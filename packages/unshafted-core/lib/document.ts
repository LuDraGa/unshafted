import {
  DEEP_ANALYSIS_CHAR_LIMIT,
  HISTORY_LIMIT,
  PREVIEW_CHAR_LIMIT,
  PRIORITY_OPTIONS,
  QUICK_SCAN_CHAR_LIMIT,
  ROLE_FALLBACKS,
} from './constants.js';
import { extractTextFromPdf } from './pdf.js';
import { IngestedDocumentSchema } from './schemas.js';
import type { HistoryRecord, IngestedDocument, QuickScanResult } from './types.js';

/** Sanitize a document name for use in filenames */
const sanitizeDocumentName = (name: string): string =>
  name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'unnamed-document';

/** Encode an ArrayBuffer as a base64 string (chunked to avoid stack overflow) */
const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

/** SHA256 hash of text, returned as hex string */
const computeContentHash = async (text: string): Promise<string> => {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

const LINE_BREAK_PATTERN = /\n{3,}/g;
const WHITESPACE_PATTERN = /[ \t]{2,}/g;

const normalizeDocumentText = (text: string): string =>
  text.replace(/\r\n/g, '\n').replace(WHITESPACE_PATTERN, ' ').replace(LINE_BREAK_PATTERN, '\n\n').trim();

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

const buildDocumentFromFile = async (
  file: File,
  options: { includeOriginalFileBase64?: boolean } = {},
): Promise<IngestedDocument> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension !== 'txt' && extension !== 'pdf') {
    throw new Error('Only `.txt` and `.pdf` files are supported.');
  }

  const originalBuffer = await file.arrayBuffer();
  const extraWarnings: string[] = [];
  let rawText: string;

  if (extension === 'txt') {
    rawText = new TextDecoder().decode(originalBuffer);
  } else {
    // Copy buffer — pdfjs detaches the original ArrayBuffer
    const result = await extractTextFromPdf(originalBuffer.slice(0));
    rawText = result.text;
    extraWarnings.push(...result.warnings);
  }

  const text = normalizeDocumentText(rawText);

  if (!text) {
    throw new Error('The uploaded file is empty.');
  }

  const warnings: string[] = [...extraWarnings];
  if (text.length < 1200) {
    warnings.push('This file looks short for a contract. The analysis may have limited context.');
  }

  const mimeType = extension === 'pdf' ? 'application/pdf' : 'text/plain';

  return IngestedDocumentSchema.parse({
    kind: 'file',
    name: file.name,
    slug: sanitizeDocumentName(file.name),
    contentHash: await computeContentHash(text),
    fileSize: file.size,
    charCount: text.length,
    estimatedTokens: estimateTokens(text),
    preview: makePreview(text),
    text,
    ...(options.includeOriginalFileBase64 ? { originalFileBase64: arrayBufferToBase64(originalBuffer) } : {}),
    originalMimeType: mimeType,
    quality: text.length < 1200 ? 'thin' : 'good',
    warnings,
    capturedAt: new Date().toISOString(),
  });
};

const makePreview = (text: string, limit = PREVIEW_CHAR_LIMIT): string => {
  const normalized = normalizeDocumentText(text);
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trimEnd()}…`;
};

const buildBalancedExcerpt = (text: string, maxChars: number): { text: string; truncated: boolean } => {
  const normalized = normalizeDocumentText(text);
  if (normalized.length <= maxChars) {
    return { text: normalized, truncated: false };
  }

  const head = Math.floor(maxChars * 0.58);
  const middle = Math.floor(maxChars * 0.17);
  const tail = maxChars - head - middle;
  const middleStart = Math.max(Math.floor(normalized.length / 2) - Math.floor(middle / 2), head);
  const middleEnd = Math.min(middleStart + middle, normalized.length - tail);

  return {
    text: [
      normalized.slice(0, head).trimEnd(),
      `[... omitted ${normalized.length - maxChars} characters from the middle ...]`,
      normalized.slice(middleStart, middleEnd).trim(),
      '[... final section ...]',
      normalized.slice(normalized.length - tail).trimStart(),
    ].join('\n\n'),
    truncated: true,
  };
};

const prepareQuickScanText = (text: string) => buildBalancedExcerpt(text, QUICK_SCAN_CHAR_LIMIT);
const prepareDeepAnalysisText = (text: string) => buildBalancedExcerpt(text, DEEP_ANALYSIS_CHAR_LIMIT);

const buildSuggestedPriorities = (quickScan: QuickScanResult | null): Array<(typeof PRIORITY_OPTIONS)[number]> => {
  const fallback: Array<(typeof PRIORITY_OPTIONS)[number]> = ['Liability', 'Payment', 'Termination'];

  if (!quickScan) {
    return fallback;
  }

  const matches = PRIORITY_OPTIONS.filter(priority =>
    quickScan.topics.some(topic => topic.toLowerCase().includes(priority.toLowerCase().replace('/', ''))),
  );

  if (matches.length >= 2) {
    return matches.slice(0, 3);
  }

  const redFlagMatches = quickScan.redFlags.flatMap(flag =>
    PRIORITY_OPTIONS.filter(priority => flag.title.toLowerCase().includes(priority.toLowerCase().replace('/', ''))),
  );

  const combined = Array.from(new Set([...matches, ...redFlagMatches]));
  return (combined.length > 0 ? combined : fallback).slice(0, 3);
};

const buildRoleOptions = (quickScan: QuickScanResult | null): string[] => {
  const fromModel = quickScan?.likelyRoles ?? [];
  const combined = Array.from(new Set([...fromModel, ...ROLE_FALLBACKS]));
  return combined.slice(0, 8);
};

const createMonthKey = (date = new Date()): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

const createDayKey = (date = new Date()): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

const clampHistory = (records: HistoryRecord[]): HistoryRecord[] =>
  [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, HISTORY_LIMIT);

const stripDocumentTextForHistory = (
  document: IngestedDocument,
): Omit<IngestedDocument, 'text' | 'originalFileBase64'> => {
  const { text, originalFileBase64, ...rest } = document;
  void text;
  void originalFileBase64;
  return rest;
};

const formatBytes = (bytes?: number): string => {
  if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
    return 'Unknown size';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export {
  arrayBufferToBase64,
  buildBalancedExcerpt,
  buildDocumentFromFile,
  buildRoleOptions,
  buildSuggestedPriorities,
  clampHistory,
  computeContentHash,
  createDayKey,
  createMonthKey,
  estimateTokens,
  formatBytes,
  makePreview,
  normalizeDocumentText,
  prepareDeepAnalysisText,
  prepareQuickScanText,
  sanitizeDocumentName,
  stripDocumentTextForHistory,
};

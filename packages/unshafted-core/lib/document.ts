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

const LINE_BREAK_PATTERN = /\n{3,}/g;
const WHITESPACE_PATTERN = /[ \t]{2,}/g;

export const normalizeDocumentText = (text: string): string =>
  text
    .replace(/\r\n/g, '\n')
    .replace(WHITESPACE_PATTERN, ' ')
    .replace(LINE_BREAK_PATTERN, '\n\n')
    .trim();

export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export const buildDocumentFromFile = async (file: File): Promise<IngestedDocument> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  let rawText: string;
  const extraWarnings: string[] = [];

  if (extension === 'txt') {
    rawText = await file.text();
  } else if (extension === 'pdf') {
    const buffer = await file.arrayBuffer();
    const result = await extractTextFromPdf(buffer);
    rawText = result.text;
    extraWarnings.push(...result.warnings);
  } else {
    throw new Error('Only `.txt` and `.pdf` files are supported.');
  }

  const text = normalizeDocumentText(rawText);

  if (!text) {
    throw new Error('The uploaded file is empty.');
  }

  const warnings: string[] = [...extraWarnings];
  if (text.length < 1200) {
    warnings.push('This file looks short for a contract. The analysis may have limited context.');
  }

  return IngestedDocumentSchema.parse({
    kind: 'file',
    name: file.name,
    fileSize: file.size,
    charCount: text.length,
    estimatedTokens: estimateTokens(text),
    preview: makePreview(text),
    text,
    quality: text.length < 1200 ? 'thin' : 'good',
    warnings,
    capturedAt: new Date().toISOString(),
  });
};

export const makePreview = (text: string, limit = PREVIEW_CHAR_LIMIT): string => {
  const normalized = normalizeDocumentText(text);
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit).trimEnd()}…`;
};

export const buildBalancedExcerpt = (text: string, maxChars: number): { text: string; truncated: boolean } => {
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

export const prepareQuickScanText = (text: string) => buildBalancedExcerpt(text, QUICK_SCAN_CHAR_LIMIT);
export const prepareDeepAnalysisText = (text: string) => buildBalancedExcerpt(text, DEEP_ANALYSIS_CHAR_LIMIT);

export const buildSuggestedPriorities = (quickScan: QuickScanResult | null): Array<(typeof PRIORITY_OPTIONS)[number]> => {
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

export const buildRoleOptions = (quickScan: QuickScanResult | null): string[] => {
  const fromModel = quickScan?.likelyRoles ?? [];
  const combined = Array.from(new Set([...fromModel, ...ROLE_FALLBACKS]));
  return combined.slice(0, 8);
};

export const createMonthKey = (date = new Date()): string => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;

export const clampHistory = (records: HistoryRecord[]): HistoryRecord[] =>
  [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, HISTORY_LIMIT);

export const stripDocumentTextForHistory = (document: IngestedDocument): Omit<IngestedDocument, 'text'> => {
  const { text: _text, ...sourceWithoutText } = document;
  return sourceWithoutText;
};

export const formatBytes = (bytes?: number): string => {
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

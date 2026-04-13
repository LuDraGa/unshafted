import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  warnings: string[];
}

export const configurePdfWorker = (workerSrc: string): void => {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
};

// --- Constants ---

const SCANNED_THRESHOLD = 200;
const LONG_DOCUMENT_THRESHOLD = 80;
const Y_LINE_TOLERANCE = 2;
const HEADING_RATIO = 1.15;
const LARGE_HEADING_RATIO = 1.5;
const INDENT_PIXELS = 20;
const SHORT_LINE_MAX = 100;
const PARAGRAPH_GAP_RATIO = 1.6;

// --- Internal types ---

interface RawItem {
  str: string;
  x: number;
  y: number;
  height: number;
  fontName: string;
  width: number;
}

interface TextLine {
  text: string;
  y: number;
  fontSize: number;
  fontName: string;
  x: number;
}

// --- Line grouping ---

const groupIntoLines = (items: RawItem[]): TextLine[] => {
  if (items.length === 0) return [];

  // Sort top-to-bottom (Y descending in PDF coords), then left-to-right
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: TextLine[] = [];
  let bucket: RawItem[] = [sorted[0]];
  let bucketY = sorted[0].y;

  const flush = () => {
    if (bucket.length === 0) return;
    bucket.sort((a, b) => a.x - b.x);

    // Dominant font: whichever covers the most text by character count
    const fontLen = new Map<string, number>();
    for (const it of bucket) {
      fontLen.set(it.fontName, (fontLen.get(it.fontName) || 0) + it.str.length);
    }
    let domFont = bucket[0].fontName;
    let domLen = 0;
    for (const [name, len] of fontLen) {
      if (len > domLen) { domLen = len; domFont = name; }
    }

    // Weighted average height (by char count)
    let totalW = 0;
    let wHeight = 0;
    for (const it of bucket) {
      if (it.height > 0) {
        const w = Math.max(it.str.length, 1);
        wHeight += it.height * w;
        totalW += w;
      }
    }

    lines.push({
      text: bucket.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim(),
      y: bucket[0].y,
      fontSize: totalW > 0 ? wHeight / totalW : bucket[0].height,
      fontName: domFont,
      x: Math.min(...bucket.map(it => it.x)),
    });
  };

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - bucketY) <= Y_LINE_TOLERANCE) {
      bucket.push(sorted[i]);
    } else {
      flush();
      bucket = [sorted[i]];
      bucketY = sorted[i].y;
    }
  }
  flush();

  return lines;
};

// --- Document metrics ---

interface DocMetrics {
  bodyFontSize: number;
  bodyFontName: string;
  leftMargin: number;
}

const detectMetrics = (allLines: TextLine[]): DocMetrics => {
  // Body font size: the height that covers the most total text
  const sizeCharCount = new Map<number, number>();
  for (const line of allLines) {
    if (line.fontSize <= 0 || !line.text) continue;
    const rounded = Math.round(line.fontSize * 2) / 2;
    sizeCharCount.set(rounded, (sizeCharCount.get(rounded) || 0) + line.text.length);
  }

  let bodyFontSize = 10;
  let maxChars = 0;
  for (const [size, chars] of sizeCharCount) {
    if (chars > maxChars) { maxChars = chars; bodyFontSize = size; }
  }

  // Body font name: most common font among body-sized lines
  const fontCharCount = new Map<string, number>();
  for (const line of allLines) {
    if (Math.abs(line.fontSize - bodyFontSize) > 1) continue;
    fontCharCount.set(line.fontName, (fontCharCount.get(line.fontName) || 0) + line.text.length);
  }

  let bodyFontName = '';
  let maxFontChars = 0;
  for (const [name, chars] of fontCharCount) {
    if (chars > maxFontChars) { maxFontChars = chars; bodyFontName = name; }
  }

  // Left margin: most common x among body-sized lines
  const bodyLines = allLines.filter(l => Math.abs(l.fontSize - bodyFontSize) < 1);
  const xCounts = new Map<number, number>();
  for (const line of bodyLines) {
    const rx = Math.round(line.x);
    xCounts.set(rx, (xCounts.get(rx) || 0) + 1);
  }

  let leftMargin = 0;
  let maxXCount = 0;
  for (const [x, count] of xCounts) {
    if (count > maxXCount) { maxXCount = count; leftMargin = x; }
  }

  return { bodyFontSize, bodyFontName, leftMargin };
};

// --- Structural formatting ---

const isBoldFontName = (name: string): boolean => {
  const lower = name.toLowerCase();
  return lower.includes('bold') || lower.includes('-bd') || lower.includes('_bd');
};

const formatLine = (line: TextLine, metrics: DocMetrics): string => {
  if (!line.text) return '';

  const { bodyFontSize, bodyFontName, leftMargin } = metrics;
  const sizeRatio = bodyFontSize > 0 ? line.fontSize / bodyFontSize : 1;
  const indentPx = Math.max(0, line.x - leftMargin);
  const indentLevel = Math.floor(indentPx / INDENT_PIXELS);

  // Font differs from body font → possibly bold/label variant
  const isAltFont = line.fontName !== bodyFontName;
  const hasBoldName = isBoldFontName(line.fontName);
  const isLikelyBold = hasBoldName || (isAltFont && line.text.length < SHORT_LINE_MAX);

  let text = line.text;

  // Large heading
  if (sizeRatio >= LARGE_HEADING_RATIO) {
    return `## ${text}`;
  }

  // Medium heading
  if (sizeRatio >= HEADING_RATIO) {
    return `### ${text}`;
  }

  // Subheading: bold-ish short line at the left margin
  if (isLikelyBold && text.length < SHORT_LINE_MAX && indentLevel === 0) {
    return `**${text}**`;
  }

  // Inline bold emphasis
  if (hasBoldName) {
    text = `**${text}**`;
  }

  // Indentation
  if (indentLevel > 0) {
    text = '  '.repeat(indentLevel) + text;
  }

  return text;
};

// --- Paragraph gap detection ---

const detectTypicalLineSpacing = (lines: TextLine[]): number => {
  if (lines.length < 2) return 12;

  const gaps: number[] = [];
  for (let i = 1; i < lines.length; i++) {
    const gap = Math.abs(lines[i - 1].y - lines[i].y);
    if (gap > 0 && gap < 200) gaps.push(gap);
  }

  if (gaps.length === 0) return 12;

  // Median gap = typical line spacing
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
};

const assemblePageText = (lines: TextLine[], metrics: DocMetrics): string => {
  if (lines.length === 0) return '';

  const typicalSpacing = detectTypicalLineSpacing(lines);
  const parts: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const formatted = formatLine(lines[i], metrics);
    if (!formatted) continue;

    // Insert blank line for paragraph breaks (Y gap notably larger than normal)
    if (i > 0 && parts.length > 0) {
      const gap = Math.abs(lines[i - 1].y - lines[i].y);
      if (gap > typicalSpacing * PARAGRAPH_GAP_RATIO) {
        parts.push('');
      }
    }

    parts.push(formatted);
  }

  return parts.join('\n');
};

// --- Main extraction ---

export const extractTextFromPdf = async (fileBuffer: ArrayBuffer): Promise<PdfExtractionResult> => {
  const warnings: string[] = [];

  let pdf: pdfjsLib.PDFDocumentProxy;
  try {
    pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(fileBuffer),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: false,
    }).promise;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('password')) {
      throw new Error(
        'This PDF is password-protected. Remove the password and try again, or paste the text into a `.txt` file.',
      );
    }
    throw new Error(`Could not read PDF: ${message}`);
  }

  const { numPages } = pdf;
  if (numPages === 0) {
    throw new Error('This PDF has no pages.');
  }

  if (numPages > LONG_DOCUMENT_THRESHOLD) {
    warnings.push(
      `This is a long document (${numPages} pages). Analysis will focus on key excerpts rather than the full text.`,
    );
  }

  // Collect all lines across all pages with page boundaries
  const allLines: TextLine[] = [];
  const pageStarts: number[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const items: RawItem[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      items.push({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        height: item.height || Math.abs(item.transform[0]),
        fontName: item.fontName || '',
        width: item.width || 0,
      });
    }

    pageStarts.push(allLines.length);
    allLines.push(...groupIntoLines(items));
  }

  // Detect document-wide metrics from all pages
  const metrics = detectMetrics(allLines);

  // Format each page with structure awareness
  const pageTexts: string[] = [];
  for (let p = 0; p < pageStarts.length; p++) {
    const start = pageStarts[p];
    const end = p + 1 < pageStarts.length ? pageStarts[p + 1] : allLines.length;
    const pageLines = allLines.slice(start, end);
    pageTexts.push(assemblePageText(pageLines, metrics));
  }

  const text = pageTexts.filter(t => t.length > 0).join('\n\n');

  if (numPages > 1 && text.length < SCANNED_THRESHOLD) {
    warnings.push(
      'This PDF appears to be scanned or image-only. Unshafted needs text-based PDFs. Try running OCR first or paste the text into a `.txt` file.',
    );
  }

  return { text, pageCount: numPages, warnings };
};

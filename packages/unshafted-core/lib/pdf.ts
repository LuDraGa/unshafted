import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
  warnings: string[];
}

const SCANNED_THRESHOLD = 200;
const LONG_DOCUMENT_THRESHOLD = 80;

/**
 * Configure the pdf.js worker source. Must be called before extractTextFromPdf
 * in browser/extension contexts where the worker file is served as a static asset.
 */
export const configurePdfWorker = (workerSrc: string): void => {
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
};

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

  const pageTexts: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    let pageText = '';
    let lastY: number | null = null;

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];

      if (lastY !== null && Math.abs(y - lastY) > 2) {
        pageText += '\n';
      } else if (pageText.length > 0) {
        pageText += ' ';
      }

      pageText += item.str;
      lastY = y;
    }

    pageTexts.push(pageText.trim());
  }

  const text = pageTexts.join('\n\n');

  if (numPages > 1 && text.length < SCANNED_THRESHOLD) {
    warnings.push(
      'This PDF appears to be scanned or image-only. Unshafted needs text-based PDFs. Try running OCR first or paste the text into a `.txt` file.',
    );
  }

  return { text, pageCount: numPages, warnings };
};

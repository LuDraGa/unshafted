import {
  EXTRACT_PAGE_MESSAGE_TYPE,
  type ExtractPageRequest,
  type ExtractPageResponse,
  IngestedDocumentSchema,
  estimateTokens,
  makePreview,
  normalizeDocumentText,
} from '@extension/unshafted-core';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'FOOTER', 'HEADER', 'NAV', 'ASIDE', 'FORM', 'BUTTON']);
const NOISE_HINTS = ['cookie', 'consent', 'subscribe', 'newsletter', 'footer', 'header', 'banner', 'advert', 'promo'];

const isProbablyVisible = (element: Element): boolean => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
};

const hasNoiseHint = (element: Element): boolean => {
  const haystack = `${element.id} ${element.className}`.toLowerCase();
  return NOISE_HINTS.some(hint => haystack.includes(hint));
};

const extractCandidateText = (root: HTMLElement): string => {
  if (!isProbablyVisible(root) || SKIP_TAGS.has(root.tagName) || hasNoiseHint(root)) {
    return '';
  }

  const clone = root.cloneNode(true) as HTMLElement;

  clone.querySelectorAll(Array.from(SKIP_TAGS).join(',')).forEach(element => element.remove());
  clone.querySelectorAll('[aria-hidden="true"], [hidden]').forEach(element => element.remove());
  clone.querySelectorAll('dialog, iframe, video, audio, canvas, svg, img').forEach(element => element.remove());

  return normalizeDocumentText(clone.innerText || clone.textContent || '');
};

const scoreCandidate = (element: HTMLElement): number => {
  const text = extractCandidateText(element);
  if (!text) {
    return 0;
  }

  const headingCount = element.querySelectorAll('h1, h2, h3, h4').length;
  const paragraphCount = element.querySelectorAll('p, li').length;
  const sectionBoost = /(terms|agreement|license|policy|contract|conditions|legal)/i.test(
    `${element.tagName} ${element.id} ${element.className}`,
  )
    ? 800
    : 0;

  return text.length + headingCount * 120 + paragraphCount * 18 + sectionBoost;
};

const pickBestRoot = (): HTMLElement => {
  const selectors = [
    'main',
    'article',
    '[role="main"]',
    '.agreement',
    '.terms',
    '.policy',
    '.legal',
    '.document',
    '.content',
    '.main',
  ];

  const candidates = selectors
    .flatMap(selector => Array.from(document.querySelectorAll(selector)))
    .filter((node): node is HTMLElement => node instanceof HTMLElement);

  if (document.body) {
    candidates.push(document.body);
  }

  const uniqueCandidates = Array.from(new Set(candidates));
  return uniqueCandidates.sort((left, right) => scoreCandidate(right) - scoreCandidate(left))[0] ?? document.body;
};

const assessQuality = (text: string): { quality: 'good' | 'thin' | 'noisy'; warnings: string[] } => {
  const warnings: string[] = [];
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const shortLineRatio = lines.length > 0 ? lines.filter(line => line.split(' ').length <= 3).length / lines.length : 0;

  if (text.length < 1200) {
    warnings.push('This page looks short for a contract. Extraction may be incomplete.');
  }

  if (shortLineRatio > 0.48) {
    warnings.push('This page contains a lot of short or menu-like lines. Uploading a clean `.txt` file may work better.');
  }

  if (text.length < 1200) {
    return { quality: 'thin', warnings };
  }

  if (shortLineRatio > 0.48) {
    return { quality: 'noisy', warnings };
  }

  return { quality: 'good', warnings };
};

const buildPageDocument = () => {
  const root = pickBestRoot();
  const text = extractCandidateText(root);
  const normalized = normalizeDocumentText(text);
  const { quality, warnings } = assessQuality(normalized);

  return IngestedDocumentSchema.parse({
    kind: 'page',
    name: document.title || 'Current webpage',
    url: window.location.href,
    charCount: normalized.length,
    estimatedTokens: estimateTokens(normalized),
    preview: makePreview(normalized),
    text: normalized,
    quality,
    warnings,
    capturedAt: new Date().toISOString(),
  });
};

chrome.runtime.onMessage.addListener((message: ExtractPageRequest, _sender, sendResponse) => {
  if (message.type !== EXTRACT_PAGE_MESSAGE_TYPE) {
    return false;
  }

  try {
    const documentPayload = buildPageDocument();

    if (documentPayload.charCount < 200) {
      sendResponse({
        ok: false,
        error: 'This page does not contain enough readable agreement text. Try a cleaner page or upload a local `.txt` file.',
      } satisfies ExtractPageResponse);

      return true;
    }

    sendResponse({
      ok: true,
      document: documentPayload,
    } satisfies ExtractPageResponse);
  } catch (error) {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to extract text from this page.',
    } satisfies ExtractPageResponse);
  }

  return true;
});

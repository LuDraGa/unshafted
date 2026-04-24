import { EXTRACT_PAGE_MESSAGE_TYPE } from '@extension/unshafted-core';
import type { ExtractPageResponse } from '@extension/unshafted-core';

const INTERNAL_URL_RE = /^(chrome|about|edge|brave|moz-extension|chrome-extension):/i;
const PDF_URL_RE = /\.pdf(?:$|[?#])/i;
const PDF_TITLE_RE = /\bpdf\b/i;
const PDF_OR_VIEWER_ERROR_RE =
  /pdf|viewer|mimehandler|cannot access contents of url|cannot access a chrome:\/\/ url|the extensions gallery cannot be scripted/i;
const PDF_UNSUPPORTED_MESSAGE =
  'This tab is a PDF or browser viewer. Unshafted only accepts local `.txt` uploads for documents like this. Convert PDF -> Markdown -> TXT, then upload the final `.txt` file.';
const GENERIC_UNSUPPORTED_MESSAGE =
  'This browser page cannot be analyzed directly. Try a normal webpage or upload a local `.txt` file instead.';

type TabReadability = {
  supported: boolean;
  label: 'Readable' | 'PDF' | 'Unsupported';
  reason: string;
};

const getCurrentActiveTab = async (): Promise<chrome.tabs.Tab | null> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
};

const isSupportedTabUrl = (url?: string): boolean => {
  if (!url) {
    return false;
  }

  return !INTERNAL_URL_RE.test(url);
};

const inspectTabContent = async (tabId: number) => {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      contentType: document.contentType ?? '',
      hasPdfEmbed: Boolean(
        document.querySelector(
          'embed[type="application/pdf"], object[type="application/pdf"], iframe[src$=".pdf"], iframe[src*=".pdf?"]',
        ),
      ),
    }),
  });

  return result?.result;
};

const getTabReadability = async (tab: chrome.tabs.Tab | null): Promise<TabReadability> => {
  if (!tab?.id || !tab.url) {
    return {
      supported: false,
      label: 'Unsupported',
      reason: 'No active webpage was detected.',
    };
  }

  if (!isSupportedTabUrl(tab.url)) {
    return {
      supported: false,
      label: 'Unsupported',
      reason: GENERIC_UNSUPPORTED_MESSAGE,
    };
  }

  if (PDF_URL_RE.test(tab.url) || PDF_TITLE_RE.test(tab.title ?? '')) {
    return {
      supported: false,
      label: 'PDF',
      reason: PDF_UNSUPPORTED_MESSAGE,
    };
  }

  if (typeof chrome.scripting?.executeScript !== 'function') {
    return {
      supported: true,
      label: 'Readable',
      reason: '',
    };
  }

  try {
    const inspection = await inspectTabContent(tab.id);
    if (inspection && (/pdf/i.test(inspection.contentType) || inspection.hasPdfEmbed)) {
      return {
        supported: false,
        label: 'PDF',
        reason: PDF_UNSUPPORTED_MESSAGE,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (PDF_OR_VIEWER_ERROR_RE.test(errorMessage)) {
      return {
        supported: false,
        label: 'PDF',
        reason: PDF_UNSUPPORTED_MESSAGE,
      };
    }

    return {
      supported: false,
      label: 'Unsupported',
      reason: GENERIC_UNSUPPORTED_MESSAGE,
    };
  }

  return {
    supported: true,
    label: 'Readable',
    reason: '',
  };
};

const extractCurrentPageDocument = async (tabId: number): Promise<ExtractPageResponse> => {
  const sendExtractRequest = async () =>
    (await chrome.tabs.sendMessage(tabId, {
      type: EXTRACT_PAGE_MESSAGE_TYPE,
    })) as ExtractPageResponse | undefined;

  try {
    const response = await sendExtractRequest();

    if (!response) {
      return {
        ok: false,
        error: 'The page did not respond. Refresh it once and try again.',
      };
    }

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (
      /Receiving end does not exist|Could not establish connection/i.test(errorMessage) &&
      typeof chrome.scripting?.executeScript === 'function'
    ) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['/content/all.iife.js'],
        });

        const retried = await sendExtractRequest();
        if (retried) {
          return retried;
        }

        return {
          ok: false,
          error: PDF_UNSUPPORTED_MESSAGE,
        };
      } catch (injectionError) {
        const injectionMessage = injectionError instanceof Error ? injectionError.message : String(injectionError);
        return {
          ok: false,
          error: PDF_OR_VIEWER_ERROR_RE.test(injectionMessage)
            ? PDF_UNSUPPORTED_MESSAGE
            : injectionMessage ||
              'The page could not be prepared for analysis. Refresh the tab once and try again, or upload a local `.txt` file.',
        };
      }
    }

    return {
      ok: false,
      error:
        /Receiving end does not exist|Could not establish connection/i.test(errorMessage) ||
        PDF_OR_VIEWER_ERROR_RE.test(errorMessage)
          ? PDF_UNSUPPORTED_MESSAGE
          : errorMessage || 'This page cannot be read directly. Upload a local `.txt` file instead.',
    };
  }
};

export { extractCurrentPageDocument, getCurrentActiveTab, getTabReadability, isSupportedTabUrl };
export type { TabReadability };

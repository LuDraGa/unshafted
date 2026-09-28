import {
  collectPolicyCandidatesInPage,
  POLICY_LINK_PATTERN,
  rankPolicyCandidates,
  readPolicyDocument,
} from '@extension/unshafted-core';
import type { PolicyCandidate, PolicyDocumentCapture, RankedPolicyCandidate } from '@extension/unshafted-core';

/**
 * Finding and reading the active tab's policy documents.
 *
 * Runs under standing `host_permissions` + `scripting`, added 2026-09-07 because `activeTab` made
 * automatic detection impossible — it is granted only on a toolbar invocation and revoked the
 * instant the tab navigates, so a panel left open while someone browses was refused on every new
 * page (see `chrome-extension/manifest.ts`).
 *
 * Still NO persistent content script. Discovery is a one-shot injection the panel asks for, at a
 * moment the user is looking at the panel — nothing runs on a page we were not asked about, and
 * nothing stays behind on one we were. "Cannot read this page" remains an ordinary outcome rather
 * than a fault: Chrome refuses injection on its own pages and on the Web Store, and a page mid-load
 * has no footer to read yet.
 *
 * Two halves, and since S2 only the first touches the page:
 *
 *  - `discoverActiveTabPolicies` — "what did this site link?" One injection, no fetches, every
 *    candidate returned.
 *  - `capturePolicyDocument` — "read exactly this URL and hash it." The extension reads it itself,
 *    cookies omitted, wherever it is hosted (D5; AD-4, which fetched from inside the page and so
 *    could read only same-origin documents, is retired). No tab is involved, which is also why the
 *    live check on a covered site no longer depends on the page letting us in.
 *
 * Everything stops at the hash. Resolving a hash to an analysis is the caller's job — that is
 * what keeps `@extension/shared` free of a runtime dependency on `@extension/storage`.
 */

const isSupportedUrl = (url: string | undefined): url is string => {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

/** Chrome refuses injection on its own pages, the Web Store, and any tab we no longer hold. */
const injectionErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Could not read this page.';

export type PolicyDiscoveryResult =
  | {
      status: 'discovered';
      tabId: number;
      pageUrl: string;
      hostname: string;
      /** Ranked for a human to pick from, deduplicated, and possibly empty. */
      documents: RankedPolicyCandidate[];
      /**
       * The raw sighting, kept because `choosePolicyUrl` scores footer placement and relative
       * paths and would pick a different document from the ranked view. Machines read this;
       * people read `documents`.
       */
      candidates: PolicyCandidate[];
    }
  | { status: 'unsupported-page' }
  | { status: 'error'; message: string };

export type { PolicyDocumentCapture };

/**
 * Every policy document linked from the active tab, ranked, in one injection.
 *
 * Returns the tab id alongside, so a caller can tell which tab this list answers for if the user
 * switched tabs while the panel was open.
 */
export const discoverActiveTabPolicies = async (): Promise<PolicyDiscoveryResult> => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isSupportedUrl(tab.url)) return { status: 'unsupported-page' };

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectPolicyCandidatesInPage,
      args: [POLICY_LINK_PATTERN.source],
    });
    const candidates = (injection?.result as PolicyCandidate[] | undefined) ?? [];

    return {
      status: 'discovered',
      tabId: tab.id,
      pageUrl: tab.url,
      hostname: new URL(tab.url).hostname,
      documents: rankPolicyCandidates(candidates, { pageUrl: tab.url }),
      candidates,
    };
  } catch (error) {
    return { status: 'error', message: injectionErrorMessage(error) };
  }
};

/**
 * Read one specific document and reduce it to a content hash.
 *
 * The text returned is the NORMALIZED text — the exact string the hash is taken over. That is
 * deliberate and load-bearing for D9: what the reader sees on screen is what the analysis
 * graded, not a prettier rendering of it.
 */
export const capturePolicyDocument = (url: string): Promise<PolicyDocumentCapture> => readPolicyDocument(url);

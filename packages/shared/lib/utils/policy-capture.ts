import {
  collectPolicyCandidatesInPage,
  isSamePage,
  POLICY_LINK_PATTERN,
  rankPolicyCandidates,
  readPolicyDocument,
  readRenderedPageInPage,
} from '@extension/unshafted-core';
import type {
  PolicyCandidate,
  PolicyDocumentCapture,
  PolicyPageRender,
  RankedPolicyCandidate,
  RenderedPolicyPage,
} from '@extension/unshafted-core';

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
 *
 * `render` is how the document may be opened if its raw HTML is not a document (A5): the reader's
 * own tab, when that is the document (`renderFromTab`), or a background tab on their click
 * (`renderInBackgroundTab`). Without it, only the raw HTML is read.
 */
export const capturePolicyDocument = (url: string, render?: PolicyPageRender): Promise<PolicyDocumentCapture> =>
  readPolicyDocument(url, undefined, render);

/**
 * Open `url` in a background tab, read it once it has loaded and settled, and close it (A5).
 *
 * The panel calls this only when the reader asks for it ("Read it by opening the page"). The tab
 * is theirs in every sense: it opens in their window and carries their session, like any link they
 * open themselves — which is why it is never done on its own. It is closed as soon as it is read.
 *
 * SELF-CONTAINED, with the in-page reader passed in, because tooling evaluates this function's
 * SOURCE inside a real extension (`tools/corpus/extension-fetch.ts`): the corpus capture and the
 * bench open and read a page exactly as the panel does, so a rendered capture hashes what the
 * panel's rendered read hashes.
 *
 * Read twice at most. A bot check that passes and then reloads the page (Zepto's) takes the page
 * out from under the first read; the second waits for the reload to finish.
 */
export const readInBackgroundTab = async (
  url: string,
  reader: () => Promise<RenderedPolicyPage>,
): Promise<RenderedPolicyPage | null> => {
  const LOAD_TIMEOUT_MS = 20_000;
  const loaded = (tabId: number) =>
    new Promise<void>(resolve => {
      const finish = () => {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      };
      const listener = (updatedId: number, change: { status?: string }) => {
        if (updatedId === tabId && change.status === 'complete') finish();
      };
      const timer = setTimeout(finish, LOAD_TIMEOUT_MS);
      chrome.tabs.onUpdated.addListener(listener);
      // It may have finished before the listener was added.
      chrome.tabs.get(tabId).then(tab => {
        if (tab.status === 'complete') finish();
      }, finish);
    });

  let tabId: number | undefined;
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;
    if (tabId === undefined) return null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await loaded(tabId);
      try {
        const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: reader });
        const result = injection?.result as RenderedPolicyPage | undefined;
        if (result && typeof result.html === 'string') return result;
      } catch {
        // The page navigated away mid-read; the next attempt waits for it to load.
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    if (tabId !== undefined) await chrome.tabs.remove(tabId).catch(() => undefined);
  }
};

/** A background tab opened on the reader's click, read with the shipped in-page reader. */
export const renderInBackgroundTab: PolicyPageRender = url => readInBackgroundTab(url, readRenderedPageInPage);

/**
 * The reader's own tab, read as it stands (A5), for when the page they are on is the document: no
 * new tab, and nothing the page is not already showing them. The panel passes this only for a
 * document whose address is the tab's own — and a tab that has since moved to another page is not
 * read as that document: what the page reports as its address must still be the document's.
 */
export const renderFromTab =
  (tabId: number): PolicyPageRender =>
  async url => {
    try {
      const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: readRenderedPageInPage });
      const page = injection?.result as RenderedPolicyPage | undefined;
      return page && isSamePage(page.url, url) ? page : null;
    } catch {
      return null;
    }
  };

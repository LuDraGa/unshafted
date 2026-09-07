import {
  choosePolicyUrl,
  collectPolicyCandidatesInPage,
  computePolicyHash,
  fetchDocumentInPage,
  rankPolicyCandidates,
  wellKnownPolicyPaths,
} from '@extension/unshafted-core';
import type {
  InPageFetchResult,
  PolicyCandidate,
  PolicyDocType,
  RankedPolicyCandidate,
} from '@extension/unshafted-core';

/**
 * Reading the active tab's policy documents.
 *
 * Runs under standing `host_permissions` + `scripting`, added 2026-09-07 because `activeTab` made
 * automatic detection impossible — it is granted only on a toolbar invocation and revoked the
 * instant the tab navigates, so a panel left open while someone browses was refused on every new
 * page (see `chrome-extension/manifest.ts`).
 *
 * Still NO persistent content script. Every read here is a one-shot injection the panel asks for,
 * at a moment the user is looking at the panel — nothing runs on a page we were not asked about,
 * and nothing stays behind on one we were. "Cannot read this page" remains an ordinary outcome
 * rather than a fault: Chrome refuses injection on its own pages and on the Web Store, and a page
 * mid-load has no footer to read yet.
 *
 * Split into two halves for D9, because the side panel asks a different question than the popup
 * did:
 *
 *  - `discoverActiveTabPolicies` — "what did this site link?" One injection, no fetches, every
 *    candidate returned. The reader lists these; the live check picks from them.
 *  - `capturePolicyDocument` — "fetch exactly this URL and hash it." The caller decides which.
 *
 * `captureActiveTabPolicy` is the original one-shot flow, now expressed in terms of those two.
 * Its contract is unchanged: give it a `docType` and it picks a document and returns its hash.
 *
 * Everything stops at the hash. Resolving a hash to an analysis is the caller's job — that is
 * what keeps `@extension/shared` free of a runtime dependency on `@extension/storage`.
 */

/** Below this, we almost certainly captured an SPA shell or an error page, not a policy. */
const MIN_PLAUSIBLE_POLICY_CHARS = 400;

/** Bounded so a site without a policy cannot cost an unbounded number of requests. */
const MAX_PATH_GUESSES = 3;

const isSupportedUrl = (url: string | undefined): url is string => {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

const runInPage = async <Args extends unknown[], Result>(
  tabId: number,
  func: (...args: Args) => Result,
  args: Args,
): Promise<Result> => {
  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return injection?.result as Result;
};

/** Chrome refuses injection on its own pages, the Web Store, and any tab we no longer hold. */
const injectionErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Could not read this page.';

export type PolicyCaptureResult =
  | {
      status: 'captured';
      hash: string;
      text: string;
      sourceUrl: string;
      hostname: string;
      docType: PolicyDocType;
      usedMainContainer: boolean;
    }
  | { status: 'unsupported-page' }
  | { status: 'no-policy-found' }
  | { status: 'error'; message: string };

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

export type PolicyDocumentCapture =
  | { status: 'captured'; hash: string; text: string; sourceUrl: string; usedMainContainer: boolean }
  /**
   * The fetch came back, but not with a policy — a 404, a login wall, or an SPA shell. Separate
   * from `error` because there is nothing wrong and nothing for a user to do about it.
   */
  | { status: 'unreadable'; reason: 'fetch-failed' | 'too-short' }
  | { status: 'error'; message: string };

/**
 * Every policy document linked from the active tab, ranked, in one injection.
 *
 * Returns the tab id alongside, because a later `capturePolicyDocument` must run against the
 * SAME tab this list came from. Re-querying the active tab at fetch time would silently read a
 * different page if the user switched tabs while the panel was open.
 */
export const discoverActiveTabPolicies = async (): Promise<PolicyDiscoveryResult> => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isSupportedUrl(tab.url)) return { status: 'unsupported-page' };

    const candidates = (await runInPage(tab.id, collectPolicyCandidatesInPage, [])) ?? ([] as PolicyCandidate[]);

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
 * Fetch one specific document from the page's own context and reduce it to a content hash.
 *
 * The text returned is the NORMALIZED text — the exact string the hash is taken over. That is
 * deliberate and load-bearing for D9: what the reader sees on screen is what the analysis
 * graded, not a prettier rendering of it.
 */
export const capturePolicyDocument = async (tabId: number, url: string): Promise<PolicyDocumentCapture> => {
  try {
    const fetched: InPageFetchResult | undefined = await runInPage(tabId, fetchDocumentInPage, [url]);
    if (!fetched?.ok || !fetched.html) return { status: 'unreadable', reason: 'fetch-failed' };

    const { hash, normalized } = await computePolicyHash(fetched.html);
    if (normalized.length < MIN_PLAUSIBLE_POLICY_CHARS) return { status: 'unreadable', reason: 'too-short' };

    return {
      status: 'captured',
      hash,
      text: normalized.text,
      sourceUrl: fetched.finalUrl,
      usedMainContainer: normalized.usedMainContainer,
    };
  } catch (error) {
    return { status: 'error', message: injectionErrorMessage(error) };
  }
};

/**
 * Capture the one policy document of a given type, hash it, and stop.
 *
 * Unchanged in behaviour from before the D9 split — same discovery, same chooser, same bounded
 * run of path guesses when nothing is linked — so existing callers need no edit.
 */
export const captureActiveTabPolicy = async (
  options: { docType?: PolicyDocType } = {},
): Promise<PolicyCaptureResult> => {
  const docType = options.docType ?? 'privacy';

  const discovery = await discoverActiveTabPolicies();
  if (discovery.status !== 'discovered') return discovery;

  const { tabId, pageUrl, hostname } = discovery;

  // The raw sighting, not `documents` — see the comment on `candidates`.
  const chosen = choosePolicyUrl(discovery.candidates, { docType, pageUrl });
  if (!chosen) return { status: 'no-policy-found' };

  // A discovered link is tried once; a guessed path gets a few attempts before giving up.
  const attempts =
    chosen.source === 'link'
      ? [chosen.url]
      : wellKnownPolicyPaths(docType)
          .slice(0, MAX_PATH_GUESSES)
          .map(path => new URL(path, new URL(pageUrl).origin).toString());

  for (const attempt of attempts) {
    const captured = await capturePolicyDocument(tabId, attempt);
    if (captured.status === 'error') return captured;
    if (captured.status !== 'captured') continue;

    return {
      status: 'captured',
      hash: captured.hash,
      text: captured.text,
      sourceUrl: captured.sourceUrl,
      hostname,
      docType,
      usedMainContainer: captured.usedMainContainer,
    };
  }

  return { status: 'no-policy-found' };
};

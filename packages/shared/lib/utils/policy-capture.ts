import {
  choosePolicyUrl,
  collectPolicyCandidatesInPage,
  computePolicyHash,
  fetchDocumentInPage,
  wellKnownPolicyPaths,
} from '@extension/unshafted-core';
import type { InPageFetchResult, PolicyCandidate, PolicyDocType } from '@extension/unshafted-core';

/**
 * Capture the policy document for the active tab and reduce it to a content hash.
 *
 * Runs ONLY on a user gesture (popup open or a click inside it), under `activeTab` +
 * `scripting`. No host permissions, no persistent content script — page access was excised in
 * `3657ca0` to clear CWS review and this deliberately does not reopen it.
 *
 * This stops at the hash. Resolving a hash to an analysis needs the local cache and the CDN, and
 * lives with the caller — keeping `@extension/shared` free of a runtime dependency on
 * `@extension/storage`, which it only carries for types.
 */

/** Below this, we almost certainly captured an SPA shell or an error page, not a policy. */
const MIN_PLAUSIBLE_POLICY_CHARS = 400;

/** Bounded so a site without a policy cannot cost an unbounded number of requests. */
const MAX_PATH_GUESSES = 3;

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

export const captureActiveTabPolicy = async (
  options: { docType?: PolicyDocType } = {},
): Promise<PolicyCaptureResult> => {
  const docType = options.docType ?? 'privacy';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isSupportedUrl(tab.url)) return { status: 'unsupported-page' };

    const tabId = tab.id;
    const pageUrl = tab.url;

    const candidates = (await runInPage(tabId, collectPolicyCandidatesInPage, [])) ?? ([] as PolicyCandidate[]);
    const chosen = choosePolicyUrl(candidates, { docType, pageUrl });
    if (!chosen) return { status: 'no-policy-found' };

    // A discovered link is tried once; a guessed path gets a few attempts before giving up.
    const attempts =
      chosen.source === 'link'
        ? [chosen.url]
        : wellKnownPolicyPaths(docType)
            .slice(0, MAX_PATH_GUESSES)
            .map(path => new URL(path, new URL(pageUrl).origin).toString());

    for (const attempt of attempts) {
      const fetched: InPageFetchResult | undefined = await runInPage(tabId, fetchDocumentInPage, [attempt]);
      if (!fetched?.ok || !fetched.html) continue;

      const { hash, normalized } = await computePolicyHash(fetched.html);
      if (normalized.length < MIN_PLAUSIBLE_POLICY_CHARS) continue;

      return {
        status: 'captured',
        hash,
        text: normalized.text,
        sourceUrl: fetched.finalUrl,
        hostname: new URL(pageUrl).hostname,
        docType,
        usedMainContainer: normalized.usedMainContainer,
      };
    }

    return { status: 'no-policy-found' };
  } catch (error) {
    // Chrome refuses injection on its own pages and on the Web Store, among others.
    const message = error instanceof Error ? error.message : 'Could not read this page.';
    return { status: 'error', message };
  }
};

import {
  POLICY_CORPUS_ASSET,
  analysesForHostname,
  analysisForHash,
  parsePolicyCorpus,
} from '@extension/unshafted-core';
import type { PolicyCorpus, SitePolicyAnalysis } from '@extension/unshafted-core';

/**
 * Loads and queries the bundled analysis corpus.
 *
 * **Do not import this from the service worker.** The badge path answers "is this site covered?"
 * from the 45 KB binary index in `policy-index-loader.ts`, and that is the whole of AD-2 and D11:
 * every page load pays the index, nothing pays for the corpus. This module parses ~1 MB of JSON,
 * so it belongs to the side panel, which loads it once when a user has actually asked to see an
 * analysis.
 *
 * Like the index, it reads an extension-local asset and makes NO network request. That is not an
 * optimisation — it is the reason a covered site can be rendered without ever telling us which
 * site the user is on.
 */

/** Parsed once per page context. The side panel is a normal document, so this lives as long as it. */
let corpusPromise: Promise<PolicyCorpus | null> | null = null;

export const loadBundledPolicyCorpus = (): Promise<PolicyCorpus | null> => {
  corpusPromise ??= (async () => {
    try {
      const response = await fetch(chrome.runtime.getURL(POLICY_CORPUS_ASSET));
      if (!response.ok) {
        console.warn('[Unshafted] policy corpus missing from bundle');
        return null;
      }
      return parsePolicyCorpus(await response.json());
    } catch (error) {
      console.warn('[Unshafted] policy corpus failed to load:', error);
      return null;
    }
  })();

  return corpusPromise;
};

export type HostnameAnalyses = { domain: string; analyses: SitePolicyAnalysis[] } | null;

/**
 * Every analysis governing a hostname, worst document first (D10).
 *
 * Resolution is the same suffix walk the badge used, so the panel cannot claim a different domain
 * than the icon that opened it.
 */
export const resolveHostnameAnalyses = async (hostname: string): Promise<HostnameAnalyses> => {
  const corpus = await loadBundledPolicyCorpus();
  return corpus ? analysesForHostname(corpus, hostname) : null;
};

/**
 * The analysis for an exact document version, or `null`.
 *
 * A miss is the expected outcome whenever the document has been edited since capture, and D6
 * treats it as information ("changed since we read it"), not as a failure.
 */
export const resolveAnalysisByHash = async (contentHash: string): Promise<SitePolicyAnalysis | null> => {
  const corpus = await loadBundledPolicyCorpus();
  return corpus ? analysisForHash(corpus, contentHash) : null;
};

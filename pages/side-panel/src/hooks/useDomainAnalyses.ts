import { resolveHostnameAnalyses } from '@extension/shared';
import { useEffect, useState } from 'react';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';

/**
 * The bundled analyses for a hostname — the panel's first paint (D6).
 *
 * ZERO NETWORK, NO PAGE ACCESS. This reads `policy-corpus.json` through
 * `chrome.runtime.getURL`, an extension-local asset. Nothing here is keyed by the site the user
 * is on, nothing leaves the browser, and the panel is fully rendered before the live check in
 * `useLivePolicyCheck` has done anything at all. That inversion is the whole of D6: on 7 of 36
 * domains the live read cannot succeed, and the panel must be complete without it.
 *
 * `status` starts at `loading` only for the corpus parse (~1 MB, once per panel instance).
 */

type DomainAnalyses = {
  status: 'loading' | 'ready';
  domain: string | null;
  /** Worst document first, as `indexPolicyCorpus` sorted them. Empty when uncovered. */
  analyses: SitePolicyAnalysis[];
};

const EMPTY_ANALYSES: SitePolicyAnalysis[] = [];

const useDomainAnalyses = (hostname: string | null): DomainAnalyses => {
  const [resolved, setResolved] = useState<DomainAnalyses>({
    status: 'loading',
    domain: null,
    analyses: EMPTY_ANALYSES,
  });

  useEffect(() => {
    if (!hostname) {
      setResolved({ status: 'ready', domain: null, analyses: EMPTY_ANALYSES });
      return;
    }

    let disposed = false;
    setResolved(previous => ({ ...previous, status: 'loading' }));

    resolveHostnameAnalyses(hostname)
      .then(result => {
        if (disposed) return;
        /*
         * The array comes straight out of the corpus's `byDomain` map, so it is referentially
         * stable for a given domain. Downstream effects depend on that: re-resolving after an
         * in-site navigation must not look like new data and re-run the live page check.
         */
        setResolved({
          status: 'ready',
          domain: result?.domain ?? null,
          analyses: result?.analyses ?? EMPTY_ANALYSES,
        });
      })
      .catch(() => {
        if (!disposed) setResolved({ status: 'ready', domain: null, analyses: EMPTY_ANALYSES });
      });

    return () => {
      disposed = true;
    };
  }, [hostname]);

  return resolved;
};

export { useDomainAnalyses };
export type { DomainAnalyses };

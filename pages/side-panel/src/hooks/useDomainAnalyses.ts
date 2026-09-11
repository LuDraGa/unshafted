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
 *
 * WHY THE RESOLUTION CARRIES ITS OWN HOSTNAME. What this returns is derived from whether the stored
 * resolution answers for the hostname being asked about, rather than reset at the top of the
 * effect. The reset used to spread the previous value — `{ ...previous, status: 'loading' }` — so
 * for the whole time a new hostname was resolving, the panel was handed the PREVIOUS hostname's
 * `domain` and `analyses`, and painted the last site's documents under the new site's name. (The
 * render before the effect ran was worse still: `ready`, with the same stale contents.) Deriving
 * removes both rather than shortening them.
 */

type DomainAnalyses = {
  status: 'loading' | 'ready';
  domain: string | null;
  /** Worst document first, as `indexPolicyCorpus` sorted them. Empty when uncovered. */
  analyses: SitePolicyAnalysis[];
};

/** A resolution, tagged with the hostname it answers for. */
type Resolution = {
  hostname: string;
  domain: string | null;
  analyses: SitePolicyAnalysis[];
};

const EMPTY_ANALYSES: SitePolicyAnalysis[] = [];
const NOT_ASKED: DomainAnalyses = { status: 'ready', domain: null, analyses: EMPTY_ANALYSES };
const LOADING: DomainAnalyses = { status: 'loading', domain: null, analyses: EMPTY_ANALYSES };

const useDomainAnalyses = (hostname: string | null): DomainAnalyses => {
  const [resolution, setResolution] = useState<Resolution | null>(null);

  useEffect(() => {
    if (!hostname) return;

    let disposed = false;

    resolveHostnameAnalyses(hostname)
      .then(result => {
        if (disposed) return;
        /*
         * The array comes straight out of the corpus's `byDomain` map, so it is referentially
         * stable for a given domain. Downstream effects depend on that: re-resolving after an
         * in-site navigation must not look like new data and re-run the live page check.
         */
        setResolution({ hostname, domain: result?.domain ?? null, analyses: result?.analyses ?? EMPTY_ANALYSES });
      })
      .catch(() => {
        if (!disposed) setResolution({ hostname, domain: null, analyses: EMPTY_ANALYSES });
      });

    return () => {
      disposed = true;
    };
  }, [hostname]);

  // No hostname is an answer, not a wait: there is nothing to resolve and nothing to show.
  if (!hostname) return NOT_ASKED;

  // Either nothing has resolved yet, or what resolved answers for the hostname we have left.
  if (resolution?.hostname !== hostname) return LOADING;

  return { status: 'ready', domain: resolution.domain, analyses: resolution.analyses };
};

export { useDomainAnalyses };
export type { DomainAnalyses };

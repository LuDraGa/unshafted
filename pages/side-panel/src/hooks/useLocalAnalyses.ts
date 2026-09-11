import { localSitePolicyStorage, sitePolicyRunStorage } from '@extension/storage';
import { IDLE_SITE_POLICY_RUN } from '@extension/unshafted-core';
import { useStorageValue } from '@src/hooks/useStorageValue';
import { useCallback, useEffect, useState } from 'react';
import type { LocalPolicyAnalysis, SitePolicyRunState } from '@extension/unshafted-core';

/**
 * The analyses the USER ran on this domain, plus the state of any run happening right now.
 *
 * Two stores, one hook, because the panel only ever wants them together: a run finishing is the
 * event that makes new analyses exist, and nothing else in the panel writes to this store. The
 * run lives in the service worker (S5) precisely so that closing the panel does not kill a call
 * the user is paying for, which means the panel learns about the result the same way any other
 * observer would — by re-reading once the worker says it is done.
 *
 * The re-read is keyed on the run's `status`, not on a timer and not on every write. A run emits
 * a state change per document; re-reading the whole domain on each one would fetch and re-parse
 * every stored analysis several times to show a progress line that does not depend on them.
 *
 * WHY THE LOAD CARRIES ITS OWN DOMAIN AND TOKEN. `status` is derived from what the stored load
 * answers for, rather than reset at the top of the effect, because an effect runs after the render
 * that scheduled it — so resetting there left one committed render reporting the new domain as
 * `ready` while still holding the previous domain's analyses.
 *
 * The two reasons to reload are deliberately not treated alike. A DOMAIN change drops the list: a
 * different site's analyses are wrong, not stale. A REFRESH of the same domain — a run completing,
 * or `reload()` after a delete — keeps showing what is already there, because it is still true and
 * blanking it would flicker the list for the length of a storage read.
 */

type LocalAnalyses = {
  status: 'loading' | 'ready';
  analyses: LocalPolicyAnalysis[];
  /** Idle until a run starts. A run on a DIFFERENT domain is still reported; callers filter. */
  runState: SitePolicyRunState;
  /** After a delete, so the storage-relief UI does not have to guess what is left. */
  reload: () => void;
};

/** A completed read, tagged with the domain and the refresh it answers for. */
type Load = {
  domain: string;
  token: string;
  analyses: LocalPolicyAnalysis[];
};

const EMPTY: LocalPolicyAnalysis[] = [];

/** Identifies one read of one domain. Changing it is what asks for another read. */
const refreshToken = (completedRun: string | null, reloadToken: number) => `${completedRun ?? ''}:${reloadToken}`;

const useLocalAnalyses = (domain: string | null): LocalAnalyses => {
  const runState = useStorageValue(sitePolicyRunStorage) ?? IDLE_SITE_POLICY_RUN;
  const [load, setLoad] = useState<Load | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken(token => token + 1), []);

  /*
   * `complete` rather than the whole run state: a completed run for THIS domain is the only
   * transition that adds an analysis, and an in-flight one adds nothing to read yet.
   */
  const completedRun = runState.status === 'complete' && runState.domain === domain ? runState.startedAt : null;
  const token = refreshToken(completedRun, reloadToken);

  useEffect(() => {
    if (!domain) return;

    let disposed = false;

    localSitePolicyStorage
      .getForDomain(domain)
      .then(found => {
        if (disposed) return;
        setLoad({ domain, token, analyses: found.length > 0 ? found : EMPTY });
      })
      .catch(() => {
        // An unreadable store is not something the reader can act on, and the panel above this
        // never depended on it. Fall back to "none" rather than surfacing a failure.
        if (disposed) return;
        setLoad({ domain, token, analyses: EMPTY });
      });

    return () => {
      disposed = true;
    };
  }, [domain, token]);

  // No domain is an answer, not a wait.
  if (!domain) return { status: 'ready', analyses: EMPTY, runState, reload };

  // A different domain's analyses are wrong, not stale — never show them under this one.
  if (load?.domain !== domain) return { status: 'loading', analyses: EMPTY, runState, reload };

  // Same domain, re-reading. What is on screen is still true; keep it rather than flicker.
  if (load.token !== token) return { status: 'loading', analyses: load.analyses, runState, reload };

  return { status: 'ready', analyses: load.analyses, runState, reload };
};

export { useLocalAnalyses };
export type { LocalAnalyses };

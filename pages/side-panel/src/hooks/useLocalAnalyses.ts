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
 */

export type LocalAnalyses = {
  status: 'loading' | 'ready';
  analyses: LocalPolicyAnalysis[];
  /** Idle until a run starts. A run on a DIFFERENT domain is still reported; callers filter. */
  runState: SitePolicyRunState;
  /** After a delete, so the storage-relief UI does not have to guess what is left. */
  reload: () => void;
};

const EMPTY: LocalPolicyAnalysis[] = [];

export const useLocalAnalyses = (domain: string | null): LocalAnalyses => {
  const runState = useStorageValue(sitePolicyRunStorage) ?? IDLE_SITE_POLICY_RUN;
  const [analyses, setAnalyses] = useState<LocalPolicyAnalysis[]>(EMPTY);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken(token => token + 1), []);

  /*
   * `complete` rather than the whole run state: a completed run for THIS domain is the only
   * transition that adds an analysis, and an in-flight one adds nothing to read yet.
   */
  const completedRun = runState.status === 'complete' && runState.domain === domain ? runState.startedAt : null;

  useEffect(() => {
    if (!domain) {
      setAnalyses(EMPTY);
      setStatus('ready');
      return;
    }

    let disposed = false;
    setStatus('loading');

    localSitePolicyStorage
      .getForDomain(domain)
      .then(found => {
        if (disposed) return;
        setAnalyses(found.length > 0 ? found : EMPTY);
        setStatus('ready');
      })
      .catch(() => {
        // An unreadable store is not something the reader can act on, and the panel above this
        // never depended on it. Fall back to "none" rather than surfacing a failure.
        if (disposed) return;
        setAnalyses(EMPTY);
        setStatus('ready');
      });

    return () => {
      disposed = true;
    };
  }, [domain, completedRun, reloadToken]);

  return { status, analyses, runState, reload };
};

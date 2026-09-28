import { localSitePolicyStorage } from '@extension/storage';
import { formatAnalysedDate, shortenUrl } from '@src/lib/presentation';
import { useCallback, useEffect, useState } from 'react';
import type { LocalPolicyIndexEntry } from '@extension/storage';
import type { SitePolicyRunState } from '@extension/unshafted-core';

/**
 * What a run looks like from the panel, during and after.
 *
 * The run happens in the service worker and outlives this panel by design, so everything here is
 * a read of state somebody else wrote. Three outcomes get their own words, and conflating any two
 * of them would tell the user the wrong thing to do next:
 *
 *  - In flight. Name the document being read and say where it is in the queue. Runs are
 *    sequential (S5), so a failure partway through still leaves the finished ones saved.
 *  - Failures. Documents that produced no analysis. Named, never swallowed — a run that quietly
 *    covered three of four documents would leave the reader believing the site was covered.
 *  - Over budget (S8). A DIFFERENT thing: the analysis succeeded, the user paid for it, and the
 *    store could not keep it. The fix is theirs to make, and we never make it for them, so this
 *    is the one place the panel offers a delete.
 */

const formatBytes = (bytes: number) => `${Math.round(bytes / 1024).toLocaleString()} KB`;

/** What is saved and what it costs. Plain I/O with no state in it, so both readers can share it. */
const readStoredState = async () => {
  const [listed, measured] = await Promise.all([localSitePolicyStorage.list(), localSitePolicyStorage.stats()]);
  return { entries: listed, stats: { bytes: measured.bytes, budgetBytes: measured.budgetBytes } };
};

/**
 * A run in progress, as the analyse bar's content. It takes the place the offer to run was in, so
 * the reader watches it where they started it — the bar is the run's place, before, during and
 * after, and the reading flow above it is never interrupted by a progress card.
 */
const RunProgress = ({ runState }: { runState: SitePolicyRunState }) => {
  const position = runState.currentUrl ? runState.completed + 1 : runState.completed;

  return (
    <div className="panel-run-progress" role="status">
      <p className="panel-run-line">
        <span className="panel-busy-dot" aria-hidden="true" />
        <span>
          Analysing {position} of {runState.total}
          {runState.currentUrl ? ` — ${shortenUrl(runState.currentUrl)}` : ''}
        </span>
      </p>
      <p className="panel-quiet">
        This runs outside the panel, so closing the panel will not stop it or lose what it has finished.
      </p>
    </div>
  );
};

/**
 * The only delete in the product, and it exists because eviction is not an option here (S8).
 * `localSitePolicyStorage` never drops anything on its own: a local analysis is not re-fetchable,
 * so evicting one destroys something the user paid for. The trade has to be theirs.
 */
const StorageRelief = ({ onChanged }: { onChanged: () => void }) => {
  const [entries, setEntries] = useState<LocalPolicyIndexEntry[] | null>(null);
  const [stats, setStats] = useState<{ bytes: number; budgetBytes: number } | null>(null);

  const refresh = useCallback(async () => {
    const state = await readStoredState();
    setEntries(state.entries);
    setStats(state.stats);
  }, []);

  /*
   * The first read is the effect's own, rather than a call to `refresh`. It needs a disposal guard
   * that `refresh` cannot have — `refresh` is also awaited by `remove`, where landing after the
   * component is gone is impossible — and reading through a callback left the state write looking
   * synchronous from the effect body.
   */
  useEffect(() => {
    let disposed = false;

    void readStoredState().then(state => {
      if (disposed) return;
      setEntries(state.entries);
      setStats(state.stats);
    });

    return () => {
      disposed = true;
    };
  }, []);

  const remove = async (hash: string) => {
    await localSitePolicyStorage.remove(hash);
    await refresh();
    onChanged();
  };

  if (!entries) return <p className="panel-quiet">Reading what is saved…</p>;

  return (
    <div className="panel-storage">
      {stats ? (
        <p className="panel-quiet">
          {formatBytes(stats.bytes)} of {formatBytes(stats.budgetBytes)} used across {entries.length}{' '}
          {entries.length === 1 ? 'analysis' : 'analyses'}.
        </p>
      ) : null}

      {entries.map(entry => (
        <div key={entry.hash} className="panel-row flex items-center gap-2">
          <span className="min-w-0 flex-1">
            <span className="panel-item-title block truncate">{entry.domain}</span>
            <span className="panel-url">
              {formatAnalysedDate(entry.ranAt)} · {formatBytes(entry.bytes)}
            </span>
          </span>
          {/* The only delete in the product: a row action, in the danger tone, never a filled button. */}
          <button
            className="panel-text-button unshafted-danger-action"
            type="button"
            aria-label={`Delete the saved analysis of ${entry.domain}`}
            onClick={() => void remove(entry.hash)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
};

const RunOutcome = ({ runState, onStorageChanged }: { runState: SitePolicyRunState; onStorageChanged: () => void }) => {
  const [managing, setManaging] = useState(false);

  if (runState.failures.length === 0 && !runState.overBudget) return null;

  /*
   * An app failure, not a finding: the app surface with its own edge rule (P1's exception), never a
   * risk tint. A run that did not happen says nothing about the document, and rose here would read
   * as a verdict on it.
   */
  return (
    <section className="panel-zone panel-app-notice unshafted-danger-tone" role="status">
      {runState.failures.length > 0 ? (
        <>
          <p className="panel-note-title">Did not run</p>
          <div>
            {runState.failures.map(failure => (
              <div key={failure.sourceUrl} className="panel-row">
                <p className="panel-item-title truncate">{shortenUrl(failure.sourceUrl)}</p>
                <p className="panel-quiet">{failure.message}</p>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {runState.overBudget ? (
        <div className={runState.failures.length > 0 ? 'mt-3' : ''}>
          <p className="panel-note-title">Analysed, not saved</p>
          <p className="panel-quiet">
            {shortenUrl(runState.overBudget.sourceUrl)} was analysed and there was no room to keep it. Saved analyses
            take {formatBytes(runState.overBudget.bytes)} and the limit is{' '}
            {formatBytes(runState.overBudget.budgetBytes)}. Nothing was deleted to make room, so nothing you already
            have was lost — and this result is gone unless you free space and run it again.
          </p>

          {managing ? (
            <StorageRelief onChanged={onStorageChanged} />
          ) : (
            <div className="panel-actions">
              <button className="panel-button" type="button" onClick={() => setManaging(true)}>
                Free space
              </button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};

export { RunProgress, RunOutcome };

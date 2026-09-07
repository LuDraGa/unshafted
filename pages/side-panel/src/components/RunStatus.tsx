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

export const RunProgress = ({ runState }: { runState: SitePolicyRunState }) => {
  const position = runState.currentUrl ? runState.completed + 1 : runState.completed;

  return (
    <section className="panel-one-thing">
      <p className="panel-eyebrow">Analysing</p>
      <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
        {runState.currentUrl ? `Reading ${shortenUrl(runState.currentUrl)}.` : 'Waiting on the next document.'}{' '}
        {position} of {runState.total}.
      </p>
      <p className="m-0 mt-1 text-[11px] leading-relaxed text-[var(--unshafted-text-faint)]">
        This runs outside the panel, so closing the panel will not stop it or lose what it has finished.
      </p>
    </section>
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
    const [listed, measured] = await Promise.all([localSitePolicyStorage.list(), localSitePolicyStorage.stats()]);
    setEntries(listed);
    setStats({ bytes: measured.bytes, budgetBytes: measured.budgetBytes });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = async (hash: string) => {
    await localSitePolicyStorage.remove(hash);
    await refresh();
    onChanged();
  };

  if (!entries)
    return <p className="m-0 mt-2 text-[11px] text-[var(--unshafted-text-faint)]">Reading what is saved…</p>;

  return (
    <div className="panel-group mt-2">
      {stats ? (
        <p className="m-0 text-[11px] text-[var(--unshafted-text-faint)]">
          {formatBytes(stats.bytes)} of {formatBytes(stats.budgetBytes)} used across {entries.length}{' '}
          {entries.length === 1 ? 'analysis' : 'analyses'}.
        </p>
      ) : null}

      {entries.map(entry => (
        <div key={entry.hash} className="panel-row flex items-center gap-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-[var(--unshafted-text)]">
              {entry.domain}
            </span>
            <span className="mt-0.5 block text-[10px] text-[var(--unshafted-text-faint)]">
              {formatAnalysedDate(entry.ranAt)} · {formatBytes(entry.bytes)}
            </span>
          </span>
          <button className="panel-button" type="button" onClick={() => void remove(entry.hash)}>
            Delete
          </button>
        </div>
      ))}
    </div>
  );
};

export const RunOutcome = ({
  runState,
  onStorageChanged,
}: {
  runState: SitePolicyRunState;
  onStorageChanged: () => void;
}) => {
  const [managing, setManaging] = useState(false);

  if (runState.failures.length === 0 && !runState.overBudget) return null;

  return (
    <section className="panel-one-thing">
      {runState.failures.length > 0 ? (
        <>
          <p className="panel-eyebrow">Did not run</p>
          <div className="panel-group mt-1">
            {runState.failures.map(failure => (
              <div key={failure.sourceUrl} className="panel-row">
                <p className="m-0 truncate text-[13px] font-semibold text-[var(--unshafted-text)]">
                  {shortenUrl(failure.sourceUrl)}
                </p>
                <p className="m-0 mt-0.5 text-[11px] leading-relaxed text-[var(--unshafted-text-muted)]">
                  {failure.message}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {runState.overBudget ? (
        <div className={runState.failures.length > 0 ? 'mt-3' : ''}>
          <p className="panel-eyebrow">Analysed, not saved</p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
            {shortenUrl(runState.overBudget.sourceUrl)} was analysed and there was no room to keep it. Saved analyses
            take {formatBytes(runState.overBudget.bytes)} and the limit is{' '}
            {formatBytes(runState.overBudget.budgetBytes)}. Nothing was deleted to make room, so nothing you already
            have was lost — and this result is gone unless you free space and run it again.
          </p>

          {managing ? (
            <StorageRelief onChanged={onStorageChanged} />
          ) : (
            <div className="mt-2">
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

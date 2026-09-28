import { AnalyseConfirm } from '@src/components/AnalyseConfirm';
import { RunProgress } from '@src/components/RunStatus';
import type { RankedPolicyCandidate, SitePolicyRunState } from '@extension/unshafted-core';
import type { LivePolicyCheck } from '@src/hooks/useLivePolicyCheck';

/**
 * Running an analysis has one place, and it is not in the reading flow.
 *
 * The popup keeps its next action in a sticky bar at the bottom — scope on the left, the action on
 * the right — and opens the scope sheet out of that same bar. This is that, for the panel. The
 * offer, the confirm (S5) and the run in progress are three states of ONE surface, so the reader
 * always knows where spending lives, and none of it ever pushes a finding down the page.
 *
 * It is Floating, not Primary: pinned to the bottom edge on a solid ground, with a hairline. On a
 * screen with results on it the offer is outlined, because reading is that screen's job and a
 * re-run is not; the filled button belongs to the confirm's commit, and to the offer only when
 * analysing is the one thing the screen has.
 */
export const AnalyseBar = ({
  domain,
  check,
  candidates,
  reading,
  run,
  hasResults,
  confirming,
  onConfirm,
  onCancel,
}: {
  domain: string;
  check: LivePolicyCheck;
  /** Read and typed — see `analysable` in `SidePanel.tsx` (D8). */
  candidates: readonly RankedPolicyCandidate[];
  /** The page's top documents are still being read, so there is nothing to offer yet. */
  reading: boolean;
  /** This domain's run, when there is one. */
  run: SitePolicyRunState | null;
  hasResults: boolean;
  confirming: { preselected: string | null } | null;
  onConfirm: (preselected: string | null) => void;
  onCancel: () => void;
}) => {
  if (run?.status === 'running') {
    return (
      <div className="panel-cta-bar">
        <RunProgress runState={run} />
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="panel-cta-bar panel-cta-sheet">
        <AnalyseConfirm
          domain={domain}
          candidates={candidates}
          preselected={confirming.preselected}
          check={check}
          onCancel={onCancel}
          onStarted={onCancel}
        />
      </div>
    );
  }

  /*
   * D8 reads before it offers, so for a moment after the panel opens there is nothing to offer and
   * something happening. Saying so keeps the offer from appearing out of nowhere a second later.
   */
  if (reading) {
    return (
      <div className="panel-cta-bar">
        <div className="panel-cta-text">
          <p className="panel-cta-title">Reading this page’s documents…</p>
          <p className="panel-cta-scope">You are offered only what we can read</p>
        </div>
      </div>
    );
  }

  if (candidates.length === 0) return null;

  const count = candidates.length === 1 ? '1 document' : `${candidates.length} documents`;

  return (
    <div className="panel-cta-bar">
      <div className="panel-cta-text">
        <p className="panel-cta-title">{hasResults ? 'Run these again on your key' : 'Analyse on your own key'}</p>
        {/* "From", not "on": a document reached through a hub (A3) is one link away from the page. */}
        <p className="panel-cta-scope">{count} from this page · we do not review the result</p>
      </div>
      <button
        className={hasResults ? 'panel-button' : 'panel-button-primary'}
        type="button"
        onClick={() => onConfirm(null)}>
        {hasResults ? 'Run again…' : 'Analyse…'}
      </button>
    </div>
  );
};

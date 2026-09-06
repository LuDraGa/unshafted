import { resolveCoveredHostname, resolveHostnameAnalyses } from '@extension/shared';
import { domainRiskSummary } from '@extension/unshafted-core';
import { useEffect, useState } from 'react';
import type { RiskLevel } from '@extension/unshafted-core';

/**
 * The site strip — the popup's entire share of site policy awareness (D8).
 *
 * The popup belongs to the document-upload flow. Everything site-policy moved to the side panel,
 * and what is left here is the doorway: domain, worst risk level, document count, one button.
 *
 * IT RENDERS IN TWO STRENGTHS (D15), and the difference has to be visible at a glance:
 *
 *  - COVERED — risk-toned, states the level and the document count. A graded claim.
 *  - UNCOVERED — no colour, no level, no count. Says only that we have not analysed the site and
 *    that its documents can still be read. That is a real offer, and a much weaker one.
 *
 * The original version rendered nothing at all when uncovered. That was over-corrected: it did
 * stop the old panel's failure mode (a "check this site" button on every page that could only end
 * in "couldn't find a policy document"), but it also made the reader unreachable on precisely the
 * sites where the reader is the only thing we have.
 *
 * What must not come back is the two surfaces disagreeing. Coverage is decided by
 * `resolveCoveredHostname`, the exact call the badge makes, so the strip's *colour* and the badge
 * can never contradict each other. The uncovered strip is deliberately uncoloured, so it makes no
 * claim the dark badge denies.
 *
 * ZERO NETWORK (AD-2 / D11). Both lookups below read extension-local assets through
 * `chrome.runtime.getURL`. Nothing keyed by the user's domain leaves the browser.
 */

/** Matches the badge's four tints in spirit; the popup has room for words, so it uses them too. */
const RISK_TONE: Record<RiskLevel, string> = {
  Low: 'border-stone-200 bg-stone-50 text-stone-800',
  Medium: 'border-amber-200 bg-amber-50 text-amber-900',
  High: 'border-rose-200 bg-rose-50 text-rose-900',
  'Very High': 'border-rose-300 bg-rose-100 text-rose-950',
};

type StripState =
  | { kind: 'hidden' }
  | { kind: 'uncovered'; tabId: number | null; hostname: string }
  | { kind: 'covered'; tabId: number | null; domain: string; riskLevel: RiskLevel; documentCount: number | null };

const hostnameFor = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // chrome://, file://, about:, devtools:// — no site, nothing to cover.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname;
  } catch {
    return null;
  }
};

export const SiteStrip = () => {
  const [state, setState] = useState<StripState>({ kind: 'hidden' });

  useEffect(() => {
    let disposed = false;

    const resolve = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const hostname = hostnameFor(tab?.url);
      if (!hostname) return;

      const resolution = await resolveCoveredHostname(hostname);
      if (disposed) return;

      if (!resolution) {
        // Uncovered is a state, not an absence. The panel can still read the page's documents.
        setState({ kind: 'uncovered', tabId: tab?.id ?? null, hostname });
        return;
      }

      /*
       * Show the strip on the index alone. The corpus is ~1 MB of JSON and the count is the only
       * thing in it we need here, so waiting for it would delay the whole strip behind a parse
       * the user did not ask for. The count arrives a beat later and slots in.
       */
      setState({
        kind: 'covered',
        tabId: tab?.id ?? null,
        domain: resolution.domain,
        riskLevel: resolution.entry.riskLevel,
        documentCount: null,
      });

      const analyses = await resolveHostnameAnalyses(hostname);
      const summary = analyses ? domainRiskSummary(analyses.analyses) : null;
      if (!summary || disposed) return;

      setState(previous =>
        previous.kind === 'covered' ? { ...previous, documentCount: summary.documentCount } : previous,
      );
    };

    // A popup is opened over one tab and dies with it, so there is nothing to re-resolve on.
    void resolve().catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, []);

  if (state.kind === 'hidden') return null;

  const { tabId } = state;

  /*
   * `sidePanel.open()` requires a user gesture, and this click is it — which is the whole reason
   * D8 keeps the panel two clicks away instead of one. The popup closes as the panel takes focus;
   * that is Chrome's behaviour, not a bug, and there is nothing left here to keep open anyway.
   */
  const openPanel = () => {
    if (tabId === null) return;
    void chrome.sidePanel.open({ tabId }).catch(error => console.warn('[Unshafted] side panel did not open:', error));
  };

  // Uncovered: no tone, no level, no count. The absence of colour IS the message.
  if (state.kind === 'uncovered') {
    return (
      <section className="mb-4 flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-stone-700">{state.hostname}</p>
          <p className="text-xs text-stone-500">Not analysed — you can still read its policies</p>
        </div>
        <button
          className="flex-shrink-0 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
          onClick={openPanel}
          type="button"
          disabled={tabId === null}>
          Find documents
        </button>
      </section>
    );
  }

  const { domain, riskLevel, documentCount } = state;

  return (
    <section className={`mb-4 flex items-center gap-3 rounded-2xl border px-3 py-2 ${RISK_TONE[riskLevel]}`}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{domain}</p>
        <p className="text-xs">
          {riskLevel} risk
          {/* Held back until the corpus resolves rather than shown as "0 documents", which reads as a denial of coverage. */}
          {documentCount === null ? null : ` · ${documentCount} document${documentCount === 1 ? '' : 's'} read`}
        </p>
      </div>
      <button
        className="flex-shrink-0 rounded-xl bg-white/70 px-3 py-1.5 text-xs font-bold text-stone-900 transition hover:bg-white"
        onClick={openPanel}
        type="button"
        disabled={tabId === null}>
        What you agreed to
      </button>
    </section>
  );
};

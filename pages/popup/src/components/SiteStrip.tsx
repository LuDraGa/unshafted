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
 * IT RENDERS ONLY ON A COVERED SITE. Not a "check this site" button on every page — that is what
 * the old panel did, and it is why the badge and the popup could disagree: the badge was silent
 * on an uncovered site while the popup still invited a click that could only end in
 * "couldn't find a policy document linked from this page". Coverage is decided by
 * `resolveCoveredHostname`, the exact call the badge and the side-panel gate make, so all three
 * surfaces answer from the same 45 KB bundled index and cannot contradict each other.
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
      if (!resolution || disposed) return;

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

  if (state.kind !== 'covered') return null;

  const { tabId, domain, riskLevel, documentCount } = state;

  /*
   * `sidePanel.open()` requires a user gesture, and this click is it — which is the whole reason
   * D8 keeps the panel two clicks away instead of one. The popup closes as the panel takes focus;
   * that is Chrome's behaviour, not a bug, and there is nothing left here to keep open anyway.
   */
  const openPanel = () => {
    if (tabId === null) return;
    void chrome.sidePanel.open({ tabId }).catch(error => console.warn('[Unshafted] side panel did not open:', error));
  };

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

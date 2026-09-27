/**
 * The rendered report against its own model: every count on the page equals what renders beside
 * it, nothing needed to verify a finding sits behind a control, and the things that open rows
 * other than a click — Expand all, a jump link, printing — do what they claim.
 *
 * Layout and the open animation are not asserted here; jsdom computes neither. Those were walked
 * in the harness (execution-docs/deep-report-execution.md, R2b).
 */
import { sampleDeepAnalysis, sampleQuickScan } from '@extension/unshafted-core';
import { buildAsks, buildBlockerTiers, buildGlance } from '@src/report-model';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryRecord } from '@extension/unshafted-core';

const store = vi.hoisted(() => {
  let records: unknown[] = [];
  const listeners = new Set<() => void>();
  return {
    reset: (next: unknown[]) => {
      records = next;
      listeners.clear();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => records,
  };
});

vi.mock('@src/Report.css', () => ({}));

vi.mock('@extension/shared', () => ({
  useStorage: (s: typeof store) => useSyncExternalStore(s.subscribe, s.getSnapshot),
  withErrorBoundary: <T,>(component: T) => component,
  withSuspense: <T,>(component: T) => component,
}));

const NO_TICKS = vi.hoisted(() => ({}));

vi.mock('@extension/storage', () => ({
  analysisHistoryStorage: store,
  // Ticks have their own suite (report-checklist.test.tsx); here they are simply empty. One object,
  // because a snapshot that is new on every read is a store that never settles.
  reportChecklistStorage: { subscribe: () => () => {}, getSnapshot: () => NO_TICKS, setTicked: async () => {} },
}));

vi.mock('@extension/ui', () => ({
  ErrorDisplay: () => null,
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
  RISK_TONE: { Low: '', Medium: '', High: '', 'Very High': '' },
}));

const record = (deep: HistoryRecord['deepAnalysis']): HistoryRecord => ({
  id: 'r',
  createdAt: '2026-09-23T10:00:00.000Z',
  source: {
    kind: 'file',
    name: 'service-agreement.pdf',
    slug: 'service-agreement',
    contentHash: 'hash',
    charCount: 1200,
    estimatedTokens: 300,
    preview: 'A service agreement.',
    quality: 'good',
    warnings: [],
    capturedAt: '2026-09-23T10:00:00.000Z',
  },
  quickScan: sampleQuickScan,
  deepAnalysis: deep,
  selectedRole: 'Contractor',
  priorities: [],
  storageState: 'local-only',
});

/** `null` for a quick-only record; `undefined` would fall back to the default. */
const renderReport = async (deep: HistoryRecord['deepAnalysis'] | null = sampleDeepAnalysis) => {
  store.reset([record(deep ?? undefined)]);
  window.history.replaceState({}, '', '/report/index.html?id=r');
  vi.resetModules();
  const { default: Report } = await import('@src/Report');
  return render(<Report />);
};

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const detailsIn = (id: string) => [...byId(id).querySelectorAll('details')];

const findings = [
  ...sampleDeepAnalysis.immediateWorries,
  ...sampleDeepAnalysis.oneSidedClauses,
  ...sampleDeepAnalysis.timingAndLockIn,
  ...sampleDeepAnalysis.couldShaftYouLater,
];

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('report sections', () => {
  it('renders exactly as many items as the strip and the group headings count', async () => {
    await renderReport();
    const asks = buildAsks(sampleDeepAnalysis);
    const tiers = buildBlockerTiers(sampleDeepAnalysis, asks);

    for (const tier of tiers) {
      expect(detailsIn(tier.anchor).length).toBe(tier.findings.length);
      expect(within(byId(tier.anchor)).getByRole('heading', { level: 3 }).textContent).toContain(
        String(tier.findings.length),
      );
    }
    expect(detailsIn('asks-negotiate').length).toBe(asks.negotiate.length);
    expect(detailsIn('asks-edits').length).toBe(asks.edits.length);
    expect(detailsIn('asks-protections').length).toBe(asks.protections.length);
    expect(byId('asks-questions').querySelectorAll('ol > li').length).toBe(asks.questions.length);
    expect(byId('asks-checklist').querySelectorAll('fieldset').length).toBe(asks.checklist.length);
    expect(byId('asks-checklist').querySelectorAll('input[type=checkbox]').length).toBe(asks.checklistItemCount);
    expect(detailsIn('evidence').length).toBe(sampleDeepAnalysis.topicConcerns.length);

    const strip = within(screen.getByRole('navigation', { name: 'At a glance' }));
    const labels = strip.getAllByRole('link').map(a => a.textContent);
    expect(labels).toEqual(buildGlance(tiers, asks, 0).map(g => g.label));
    for (const link of strip.getAllByRole('link')) expect(byId(link.getAttribute('href')!.slice(1))).toBeTruthy();
  });

  it('keeps every finding’s title, severity and quote inside its summary, never behind the control', async () => {
    await renderReport();
    const summaries = [...document.querySelectorAll('#blockers summary')];
    expect(summaries.length).toBe(findings.length);
    for (const finding of findings) {
      const summary = summaries.find(s => s.textContent?.includes(finding.title));
      expect(summary, finding.title).toBeTruthy();
      expect(summary?.textContent).toContain(finding.severity);
      if (finding.reference?.quote) expect(summary?.textContent).toContain(finding.reference.quote);
    }
  });

  it('is non-exclusive, and opens only the deal-breakers by default', async () => {
    await renderReport();
    const all = [...document.querySelectorAll('details')];
    expect(all.some(d => d.hasAttribute('name'))).toBe(false);
    expect(detailsIn('tier-high').every(d => d.open)).toBe(true);
    expect(detailsIn('tier-medium').some(d => d.open)).toBe(false);
    expect(detailsIn('asks').some(d => d.open)).toBe(false);
  });

  it('labels Expand all from the group’s current state', async () => {
    await renderReport();
    const tier = within(byId('tier-medium'));
    fireEvent.click(tier.getByRole('button', { name: /Expand all/ }));
    expect(detailsIn('tier-medium').every(d => d.open)).toBe(true);
    expect(tier.getByRole('button', { name: /Collapse all/ }).textContent).toBe('Collapse all');

    fireEvent.click(tier.getByRole('button', { name: /Collapse all/ }));
    expect(detailsIn('tier-medium').some(d => d.open)).toBe(false);
  });

  it('opens everything to print, then puts back exactly what was closed', async () => {
    await renderReport();
    fireEvent.click(within(byId('tier-high')).getByRole('button', { name: /Collapse all/ }));
    const before = [...document.querySelectorAll('details')].map(d => d.open);

    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    expect([...document.querySelectorAll('details')].every(d => d.open)).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect([...document.querySelectorAll('details')].map(d => d.open)).toEqual(before);
  });

  it('jumps from a finding to its paired ask, opening the ask and moving focus to it', async () => {
    await renderReport();
    const link = screen.getAllByRole('link', { name: /Your ask/ })[0];
    const target = byId(link.getAttribute('href')!.slice(1)) as HTMLDetailsElement;
    expect(target.open).toBe(false);

    fireEvent.click(link);

    expect(target.open).toBe(true);
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(target.querySelector('summary'));
  });

  it('shows a quick scan as a pointer back to the popup, not as half a report', async () => {
    await renderReport(null);
    expect(screen.getByText(/This is a quick scan/)).toBeTruthy();
    expect(document.querySelector('.report-section')).toBeNull();
  });
});

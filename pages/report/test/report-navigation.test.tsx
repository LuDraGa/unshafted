/**
 * Getting around the report (plan §5): the rail and the strip list what the page holds, the entry
 * for where the reader is carries `aria-current="location"`, a click holds its target until the
 * scroll lands, and the sticky bar appears only once the page header has gone.
 *
 * Scrolling is driven through the fake observers in `test/setup.ts`; jsdom has no layout, so what
 * is asserted is the logic on top of the observers, and the geometry was walked in the harness.
 */
import { intersect } from './setup';
import { sampleDeepAnalysis, sampleQuickScan } from '@extension/unshafted-core';
import { buildSections } from '@src/report-model';
import { act, fireEvent, render, within } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryRecord } from '@extension/unshafted-core';
import type { DeepRecord } from '@src/report-model';

const store = vi.hoisted(() => {
  let records: unknown[] = [];
  return {
    reset: (next: unknown[]) => {
      records = next;
    },
    subscribe: () => () => {},
    getSnapshot: () => records,
  };
});

const NO_TICKS = vi.hoisted(() => ({}));

vi.mock('@src/Report.css', () => ({}));

vi.mock('@extension/shared', () => ({
  useStorage: (s: typeof store) => useSyncExternalStore(s.subscribe, s.getSnapshot),
  withErrorBoundary: <T,>(component: T) => component,
  withSuspense: <T,>(component: T) => component,
}));

vi.mock('@extension/storage', () => ({
  analysisHistoryStorage: store,
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

const rail = () => within(document.querySelector<HTMLElement>('.report-rail')!);
const strip = () => within(document.querySelector<HTMLElement>('.report-strip')!);
const current = (nav: ReturnType<typeof rail>) =>
  nav
    .getAllByRole('link')
    .filter(a => a.getAttribute('aria-current') === 'location')
    .map(a => a.getAttribute('href'));
const chrome = () => document.querySelector<HTMLElement>('.report-chrome')!;
const section = (id: string) => document.getElementById(id)!;

beforeEach(() => {
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
});

describe('rail and strip', () => {
  it('list every section the page renders, in order, with the model’s counts', async () => {
    await renderReport();
    const sections = buildSections(record(sampleDeepAnalysis) as DeepRecord);

    for (const nav of [rail(), strip()]) {
      const links = nav.getAllByRole('link');
      expect(links.map(a => a.getAttribute('href'))).toEqual(sections.map(s => `#${s.id}`));
      for (const [i, s] of sections.entries()) {
        expect(section(s.id)).toBeTruthy();
        if (s.count !== undefined)
          expect(links[i].querySelector('.report-nav-count')?.textContent).toBe(String(s.count));
      }
    }
  });

  it('say how Blockers splits by severity in words, not only in the mark', async () => {
    await renderReport();
    const blockers = rail().getByRole('link', { name: /Blockers/ });
    const { split } = buildSections(record(sampleDeepAnalysis) as DeepRecord).find(s => s.id === 'blockers')!;
    for (const [severity, n] of Object.entries(split!)) {
      if (n > 0) expect(blockers.textContent).toContain(`${n} ${severity}`);
    }
  });

  it('mark the Verdict as current before anything has scrolled', async () => {
    await renderReport();
    expect(current(rail())).toEqual(['#verdict']);
    expect(current(strip())).toEqual(['#verdict']);
  });
});

describe('scroll-spy', () => {
  it('follows the section at the reading line: the first one not yet scrolled up past it', async () => {
    await renderReport();
    act(() => intersect(section('verdict'), true));
    expect(current(rail())).toEqual(['#verdict']);

    // Blockers' heading comes up the screen while the verdict is still at the line.
    act(() => intersect(section('blockers'), true));
    act(() => intersect(section('asks'), true));
    expect(current(rail())).toEqual(['#verdict']);

    act(() => intersect(section('verdict'), false));
    expect(current(rail())).toEqual(['#blockers']);
    expect(current(strip())).toEqual(['#blockers']);

    act(() => intersect(section('blockers'), false));
    expect(current(rail())).toEqual(['#asks']);

    // Scrolling back up brings Blockers back down to the line.
    act(() => intersect(section('blockers'), true));
    expect(current(rail())).toEqual(['#blockers']);
  });

  it('keeps the last answer while nothing is under the line', async () => {
    await renderReport();
    act(() => intersect(section('evidence'), true));
    act(() => intersect(section('evidence'), false));
    expect(current(rail())).toEqual(['#evidence']);
  });

  it('selects the last section at the foot of the page, where short sections never reach the band', async () => {
    await renderReport();
    act(() => intersect(section('doc'), true));
    Object.defineProperty(window, 'scrollY', { value: 4000, configurable: true });

    act(() => intersect(document.querySelector('.report-footer')!, true));
    expect(current(rail())).toEqual(['#caveats']);

    act(() => intersect(document.querySelector('.report-footer')!, false));
    expect(current(rail())).toEqual(['#doc']);
  });

  it('keeps a section the reader jumped to at the foot of the page, until they leave it', async () => {
    await renderReport();
    Object.defineProperty(window, 'scrollY', { value: 4000, configurable: true });

    // Doc is too near the end to reach the line; the page bottoms out with it on screen.
    section('doc').getBoundingClientRect = () => ({ top: 300, bottom: 500 }) as DOMRect;
    section('wins').getBoundingClientRect = () => ({ top: -900, bottom: -100 }) as DOMRect;
    fireEvent.click(rail().getByRole('link', { name: /^Doc/ }));
    // The reading observer can report before the end observer does in the same frame.
    act(() => intersect(section('wins'), false));
    act(() => intersect(document.querySelector('.report-footer')!, true));
    act(() => {
      window.dispatchEvent(new Event('scrollend'));
    });
    expect(current(rail())).toEqual(['#doc']);

    act(() => intersect(document.querySelector('.report-footer')!, false));
    act(() => intersect(document.querySelector('.report-footer')!, true));
    expect(current(rail())).toEqual(['#caveats']);
  });

  it('holds a clicked entry until the scroll lands, then hands back to the spy', async () => {
    await renderReport();
    const target = section('caveats');
    target.scrollIntoView = vi.fn();

    fireEvent.click(rail().getByRole('link', { name: /Caveats/ }));
    expect(target.scrollIntoView).toHaveBeenCalled();
    expect(current(rail())).toEqual(['#caveats']);

    // The smooth scroll passes Asks on the way down; the highlight does not follow it there.
    act(() => intersect(section('asks'), true));
    expect(current(rail())).toEqual(['#caveats']);
    expect(current(strip())).toEqual(['#caveats']);

    act(() => {
      window.dispatchEvent(new Event('scrollend'));
    });
    expect(current(rail())).toEqual(['#asks']);
  });
});

describe('sticky bar', () => {
  it('stays out of sight and out of reach until the page header has scrolled away', async () => {
    await renderReport();
    const header = document.querySelector('.report-header')!;

    expect(chrome().hasAttribute('data-shown')).toBe(false);
    expect(chrome().hasAttribute('inert')).toBe(true);

    act(() => intersect(header, false, -120));
    expect(chrome().hasAttribute('data-shown')).toBe(true);
    expect(chrome().hasAttribute('inert')).toBe(false);
    expect(within(chrome()).getByText('service-agreement.pdf')).toBeTruthy();

    act(() => intersect(header, true));
    expect(chrome().hasAttribute('data-shown')).toBe(false);
  });

  it('is left out, with the rail, for a quick scan', async () => {
    await renderReport(null);
    expect(document.querySelector('.report-chrome')).toBeNull();
    expect(document.querySelector('.report-rail')).toBeNull();
  });
});

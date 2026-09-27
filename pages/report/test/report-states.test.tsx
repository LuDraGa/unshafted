/**
 * The report page's relationship to history, which is the one thing about it that can go wrong
 * before a single section renders.
 *
 * History is capped, deduplicated by `contentHash`, and written a moment after the popup's button
 * appears, so a record can be not-there-yet, never-there, or gone while the reader is mid-read.
 * Each of those is asserted here, against a store the test can write to while the page is mounted.
 *
 * `Report` reads `?id=` at import time, so each test sets the URL and then imports it fresh.
 */
import { sampleDeepAnalysis, sampleQuickScan } from '@extension/unshafted-core';
import { act, render, screen } from '@testing-library/react';
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
    write: (next: unknown[]) => {
      records = next;
      listeners.forEach(listener => listener());
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
  // The real hook suspends on its first read; these tests are about what happens after it.
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

const recordFor = (id: string, contentHash: string, name = 'service-agreement.pdf'): HistoryRecord => ({
  id,
  createdAt: '2026-09-23T10:00:00.000Z',
  source: {
    kind: 'file',
    name,
    slug: 'service-agreement',
    contentHash,
    charCount: 1200,
    estimatedTokens: 300,
    preview: 'A client-friendly service agreement.',
    quality: 'good',
    warnings: [],
    capturedAt: '2026-09-23T10:00:00.000Z',
  },
  quickScan: sampleQuickScan,
  deepAnalysis: sampleDeepAnalysis,
  selectedRole: 'Contractor',
  priorities: [],
  storageState: 'local-only',
});

const renderAt = async (search: string) => {
  window.history.replaceState({}, '', `/report/index.html${search}`);
  vi.resetModules();
  const { default: Report } = await import('@src/Report');
  return render(<Report />);
};

beforeEach(() => {
  vi.useFakeTimers();
  store.reset([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('report page data states', () => {
  it('renders the record the id names, and titles the tab after it', async () => {
    store.reset([recordFor('a', 'hash-a'), recordFor('b', 'hash-b', 'lease.pdf')]);
    await renderAt('?id=b');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('lease.pdf');
    expect(document.title).toBe('lease.pdf — Unshafted report');
  });

  it('says missing for an id that is not in history, but only once the grace window has passed', async () => {
    store.reset([recordFor('a', 'hash-a')]);
    await renderAt('?id=gone');

    expect(screen.getByText(/Opening your report/)).toBeTruthy();

    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByText(/no longer in your history/)).toBeNull();
    expect(screen.getByText(/Opening your report/)).toBeTruthy();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('heading', { name: /no longer in your history/ })).toBeTruthy();
  });

  it('says missing straight away when there is no id at all', async () => {
    await renderAt('');
    expect(screen.getByRole('heading', { name: /no longer in your history/ })).toBeTruthy();
  });

  it('shows a record that lands inside the grace window without ever saying missing', async () => {
    await renderAt('?id=late');
    expect(screen.getByText(/Opening your report/)).toBeTruthy();

    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByText(/Opening your report/)).toBeTruthy();
    act(() => store.write([recordFor('late', 'hash-late')]));

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('service-agreement.pdf');
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByText(/no longer in your history/)).toBeNull();
  });

  it('keeps the content on screen when the record is removed while open', async () => {
    store.reset([recordFor('a', 'hash-a')]);
    await renderAt('?id=a');

    act(() => store.write([]));

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('service-agreement.pdf');
    expect(screen.getByText(/Removed from history/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open it' })).toBeNull();
  });

  it('offers the newer report when the same document comes back under a new id', async () => {
    store.reset([recordFor('a', 'hash-a')]);
    await renderAt('?id=a');

    // What `push` does on a re-upload: the old record goes and the new one arrives in one write.
    act(() => store.write([recordFor('a2', 'hash-a')]));

    expect(screen.getByText(/A newer report for this document exists/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open it' })).toBeTruthy();
  });

  it('does not treat two records with a blank hash as the same document', async () => {
    store.reset([recordFor('a', '')]);
    await renderAt('?id=a');

    act(() => store.write([recordFor('b', '')]));

    expect(screen.getByText(/Removed from history/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open it' })).toBeNull();
  });
});

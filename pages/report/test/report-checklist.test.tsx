/**
 * Checklist ticks on the page (plan §11.4, §11.6): shown the instant they are clicked, remembered
 * across a remount, steady through a burst of clicks, and kept on the removed copy.
 *
 * The storage side — that ticks leave with their record — is asserted against the real modules in
 * `packages/storage/test/report-checklist-storage.test.ts`. Here storage is a stub whose writes the
 * test resolves by hand, because the thing under test is what the page shows while a write is
 * still in flight.
 */
import { sampleDeepAnalysis, sampleQuickScan } from '@extension/unshafted-core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryRecord } from '@extension/unshafted-core';

const stores = vi.hoisted(() => {
  const make = <T,>(initial: T) => {
    let value = initial;
    const listeners = new Set<() => void>();
    return {
      reset: (next: T) => {
        value = next;
        listeners.clear();
      },
      write: (next: T) => {
        value = next;
        listeners.forEach(listener => listener());
      },
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => value,
    };
  };

  const history = make<unknown[]>([]);
  const ticks = make<Record<string, string[]>>({});

  /** Writes that have been asked for and not yet landed, in order. `land()` completes the oldest. */
  const inFlight: (() => void)[] = [];
  const checklist = {
    ...ticks,
    setTicked: (id: string, key: string, on: boolean) =>
      new Promise<void>(resolve => {
        inFlight.push(() => {
          const keys = new Set(ticks.getSnapshot()[id] ?? []);
          if (on) keys.add(key);
          else keys.delete(key);
          // Like the real storage: the change is emitted before `set` resolves.
          ticks.write({ ...ticks.getSnapshot(), [id]: [...keys] });
          resolve();
        });
      }),
  };
  return { history, ticks, checklist, inFlight };
});

vi.mock('@src/Report.css', () => ({}));

vi.mock('@extension/shared', () => ({
  useStorage: (s: typeof stores.history) => useSyncExternalStore(s.subscribe, s.getSnapshot),
  withErrorBoundary: <T,>(component: T) => component,
  withSuspense: <T,>(component: T) => component,
}));

vi.mock('@extension/storage', () => ({
  analysisHistoryStorage: stores.history,
  reportChecklistStorage: stores.checklist,
}));

vi.mock('@extension/ui', () => ({
  ErrorDisplay: () => null,
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
  RISK_TONE: { Low: '', Medium: '', High: '', 'Very High': '' },
}));

const record: HistoryRecord = {
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
  deepAnalysis: sampleDeepAnalysis,
  selectedRole: 'Contractor',
  priorities: [],
  storageState: 'local-only',
};

const [group] = sampleDeepAnalysis.protectionChecklist;
const firstKey = `${group.label}\u0000${group.items[0]}`;
const total = sampleDeepAnalysis.protectionChecklist.reduce((sum, g) => sum + g.items.length, 0);

const mount = async () => {
  window.history.replaceState({}, '', '/report/index.html?id=r');
  vi.resetModules();
  const { default: Report } = await import('@src/Report');
  return render(<Report />);
};

const firstBox = () =>
  within(document.getElementById('asks-checklist')!).getAllByRole('checkbox')[0] as HTMLInputElement;
const progress = () => document.querySelector('#asks-checklist .report-progress')!.textContent;
/** Completes the oldest write, then lets its `.then` run, as a real write's would before the next event. */
const land = () =>
  act(async () => {
    stores.inFlight.shift()!();
  });

beforeEach(() => {
  stores.history.reset([record]);
  stores.ticks.reset({});
  stores.inFlight.length = 0;
});

describe('checklist ticks', () => {
  it('shows a tick the moment it is clicked, before storage has written it', async () => {
    await mount();

    fireEvent.click(firstBox());

    expect(stores.inFlight).toHaveLength(1);
    expect(firstBox().checked).toBe(true);
    expect(progress()).toBe(`1 of ${total} done`);
    expect(screen.getByRole('link', { name: `Checklist 1 of ${total}` })).toBeTruthy();

    await land();
    expect(firstBox().checked).toBe(true);
    expect(stores.ticks.getSnapshot()).toEqual({ r: [firstKey] });
  });

  it('comes back ticked after the page is mounted again', async () => {
    const first = await mount();
    fireEvent.click(firstBox());
    await land();
    first.unmount();

    await mount();
    expect(firstBox().checked).toBe(true);
    expect(progress()).toBe(`1 of ${total} done`);
  });

  it('never shows a stale state while on, off, on is still being written', async () => {
    await mount();
    const seen: boolean[] = [];

    fireEvent.click(firstBox());
    fireEvent.click(firstBox());
    fireEvent.click(firstBox());
    seen.push(firstBox().checked);

    // Each earlier write lands and emits a value the reader has already clicked past.
    await land();
    seen.push(firstBox().checked);
    await land();
    seen.push(firstBox().checked);
    await land();
    seen.push(firstBox().checked);

    expect(seen).toEqual([true, true, true, true]);
    expect(stores.ticks.getSnapshot()).toEqual({ r: [firstKey] });
  });

  it('follows a tick made in another tab', async () => {
    await mount();
    act(() => stores.ticks.write({ r: [firstKey] }));
    expect(firstBox().checked).toBe(true);
  });

  it('keeps the ticks on screen when the record leaves history and storage prunes them', async () => {
    stores.ticks.reset({ r: [firstKey] });
    await mount();
    expect(firstBox().checked).toBe(true);

    // What `removeReport` does: the history write, then the prune.
    act(() => stores.history.write([]));
    act(() => stores.ticks.write({}));

    expect(screen.getByText(/Removed from history/)).toBeTruthy();
    expect(firstBox().checked).toBe(true);

    // Still usable on the kept copy, and nothing is written for a record that is gone.
    fireEvent.click(firstBox());
    expect(firstBox().checked).toBe(false);
    expect(stores.inFlight).toHaveLength(0);
  });
});

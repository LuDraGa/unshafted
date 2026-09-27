/**
 * The whole-report actions (plan §7): Copy and Export give the complete Markdown with the
 * checklist as ticked, Print prints, and Delete does what the popup's History delete does, behind
 * an inline confirm, then leaves the page up and says so.
 */
import { deleteFromDrive } from '@extension/supabase';
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
  const history = make<{ id: string }[]>([]);
  const ticks = make<Record<string, string[]>>({});
  return {
    history: {
      ...history,
      removeReport: vi.fn(async (record: { id: string }) => {
        history.write(history.getSnapshot().filter(r => r.id !== record.id));
      }),
    },
    ticks: { ...ticks, setTicked: async () => {} },
  };
});

vi.mock('@src/Report.css', () => ({}));

vi.mock('@extension/shared', () => ({
  useStorage: (s: typeof stores.ticks) => useSyncExternalStore(s.subscribe, s.getSnapshot),
  withErrorBoundary: <T,>(component: T) => component,
  withSuspense: <T,>(component: T) => component,
}));

vi.mock('@extension/storage', () => ({
  analysisHistoryStorage: stores.history,
  reportChecklistStorage: stores.ticks,
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
    contentHash: 'hash-r',
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

const mount = async () => {
  window.history.replaceState({}, '', '/report/index.html?id=r');
  vi.resetModules();
  const { default: Report } = await import('@src/Report');
  return render(<Report />);
};

/** The page header's actions, not the sticky bar's copy of them. */
const header = () => within(document.querySelector<HTMLElement>('.report-header')!);

let clipboard = '';

beforeEach(() => {
  stores.history.reset([record]);
  stores.ticks.reset({ r: [`${group.label}\u0000${group.items[0]}`] });
  stores.history.removeReport.mockClear();
  vi.mocked(deleteFromDrive).mockClear();
  clipboard = '';
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async (text: string) => void (clipboard = text) },
    configurable: true,
  });
});

describe('copy, export and print', () => {
  it('copies the complete report, with the checklist as ticked', async () => {
    await mount();
    await act(async () => {
      fireEvent.click(header().getByRole('button', { name: 'Copy' }));
    });

    const findings = [
      ...sampleDeepAnalysis.immediateWorries,
      ...sampleDeepAnalysis.oneSidedClauses,
      ...sampleDeepAnalysis.timingAndLockIn,
      ...sampleDeepAnalysis.couldShaftYouLater,
    ];
    for (const f of findings) expect(clipboard).toContain(f.title);
    for (const q of sampleDeepAnalysis.questionsToAsk) expect(clipboard).toContain(q);
    expect(clipboard).toContain(`- [x] ${group.items[0]}`);
    expect(clipboard).toContain(`- [ ] ${group.items[1]}`);
    expect(header().getByRole('button', { name: 'Copied' })).toBeTruthy();
  });

  it('exports the same Markdown as a file named for the document and the day', async () => {
    await mount();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return 'blob:report';
    });
    URL.revokeObjectURL = vi.fn();
    let downloaded = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloaded = this.download;
    });

    fireEvent.click(header().getByRole('button', { name: 'Export .md' }));

    expect(downloaded).toBe('service-agreement-2026-09-23.md');
    const text = await blobs[0].text();
    expect(text).toMatch(/^# Unshafted report: service-agreement\.pdf/);
    expect(text).toContain(`- [x] ${group.items[0]}`);
    click.mockRestore();
  });

  it('prints', async () => {
    await mount();
    window.print = vi.fn();
    fireEvent.click(header().getByRole('button', { name: 'Print' }));
    expect(window.print).toHaveBeenCalledOnce();
  });

  it('keeps Delete out of the sticky bar', async () => {
    await mount();
    const bar = within(document.querySelector<HTMLElement>('.report-chrome')!);
    expect(bar.getByRole('button', { name: 'Print' })).toBeTruthy();
    expect(bar.queryByRole('button', { name: /Delete/ })).toBeNull();
  });
});

describe('delete', () => {
  it('asks first, with focus on Cancel, and Cancel changes nothing', async () => {
    await mount();
    fireEvent.click(header().getByRole('button', { name: 'Delete' }));

    expect(header().getByText('Delete this report?')).toBeTruthy();
    expect(document.activeElement).toBe(header().getByRole('button', { name: 'Cancel' }));

    fireEvent.click(header().getByRole('button', { name: 'Cancel' }));
    expect(header().queryByText('Delete this report?')).toBeNull();
    expect(stores.history.removeReport).not.toHaveBeenCalled();
  });

  it('removes the report and its Drive copies, then keeps the page up and offers to close it', async () => {
    await mount();
    fireEvent.click(header().getByRole('button', { name: 'Delete' }));
    await act(async () => {
      fireEvent.click(header().getByRole('button', { name: 'Delete permanently' }));
    });

    expect(stores.history.removeReport).toHaveBeenCalledWith(record);
    expect(vi.mocked(deleteFromDrive).mock.calls).toEqual([
      ['hash-r', 'quick-scan'],
      ['hash-r', 'deep-analysis'],
    ]);
    expect(screen.getByText(/Deleted from your history/)).toBeTruthy();
    expect(screen.queryByText(/Removed from history/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Close tab' })).toBeTruthy();
    // The report is still there to read, copy or print, but there is nothing left to delete.
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('service-agreement.pdf');
    expect(header().getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(header().queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});

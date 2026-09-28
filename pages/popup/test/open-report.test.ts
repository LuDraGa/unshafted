/**
 * Opening the full report from the popup (plan §7, "Opening it"): one tab per report. A second
 * open, from the button, from History, or from a double click, focuses the tab already there.
 */
import { openReportTab, reportUrl } from '@src/open-report';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Tab = { id: number; windowId: number; url?: string };

let tabs: Tab[] = [];
const created: string[] = [];

const chromeStub = {
  runtime: { getURL: (path: string) => `chrome-extension://ext/${path}` },
  tabs: {
    query: vi.fn(async () => tabs),
    create: vi.fn(async ({ url }: { url: string }) => {
      // Slow enough that a second click lands while the first is still opening.
      await new Promise(resolve => setTimeout(resolve, 20));
      created.push(url);
      const tab = { id: 100 + created.length, windowId: 1, url };
      tabs.push(tab);
      return tab;
    }),
    update: vi.fn(async () => ({})),
  },
  windows: { update: vi.fn(async () => ({})) },
};

beforeEach(() => {
  tabs = [];
  created.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal('chrome', chromeStub);
});

describe('openReportTab', () => {
  it('builds the report URL with the history id as its only parameter', () => {
    expect(reportUrl('abc 1')).toBe('chrome-extension://ext/report/index.html?id=abc+1');
  });

  it('opens a new tab when none shows this report', async () => {
    tabs = [{ id: 7, windowId: 2, url: reportUrl('other') }];
    await openReportTab('r1');
    expect(created).toEqual([reportUrl('r1')]);
    expect(chromeStub.tabs.update).not.toHaveBeenCalled();
  });

  it('focuses the tab, and its window, when one already shows this report', async () => {
    tabs = [
      { id: 7, windowId: 2, url: reportUrl('other') },
      { id: 9, windowId: 3, url: `${reportUrl('r1')}#asks` },
    ];
    await openReportTab('r1');
    expect(created).toEqual([]);
    expect(chromeStub.tabs.update).toHaveBeenCalledWith(9, { active: true });
    expect(chromeStub.windows.update).toHaveBeenCalledWith(3, { focused: true });
  });

  it('opens one tab for a double click', async () => {
    await Promise.all([openReportTab('r1'), openReportTab('r1')]);
    expect(created).toEqual([reportUrl('r1')]);
  });

  it('falls back to window.open when the tabs API fails', async () => {
    chromeStub.tabs.query.mockRejectedValueOnce(new Error('no tabs'));
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await openReportTab('r1');
    expect(open).toHaveBeenCalledWith(reportUrl('r1'), '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });
});

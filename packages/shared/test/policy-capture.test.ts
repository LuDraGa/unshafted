/**
 * A1 left one link pattern: the injected collector takes it as an argument, from whoever injects
 * it. The core tests prove the collector matches with what it is given. This proves the extension
 * gives it the exported pattern — a literal at this call site would pass every core test and
 * reopen exactly the drift A1 closed.
 */
import {
  discoverActiveTabPolicies,
  readInBackgroundTab,
  renderFromTab,
  renderInBackgroundTab,
} from '../lib/utils/policy-capture';
import { collectPolicyCandidatesInPage, POLICY_LINK_PATTERN, readRenderedPageInPage } from '@extension/unshafted-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('discoverActiveTabPolicies', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('injects the shipped collector with the exported link pattern', async () => {
    const executeScript = vi.fn(async () => [{ result: [] }]);
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn(async () => [{ id: 7, url: 'https://example.com/' }]) },
      scripting: { executeScript },
    });

    const result = await discoverActiveTabPolicies();

    expect(result.status).toBe('discovered');
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      func: collectPolicyCandidatesInPage,
      args: [POLICY_LINK_PATTERN.source],
    });
  });
});

/**
 * A5: reading a page by opening it. The tab is the reader's — it carries their session — so it is
 * opened in the background, only for the document asked about, and closed whatever happens.
 */
describe('readInBackgroundTab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A tabs + scripting stub whose tab finishes loading as soon as it is asked about. */
  const stubTabs = (results: unknown[]) => {
    const listeners = new Set<(tabId: number, change: { status?: string }) => void>();
    const tabs = {
      create: vi.fn(async () => ({ id: 42 })),
      get: vi.fn(async () => ({ id: 42, status: 'complete' })),
      remove: vi.fn(async () => undefined),
      onUpdated: {
        addListener: vi.fn((listener: (tabId: number, change: { status?: string }) => void) => listeners.add(listener)),
        removeListener: vi.fn((listener: (tabId: number, change: { status?: string }) => void) =>
          listeners.delete(listener),
        ),
      },
    };
    const executeScript = vi.fn(async () => {
      const next = results.shift();
      if (next instanceof Error) throw next;
      return [{ result: next }];
    });
    vi.stubGlobal('chrome', { tabs, scripting: { executeScript } });
    return { tabs, executeScript, listeners };
  };

  const reader = async () => ({ html: '<p>x</p>', url: 'https://example.com/x' });

  it('opens the page in a background tab, reads it with the reader it was given, and closes it', async () => {
    const page = { html: '<main>policy</main>', url: 'https://example.com/privacy' };
    const { tabs, executeScript, listeners } = stubTabs([page]);

    const result = await readInBackgroundTab('https://example.com/privacy', reader);

    expect(result).toEqual(page);
    expect(tabs.create).toHaveBeenCalledWith({ url: 'https://example.com/privacy', active: false });
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 42 }, func: reader });
    expect(tabs.remove).toHaveBeenCalledWith(42);
    expect(listeners.size).toBe(0);
  });

  it('reads once more when the page navigates away mid-read, as a bot check that reloads does', async () => {
    const page = { html: '<main>policy</main>', url: 'https://example.com/privacy' };
    const { executeScript, tabs } = stubTabs([new Error('Frame with ID 0 was removed.'), page]);

    expect(await readInBackgroundTab('https://example.com/privacy', reader)).toEqual(page);
    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(tabs.remove).toHaveBeenCalledTimes(1);
  });

  it('gives up after a second failed read, and still closes the tab', async () => {
    const { executeScript, tabs } = stubTabs([new Error('gone'), new Error('gone again'), { html: 'late' }]);

    expect(await readInBackgroundTab('https://example.com/privacy', reader)).toBeNull();
    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(tabs.remove).toHaveBeenCalledWith(42);
  });

  it('answers null, not a throw, when no tab can be opened', async () => {
    const { tabs } = stubTabs([]);
    tabs.create.mockRejectedValueOnce(new Error('No current window'));

    expect(await readInBackgroundTab('https://example.com/privacy', reader)).toBeNull();
    expect(tabs.remove).not.toHaveBeenCalled();
  });

  it('opens with the shipped in-page reader when the panel asks', async () => {
    const { executeScript } = stubTabs([{ html: '<main>policy</main>', url: 'u' }]);
    await renderInBackgroundTab('https://example.com/privacy');
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 42 }, func: readRenderedPageInPage });
  });

  it('reads the reader’s own tab in place, opening nothing', async () => {
    const page = { html: '<main>policy</main>', url: 'https://example.com/privacy#section-2' };
    const { executeScript, tabs } = stubTabs([page]);

    expect(await renderFromTab(7)('https://example.com/privacy')).toEqual(page);
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 7 }, func: readRenderedPageInPage });
    expect(tabs.create).not.toHaveBeenCalled();
  });

  it('does not read the reader’s tab as the document once it has moved to another page', async () => {
    stubTabs([{ html: '<main>pricing</main>', url: 'https://example.com/pricing' }]);
    expect(await renderFromTab(7)('https://example.com/privacy')).toBeNull();
  });
});

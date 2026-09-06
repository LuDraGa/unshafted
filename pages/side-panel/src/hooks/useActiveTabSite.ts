import { resolveCoveredHostname } from '@extension/shared';
import { useEffect, useState } from 'react';
import type { PolicyIndexEntry } from '@extension/unshafted-core';

/**
 * "Which site is the user looking at, and do we cover it?"
 *
 * This is the panel's only piece of Chrome plumbing, deliberately isolated from rendering so the
 * analysis UI (W4) can be a pure function of this result. Everything the panel shows hangs off
 * `domain` and `entry`.
 *
 * ZERO NETWORK (AD-2 / D11). `resolveCoveredHostname` reads the bundled 45 KB index through
 * `chrome.runtime.getURL` — an extension-local asset, never a request keyed by the domain the
 * user is browsing. The panel's first render must stay on that path.
 *
 * A side panel instance is scoped to one browser window and outlives navigation inside it, so it
 * has to re-resolve on two events that a popup never sees: the user switching tabs, and the
 * current tab navigating underneath it.
 */

export type ActiveTabSite = {
  /** `loading` covers the first resolve and every re-resolve; the previous site stays visible. */
  status: 'loading' | 'ready';
  tabId: number | null;
  url: string | null;
  /** The tab's hostname, e.g. `www.hotstar.com`. Null on chrome://, file://, and new tabs. */
  hostname: string | null;
  /** The corpus domain the hostname matched, which is not always the hostname itself. */
  domain: string | null;
  entry: PolicyIndexEntry | null;
  isCovered: boolean;
};

const EMPTY: ActiveTabSite = {
  status: 'ready',
  tabId: null,
  url: null,
  hostname: null,
  domain: null,
  entry: null,
  isCovered: false,
};

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

const resolveActiveTab = async (): Promise<ActiveTabSite> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return EMPTY;

  const hostname = hostnameFor(tab.url);
  const base = { status: 'ready' as const, tabId: tab.id ?? null, url: tab.url ?? null, hostname };

  if (!hostname) return { ...base, domain: null, entry: null, isCovered: false };

  const resolution = await resolveCoveredHostname(hostname);
  if (!resolution) return { ...base, domain: null, entry: null, isCovered: false };

  return { ...base, domain: resolution.domain, entry: resolution.entry, isCovered: true };
};

export const useActiveTabSite = (): ActiveTabSite => {
  const [site, setSite] = useState<ActiveTabSite>({ ...EMPTY, status: 'loading' });

  useEffect(() => {
    let disposed = false;
    /*
     * Tab switches and redirects can land faster than a resolve completes, and the answers can
     * arrive out of order. Only the newest request is allowed to write.
     */
    let generation = 0;

    const refresh = () => {
      const current = ++generation;
      setSite(previous => ({ ...previous, status: 'loading' }));

      resolveActiveTab()
        .then(next => {
          if (!disposed && current === generation) setSite(next);
        })
        .catch(() => {
          if (!disposed && current === generation) setSite(EMPTY);
        });
    };

    /*
     * Both listeners re-query rather than trusting the event payload. A side panel is bound to a
     * window, `currentWindow` resolves to that window from this context, and events from other
     * windows simply re-confirm the same tab — cheap, and it keeps one code path.
     */
    const onActivated = () => refresh();

    const onUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      // SPA route changes and redirects both surface as a `url` change without a fresh load.
      if (!changeInfo.url && changeInfo.status !== 'complete') return;
      if (!tab.active) return;
      refresh();
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    refresh();

    return () => {
      disposed = true;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return site;
};

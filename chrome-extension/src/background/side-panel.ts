import { resolveCoveredHostname } from '@extension/shared';
import { hostnameFor } from './site-policy.js';

/**
 * Side-panel availability.
 *
 * The panel is offered on sites we have read and nowhere else. Chrome's own affordance for
 * opening it is global once `side_panel.default_path` is declared, so the default is "available
 * everywhere" and this module is what narrows it back down — per tab, via
 * `sidePanel.setOptions({ tabId, enabled })`.
 *
 * THE ZERO-NETWORK GUARANTEE STILL HOLDS (AD-2 / D11). This asks the same question the badge
 * asks, through the same `resolveCoveredHostname`, against the same bundled 45 KB index. It is
 * one extra local lookup per tab event and not one extra byte over the wire.
 *
 * What must never happen here: loading the bundled corpus. The worker's job is "is this site
 * covered?" — a domain lookup. "What do these policies say?" is 305 KB of analyses, it is the
 * panel page's job, and it happens only once a user has opened the panel. Merging the two would
 * pull the whole corpus into every service-worker wake.
 *
 * This lives beside `site-policy.ts` rather than inside it because that module owns the badge
 * and its guarantee; availability is a separate concern that happens to share an input.
 *
 * Permissions: `sidePanel` and `tabs`. No host permissions, no content script.
 */

/** Must match `side_panel.default_path` in `manifest.ts` and the side-panel build's `outDir`. */
const SIDE_PANEL_PATH = 'side-panel/index.html';

/**
 * Tabs that have ever been offered the panel, kept in session storage.
 *
 * WHY THIS EXISTS: `setOptions({ enabled: false })` does not merely hide the affordance — it
 * CLOSES the panel if it is open. Without this set, a user reading an analysis who clicks a link
 * to an uncovered page has the panel yanked out from under them mid-sentence. That reads as a
 * crash, not as a coverage boundary.
 *
 * So availability is sticky per tab: once offered, it stays offered for that tab's life, and the
 * panel itself renders "we haven't read this site" for pages outside the corpus. The cost is that
 * a tab which once visited a covered site keeps offering the panel afterwards. That is a far
 * smaller sin than closing a panel someone is reading.
 *
 * Session storage rather than a module variable because MV3 workers sleep, and a forgotten set
 * means the next `sweepOpenTabs` disables — and therefore closes — a panel that is open.
 */
const OFFERED_TABS_KEY = 'side-panel-offered-tabs';

const readOfferedTabs = async (): Promise<Set<number>> => {
  try {
    const stored = await chrome.storage.session.get(OFFERED_TABS_KEY);
    return new Set<number>(stored[OFFERED_TABS_KEY] ?? []);
  } catch {
    return new Set<number>();
  }
};

const rememberOfferedTab = async (tabId: number) => {
  try {
    const offered = await readOfferedTabs();
    if (offered.has(tabId)) return;
    offered.add(tabId);
    await chrome.storage.session.set({ [OFFERED_TABS_KEY]: [...offered] });
  } catch {
    // Session storage unavailable; we fall back to non-sticky behaviour, which still works.
  }
};

const forgetTab = async (tabId: number) => {
  try {
    const offered = await readOfferedTabs();
    if (!offered.delete(tabId)) return;
    await chrome.storage.session.set({ [OFFERED_TABS_KEY]: [...offered] });
  } catch {
    // Nothing to forget.
  }
};

const applyAvailability = async (tabId: number, url: string | undefined) => {
  const hostname = hostnameFor(url);
  const covered = hostname !== null && (await resolveCoveredHostname(hostname)) !== null;

  if (covered) await rememberOfferedTab(tabId);
  // Never revoke from a tab that has been offered the panel — see OFFERED_TABS_KEY above.
  else if ((await readOfferedTabs()).has(tabId)) return;

  try {
    /*
     * `path` is sent only when enabling. Chrome treats a path on a disabled panel as a
     * configuration for a panel that cannot open, and the disable call is clearer without it.
     */
    await chrome.sidePanel.setOptions(
      covered ? { tabId, path: SIDE_PANEL_PATH, enabled: true } : { tabId, enabled: false },
    );
  } catch {
    // Tab closed or discarded mid-flight; there is nothing left to configure.
  }
};

const refreshTabById = async (tabId: number) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await applyAvailability(tabId, tab.url);
  } catch {
    // Tab closed mid-flight.
  }
};

/**
 * Tabs that were already open when the worker started have fired no event, so nothing has
 * narrowed the manifest's global default for them. Without this sweep the panel is offered on
 * every pre-existing tab — including uncovered ones — until the user navigates.
 *
 * MV3 workers wake often, so this runs often. It costs a `tabs.query` plus one cached map lookup
 * per tab, and no network.
 */
const sweepOpenTabs = async () => {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map(tab => (tab.id === undefined ? undefined : applyAvailability(tab.id, tab.url))));
  } catch {
    // Nothing to sweep.
  }
};

export const registerSitePolicySidePanel = () => {
  /*
   * D8: the toolbar click keeps opening the popup, which is where the upload flow lives. The
   * panel opens from a button inside that popup, so the popup click supplies the user gesture
   * `sidePanel.open()` requires. Letting the icon open the panel instead would take the upload
   * flow away on exactly the sites the user is most likely to be on.
   */
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(error => console.warn('[Unshafted] could not set side panel behavior:', error));

  void sweepOpenTabs();

  // Availability is per-tab, so it tracks the same two events the badge does.
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url && changeInfo.status !== 'complete') return;
    void applyAvailability(tabId, changeInfo.url ?? tab.url);
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void refreshTabById(tabId);
  });

  // A tab id is reused after the tab closes, so a stale entry would offer the panel on an
  // unrelated site. Drop it with the tab.
  chrome.tabs.onRemoved.addListener(tabId => {
    void forgetTab(tabId);
  });
};

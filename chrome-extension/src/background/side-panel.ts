import { hostnameFor } from './site-policy.js';

/**
 * Side-panel availability.
 *
 * The panel is offered on any http(s) page and nowhere else — not on `chrome://`, `file://` or
 * the Web Store, where there is no site and no page we may read. Chrome's affordance is global
 * once `side_panel.default_path` is declared, so this module narrows it per tab via
 * `sidePanel.setOptions({ tabId, enabled })`.
 *
 * IT DOES NOT GATE ON COVERAGE (D15). It used to, and that hid the reader on exactly the sites
 * where the reader is the only thing we have. See `applyAvailability`.
 *
 * THE ZERO-NETWORK GUARANTEE STILL HOLDS (AD-2 / D11). Availability is now decided by parsing the
 * tab's URL — no index read, no corpus read, no network. Strictly less work than before.
 *
 * What must never happen here: loading the bundled corpus. The worker's job is availability.
 * "What do these policies say?" is 305 KB of analyses, it is the panel page's job, and it happens
 * only once a user has opened the panel. Merging the two would pull the whole corpus into every
 * service-worker wake.
 *
 * This lives beside `site-policy.ts` rather than inside it because that module owns the badge and
 * its guarantee. The badge stays coverage-gated; availability is a different question.
 *
 * Permissions: `sidePanel` and `tabs`. No host permissions, no content script.
 */

/** Must match `side_panel.default_path` in `manifest.ts` and the side-panel build's `outDir`. */
const SIDE_PANEL_PATH = 'side-panel/index.html';

/**
 * Tabs that have ever been offered the panel, kept in session storage.
 *
 * WHY THIS EXISTS: `setOptions({ enabled: false })` does not merely hide the affordance — it
 * CLOSES the panel if it is open. Without this set, a user reading a document who follows a link
 * into `chrome://settings` or the Web Store has the panel yanked out from under them mid-sentence.
 * That reads as a crash, not as a boundary.
 *
 * So availability is sticky per tab: once offered, it stays offered for that tab's life. Since
 * D15 widened availability to every http(s) page, the only thing this now protects against is a
 * navigation to a non-web scheme — a much narrower case than the coverage boundary it was written
 * for, and still worth keeping for exactly the same reason.
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
  /*
   * D15: availability follows "is this a web page?", not "have we analysed it?".
   *
   * This used to gate on coverage. That was wrong, and it hid the one thing we can offer on a site
   * outside the corpus: the reader needs no analysis, only page access, so on an uncovered site
   * finding and showing the policy documents is the *whole* value. Gating it away left the panel
   * unreachable exactly where it was the only thing we had.
   *
   * The badge does NOT follow this and must not. The badge means "we have read this site's
   * policies" — a claim we can only make about 37 domains. The panel answers "what does this site
   * make you agree to?", which is answerable anywhere. Different questions, deliberately different
   * reach; the panel's own copy carries the weaker promise.
   */
  const available = hostnameFor(url) !== null;

  if (available) await rememberOfferedTab(tabId);
  // Never revoke from a tab that has been offered the panel — see OFFERED_TABS_KEY above.
  else if ((await readOfferedTabs()).has(tabId)) return;

  try {
    /*
     * `path` is sent only when enabling. Chrome treats a path on a disabled panel as a
     * configuration for a panel that cannot open, and the disable call is clearer without it.
     */
    await chrome.sidePanel.setOptions(
      available ? { tabId, path: SIDE_PANEL_PATH, enabled: true } : { tabId, enabled: false },
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
 * every pre-existing tab — including `chrome://` ones — until the user navigates.
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

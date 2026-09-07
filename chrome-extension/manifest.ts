import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
const rootEnvPath = resolve(import.meta.dirname, '..', '.env');

const readChromeExtensionKey = () => {
  const explicitKey = process.env['CEB_CHROME_EXTENSION_KEY']?.trim();
  if (explicitKey) {
    return explicitKey;
  }

  try {
    const envFile = readFileSync(rootEnvPath, 'utf8');
    const envLine = envFile.split('\n').find(line => line.trim().startsWith('CEB_CHROME_EXTENSION_KEY='));

    if (!envLine) {
      return undefined;
    }

    return envLine.split('=').slice(1).join('=').trim();
  } catch {
    return undefined;
  }
};

const extensionKey = readChromeExtensionKey();

const manifest = {
  manifest_version: 3,
  default_locale: 'en',
  name: '__MSG_extensionName__',
  version: packageJson.version,
  description: '__MSG_extensionDescription__',
  // `tabs` reads tab URLs for the ambient badge (bundled index, zero network).
  // `scripting` runs the one-shot policy discovery and fetch in the page.
  // `sidePanel` renders the analysis in Chrome's own panel — beside the page, never inside it.
  // `activeTab` is kept alongside `host_permissions` on purpose: it is what still works if a user
  // ever revokes site access from chrome://extensions, and it costs nothing to declare.
  permissions: ['storage', 'identity', 'tabs', 'activeTab', 'scripting', 'sidePanel'],
  /**
   * Standing read access to the page, added 2026-09-07 for site policy awareness (see
   * execution-docs/site-policy-part7-page-access.md). NOT YET SUBMITTED — the live listing is
   * 0.7.1, which has no host permissions.
   *
   * WHY THIS REOPENS WHAT 3657ca0 CLOSED, AND WHY THAT IS NOT A REGRESSION.
   *
   * That commit deleted a page-scraping content script because the extension was an UPLOAD-ONLY
   * product: you handed it a contract file and it analysed it. A scraper in the ZIP contradicted
   * the listing, and it was the cleanest available "single-purpose drift" citation. Deleting it
   * was right for the product that existed.
   *
   * The product changed. Site policy awareness reads the terms a site links to and tells the user
   * what they already agreed to — page access is not scope drift from that purpose, it IS that
   * purpose. `activeTab` cannot serve it: Chrome grants it only when the user invokes the
   * extension from the toolbar and revokes it the instant the tab navigates, so a panel left open
   * while someone browses is refused on every new page. That is not a UX rough edge to smooth
   * over; it makes automatic detection structurally impossible.
   *
   * The obligation this carries is the review surface named in cws/rejection-history.md — policy,
   * in-product disclosure, listing copy, and what is actually in the ZIP have to agree. All four
   * moved with this line.
   */
  host_permissions: ['<all_urls>'],
  options_ui: {
    page: 'options/index.html',
    open_in_tab: true,
  },
  // The default is global; the background disables it per tab on sites we have not read, so the
  // panel is offered only where there is an analysis to show.
  side_panel: {
    default_path: 'side-panel/index.html',
  },
  background: {
    service_worker: 'background.js',
    type: 'module',
  },
  action: {
    default_popup: 'popup/index.html',
    default_icon: 'icon-34.png',
  },
  icons: {
    '34': 'icon-34.png',
    '128': 'icon-128.png',
  },
  ...(extensionKey ? { key: extensionKey } : {}),
} satisfies chrome.runtime.ManifestV3;

export default manifest;

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
  // `activeTab` + `scripting` capture the current page's policy, and only on a user gesture.
  // `sidePanel` renders the analysis in Chrome's own panel — beside the page, never inside it.
  // It grants no access to page content, injects nothing, and raises no install warning, so it
  // buys the full-height surface a content script would have bought at none of its cost.
  // Still no host permissions and no registered content scripts — page access was excised in
  // 3657ca0 to clear review, and this does not reopen it.
  permissions: ['storage', 'identity', 'tabs', 'activeTab', 'scripting', 'sidePanel'],
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

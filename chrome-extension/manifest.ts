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
  permissions: ['storage', 'identity'],
  options_ui: {
    page: 'options/index.html',
    open_in_tab: true,
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

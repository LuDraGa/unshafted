import { resolveCoveredHostname } from '@extension/shared';
import type { PolicyIndexEntry } from '@extension/unshafted-core';

/**
 * Ambient site-policy badge.
 *
 * THE ZERO-NETWORK GUARANTEE (AD-2). This path answers "is this site covered?" entirely from a
 * bundled index. It must never make a network request, because a per-page server call keyed by
 * domain is a browsing-history pipe to our own infrastructure — disqualifying for a privacy
 * product, and exactly what CWS review probes on an extension that cleared review by removing
 * page access.
 *
 * The other lookup — "what does this policy actually say?" — is lazy, fires only on popup open,
 * and lives elsewhere. Do not merge the two.
 *
 * Permissions: `tabs` only. No host permissions, no content script.
 */

const BADGE_TEXT = '•';

const BADGE_COLORS: Record<PolicyIndexEntry['riskLevel'], string> = {
  Low: '#6b7280',
  Medium: '#d97706',
  High: '#dc2626',
  'Very High': '#991b1b',
};

/** Distinct tint for "you can still act, but not forever" — an opt-out window closing. */
const TIME_SENSITIVE_COLOR = '#7c3aed';

type Resolution = Awaited<ReturnType<typeof resolveCoveredHostname>>;

const hostnameFor = (url: string | undefined): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // chrome://, file://, about:, devtools:// — nothing to resolve, and no work to do.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.hostname;
  } catch {
    return null;
  }
};

const clearBadge = async (tabId: number) => {
  try {
    await chrome.action.setBadgeText({ tabId, text: '' });
    await chrome.action.setTitle({ tabId, title: '' });
  } catch {
    // Tab closed mid-flight; nothing to clean up.
  }
};

const applyBadge = async (tabId: number, resolution: NonNullable<Resolution>) => {
  const { entry, domain } = resolution;
  const color = entry.hasTimeSensitiveAction ? TIME_SENSITIVE_COLOR : BADGE_COLORS[entry.riskLevel];
  const title = entry.hasTimeSensitiveAction
    ? `Unshafted: ${domain} — ${entry.riskLevel.toLowerCase()} risk, and there is a deadline you can still act on.`
    : `Unshafted: ${domain} — ${entry.riskLevel.toLowerCase()} risk in this site's policies.`;

  try {
    await chrome.action.setBadgeText({ tabId, text: BADGE_TEXT });
    await chrome.action.setBadgeBackgroundColor({ tabId, color });
    await chrome.action.setTitle({ tabId, title });
  } catch {
    // Tab closed mid-flight.
  }
};

const refreshTab = async (tabId: number, url: string | undefined) => {
  const hostname = hostnameFor(url);
  if (!hostname) {
    await clearBadge(tabId);
    return;
  }

  const resolution = await resolveCoveredHostname(hostname);
  if (resolution) await applyBadge(tabId, resolution);
  else await clearBadge(tabId);
};

export const registerSitePolicyBadge = () => {
  // Badges are per-tab; a global badge is wrong the moment two tabs are open.
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url && changeInfo.status !== 'complete') return;
    void refreshTab(tabId, changeInfo.url ?? tab.url);
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    void chrome.tabs
      .get(tabId)
      .then(tab => refreshTab(tabId, tab.url))
      .catch(() => undefined);
  });
};

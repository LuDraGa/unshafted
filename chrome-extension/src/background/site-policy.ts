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

type Resolution = Awaited<ReturnType<typeof resolveCoveredHostname>>;

/**
 * Exported so the side-panel gate resolves tabs by exactly the same rule the badge does. If the
 * two ever disagree, a tab gets a badge with no panel behind it (or the reverse), which reads as
 * a broken feature rather than a coverage boundary.
 */
export const hostnameFor = (url: string | undefined): string | null => {
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

/*
 * D2: risk tint always wins, and `hasTimeSensitiveAction` never touches the colour.
 *
 * This used to paint a violet tint INSTEAD of the risk colour whenever a domain had a deadline.
 * That fires on 19 of the 37 seeded domains, so it hid the risk grade on half the corpus — the
 * one byte this feature exists to deliver. Two independent facts cannot share one channel.
 *
 * The bit itself is real and stays: it rides the index, it reaches the side panel, and the
 * tooltip below says so in words. It just does not get to own the colour. If you are about to
 * restore the override to make deadlines visible, give them a non-colour channel instead.
 */
const applyBadge = async (tabId: number, resolution: NonNullable<Resolution>) => {
  const { entry, domain } = resolution;
  const color = BADGE_COLORS[entry.riskLevel];

  /*
   * The tooltip has to name the unit of the claim. Under D1 this level is the site's WORST
   * document, not a summary of the site and not an average — averaging is what turns Zerodha's
   * INR 100 liability cap into a merely "High" site (finding 16). One line is not enough room to
   * explain that, but it is enough room to not imply the opposite.
   */
  const headline = `Unshafted — ${domain}: ${entry.riskLevel.toLowerCase()} risk. That is this site's worst document, not an average.`;
  const title = entry.hasTimeSensitiveAction
    ? `${headline}\nOne of its documents has a deadline you can still act on.`
    : headline;

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

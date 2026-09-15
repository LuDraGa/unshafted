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

/**
 * The badge grades on the same axis as every other surface, so it grades in the same hue (#82).
 *
 * It used to run grey → amber → red → dark red, and `SiteStrip` faithfully matched it, which is
 * how the popup came to paint Low grey and High rose while the panel painted them green and
 * orange. Grey is gone from the ramp for a reason beyond consistency: grey means "not analysed",
 * which is what the strip's uncovered state says, and a badge must never make the absence of a
 * grade look like a good one.
 *
 * SATURATED SHADES, not the tints the surfaces use. This is a filled dot a few pixels wide on
 * browser chrome we do not control, so it needs chroma rather than a wash — rose-300, rose-400,
 * rose-600, rose-800, the same hue as `RISK_TONE` taken further down the ramp.
 *
 * These are hexes, and `global.css` otherwise requires a Tailwind shade be written as
 * `var(--color-<shade>)` so risk cannot be encoded twice and drift. That rule cannot reach here:
 * `chrome.action.setBadgeBackgroundColor` takes a colour, not a stylesheet, and a service worker
 * has no CSS custom properties to resolve. The shade names are recorded above instead, so the two
 * halves can still be checked against each other by eye.
 */
const BADGE_COLORS: Record<PolicyIndexEntry['riskLevel'], string> = {
  Low: '#ffa1ad',
  Medium: '#ff637e',
  High: '#ec003f',
  'Very High': '#a50036',
};

type Resolution = Awaited<ReturnType<typeof resolveCoveredHostname>>;

/**
 * Exported so the side-panel gate resolves tabs by exactly the same rule the badge does. If the
 * two ever disagree, a tab gets a badge with no panel behind it (or the reverse), which reads as
 * a broken feature rather than a coverage boundary.
 */
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

const registerSitePolicyBadge = () => {
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

export { hostnameFor, registerSitePolicyBadge };

import { decodePolicyIndex, lookupHostname } from '@extension/unshafted-core';
import type { PolicyIndex, PolicyIndexEntry } from '@extension/unshafted-core';

/**
 * Loads and queries the bundled domain-coverage index.
 *
 * Shared by the background badge and the popup so there is exactly one implementation of "is
 * this site covered?". It answers from an extension-local asset and MUST NOT make a network
 * request — that is the zero-network guarantee in AD-2, and merging it with the hash lookup is
 * the design trap the whole feature is arranged to avoid.
 */

const INDEX_ASSET = 'policy-index.bin';

/** Bounded so a long-lived worker or a long popup session cannot grow this without limit. */
const HOSTNAME_CACHE_LIMIT = 500;

type HostnameResolution = { domain: string; entry: PolicyIndexEntry } | null;

/**
 * MV3 workers sleep and restart, resetting this. That is intended: re-reading a small
 * extension-local asset costs single-digit milliseconds, which is why the index does not live
 * in `chrome.storage` (slower, and quota-bound).
 */
let indexPromise: Promise<PolicyIndex | null> | null = null;

const loadBundledPolicyIndex = (): Promise<PolicyIndex | null> => {
  indexPromise ??= (async () => {
    try {
      const response = await fetch(chrome.runtime.getURL(INDEX_ASSET));
      if (!response.ok) {
        console.warn('[Unshafted] policy index missing from bundle');
        return null;
      }
      return decodePolicyIndex(await response.arrayBuffer());
    } catch (error) {
      console.warn('[Unshafted] policy index failed to load:', error);
      return null;
    }
  })();

  return indexPromise;
};

const hostnameCache = new Map<string, HostnameResolution>();

const resolveCoveredHostname = async (hostname: string): Promise<HostnameResolution> => {
  const cached = hostnameCache.get(hostname);
  if (cached !== undefined) return cached;

  const index = await loadBundledPolicyIndex();
  const resolution = index ? await lookupHostname(index, hostname) : null;

  if (hostnameCache.size >= HOSTNAME_CACHE_LIMIT) {
    const oldest = hostnameCache.keys().next();
    if (!oldest.done) hostnameCache.delete(oldest.value);
  }
  hostnameCache.set(hostname, resolution);

  return resolution;
};

export { loadBundledPolicyIndex, resolveCoveredHostname };
export type { HostnameResolution };

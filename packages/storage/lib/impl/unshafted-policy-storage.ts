import { createStorage, StorageEnum } from '../base/index.js';
import { PolicyCacheIndexSchema, PolicyDomainCacheSchema, SitePolicyAnalysisSchema } from '@extension/unshafted-core';
import type { PolicyCacheEntry, PolicyDomainCacheEntry, SitePolicyAnalysis } from '@extension/unshafted-core';

/**
 * Bounded local cache for published policy analyses.
 *
 * Keyed by content hash, which is the document's identity (AD-1) — so entries are immutable and
 * a "cache invalidation" problem never arises: a changed document is simply a different key.
 *
 * `chrome.storage.local` is 10 MB by default. We deliberately do NOT request
 * `unlimitedStorage`: this is an extension whose entire story is minimal permissions, and the
 * cache is a convenience, not a source of truth — everything in it is re-fetchable from the CDN.
 */

const ENTRY_PREFIX = 'unshafted-policy-analysis:';

/** Leaves headroom under the 10 MB quota for analysis history, settings and onboarding state. */
const CACHE_BUDGET_BYTES = 4 * 1024 * 1024;

const entryKey = (hash: string) => `${ENTRY_PREFIX}${hash}`;

const cacheIndexStorage = createStorage<PolicyCacheEntry[]>('unshafted-policy-cache-index', [], {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
  serialization: {
    serialize: value => PolicyCacheIndexSchema.parse(value),
    deserialize: value => {
      const parsed = PolicyCacheIndexSchema.safeParse(value);
      return parsed.success ? parsed.data : [];
    },
  },
});

const readEntry = async (hash: string): Promise<SitePolicyAnalysis | null> => {
  const key = entryKey(hash);
  const stored = await chrome.storage.local.get(key);
  const raw = stored[key];
  if (raw === undefined) return null;

  // Storage is not a trust boundary: a stale schema or hand-edited value must not crash the popup.
  const parsed = SitePolicyAnalysisSchema.safeParse(raw);
  if (!parsed.success || parsed.data.contentHash !== hash) {
    await chrome.storage.local.remove(key);
    await cacheIndexStorage.set(entries => entries.filter(entry => entry.hash !== hash));
    return null;
  }

  return parsed.data;
};

const evictToBudget = async (entries: PolicyCacheEntry[]): Promise<PolicyCacheEntry[]> => {
  let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (total <= CACHE_BUDGET_BYTES) return entries;

  // Least recently accessed goes first.
  const ordered = [...entries].sort((left, right) => left.lastAccessedAt - right.lastAccessedAt);
  const evicted: string[] = [];

  while (total > CACHE_BUDGET_BYTES && ordered.length > 0) {
    const victim = ordered.shift();
    if (!victim) break;
    evicted.push(victim.hash);
    total -= victim.bytes;
  }

  if (evicted.length > 0) {
    await chrome.storage.local.remove(evicted.map(entryKey));
  }

  return ordered;
};

export const sitePolicyCacheStorage = {
  /** Returns the cached analysis and refreshes its LRU position. */
  get: async (hash: string): Promise<SitePolicyAnalysis | null> => {
    const analysis = await readEntry(hash);
    if (!analysis) return null;

    await cacheIndexStorage.set(entries =>
      entries.map(entry => (entry.hash === hash ? { ...entry, lastAccessedAt: Date.now() } : entry)),
    );

    return analysis;
  },

  put: async (analysis: SitePolicyAnalysis): Promise<void> => {
    const hash = analysis.contentHash;
    const serialized = JSON.stringify(analysis);

    await chrome.storage.local.set({ [entryKey(hash)]: analysis });

    const entry: PolicyCacheEntry = {
      hash,
      bytes: serialized.length,
      lastAccessedAt: Date.now(),
    };

    await cacheIndexStorage.set(async entries =>
      evictToBudget([...entries.filter(existing => existing.hash !== hash), entry]),
    );
  },

  stats: async (): Promise<{ entries: number; bytes: number; budgetBytes: number }> => {
    const entries = await cacheIndexStorage.get();
    return {
      entries: entries.length,
      bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      budgetBytes: CACHE_BUDGET_BYTES,
    };
  },

  clear: async (): Promise<void> => {
    const entries = await cacheIndexStorage.get();
    if (entries.length > 0) {
      await chrome.storage.local.remove(entries.map(entry => entryKey(entry.hash)));
    }
    await cacheIndexStorage.set([]);
  },
};

export { CACHE_BUDGET_BYTES as POLICY_CACHE_BUDGET_BYTES };

// ── Per-domain freshness cache (M1d) ──

/**
 * Bounded so a heavy browsing session cannot grow this without limit. Entries are tiny (a few
 * hashes and an ETag), so this is about hygiene rather than quota.
 */
const DOMAIN_CACHE_LIMIT = 200;

const domainCacheStorage = createStorage<PolicyDomainCacheEntry[]>('unshafted-policy-domain-cache', [], {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
  serialization: {
    serialize: value => PolicyDomainCacheSchema.parse(value),
    deserialize: value => {
      const parsed = PolicyDomainCacheSchema.safeParse(value);
      return parsed.success ? parsed.data : [];
    },
  },
});

export const sitePolicyDomainCacheStorage = {
  get: async (domainHash: string): Promise<PolicyDomainCacheEntry | null> => {
    const entries = await domainCacheStorage.get();
    return entries.find(entry => entry.domainHash === domainHash) ?? null;
  },

  put: async (entry: PolicyDomainCacheEntry): Promise<void> => {
    await domainCacheStorage.set(entries => {
      const next = [entry, ...entries.filter(existing => existing.domainHash !== entry.domainHash)];
      return next.slice(0, DOMAIN_CACHE_LIMIT);
    });
  },

  /** A `304` means the cached record still stands; only its freshness timestamp moves. */
  touch: async (domainHash: string): Promise<void> => {
    await domainCacheStorage.set(entries =>
      entries.map(entry => (entry.domainHash === domainHash ? { ...entry, checkedAt: Date.now() } : entry)),
    );
  },

  clear: async (): Promise<void> => {
    await domainCacheStorage.set([]);
  },
};

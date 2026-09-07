import { createStorage, StorageEnum } from '../base/index.js';
import { LocalPolicyAnalysisSchema } from '@extension/unshafted-core';
import type { LocalPolicyAnalysis } from '@extension/unshafted-core';

/**
 * Analyses the USER ran, on their own key (Part 6, S2/S8).
 *
 * WHY THIS IS NOT `sitePolicyCacheStorage` WITH A DIFFERENT PREFIX.
 *
 * The corpus cache evicts LRU on write, and that is correct for what it holds: published
 * analyses, re-fetchable from the CDN, where eviction costs exactly one request. A local
 * analysis is not re-fetchable from anywhere. Evicting one destroys a result the user paid for
 * with their own API credits, silently, to make room for a newer one they did not know they
 * were trading it for.
 *
 * So this store NEVER evicts. A write that would exceed budget fails with an `over-budget`
 * result the panel can act on — it asks the user which analysis to delete, and the user makes
 * the trade knowingly. Sharing a module with the cache would put those two policies one
 * copy-paste apart, which is the mistake this file exists to make impossible.
 *
 * Drive (S9) is the durable copy that makes a deletion recoverable; until Drive is connected
 * it is not, which is the other half of why nothing here happens without a click.
 */

const ENTRY_PREFIX = 'unshafted-local-policy-analysis:';

/**
 * The corpus cache already claims 4 MB of the 10 MB `chrome.storage.local` quota, and history,
 * settings and onboarding need what is left. 2 MB holds on the order of a hundred analyses,
 * and the over-budget path is a prompt rather than a failure, so a low ceiling costs the user
 * a decision rather than a result.
 */
const LOCAL_POLICY_BUDGET_BYTES = 2 * 1024 * 1024;

const entryKey = (hash: string) => `${ENTRY_PREFIX}${hash}`;

/** What a management UI lists, and what pressure handling reasons over, without loading bodies. */
type LocalPolicyIndexEntry = {
  hash: string;
  domain: string;
  /** ISO, copied from `provenance.ranAt` so the list sorts without reading every entry. */
  ranAt: string;
  bytes: number;
};

/**
 * `bytes` on the failure is what the store WOULD have held after the write, so the panel can
 * tell the user how much they need to free rather than only that they are full.
 */
type LocalPolicySaveResult = { status: 'saved' } | { status: 'over-budget'; bytes: number; budgetBytes: number };

const isIndexEntry = (value: unknown): value is LocalPolicyIndexEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<LocalPolicyIndexEntry>;
  return (
    typeof entry.hash === 'string' &&
    typeof entry.domain === 'string' &&
    typeof entry.ranAt === 'string' &&
    typeof entry.bytes === 'number' &&
    Number.isFinite(entry.bytes)
  );
};

// The index shape is local bookkeeping, not part of any published contract, so it is validated
// here by hand rather than pulling `zod` into a package that does not otherwise depend on it.
const indexStorage = createStorage<LocalPolicyIndexEntry[]>('unshafted-local-policy-index', [], {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
  serialization: {
    serialize: value => value.filter(isIndexEntry),
    deserialize: value => (Array.isArray(value) ? value.filter(isIndexEntry) : []),
  },
});

const totalBytes = (entries: LocalPolicyIndexEntry[]) => entries.reduce((sum, entry) => sum + entry.bytes, 0);

const forgetEntry = async (hash: string): Promise<void> => {
  await chrome.storage.local.remove(entryKey(hash));
  await indexStorage.set(entries => entries.filter(entry => entry.hash !== hash));
};

/**
 * Drops a record that no longer parses. That is not eviction: the analysis is already
 * unreadable, and leaving its byte charge in place would make the budget lie to the user about
 * how much they have to free.
 */
const readEntry = async (hash: string): Promise<LocalPolicyAnalysis | null> => {
  const key = entryKey(hash);
  const stored = await chrome.storage.local.get(key);
  const raw = stored[key];
  if (raw === undefined) return null;

  const parsed = LocalPolicyAnalysisSchema.safeParse(raw);
  if (!parsed.success || parsed.data.analysis.contentHash !== hash) {
    await forgetEntry(hash);
    return null;
  }

  return parsed.data;
};

const matchesDomain = (local: LocalPolicyAnalysis, domain: string) => {
  const wanted = domain.toLowerCase();
  return (
    local.analysis.domain.toLowerCase() === wanted ||
    local.analysis.domains.some(candidate => candidate.toLowerCase() === wanted)
  );
};

export const localSitePolicyStorage = {
  get: async (contentHash: string): Promise<LocalPolicyAnalysis | null> => readEntry(contentHash),

  /**
   * The panel's main read. Matches `domains` as well as `domain` because one document can
   * govern several sites, and the user analysed it from whichever one they were standing on.
   */
  getForDomain: async (domain: string): Promise<LocalPolicyAnalysis[]> => {
    const entries = await indexStorage.get();
    if (entries.length === 0) return [];

    const stored = await chrome.storage.local.get(entries.map(entry => entryKey(entry.hash)));
    const matched: LocalPolicyAnalysis[] = [];
    const unreadable: string[] = [];

    for (const entry of entries) {
      const parsed = LocalPolicyAnalysisSchema.safeParse(stored[entryKey(entry.hash)]);
      if (!parsed.success || parsed.data.analysis.contentHash !== entry.hash) {
        unreadable.push(entry.hash);
        continue;
      }
      if (matchesDomain(parsed.data, domain)) matched.push(parsed.data);
    }

    for (const hash of unreadable) {
      await forgetEntry(hash);
    }

    return matched.sort((left, right) => right.provenance.ranAt.localeCompare(left.provenance.ranAt));
  },

  /**
   * Writes the body only once the budget check passes, so a rejected save leaves the store
   * exactly as it was — the user still has every analysis they paid for, plus a number telling
   * them how much to free.
   */
  save: async (local: LocalPolicyAnalysis): Promise<LocalPolicySaveResult> => {
    const hash = local.analysis.contentHash;
    // Measured over the wrapper, since provenance is what the user is storing and paying quota for.
    const bytes = JSON.stringify(local).length;

    const entries = await indexStorage.get();
    // A re-run of the same document replaces its predecessor rather than adding to it.
    const others = entries.filter(entry => entry.hash !== hash);
    const projected = totalBytes(others) + bytes;

    if (projected > LOCAL_POLICY_BUDGET_BYTES) {
      return { status: 'over-budget', bytes: projected, budgetBytes: LOCAL_POLICY_BUDGET_BYTES };
    }

    await chrome.storage.local.set({ [entryKey(hash)]: local });
    await indexStorage.set([...others, { hash, domain: local.analysis.domain, ranAt: local.provenance.ranAt, bytes }]);

    return { status: 'saved' };
  },

  /** The only way anything leaves this store, and it is always the user's decision. */
  remove: async (contentHash: string): Promise<void> => {
    await forgetEntry(contentHash);
  },

  list: async (): Promise<LocalPolicyIndexEntry[]> => {
    const entries = await indexStorage.get();
    return [...entries].sort((left, right) => right.ranAt.localeCompare(left.ranAt));
  },

  stats: async (): Promise<{ bytes: number; budgetBytes: number; entryCount: number }> => {
    const entries = await indexStorage.get();
    return {
      bytes: totalBytes(entries),
      budgetBytes: LOCAL_POLICY_BUDGET_BYTES,
      entryCount: entries.length,
    };
  },
};

export { LOCAL_POLICY_BUDGET_BYTES };
export type { LocalPolicyIndexEntry, LocalPolicySaveResult };

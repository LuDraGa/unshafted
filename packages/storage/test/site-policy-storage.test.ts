import assert from 'node:assert/strict';
import test, { beforeEach, describe } from 'node:test';
import type { LocalPolicyAnalysis, SitePolicyAnalysis } from '@extension/unshafted-core';

/**
 * `createStorage` captures `globalThis.chrome` at module load, so the fake has to be installed
 * before the storage modules are imported — hence the dynamic import below.
 */
const store = new Map<string, unknown>();

const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

const fakeLocal = {
  get: async (keys?: string | string[] | null) => {
    const wanted = keys === undefined || keys === null ? [...store.keys()] : Array.isArray(keys) ? keys : [keys];
    const result: Record<string, unknown> = {};
    for (const key of wanted) {
      if (store.has(key)) result[key] = clone(store.get(key));
    }
    return result;
  },
  set: async (items: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(items)) store.set(key, clone(value));
  },
  remove: async (keys: string | string[]) => {
    for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
  },
};

(globalThis as { chrome?: unknown }).chrome = {
  storage: {
    local: fakeLocal,
    onChanged: { addListener: () => {} },
  },
};

const { sitePolicyCacheStorage, POLICY_CACHE_BUDGET_BYTES } = await import('../lib/impl/unshafted-policy-storage.js');
const { localSitePolicyStorage, LOCAL_POLICY_BUDGET_BYTES } = await import(
  '../lib/impl/unshafted-local-policy-storage.js'
);

const CORPUS_ENTRY_PREFIX = 'unshafted-policy-analysis:';
const LOCAL_ENTRY_PREFIX = 'unshafted-local-policy-analysis:';

const hashOf = (seed: string) => seed.padEnd(64, '0').slice(0, 64);

/** Sized by padding `summary`, since `bytes` is measured as `JSON.stringify(...).length`. */
const analysisOf = (
  seed: string,
  padding: number,
  overrides: Partial<SitePolicyAnalysis> = {},
): SitePolicyAnalysis => ({
  schemaVersion: 1,
  contentHash: hashOf(seed),
  domain: `${seed}.example`,
  domains: [`${seed}.example`],
  docType: 'terms',
  verticals: ['other'],
  surfaces: ['footer'],
  sourceUrl: `https://${seed}.example/terms`,
  promptVersion: 'adhesion-rubric-v1',
  normalizerVersion: 'policy-normalizer-v1',
  model: 'claude-opus-4',
  analyzedAt: '2026-09-07T00:00:00.000Z',
  summary: `${seed} ${'x'.repeat(padding)}`,
  riskLevel: 'Medium',
  confidence: 'high',
  exposures: [],
  availableActions: [],
  requiredDisclosures: [],
  peerDeviation: [],
  ...overrides,
});

const localOf = (
  seed: string,
  padding: number,
  overrides: Partial<SitePolicyAnalysis> = {},
  ranAt = '2026-09-07T00:00:00.000Z',
): LocalPolicyAnalysis => ({
  analysis: analysisOf(seed, padding, overrides),
  provenance: {
    ranAt,
    provider: 'openrouter',
    model: 'openai/gpt-5',
    promptVersion: 'site-policy-prompt-v1',
    excerpted: false,
    sourceChars: 12_000,
  },
});

const MB = 1024 * 1024;

/**
 * LRU order is the thing under test, so the clock advances on every read rather than leaving the
 * outcome to whether two writes happened to land in different milliseconds.
 */
let tick = 1_700_000_000_000;
Date.now = () => (tick += 1_000);

beforeEach(() => {
  store.clear();
});

describe('sitePolicyCacheStorage eviction', () => {
  test('leaves everything in place while the total stays under budget', async () => {
    await sitePolicyCacheStorage.put(analysisOf('alpha', MB));
    await sitePolicyCacheStorage.put(analysisOf('bravo', MB));

    const stats = await sitePolicyCacheStorage.stats();
    assert.equal(stats.entries, 2);
    assert.ok(stats.bytes < POLICY_CACHE_BUDGET_BYTES);
    assert.ok(await sitePolicyCacheStorage.get(hashOf('alpha')));
    assert.ok(await sitePolicyCacheStorage.get(hashOf('bravo')));
  });

  test('evicts least recently accessed first, and deletes the body as well as the index row', async () => {
    await sitePolicyCacheStorage.put(analysisOf('alpha', 1.5 * MB));
    await sitePolicyCacheStorage.put(analysisOf('bravo', 1.5 * MB));

    // Reading alpha moves it ahead of bravo in the LRU order, so bravo becomes the victim.
    await sitePolicyCacheStorage.get(hashOf('alpha'));
    await sitePolicyCacheStorage.put(analysisOf('charlie', 1.5 * MB));

    const stats = await sitePolicyCacheStorage.stats();
    assert.ok(stats.bytes <= POLICY_CACHE_BUDGET_BYTES);
    assert.equal(stats.entries, 2);

    assert.ok(await sitePolicyCacheStorage.get(hashOf('alpha')));
    assert.ok(await sitePolicyCacheStorage.get(hashOf('charlie')));
    assert.equal(await sitePolicyCacheStorage.get(hashOf('bravo')), null);
    assert.equal(store.has(`${CORPUS_ENTRY_PREFIX}${hashOf('bravo')}`), false);
  });

  test('evicts as many entries as it takes to get back under budget', async () => {
    for (const seed of ['alpha', 'bravo', 'charlie', 'delta']) {
      await sitePolicyCacheStorage.put(analysisOf(seed, 1.2 * MB));
    }

    const stats = await sitePolicyCacheStorage.stats();
    assert.ok(stats.bytes <= POLICY_CACHE_BUDGET_BYTES);
    assert.equal(stats.entries, 3);
    assert.equal(await sitePolicyCacheStorage.get(hashOf('alpha')), null);
  });

  test('re-putting the same hash replaces its row rather than double-counting its bytes', async () => {
    await sitePolicyCacheStorage.put(analysisOf('alpha', MB));
    const first = await sitePolicyCacheStorage.stats();

    await sitePolicyCacheStorage.put(analysisOf('alpha', MB));
    const second = await sitePolicyCacheStorage.stats();

    assert.equal(second.entries, 1);
    assert.equal(second.bytes, first.bytes);
  });

  test('an analysis larger than the whole budget is not left half-cached', async () => {
    await sitePolicyCacheStorage.put(analysisOf('whale', POLICY_CACHE_BUDGET_BYTES + MB));

    const stats = await sitePolicyCacheStorage.stats();
    assert.equal(stats.entries, 0);
    assert.equal(store.has(`${CORPUS_ENTRY_PREFIX}${hashOf('whale')}`), false);
    assert.equal(await sitePolicyCacheStorage.get(hashOf('whale')), null);
  });

  test('clear empties both the index and the bodies', async () => {
    await sitePolicyCacheStorage.put(analysisOf('alpha', MB));
    await sitePolicyCacheStorage.clear();

    const stats = await sitePolicyCacheStorage.stats();
    assert.equal(stats.entries, 0);
    assert.equal(store.has(`${CORPUS_ENTRY_PREFIX}${hashOf('alpha')}`), false);
  });
});

describe('localSitePolicyStorage never evicts', () => {
  test('saves and reads back by content hash', async () => {
    const result = await localSitePolicyStorage.save(localOf('alpha', 1_000));
    assert.deepEqual(result, { status: 'saved' });

    const found = await localSitePolicyStorage.get(hashOf('alpha'));
    assert.equal(found?.provenance.model, 'openai/gpt-5');
  });

  test('rejects an over-budget save and keeps every analysis already paid for', async () => {
    await localSitePolicyStorage.save(localOf('alpha', 1.5 * MB));
    const before = await localSitePolicyStorage.stats();

    const result = await localSitePolicyStorage.save(localOf('bravo', 1.5 * MB));

    assert.equal(result.status, 'over-budget');
    assert.ok(result.status === 'over-budget' && result.bytes > LOCAL_POLICY_BUDGET_BYTES);
    assert.ok(result.status === 'over-budget' && result.budgetBytes === LOCAL_POLICY_BUDGET_BYTES);

    // The whole point of the module: nothing the user paid for was traded away for the new one.
    assert.ok(await localSitePolicyStorage.get(hashOf('alpha')));
    assert.equal(await localSitePolicyStorage.get(hashOf('bravo')), null);
    assert.equal(store.has(`${LOCAL_ENTRY_PREFIX}${hashOf('bravo')}`), false);
    assert.deepEqual(await localSitePolicyStorage.stats(), before);
  });

  test('deleting an analysis frees the room the rejected save needed', async () => {
    await localSitePolicyStorage.save(localOf('alpha', 1.5 * MB));
    assert.equal((await localSitePolicyStorage.save(localOf('bravo', 1.5 * MB))).status, 'over-budget');

    await localSitePolicyStorage.remove(hashOf('alpha'));

    assert.deepEqual(await localSitePolicyStorage.save(localOf('bravo', 1.5 * MB)), { status: 'saved' });
    assert.equal(await localSitePolicyStorage.get(hashOf('alpha')), null);
    assert.equal(store.has(`${LOCAL_ENTRY_PREFIX}${hashOf('alpha')}`), false);
  });

  test('re-running the same document replaces it instead of charging for it twice', async () => {
    await localSitePolicyStorage.save(localOf('alpha', 1.2 * MB));
    const result = await localSitePolicyStorage.save(localOf('alpha', 1.2 * MB, {}, '2026-09-08T00:00:00.000Z'));

    assert.deepEqual(result, { status: 'saved' });
    const stats = await localSitePolicyStorage.stats();
    assert.equal(stats.entryCount, 1);
    assert.ok(stats.bytes < LOCAL_POLICY_BUDGET_BYTES);
    assert.equal((await localSitePolicyStorage.get(hashOf('alpha')))?.provenance.ranAt, '2026-09-08T00:00:00.000Z');
  });

  test('getForDomain matches the secondary domains a shared document governs', async () => {
    await localSitePolicyStorage.save(
      localOf('shared', 1_000, { domain: 'disneyplus.com', domains: ['disneyplus.com', 'hotstar.com'] }),
    );
    await localSitePolicyStorage.save(localOf('other', 1_000, { domain: 'example.com', domains: ['example.com'] }));

    const viaPrimary = await localSitePolicyStorage.getForDomain('disneyplus.com');
    const viaSecondary = await localSitePolicyStorage.getForDomain('HOTSTAR.com');

    assert.equal(viaPrimary.length, 1);
    assert.equal(viaSecondary.length, 1);
    assert.equal(viaSecondary[0]?.analysis.contentHash, hashOf('shared'));
    assert.deepEqual(await localSitePolicyStorage.getForDomain('unrelated.com'), []);
  });

  test('list reports what a management UI needs, newest first', async () => {
    await localSitePolicyStorage.save(localOf('older', 1_000, {}, '2026-09-01T00:00:00.000Z'));
    await localSitePolicyStorage.save(localOf('newer', 1_000, {}, '2026-09-06T00:00:00.000Z'));

    const listed = await localSitePolicyStorage.list();
    assert.deepEqual(
      listed.map(entry => entry.hash),
      [hashOf('newer'), hashOf('older')],
    );
    assert.equal(listed[0]?.domain, 'newer.example');
    assert.ok((listed[0]?.bytes ?? 0) > 0);
  });

  test('a record that no longer parses is dropped rather than charged for forever', async () => {
    await localSitePolicyStorage.save(localOf('alpha', 1_000));
    store.set(`${LOCAL_ENTRY_PREFIX}${hashOf('alpha')}`, { analysis: 'not an analysis' });

    assert.equal(await localSitePolicyStorage.get(hashOf('alpha')), null);
    assert.deepEqual(await localSitePolicyStorage.list(), []);
    assert.equal((await localSitePolicyStorage.stats()).bytes, 0);
  });
});

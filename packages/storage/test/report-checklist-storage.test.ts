import { HISTORY_LIMIT, sampleQuickScan } from '@extension/unshafted-core';
import assert from 'node:assert/strict';
import test, { beforeEach, describe } from 'node:test';
import type { HistoryRecord } from '@extension/unshafted-core';

/**
 * Checklist ticks on the report page, and the one property that makes remembering them safe: they
 * never outlive the history record they belong to (plan §11.6).
 *
 * Records leave history four ways — `remove`, `removeReport`, `clear`, and silently through
 * `push`, which evicts past the cap and drops an older record for the same document. Each is
 * asserted here, against the real storage modules over a fake `chrome.storage.local`.
 *
 * `createStorage` captures `globalThis.chrome` at module load, so the fake goes in before the
 * dynamic import below.
 */
const store = new Map<string, unknown>();

const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

(globalThis as { chrome?: unknown }).chrome = {
  storage: {
    local: {
      get: async (keys?: string | string[] | null) => {
        const wanted = keys === undefined || keys === null ? [...store.keys()] : Array.isArray(keys) ? keys : [keys];
        const result: Record<string, unknown> = {};
        for (const key of wanted) if (store.has(key)) result[key] = clone(store.get(key));
        return result;
      },
      set: async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) store.set(key, clone(value));
      },
    },
    onChanged: { addListener: () => {} },
  },
};

const { analysisHistoryStorage, reportChecklistStorage } = await import('../lib/impl/unshafted-history-storage.js');

const TICKS_KEY = 'unshafted-report-ticks';

/** A day apart per `n`, so the cap's newest-first order is the order they were made in. */
const recordFor = (id: string, contentHash = `hash-${id}`, n = 0): HistoryRecord => ({
  id,
  createdAt: new Date(Date.UTC(2026, 8, 1 + n)).toISOString(),
  source: {
    kind: 'file',
    name: `${id}.pdf`,
    slug: id,
    contentHash,
    charCount: 1200,
    estimatedTokens: 300,
    preview: 'An agreement.',
    quality: 'good',
    warnings: [],
    capturedAt: '2026-09-01T00:00:00.000Z',
  },
  quickScan: sampleQuickScan,
  selectedRole: 'Contractor',
  priorities: [],
  storageState: 'local-only',
});

const PAY = 'Before you sign\u0000Payment terms are in writing';
const IP = 'Before you sign\u0000IP ownership is clear';

/** What is actually in `chrome.storage.local`, not what a module's cache believes. */
const storedTicks = () => (store.get(TICKS_KEY) ?? {}) as Record<string, string[]>;

beforeEach(async () => {
  store.clear();
  // The modules cache what they last read; start each test from an empty history through them.
  await analysisHistoryStorage.clear();
});

describe('reportChecklistStorage', () => {
  test('a tick is written to storage and reads back from a fresh get, which is what a reload does', async () => {
    await analysisHistoryStorage.push(recordFor('a'));

    await reportChecklistStorage.setTicked('a', PAY, true);
    await reportChecklistStorage.setTicked('a', IP, true);

    assert.deepEqual(storedTicks(), { a: [PAY, IP] });
    assert.deepEqual(await reportChecklistStorage.get(), { a: [PAY, IP] });
  });

  test('unticking removes the key, and the last untick removes the report entry altogether', async () => {
    await analysisHistoryStorage.push(recordFor('a'));
    await reportChecklistStorage.setTicked('a', PAY, true);
    await reportChecklistStorage.setTicked('a', IP, true);

    await reportChecklistStorage.setTicked('a', PAY, false);
    assert.deepEqual(storedTicks(), { a: [IP] });

    await reportChecklistStorage.setTicked('a', IP, false);
    assert.deepEqual(storedTicks(), {});
  });

  test('ticking twice stores the key once', async () => {
    await analysisHistoryStorage.push(recordFor('a'));
    await reportChecklistStorage.setTicked('a', PAY, true);
    await reportChecklistStorage.setTicked('a', PAY, true);

    assert.deepEqual(storedTicks(), { a: [PAY] });
  });

  test('a tick for a report that is not in history is not kept', async () => {
    await analysisHistoryStorage.push(recordFor('a'));

    await reportChecklistStorage.setTicked('ghost', PAY, true);

    assert.deepEqual(storedTicks(), {});
  });

  test('a malformed stored value reads as no ticks rather than throwing', async () => {
    store.set(TICKS_KEY, { a: 'not a list', b: [PAY, 7, null], c: null });

    assert.deepEqual(await reportChecklistStorage.get(), { b: [PAY] });
  });
});

describe('ticks leave with their report', () => {
  beforeEach(async () => {
    await analysisHistoryStorage.push(recordFor('a', 'hash-a', 1));
    await analysisHistoryStorage.push(recordFor('b', 'hash-b', 2));
    await reportChecklistStorage.setTicked('a', PAY, true);
    await reportChecklistStorage.setTicked('b', IP, true);
  });

  test('remove(id) drops that report’s ticks and keeps the others', async () => {
    await analysisHistoryStorage.remove('a');
    assert.deepEqual(storedTicks(), { b: [IP] });
  });

  test('removeReport drops that report’s ticks and keeps the others', async () => {
    await analysisHistoryStorage.removeReport(recordFor('b', 'hash-b', 2));
    assert.deepEqual(storedTicks(), { a: [PAY] });
  });

  test('clear drops every tick', async () => {
    await analysisHistoryStorage.clear();
    assert.deepEqual(storedTicks(), {});
  });

  test('a re-run that keeps the id keeps the ticks', async () => {
    // A deep re-run replaces the record in place: same id, same document.
    await analysisHistoryStorage.push({ ...recordFor('a', 'hash-a', 3), selectedRole: 'Client' });
    assert.deepEqual(storedTicks(), { a: [PAY], b: [IP] });
  });

  test('the same document analysed again under a new id takes the old id’s ticks with it', async () => {
    // `push` drops the older record for the same contentHash without any delete call.
    await analysisHistoryStorage.push(recordFor('a2', 'hash-a', 3));

    assert.equal(
      (await analysisHistoryStorage.get()).some(r => r.id === 'a'),
      false,
    );
    assert.deepEqual(storedTicks(), { b: [IP] });
  });

  test('a report evicted by the history cap loses its ticks by the next write at the latest', async () => {
    // Push enough newer records to push `a` (the oldest) off the end.
    for (let n = 0; n < HISTORY_LIMIT - 1; n++) {
      await analysisHistoryStorage.push(recordFor(`new-${n}`, `hash-new-${n}`, 10 + n));
    }
    const ids = (await analysisHistoryStorage.get()).map(r => r.id);
    assert.equal(ids.includes('a'), false);
    assert.equal(ids.includes('b'), true);

    await reportChecklistStorage.setTicked('b', PAY, true);
    assert.deepEqual(storedTicks(), { b: [IP, PAY] });
  });

  test('an eviction written straight to history, bypassing every helper, is pruned by the next tick', async () => {
    // Nothing in the extension does this today. The prune-on-write is what makes that not matter.
    store.set('unshafted-history', [clone(recordFor('b', 'hash-b', 2))]);

    await reportChecklistStorage.setTicked('b', PAY, true);
    assert.deepEqual(storedTicks(), { b: [IP, PAY] });
  });
});

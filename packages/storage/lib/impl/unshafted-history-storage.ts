/**
 * History, and the one thing that hangs off it: the report page's checklist ticks.
 *
 * They share a file because their lifecycles are one lifecycle. Ticks are remembered per history
 * record (plan §11.6), and a tick whose record has gone is a leak — so every write to either store
 * prunes ticks down to the ids still in history. Kept apart, each module would need the other and
 * the pair would import in a cycle.
 */
import { createStorage, StorageEnum } from '../base/index.js';
import { HistoryRecordSchema, clampHistory } from '@extension/unshafted-core';
import type { ValueOrUpdateType } from '../base/index.js';
import type { HistoryRecord } from '@extension/unshafted-core';

const fallback: HistoryRecord[] = [];

const storage = createStorage<HistoryRecord[]>('unshafted-history', fallback, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
  serialization: {
    serialize: value => HistoryRecordSchema.array().parse(clampHistory(value)),
    deserialize: value => {
      const parsed = HistoryRecordSchema.array().safeParse(value);
      return parsed.success ? clampHistory(parsed.data) : fallback;
    },
  },
});

// ── Checklist ticks ─────────────────────────────────────────────────────

/**
 * History id → the tick keys ticked on that report. A tick key is the group label and the item
 * text, NUL-separated (`report-model.ts`), so a tick survives any re-run that keeps its item word
 * for word. Nothing here is new data: every key is text already stored in the history record.
 */
type ReportTicks = Record<string, string[]>;

/** Deduplicated string keys only, and no empty entries — an unticked report has no row at all. */
const normaliseTicks = (value: unknown): ReportTicks => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const ticks: ReportTicks = {};
  for (const [id, keys] of Object.entries(value)) {
    if (!Array.isArray(keys)) continue;
    const unique = [...new Set(keys.filter((key): key is string => typeof key === 'string'))];
    if (unique.length > 0) ticks[id] = unique;
  }
  return ticks;
};

const ticksStorage = createStorage<ReportTicks>(
  'unshafted-report-ticks',
  {},
  {
    storageEnum: StorageEnum.Local,
    liveUpdate: true,
    serialization: { serialize: normaliseTicks, deserialize: normaliseTicks },
  },
);

const onlyLive = (ticks: ReportTicks, live: ReadonlySet<string>): ReportTicks =>
  Object.fromEntries(Object.entries(ticks).filter(([id]) => live.has(id)));

/**
 * Every tick write goes through here, `set` included, so none can skip the prune. History is read
 * inside the queued write, which keeps the prune in order with the writes around it.
 */
const setTicks = (valueOrUpdate: ValueOrUpdateType<ReportTicks>) =>
  ticksStorage.set(async current => {
    const next = typeof valueOrUpdate === 'function' ? await valueOrUpdate(current ?? {}) : valueOrUpdate;
    const live = new Set((await storage.get()).map(record => record.id));
    return onlyLive(normaliseTicks(next), live);
  });

const reportChecklistStorage = {
  ...ticksStorage,
  set: setTicks,
  /** Written at once and in the background; the page shows the tick before this resolves. */
  setTicked: (historyId: string, tickKey: string, ticked: boolean) =>
    setTicks(current => {
      const keys = new Set(current[historyId] ?? []);
      if (ticked) keys.add(tickKey);
      else keys.delete(tickKey);
      return { ...current, [historyId]: [...keys] };
    }),
};

// ── History ─────────────────────────────────────────────────────────────

/**
 * A history write, then the prune that keeps ticks from outliving it. `push` needs it as much as
 * the deletes: it evicts past the cap and drops an older record for the same document, and neither
 * calls anything that would otherwise tell the ticks.
 */
const setHistory = async (valueOrUpdate: ValueOrUpdateType<HistoryRecord[]>) => {
  await storage.set(valueOrUpdate);
  await setTicks(current => current);
};

const analysisHistoryStorage = {
  ...storage,
  set: setHistory,
  push: async (record: HistoryRecord) => {
    await setHistory(currentRecords =>
      clampHistory([
        record,
        ...(currentRecords ?? []).filter(
          current => current.id !== record.id && current.source.contentHash !== record.source.contentHash,
        ),
      ]),
    );
  },
  remove: async (id: string) => {
    await setHistory(currentRecords => (currentRecords ?? []).filter(record => record.id !== id));
  },
  removeReport: async (record: HistoryRecord) => {
    await setHistory(currentRecords =>
      (currentRecords ?? []).filter(
        current => current.id !== record.id && current.source.contentHash !== record.source.contentHash,
      ),
    );
  },
  clear: async () => {
    await setHistory([]);
  },
};

export { analysisHistoryStorage, reportChecklistStorage };
export type { ReportTicks };

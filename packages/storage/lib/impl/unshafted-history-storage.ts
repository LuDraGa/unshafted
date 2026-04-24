import { createStorage, StorageEnum } from '../base/index.js';
import { HistoryRecordSchema, clampHistory } from '@extension/unshafted-core';
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

export const analysisHistoryStorage = {
  ...storage,
  push: async (record: HistoryRecord) => {
    await storage.set(currentRecords => clampHistory([record, ...(currentRecords ?? [])]));
  },
  remove: async (id: string) => {
    await storage.set(currentRecords => (currentRecords ?? []).filter(record => record.id !== id));
  },
  clear: async () => {
    await storage.set([]);
  },
};

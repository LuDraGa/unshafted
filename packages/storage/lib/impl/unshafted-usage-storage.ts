import { UsageSnapshotSchema, createMonthKey } from '@extension/unshafted-core';
import type { UsageSnapshot } from '@extension/unshafted-core';
import { createStorage, StorageEnum } from '../base/index.js';

const makeFallback = (): UsageSnapshot => ({
  monthKey: createMonthKey(),
  fullAnalysesUsed: 0,
});

const storage = createStorage<UsageSnapshot>('unshafted-usage', makeFallback(), {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
  serialization: {
    serialize: value => UsageSnapshotSchema.parse(value),
    deserialize: value => {
      const parsed = UsageSnapshotSchema.safeParse(value);
      return parsed.success ? parsed.data : makeFallback();
    },
  },
});

export const usageSnapshotStorage = {
  ...storage,
  incrementFullAnalyses: async (date = new Date()) => {
    const monthKey = createMonthKey(date);
    await storage.set(current => {
      const next = current ?? makeFallback();

      if (next.monthKey !== monthKey) {
        return {
          monthKey,
          fullAnalysesUsed: 1,
        };
      }

      return {
        ...next,
        fullAnalysesUsed: next.fullAnalysesUsed + 1,
      };
    });
  },
  syncMonth: async (date = new Date()) => {
    const monthKey = createMonthKey(date);
    await storage.set(current => {
      if (!current || current.monthKey !== monthKey) {
        return {
          monthKey,
          fullAnalysesUsed: 0,
        };
      }

      return current;
    });
  },
};

import { UsageSnapshotSchema, createMonthKey, createDayKey } from '@extension/unshafted-core';
import type { UsageSnapshot } from '@extension/unshafted-core';
import { createStorage, StorageEnum } from '../base/index.js';

const makeFallback = (): UsageSnapshot => ({
  monthKey: createMonthKey(),
  fullAnalysesUsed: 0,
  dayKey: createDayKey(),
  quickScansToday: 0,
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

export const ANONYMOUS_DAILY_QUICK_SCAN_LIMIT = 3;

export const usageSnapshotStorage = {
  ...storage,
  incrementFullAnalyses: async (date = new Date()) => {
    const monthKey = createMonthKey(date);
    await storage.set(current => {
      const next = current ?? makeFallback();

      if (next.monthKey !== monthKey) {
        return {
          ...next,
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
  incrementQuickScans: async (date = new Date()) => {
    const dayKey = createDayKey(date);
    await storage.set(current => {
      const next = current ?? makeFallback();

      if (next.dayKey !== dayKey) {
        return {
          ...next,
          dayKey,
          quickScansToday: 1,
        };
      }

      return {
        ...next,
        quickScansToday: next.quickScansToday + 1,
      };
    });
  },
  canAnonymousQuickScan: async (date = new Date()): Promise<boolean> => {
    const current = await storage.get();
    const dayKey = createDayKey(date);
    if (!current || current.dayKey !== dayKey) return true;
    return current.quickScansToday < ANONYMOUS_DAILY_QUICK_SCAN_LIMIT;
  },
  syncMonth: async (date = new Date()) => {
    const monthKey = createMonthKey(date);
    await storage.set(current => {
      if (!current || current.monthKey !== monthKey) {
        return {
          ...makeFallback(),
          monthKey,
          fullAnalysesUsed: 0,
        };
      }

      return current;
    });
  },
};

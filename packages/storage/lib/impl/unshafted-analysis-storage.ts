import { createStorage, StorageEnum } from '../base/index.js';
import { CurrentAnalysisSchema, PendingActionSchema } from '@extension/unshafted-core';
import type { CurrentAnalysis, PendingAction } from '@extension/unshafted-core';

const analysisFallback: CurrentAnalysis | null = null;
const pendingActionFallback: PendingAction = {
  type: 'none',
};
const legacyPersistentAnalysisKeys = ['unshafted-current-analysis', 'unshafted-pending-action'] as const;

export const currentAnalysisStorage = createStorage<CurrentAnalysis | null>(
  'unshafted-current-analysis',
  analysisFallback,
  {
    storageEnum: StorageEnum.Session,
    liveUpdate: true,
    serialization: {
      serialize: value => (value ? CurrentAnalysisSchema.parse(value) : null),
      deserialize: value => {
        if (value === null || value === undefined) {
          return null;
        }

        const parsed = CurrentAnalysisSchema.safeParse(value);
        return parsed.success ? parsed.data : null;
      },
    },
  },
);

export const pendingActionStorage = createStorage<PendingAction>('unshafted-pending-action', pendingActionFallback, {
  storageEnum: StorageEnum.Session,
  liveUpdate: true,
  serialization: {
    serialize: value => PendingActionSchema.parse(value),
    deserialize: value => {
      const parsed = PendingActionSchema.safeParse(value);
      return parsed.success ? parsed.data : pendingActionFallback;
    },
  },
});

export const clearLegacyPersistentAnalysisState = async (): Promise<void> => {
  await chrome.storage.local.remove([...legacyPersistentAnalysisKeys]);
};

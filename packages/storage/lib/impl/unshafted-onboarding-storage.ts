import { createStorage, StorageEnum } from '../base/index.js';
import { OnboardingStateSchema } from '@extension/unshafted-core';
import type { OnboardingState } from '@extension/unshafted-core';

const fallback = OnboardingStateSchema.parse({});

const storage = createStorage<OnboardingState>('unshafted-onboarding', fallback, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
  serialization: {
    serialize: value => OnboardingStateSchema.parse(value),
    deserialize: value => {
      const parsed = OnboardingStateSchema.safeParse(value);
      return parsed.success ? parsed.data : fallback;
    },
  },
});

export const unshaftedOnboardingStorage = {
  ...storage,
  reset: async () => storage.set(fallback),
};

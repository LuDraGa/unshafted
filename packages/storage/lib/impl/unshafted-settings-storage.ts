import { AppSettingsSchema } from '@extension/unshafted-core';
import type { AppSettings } from '@extension/unshafted-core';
import { createStorage, StorageEnum } from '../base/index.js';

const fallback = AppSettingsSchema.parse({});

const storage = createStorage<AppSettings>('unshafted-settings', fallback, {
  storageEnum: StorageEnum.Local,
  liveUpdate: true,
  serialization: {
    serialize: value => AppSettingsSchema.parse(value),
    deserialize: value => {
      const parsed = AppSettingsSchema.safeParse(value);
      return parsed.success ? parsed.data : fallback;
    },
  },
});

export const unshaftedSettingsStorage = {
  ...storage,
  reset: async () => storage.set(fallback),
};

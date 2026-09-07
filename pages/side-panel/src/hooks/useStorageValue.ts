import { useSyncExternalStore } from 'react';
import type { BaseStorageType } from '@extension/storage';

/**
 * A storage value, or `null` until the first read lands.
 *
 * WHY NOT `useStorage` FROM `@extension/shared`. That hook suspends on its first read, and the
 * popup and options pages can afford it because both mount under `withSuspense`. The side panel's
 * root renders `<SidePanel />` bare (see `index.tsx`), so a throw-a-promise read there is an
 * uncaught error, not a fallback — and D6's whole shape is that the panel paints first and layers
 * everything else on top. A hook that can suspend the first paint is the wrong tool on this
 * surface.
 *
 * `createStorage` kicks off its own `get()` at module load and emits on completion, so the null
 * window is one render and callers render their pending state through it.
 */
export const useStorageValue = <Data>(storage: BaseStorageType<Data>): Data | null =>
  useSyncExternalStore(storage.subscribe, storage.getSnapshot);

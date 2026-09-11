import { useSyncExternalStore } from 'react';
import type { BaseStorageType } from '@extension/storage';

/**
 * How a storage's value is read this render, and whether it has ever produced one.
 *
 * `settled` is the fact that used to live in a per-component `useRef`, read and written during
 * render. It says "this storage has produced a value at least once", which is what separates
 * "still loading, suspend" from "loaded, and currently empty" — without it a store that is cleared
 * after loading falls back to the resolved promise and serves the value it used to hold.
 *
 * Moving it onto the entry is behaviour-preserving, and deliberately so: this hook is behind the
 * first paint of the popup, the options page and the workspace. It belongs here on the merits
 * anyway — the fact is about the storage, not about whichever component happened to read it first,
 * and the entry it now sits on is already shared by every reader of that storage.
 */
type StorageEntry = {
  read: () => unknown;
  settled: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const storageMap: Map<BaseStorageType<any>, StorageEntry> = new Map();

const wrapPromise = <R,>(promise: Promise<R>) => {
  let status = 'pending';
  let result: R;

  const suspender = promise.then(
    r => {
      status = 'success';
      result = r;
    },
    e => {
      status = 'error';
      result = e;
    },
  );

  return {
    read() {
      switch (status) {
        case 'pending':
          throw suspender;
        case 'error':
          throw result;
        default:
          return result;
      }
    },
  };
};

export const useStorage = <
  Storage extends BaseStorageType<Data>,
  Data = Storage extends BaseStorageType<infer Data> ? Data : unknown,
>(
  storage: Storage,
) => {
  const _data = useSyncExternalStore<Data | null>(storage.subscribe, storage.getSnapshot);
  const entry = storageMap.get(storage);

  if (_data || entry?.settled) {
    // Read straight through from here on, including when the value goes away again.
    storageMap.set(storage, { read: () => _data, settled: true });
  } else if (!entry) {
    // Nothing has been read yet. `read()` throws the promise, and Suspense catches it.
    storageMap.set(storage, { ...wrapPromise(storage.get()), settled: false });
  }

  return (_data ?? storageMap.get(storage)!.read()) as Exclude<Data, PromiseLike<unknown>>;
};

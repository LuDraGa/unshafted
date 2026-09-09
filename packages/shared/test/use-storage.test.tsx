/**
 * The suspense-backed storage hook, and the one fact it has to keep about each store: whether that
 * store has ever produced a value.
 *
 * That fact used to live in a per-component `useRef`, read and written during render, which is
 * what `react-hooks/refs` objected to. Moving it onto the module-level entry the hook already keeps
 * is meant to change nothing observable, and these cases are here to say so: every one of them
 * passes against both versions. That is the point — this hook is behind the first paint of the
 * popup, the options page and the workspace, so the bar for the change was "provably the same".
 */
import { useStorage } from '../lib/hooks/use-storage';
import { render, screen, act } from '@testing-library/react';
import { Suspense } from 'react';
import { describe, expect, it } from 'vitest';
import type { BaseStorageType } from '@extension/storage';

/** A storage whose first read the test settles by hand, and whose value it can change. */
const makeStorage = <D,>(initial: D | null = null) => {
  let snapshot: D | null = initial;
  const listeners = new Set<() => void>();
  let settleFirstRead!: (value: D) => void;

  const firstRead = new Promise<D>(resolve => {
    settleFirstRead = value => {
      snapshot = value;
      resolve(value);
    };
  });

  const storage: BaseStorageType<D> = {
    get: () => firstRead,
    set: async () => {},
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  const emit = (value: D | null) => {
    snapshot = value;
    listeners.forEach(listener => listener());
  };

  return { storage, settleFirstRead, emit };
};

const Show = ({ storage, label = 'value' }: { storage: BaseStorageType<string>; label?: string }) => {
  const value = useStorage(storage);
  return <output data-testid={label}>{value === null ? 'null' : value}</output>;
};

describe('useStorage', () => {
  it('suspends until the first read lands, then shows the value', async () => {
    const { storage, settleFirstRead } = makeStorage<string>();

    render(
      <Suspense fallback={<span data-testid="fallback">loading</span>}>
        <Show storage={storage} />
      </Suspense>,
    );

    expect(screen.getByTestId('fallback')).toBeInTheDocument();

    await act(async () => {
      settleFirstRead('first');
    });

    expect(screen.getByTestId('value')).toHaveTextContent('first');
  });

  it('follows the store after it has loaded', async () => {
    const { storage, settleFirstRead, emit } = makeStorage<string>();

    render(
      <Suspense fallback={<span>loading</span>}>
        <Show storage={storage} />
      </Suspense>,
    );
    await act(async () => {
      settleFirstRead('first');
    });

    await act(async () => {
      emit('second');
    });

    expect(screen.getByTestId('value')).toHaveTextContent('second');
  });

  it('reports empty rather than the value it used to hold', async () => {
    const { storage, settleFirstRead, emit } = makeStorage<string>();

    render(
      <Suspense fallback={<span>loading</span>}>
        <Show storage={storage} />
      </Suspense>,
    );
    await act(async () => {
      settleFirstRead('first');
    });

    // The store is cleared. Falling back to the settled promise here would serve 'first' forever.
    await act(async () => {
      emit(null);
    });

    expect(screen.getByTestId('value')).toHaveTextContent('null');
  });

  it('does not suspend a component that mounts after the store has loaded', async () => {
    const { storage, settleFirstRead } = makeStorage<string>();

    const { rerender } = render(
      <Suspense fallback={<span>loading</span>}>
        <Show storage={storage} label="first-reader" />
      </Suspense>,
    );
    await act(async () => {
      settleFirstRead('first');
    });

    rerender(
      <Suspense fallback={<span data-testid="fallback">loading</span>}>
        <Show storage={storage} label="first-reader" />
        <Show storage={storage} label="late-reader" />
      </Suspense>,
    );

    expect(screen.queryByTestId('fallback')).not.toBeInTheDocument();
    expect(screen.getByTestId('late-reader')).toHaveTextContent('first');
  });
});

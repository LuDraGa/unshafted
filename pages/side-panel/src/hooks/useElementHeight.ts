import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/**
 * The rendered height of an element, read live rather than assumed (P13) — a per-view header can
 * wrap to a second line, a document's `<summary>` is one font away from a different height, and a
 * sticky offset downstream of either has to track the real box, not a guessed constant.
 *
 * jsdom (every test in this workspace) has no `ResizeObserver`, so the observer is skipped there
 * and `height` stays at its initial `getBoundingClientRect()` reading — 0, since jsdom does no
 * layout. No test asserts on a measured offset; the real check is against a built stylesheet in an
 * actual browser, the same gate every other computed-style claim in this redesign already needs.
 */
export const useElementHeight = <T extends HTMLElement>(): [RefObject<T | null>, number] => {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const measure = () => setHeight(node.getBoundingClientRect().height);
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, height];
};

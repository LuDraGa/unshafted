/**
 * Layered disclosure: which rows are open, and the three things that open them other than a click
 * — a jump link, printing, and find-in-page.
 *
 * Every row is a native `<details>`, never a div with a handler (plan §11.4). That gets keyboard,
 * screen-reader state and Chrome's find-in-page auto-expansion for free. No `name` attribute: the
 * page is non-exclusive, and holding several findings open side by side is why it exists.
 *
 * The open state is still held here rather than left to the DOM, because three things need to
 * know it: *Expand all* has to label itself from the tier's current state, printing opens
 * everything and must put it back afterwards, and a live re-run must not reset what the reader had
 * open. The store keeps only what the reader CHANGED, keyed on content (`report-model.ts`), so a
 * row that survives a re-run keeps its state and a new row takes its tier's default.
 */
import { cn } from '@extension/ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import type { Severity } from '@extension/unshafted-core';

type DisclosureApi = {
  isOpen: (key: string, defaultOpen: boolean) => boolean;
  setOpen: (keys: string[], open: boolean) => void;
  /**
   * Scroll to the element with this id, open it if it is a closed row, and flash it so the eye
   * lands. Used by the rail, the at-a-glance strip and every "→ Your ask" link.
   */
  jumpTo: (id: string) => void;
};

const DisclosureContext = createContext<DisclosureApi | null>(null);

const useDisclosure = (): DisclosureApi => {
  const api = useContext(DisclosureContext);
  if (!api) throw new Error('useDisclosure outside <DisclosureProvider>');
  return api;
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Re-triggerable by removing and re-adding the attribute across a reflow. A data attribute rather
 * than a class, because React owns `className` and would strip a class it did not render the next
 * time the row re-renders — which, for a row that was just opened, is immediately.
 */
const flash = (el: HTMLElement) => {
  el.removeAttribute('data-arrived');
  void el.offsetWidth;
  el.setAttribute('data-arrived', '');
  window.setTimeout(() => el.removeAttribute('data-arrived'), 1600);
};

/**
 * Flash once the scroll has actually arrived, not when it starts — a highlight that plays out
 * mid-scroll is a highlight nobody sees. `scrollend` covers the smooth case; the timeout covers a
 * target already in place (no scroll, so no `scrollend`) and a page that cannot scroll that far.
 */
const flashOnArrival = (el: HTMLElement, willScroll: boolean) => {
  if (!willScroll) {
    flash(el);
    return;
  }
  let done = false;
  const land = () => {
    if (done) return;
    done = true;
    window.removeEventListener('scrollend', land);
    flash(el);
  };
  window.addEventListener('scrollend', land);
  window.setTimeout(land, 1200);
};

/** Where keyboard focus should go on arrival: the row's summary, or the heading of a section. */
const focusTargetOf = (el: HTMLElement): HTMLElement | null =>
  el instanceof HTMLDetailsElement ? el.querySelector(':scope > summary') : el.querySelector('h2, h3');

const DisclosureProvider = ({ children }: { children: React.ReactNode }) => {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(() => new Map());
  const [printing, setPrinting] = useState(false);

  /*
   * Print opens everything and remembers nothing: the overrides are untouched while `printing`
   * holds every row open, so clearing the flag restores exactly what was closed. `flushSync`
   * because Chrome lays out the printout straight after `beforeprint` returns; a state update left
   * for React's next tick would print the screen as it was.
   */
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  const isOpen = useCallback(
    (key: string, defaultOpen: boolean) => printing || (overrides.get(key) ?? defaultOpen),
    [overrides, printing],
  );

  const setOpen = useCallback((keys: string[], open: boolean) => {
    setOverrides(current => {
      const next = new Map(current);
      for (const key of keys) next.set(key, open);
      return next;
    });
  }, []);

  const jumpTo = useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;

      // Open first, synchronously, so the scroll measures the row at its real position.
      if (el instanceof HTMLDetailsElement && !el.open) flushSync(() => setOpen([id], true));

      const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      const smooth = !prefersReducedMotion();
      // An instant jump has arrived by the next line, so only a smooth one has anything to wait for.
      const willScroll = smooth && Math.abs(el.getBoundingClientRect().top - margin) > 2;
      el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
      focusTargetOf(el)?.focus({ preventScroll: true });
      flashOnArrival(el, willScroll);
    },
    [setOpen],
  );

  const api = useMemo(() => ({ isOpen, setOpen, jumpTo }), [isOpen, setOpen, jumpTo]);
  return <DisclosureContext.Provider value={api}>{children}</DisclosureContext.Provider>;
};

/**
 * A click that ends a text selection is not a request to toggle. The quote lives in the summary so
 * it stays visible while closed — and a reader verifying a finding will select it to search the
 * contract for it. Without this, finishing the selection closes the row out from under them.
 */
const keepSelection = (event: React.MouseEvent) => {
  const selection = document.getSelection();
  if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) event.preventDefault();
};

const Chevron = () => (
  <svg className="report-chevron" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

/**
 * One row. The summary holds layers 1 and 2 — what it is, how bad, and the words it rests on — and
 * the body holds layer 3, the explanation. So the whole closed row is the click target, and
 * nothing needed to verify a finding is ever behind the control.
 */
const Disclosure = ({
  id,
  defaultOpen = false,
  className,
  severity,
  summary,
  children,
}: {
  id: string;
  defaultOpen?: boolean;
  className?: string;
  /** Drives the left rule. The pill in the summary says it in words; the rule never says it alone. */
  severity?: Severity;
  summary: React.ReactNode;
  children: React.ReactNode;
}) => {
  const { isOpen, setOpen } = useDisclosure();
  const open = isOpen(id, defaultOpen);

  /*
   * Record only what the reader did. React setting `open` from state — Expand all, a jump, print —
   * also fires `toggle`, and there the DOM already agrees with state, so nothing is written. That
   * is what keeps print's open-everything out of the overrides. Find-in-page opening a row is a
   * real change, and is recorded like a click.
   */
  const onToggle = (event: React.SyntheticEvent<HTMLDetailsElement>) => {
    const nowOpen = event.currentTarget.open;
    if (nowOpen !== open) setOpen([id], nowOpen);
  };

  return (
    <details
      id={id}
      className={cn('report-disclosure', className)}
      data-severity={severity}
      open={open}
      onToggle={onToggle}>
      <summary className="report-summary" onClick={keepSelection}>
        <Chevron />
        <span className="report-summary-main">{summary}</span>
      </summary>
      <div className="report-disclosure-body">{children}</div>
    </details>
  );
};

/**
 * *Expand all* / *Collapse all* for one group of rows. The label follows the group's current state,
 * including after the reader opens rows one at a time: it offers to collapse only once every row
 * is open.
 */
const ExpandAll = ({ keys, defaultOpen, label }: { keys: string[]; defaultOpen: boolean; label: string }) => {
  const { isOpen, setOpen } = useDisclosure();
  if (keys.length < 2) return null;
  const allOpen = keys.every(key => isOpen(key, defaultOpen));
  return (
    <button
      type="button"
      className="report-text-button report-expand-all"
      aria-label={`${allOpen ? 'Collapse' : 'Expand'} all ${label}`}
      onClick={() => setOpen(keys, !allOpen)}>
      {allOpen ? 'Collapse all' : 'Expand all'}
    </button>
  );
};

/** An in-page link that opens and flashes its target. A real `href`, so it still works as a link. */
const JumpLink = ({ to, className, children }: { to: string; className?: string; children: React.ReactNode }) => {
  const { jumpTo } = useDisclosure();
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={event => {
        event.preventDefault();
        jumpTo(to);
      }}>
      {children}
    </a>
  );
};

export { Disclosure, DisclosureProvider, ExpandAll, JumpLink, useDisclosure };

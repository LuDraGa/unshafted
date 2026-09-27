import { useStorage } from '@extension/shared';
import { reportChecklistStorage } from '@extension/storage';
import { useRef, useState } from 'react';

const NONE: readonly string[] = [];

type Pending = ReadonlyMap<string, { on: boolean; seq: number }>;

/**
 * The checklist ticks for one report: remembered in storage, shown before storage says so.
 *
 * A checkbox bound straight to storage flickers. The write is async, so React puts the box back
 * the moment it is clicked and storage ticks it again a beat later. So a click lands in `pending`
 * at once and the write follows. The pending entry is dropped only when *its own* write resolves,
 * because storage emits before `set` returns, so by then the stored value already agrees. The
 * sequence number is what lets on-off-on in quick succession settle without a blink: an earlier
 * write finishing cannot clear a later click.
 *
 * `live` is false once the record has left history. Storage prunes the ticks of a removed record
 * (`unshafted-history-storage.ts`), but the page keeps the removed copy on screen, so it keeps the
 * ticks it last saw too. New ticks there last as long as the tab does.
 */
const useReportTicks = (historyId: string, live: boolean) => {
  const stored = useStorage(reportChecklistStorage);
  const savedNow = stored[historyId] ?? NONE;

  const [kept, setKept] = useState(savedNow);
  const [pending, setPending] = useState<Pending>(() => new Map());
  const seq = useRef(0);

  // Adjusting state during render: while live, remember the last saved ticks for when it isn't.
  if (live && kept !== savedNow) setKept(savedNow);

  const ticked = new Set(live ? savedNow : kept);
  for (const [key, { on }] of pending) {
    if (on) ticked.add(key);
    else ticked.delete(key);
  }

  const onTick = (key: string, on: boolean) => {
    const mine = ++seq.current;
    setPending(current => new Map(current).set(key, { on, seq: mine }));
    if (!live) return;

    const settle = () =>
      setPending(current => {
        if (current.get(key)?.seq !== mine) return current;
        const next = new Map(current);
        next.delete(key);
        return next;
      });
    // A failed write settles too, so the box then shows what is really stored.
    void reportChecklistStorage.setTicked(historyId, key, on).then(settle, settle);
  };

  return { ticked: ticked as ReadonlySet<string>, onTick };
};

export { useReportTicks };

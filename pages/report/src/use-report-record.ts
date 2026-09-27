import { useStorage } from '@extension/shared';
import { analysisHistoryStorage } from '@extension/storage';
import { useEffect, useState } from 'react';
import type { HistoryRecord } from '@extension/unshafted-core';

/**
 * How long a record that is not in history yet gets before the page says it is missing.
 *
 * The popup's *Open full report* button appears when `currentAnalysis.deepAnalysis` lands, and the
 * background pushes the history record just after writing `currentAnalysis`. A fast click can
 * arrive in that gap, and flashing "not found" at a reader whose report is a moment away is the
 * one thing this state exists to prevent.
 */
const ARRIVAL_GRACE_MS = 3000;

type ReportState =
  /** Not in history yet, inside the grace window. Renders as loading. */
  | { kind: 'waiting' }
  /** No id, or an id that never resolved: evicted, deleted, or never there. */
  | { kind: 'missing' }
  /** `revision` counts in-place replacements seen while open — a deep re-run keeps the id. */
  | { kind: 'present'; record: HistoryRecord; revision: number }
  /**
   * Was on screen, and is no longer in history. The record is kept so the reader is not blanked
   * mid-read. `newer` is a record for the same document under a different id, which is what a
   * re-upload of the same file produces (`push` drops the old one by `contentHash`).
   */
  | { kind: 'removed'; record: HistoryRecord; newer: HistoryRecord | null };

type Held = { record: HistoryRecord; revision: number };

/** Every storage change deserialises fresh objects, so identity says nothing; content does. */
const sameContent = (a: HistoryRecord, b: HistoryRecord) => JSON.stringify(a) === JSON.stringify(b);

const findNewer = (records: HistoryRecord[], gone: HistoryRecord): HistoryRecord | null => {
  const hash = gone.source.contentHash;
  // `contentHash` defaults to '' on old records, and two blanks are not the same document.
  if (!hash) return null;
  return records.find(r => r.id !== gone.id && r.source.contentHash === hash) ?? null;
};

/** The `?id=` in this page's URL. Only ever a lookup key; it is never rendered or sent anywhere. */
const readReportId = (search: string): string | null => new URLSearchParams(search).get('id')?.trim() || null;

const useReportRecord = (id: string | null): ReportState => {
  const records = useStorage(analysisHistoryStorage);
  const live = id ? (records.find(r => r.id === id) ?? null) : null;

  const [held, setHeld] = useState<Held | null>(null);
  const [graceOver, setGraceOver] = useState(false);

  // Adjusting state during render, React's pattern for state derived from a changing input: the
  // held copy follows the live record, and a change in its content is an in-place update.
  if (live && live !== held?.record) {
    if (!held) setHeld({ record: live, revision: 0 });
    else if (!sameContent(held.record, live)) setHeld({ record: live, revision: held.revision + 1 });
    else setHeld({ record: live, revision: held.revision });
  }

  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => setGraceOver(true), ARRIVAL_GRACE_MS);
    return () => clearTimeout(timer);
  }, [id]);

  if (live) return { kind: 'present', record: live, revision: held?.revision ?? 0 };
  if (held) return { kind: 'removed', record: held.record, newer: findNewer(records, held.record) };
  if (!id || graceOver) return { kind: 'missing' };
  return { kind: 'waiting' };
};

export { ARRIVAL_GRACE_MS, readReportId, useReportRecord };
export type { ReportState };

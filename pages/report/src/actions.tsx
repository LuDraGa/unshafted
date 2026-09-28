/**
 * What the reader can do with the whole report (plan §7, "Actions"): Copy and Export it as
 * Markdown, Print it, and Delete it.
 *
 * Ranks follow the side panel's ladder (§6): outlined for Copy, Export and Print, a text button for
 * Delete, and a filled button only for Delete's confirm, the one commit on the page.
 */
import { analysisHistoryStorage } from '@extension/storage';
import { deleteFromDrive } from '@extension/supabase';
import { cn } from '@extension/ui';
import { createReportFilename, createReportMarkdown } from '@extension/unshafted-core';
import { useEffect, useRef, useState } from 'react';
import type { HistoryRecord, ReportMarkdownOptions } from '@extension/unshafted-core';

/**
 * Exactly what the popup's History delete does: the record and its matching ticks leave local
 * history, and matching Drive files are asked to go too. Anything less and a Drive restore could
 * bring back a report the reader deleted here.
 */
const deleteReport = async (record: HistoryRecord) => {
  await analysisHistoryStorage.removeReport(record);
  if (record.source.contentHash) {
    void deleteFromDrive(record.source.contentHash, 'quick-scan');
    void deleteFromDrive(record.source.contentHash, 'deep-analysis');
  }
};

const download = (record: HistoryRecord, markdown: string) => {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = createReportFilename(record);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

type Flash = 'copied' | 'failed' | null;

const ReportActions = ({
  record,
  markdownOptions,
  onDelete,
  compact = false,
}: {
  record: HistoryRecord;
  /** The checklist as ticked, so the export says what the page shows. */
  markdownOptions: ReportMarkdownOptions;
  /** Absent once the record has left history: there is nothing left to delete. */
  onDelete?: () => void;
  /** The sticky bar's copy: no Delete, which stays next to the document it deletes. */
  compact?: boolean;
}) => {
  const [flash, setFlash] = useState<Flash>(null);
  const [confirming, setConfirming] = useState(false);
  const keep = useRef<HTMLButtonElement>(null);

  // The confirm replaces the button the reader just pressed; focus goes to the safe choice in it.
  useEffect(() => {
    if (confirming) keep.current?.focus();
  }, [confirming]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(createReportMarkdown(record, markdownOptions));
      setFlash('copied');
    } catch {
      setFlash('failed');
    }
    window.setTimeout(() => setFlash(null), 1800);
  };

  return (
    <div className={cn('report-actions', compact && 'report-actions-compact')}>
      <div className="report-actions-row" role="group" aria-label="Report actions">
        <button type="button" className="report-button-outline" onClick={() => void copy()}>
          <span aria-live="polite">
            {flash === 'copied' ? 'Copied' : flash === 'failed' ? 'Couldn’t copy' : 'Copy'}
          </span>
        </button>
        <button
          type="button"
          className="report-button-outline"
          onClick={() => download(record, createReportMarkdown(record, markdownOptions))}>
          Export .md
        </button>
        <button type="button" className="report-button-outline" onClick={() => window.print()}>
          Print
        </button>
        {!compact && onDelete && !confirming ? (
          <button type="button" className="report-text-button report-delete" onClick={() => setConfirming(true)}>
            Delete
          </button>
        ) : null}
      </div>
      {!compact && onDelete && confirming ? (
        <div className="report-confirm" role="group" aria-label="Delete this report?">
          <p className="report-confirm-title">Delete this report?</p>
          <p className="report-confirm-body">
            This removes it from local recent analyses. If matching Drive files exist, Unshafted will also ask Drive to
            remove them.
          </p>
          <div className="report-actions-row">
            <button type="button" className="report-button-danger" onClick={onDelete}>
              Delete permanently
            </button>
            <button ref={keep} type="button" className="report-text-button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

/** Closes this tab. Extension pages can close their own tab through `chrome.tabs`; plain pages cannot. */
const closeTab = async () => {
  const tab = await globalThis.chrome?.tabs?.getCurrent?.();
  if (tab?.id !== undefined) await chrome.tabs.remove(tab.id);
  else window.close();
};

export { ReportActions, closeTab, deleteReport };

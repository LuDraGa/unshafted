import '@src/Report.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { ErrorDisplay } from '@extension/ui';
import { APP_NAME, HISTORY_LIMIT } from '@extension/unshafted-core';
import { ReportActions, closeTab, deleteReport } from '@src/actions';
import { DisclosureProvider } from '@src/disclosure';
import { ReportFrame } from '@src/navigation';
import {
  buildAsks,
  buildBlockerTiers,
  buildCaveats,
  buildEvidence,
  buildGlance,
  buildSections,
  isDeepRecord,
  tickKeyFor,
} from '@src/report-model';
import {
  AsksSection,
  Blockers,
  CaveatsSection,
  Doc,
  Evidence,
  Footer,
  Obligations,
  Verdict,
  Wins,
} from '@src/sections';
import { readReportId, useReportRecord } from '@src/use-report-record';
import { useReportTicks } from '@src/use-report-ticks';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { HistoryRecord } from '@extension/unshafted-core';
import type { DeepRecord } from '@src/report-model';

/** Read once. The page shows one report for its lifetime; a different id is a different page load. */
const reportId = readReportId(window.location.search);

const PAGE_TITLE = `${APP_NAME} report`;

const openReport = (id: string) => {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ id }).toString();
  window.location.assign(url.toString());
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** A CSS string literal holding `text`, for `content:` through a custom property. */
const cssString = (text: string) => `"${text.replace(/[\\"]/g, '\\$&').replace(/[\n\r\f]/g, ' ')}"`;

const BrandMark = () => <p className="report-brand">{APP_NAME}</p>;

const ReportLoading = () => (
  <main className="report-shell">
    <div className="report-state" aria-busy="true" aria-live="polite">
      <BrandMark />
      <p className="report-state-body">Opening your report…</p>
    </div>
  </main>
);

const ReportMissing = () => (
  <main className="report-shell">
    <div className="report-state" role="status">
      <BrandMark />
      <h1 className="report-state-title">This report is no longer in your history</h1>
      <p className="report-state-body">
        History keeps your {HISTORY_LIMIT} most recent reports, and analysing the same document again replaces its older
        report. Open a report from the {APP_NAME} popup&rsquo;s History to see it here.
      </p>
    </div>
  </main>
);

const RemovedNotice = ({ newer }: { newer: HistoryRecord | null }) => (
  <div className="report-notice" role="status">
    {newer ? (
      <>
        <p>
          <strong>A newer report for this document exists.</strong> This one has left your history.
        </p>
        <button type="button" className="report-button-outline" onClick={() => openReport(newer.id)}>
          Open it
        </button>
      </>
    ) : (
      <p>
        <strong>Removed from history.</strong> This copy stays open until you close the tab.
      </p>
    )}
  </div>
);

/** After Delete on this page. The content stays until the reader closes the tab; nothing auto-closes. */
const DeletedNotice = () => (
  <div className="report-notice" role="status">
    <p>
      <strong>Deleted from your history.</strong> This copy stays open until you close the tab.
    </p>
    <button type="button" className="report-button-outline" onClick={() => void closeTab()}>
      Close tab
    </button>
  </div>
);

/**
 * The page renders deep records only (plan §11.7, D8). A quick scan is reachable here only by
 * hand, and the popup's History is where it reads properly, so this says so calmly instead of
 * rendering half a report.
 */
const QuickOnly = () => (
  <div className="report-notice report-notice-quiet" role="status">
    <p>
      <strong>This is a quick scan.</strong> Quick scans open in the {APP_NAME} popup&rsquo;s History; the full report
      is for detailed analyses.
    </p>
  </div>
);

/**
 * Shown after a deep re-run replaces the record in place. Keyed on the revision, so each update
 * restarts it; it fades on its own (CSS), because "just now" stops being true.
 */
const UpdatedNote = ({ revision }: { revision: number }) =>
  revision > 0 ? (
    <span key={revision} className="report-updated" role="status">
      Updated just now
    </span>
  ) : null;

const ReportBody = ({
  record,
  ticked,
  onTick,
}: {
  record: DeepRecord;
  ticked: ReadonlySet<string>;
  onTick: (tickKey: string, on: boolean) => void;
}) => {
  const deep = record.deepAnalysis;
  const model = useMemo(() => {
    const asks = buildAsks(deep);
    return {
      asks,
      tiers: buildBlockerTiers(deep, asks),
      evidence: buildEvidence(deep),
      caveats: buildCaveats(record),
    };
  }, [deep, record]);

  const tickedCount = model.asks.checklist.reduce(
    (sum, g) => sum + g.items.filter(i => ticked.has(i.tickKey)).length,
    0,
  );
  const glance = buildGlance(model.tiers, model.asks, tickedCount);

  return (
    <>
      <Verdict deep={deep} glance={glance} />
      {model.tiers.length > 0 ? <Blockers tiers={model.tiers} /> : null}
      {model.asks.count > 0 ? <AsksSection asks={model.asks} ticked={ticked} onTick={onTick} /> : null}
      {record.quickScan.keyObligations.length > 0 ? <Obligations items={record.quickScan.keyObligations} /> : null}
      {model.evidence.length > 0 ? <Evidence groups={model.evidence} /> : null}
      {deep.potentialAdvantages.length > 0 ? <Wins items={deep.potentialAdvantages} /> : null}
      <Doc record={record} />
      {model.caveats.count > 0 ? <CaveatsSection caveats={model.caveats} /> : null}
      <Footer disclaimer={deep.disclaimer} />
    </>
  );
};

const ReportDocument = ({
  record,
  live,
  revision = 0,
  notice,
  onDelete,
}: {
  record: HistoryRecord;
  /** False once the record has left history and this is the copy kept on screen. */
  live: boolean;
  revision?: number;
  notice?: React.ReactNode;
  onDelete?: () => void;
}) => {
  const partyCount = record.quickScan.parties.length;
  const deep = isDeepRecord(record) ? record : null;
  const sections = useMemo(() => (deep ? buildSections(deep) : []), [deep]);
  const header = useRef<HTMLElement>(null);
  // Held here rather than in the body, because the export says what the checklist shows.
  const { ticked, onTick } = useReportTicks(record.id, live);
  const markdownOptions = { isTicked: (group: string, item: string) => ticked.has(tickKeyFor(group, item)) };

  // The printed running header reads these (`@page` in Report.css).
  const printedDate = formatDate(record.createdAt);
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty('--report-print-name', cssString(record.source.name));
    root.setProperty('--report-print-date', cssString(printedDate));
  }, [record.source.name, printedDate]);

  return (
    <DisclosureProvider>
      <ReportFrame
        name={record.source.name}
        risk={deep?.deepAnalysis.overallRiskLevel ?? null}
        sections={sections}
        headerRef={header}
        actions={deep ? <ReportActions record={record} markdownOptions={markdownOptions} compact /> : null}>
        <header ref={header} className="report-header">
          <BrandMark />
          <h1 className="report-title">{record.source.name}</h1>
          <p className="report-meta">
            {record.quickScan.documentType}
            {partyCount > 0 ? ` · ${partyCount === 1 ? '1 party' : `${partyCount} parties`}` : null}
            {` · Reviewed as ${record.selectedRole} · ${formatDate(record.createdAt)}`}
            <UpdatedNote revision={revision} />
          </p>
          {deep ? (
            <ReportActions record={record} markdownOptions={markdownOptions} onDelete={live ? onDelete : undefined} />
          ) : null}
        </header>
        {notice}
        {deep ? <ReportBody record={deep} ticked={ticked} onTick={onTick} /> : <QuickOnly />}
      </ReportFrame>
    </DisclosureProvider>
  );
};

const Report = () => {
  const state = useReportRecord(reportId);
  const name = state.kind === 'present' || state.kind === 'removed' ? state.record.source.name : null;
  // Set before the delete is written, so the page never shows "Removed from history" in between.
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    document.title = name ? `${name} — ${PAGE_TITLE}` : PAGE_TITLE;
  }, [name]);

  switch (state.kind) {
    case 'waiting':
      return <ReportLoading />;
    case 'missing':
      return <ReportMissing />;
    case 'present': {
      const { record } = state;
      const onDelete = async () => {
        setDeleted(true);
        try {
          await deleteReport(record);
        } catch {
          setDeleted(false);
        }
      };
      return <ReportDocument record={record} live revision={state.revision} onDelete={() => void onDelete()} />;
    }
    case 'removed':
      return (
        <ReportDocument
          record={state.record}
          live={false}
          notice={deleted ? <DeletedNotice /> : <RemovedNotice newer={state.newer} />}
        />
      );
  }
};

export default withErrorBoundary(withSuspense(Report, <ReportLoading />), ErrorDisplay);

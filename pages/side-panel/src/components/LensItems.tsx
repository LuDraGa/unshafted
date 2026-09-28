import { RISK_TONE } from '@extension/ui';
import {
  DOC_TYPE_LABELS,
  SEVERITY_TONE,
  describeDeadline,
  formatAnalysedDate,
  shortenUrl,
} from '@src/lib/presentation';
import type { Exposure, SitePolicyAnalysis } from '@extension/unshafted-core';
import type { DocumentFreshness } from '@src/hooks/useLivePolicyCheck';
import type { LensItem } from '@src/lib/lenses';
import type { ReactNode } from 'react';

/**
 * The blocks inside a lens — the popup's `CollapsibleItem`, carried over on purpose.
 *
 * CRISP WHEN CLOSED. A closed block is the finding's name and nothing else a reader has to wade
 * through: a lens of 18 findings reads as 18 scannable lines, and the reader opens the one that
 * is about them. This replaces P3's per-row split, where an exposure kept its meaning on screen
 * and a 40-row document was still 40 paragraphs long (director, 2026-09-23).
 *
 * ONE OPEN AT A TIME, via the platform's exclusive accordion: every block in a lens shares a
 * `name`, so opening one closes the last with no state and no handler — the popup's reasoning
 * exactly. Nothing nests inside an opened block; the lens is chosen sideways, and the block is the
 * only thing that opens.
 *
 * FLAT, NOT CARDS. The popup gives each item its own border; here they are rows divided by
 * hairlines inside the one bordered lens card (P5). The interaction is mirrored; the nested-box
 * surface the ladder removed is not.
 *
 * TWO THINGS NEVER HIDE, and both are the same rule D17 and C1 already made: a window is in the
 * closed block, because a deadline behind a control is a deadline the product decided not to
 * mention; and a missing disclosure gets no control at all, because its whole payload is its name,
 * regime and note (P4) — a control could only open onto nothing.
 */

type ItemContext = {
  /** Null means no freshness claim exists for this analysis — a run on the reader's own key (S3). */
  freshnessOf: (analysis: SitePolicyAnalysis) => DocumentFreshness | null;
  /** On a one-document site every finding comes from the same place, so naming it is noise. */
  showSource: boolean;
  /** Per-document provenance, when the default "read from" line is not who read it (S3). */
  provenance?: (analysis: SitePolicyAnalysis) => ReactNode;
};

const Severity = ({ severity }: { severity: Exposure['severity'] }) => (
  <span className={`panel-severity ${SEVERITY_TONE[severity]}`}>{severity}</span>
);

/** The quote is what makes a finding checkable on a page that has since moved (D7). */
const Reference = ({ reference }: { reference: NonNullable<Exposure['reference']> }) => (
  <div className="panel-reference">
    <p className="panel-reference-label">{reference.label}</p>
    {reference.quote ? <p className="panel-reference-quote">“{reference.quote}”</p> : null}
  </div>
);

/**
 * Where the finding came from. Aggregating by concern does not stop the document being the real
 * unit (D3): on a changed document the finding describes an earlier version, and the reader has to
 * be told which findings those are, next to the finding, not in a caveat three lenses away.
 */
const Source = ({ analysis, context }: { analysis: SitePolicyAnalysis; context: ItemContext }) => {
  const changed = context.freshnessOf(analysis) === 'changed';
  if (!context.showSource && !changed) return null;

  return (
    <span className="panel-item-source">
      {context.showSource ? DOC_TYPE_LABELS[analysis.docType] : null}
      {context.showSource && changed ? ' · ' : null}
      {changed ? <span className="panel-item-earlier">earlier version</span> : null}
    </span>
  );
};

const Block = ({
  group,
  open,
  head,
  children,
}: {
  group: string;
  open: boolean;
  head: ReactNode;
  children: ReactNode;
}) => (
  <details className="panel-item" name={group} open={open || undefined}>
    <summary>
      <span className="panel-item-chevron" aria-hidden="true" />
      <span className="panel-item-head">{head}</span>
    </summary>
    <div className="panel-item-body">{children}</div>
  </details>
);

const ExposureBlock = ({
  item,
  group,
  open,
  context,
}: {
  item: Extract<LensItem, { kind: 'exposure' }>;
  group: string;
  open: boolean;
  context: ItemContext;
}) => (
  <Block
    group={group}
    open={open}
    head={
      <>
        <span className="panel-item-title-row">
          <span className="panel-item-title">{item.exposure.title}</span>
          <Severity severity={item.exposure.severity} />
        </span>
        <Source analysis={item.analysis} context={context} />
      </>
    }>
    <p className="panel-item-text">{item.exposure.whatItMeans}</p>
    <p className="panel-item-text panel-item-text-quiet">{item.exposure.whyItMatters}</p>
    {item.exposure.reference ? <Reference reference={item.exposure.reference} /> : null}
  </Block>
);

const ActionBlock = ({
  item,
  group,
  open,
  context,
}: {
  item: Extract<LensItem, { kind: 'window' | 'action' }>;
  group: string;
  open: boolean;
  context: ItemContext;
}) => (
  <Block
    group={group}
    open={open}
    head={
      <>
        <span className="panel-item-title">{item.action.action}</span>
        {/* The window is in the CLOSED block. It is the one line this lens exists to show. */}
        {item.kind === 'window' ? (
          <span className="panel-item-window">{describeDeadline(item.action.deadline)}</span>
        ) : null}
        <Source analysis={item.analysis} context={context} />
      </>
    }>
    <p className="panel-item-text">{item.action.howTo}</p>
    {item.action.reference ? <Reference reference={item.action.reference} /> : null}
  </Block>
);

/**
 * No control, because there is nothing behind one (P4). It is still shaped like a block — same
 * padding, same hairline — so a Missing lens reads as the same kind of list as every other lens.
 */
const MissingRow = ({ item, context }: { item: Extract<LensItem, { kind: 'missing' }>; context: ItemContext }) => (
  <div className="panel-item panel-item-flat">
    <span className="panel-item-title-row">
      <span className="panel-item-title">
        {item.disclosure.name} <span className="panel-item-regime">({item.disclosure.regime})</span>
      </span>
      <span className={`panel-severity ${SEVERITY_TONE.high}`}>Missing</span>
    </span>
    <p className="panel-item-text">{item.disclosure.note}</p>
    <Source analysis={item.analysis} context={context} />
  </div>
);

const FRESHNESS_LINE: Partial<Record<DocumentFreshness, string>> = {
  pending: 'Checking the live page…',
  current: 'Current — verified against the live page',
  changed: 'Changed since we read it',
  /*
   * `unconfirmed` has no line of its own: the header already says "last read on …" for the
   * site, and the opened block's provenance line carries this document's own date.
   */
};

/**
 * One document, as an item in the Documents lens. Its findings live in the other lenses now; what
 * is left is what only the document can say about itself — its grade, its summary, whether the
 * live page still matches it, and where it came from.
 *
 * D7 is unchanged: a changed document shows no risk pill and no summary, because both are a
 * judgement about a page nobody can see any more, and nothing on screen lets anyone test them.
 */
const DocumentBlock = ({
  item,
  group,
  open,
  context,
}: {
  item: Extract<LensItem, { kind: 'document' }>;
  group: string;
  open: boolean;
  context: ItemContext;
}) => {
  const { analysis } = item;
  const freshness = context.freshnessOf(analysis);
  const changed = freshness === 'changed';
  const freshnessLine = freshness ? FRESHNESS_LINE[freshness] : undefined;

  return (
    <Block
      group={group}
      open={open}
      head={
        <>
          <span className="panel-item-title-row">
            <span className="panel-item-title">{DOC_TYPE_LABELS[analysis.docType]}</span>
            {changed ? null : (
              <span className={`panel-risk-pill ${RISK_TONE[analysis.riskLevel]}`}>{analysis.riskLevel}</span>
            )}
          </span>
          {freshnessLine ? (
            <span className="panel-item-source" data-freshness={freshness}>
              {freshnessLine}
            </span>
          ) : null}
        </>
      }>
      {changed ? (
        <div className="panel-changed-note">
          <p className="m-0">
            This page is not the version we read on {formatAnalysedDate(analysis.analyzedAt)}. Its findings in the other
            lenses describe that earlier version and are marked so — search the live page for a quote to see whether it
            still stands.
          </p>
          {/*
            We can say the document moved. We cannot say WHICH sections moved: that needs the
            earlier document's text, and D5 is that we never ship or serve anyone else's text.
          */}
          <p className="m-0 mt-1">
            We are not showing a risk level or a summary for this version — we would have no way to back them up.
          </p>
        </div>
      ) : (
        <div className={`panel-graded ${RISK_TONE[analysis.riskLevel]}`}>{analysis.summary}</div>
      )}
      <p className="panel-item-provenance">
        {context.provenance ? (
          context.provenance(analysis)
        ) : (
          <>
            Read {formatAnalysedDate(analysis.analyzedAt)} from{' '}
            <a className="panel-link" href={analysis.sourceUrl} target="_blank" rel="noreferrer">
              {shortenUrl(analysis.sourceUrl)}
            </a>
            {' · '}
            {analysis.model}
          </>
        )}
      </p>
    </Block>
  );
};

export const LensItemView = ({
  item,
  group,
  open,
  context,
}: {
  item: LensItem;
  group: string;
  open: boolean;
  context: ItemContext;
}) => {
  switch (item.kind) {
    case 'exposure':
      return <ExposureBlock item={item} group={group} open={open} context={context} />;
    case 'window':
    case 'action':
      return <ActionBlock item={item} group={group} open={open} context={context} />;
    case 'missing':
      return <MissingRow item={item} context={context} />;
    case 'document':
      return <DocumentBlock item={item} group={group} open={open} context={context} />;
  }
};

export type { ItemContext };

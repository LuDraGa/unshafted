import { RISK_TONE } from '@extension/ui';
import {
  DOC_TYPE_LABELS,
  SEVERITY_TONE,
  describeDeadline,
  formatAnalysedDate,
  shortenUrl,
} from '@src/lib/presentation';
import type { AvailableAction, Exposure, RequiredDisclosure, SitePolicyAnalysis } from '@extension/unshafted-core';
import type { DocumentFreshness } from '@src/hooks/useLivePolicyCheck';
import type { ReactNode } from 'react';

/**
 * One document, collapsed (D10) — and two different renderings of it, chosen by whether the live
 * page still hashes to what we read.
 *
 * The D7 rule, and the reason this component is shaped the way it is: **when the hash does not
 * match, show the claims the reader can verify and drop the ones they cannot.** An exposure
 * carries a section label and often a quote, and a quote is checkable — the reader can search
 * the live page for it and see for themselves. `riskLevel` and `summary` are a judgement about a
 * document we are no longer looking at, and nothing on screen lets anyone test them, so they go.
 *
 * That asymmetry is the whole point. Showing the stale analysis whole risks asserting a fact
 * about a real company that is no longer true, and showing nothing makes the badge a liar on a
 * large fraction of visits.
 *
 * EDITIONS. x.com, snapchat.com and ebay.com each serve two contradictory contracts under one
 * hash. There is no structured field for that, and there is not going to be one here: the pass-1
 * analysts named the edition inline in the affected exposure text ("the EU/UK edition adds one
 * sentence…"). Everything below renders that text verbatim. Do not add edition detection and do
 * not guess the reader's jurisdiction — choosing needs their legal residence, which we will not
 * ask for.
 */

const FRESHNESS_LABEL: Record<DocumentFreshness, (analysedAt: string) => string> = {
  pending: () => 'Checking the live page…',
  current: () => 'Current — verified against the live page',
  changed: () => 'Changed since we read it',
  unconfirmed: analysedAt => `As we read it on ${formatAnalysedDate(analysedAt)}`,
};

const FRESHNESS_TONE: Record<DocumentFreshness, string> = {
  pending: 'text-[var(--unshafted-text-faint)]',
  current: 'text-emerald-700',
  changed: 'text-violet-700',
  unconfirmed: 'text-[var(--unshafted-text-faint)]',
};

const ReferenceLine = ({ reference }: { reference: NonNullable<Exposure['reference']> }) => (
  <div className="mt-1.5 border-l-2 border-[var(--unshafted-border-strong)] pl-2">
    <p className="m-0 text-[10px] font-semibold tracking-wide text-[var(--unshafted-text-faint)] uppercase">
      {reference.label}
    </p>
    {/* The quote is what makes a finding checkable on a page that has since moved (D7). */}
    {reference.quote ? (
      <p className="m-0 mt-0.5 text-[11px] leading-relaxed text-[var(--unshafted-text)] italic">“{reference.quote}”</p>
    ) : null}
  </div>
);

const ExposureRow = ({ exposure }: { exposure: Exposure }) => (
  <div className="panel-row">
    <div className="flex items-start justify-between gap-2">
      <p className="m-0 text-[13px] leading-snug font-semibold text-[var(--unshafted-text)]">{exposure.title}</p>
      <span
        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_TONE[exposure.severity]}`}>
        {exposure.severity}
      </span>
    </div>
    <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">{exposure.whatItMeans}</p>
    <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--unshafted-text-faint)]">{exposure.whyItMatters}</p>
    {exposure.reference ? <ReferenceLine reference={exposure.reference} /> : null}
  </div>
);

const ActionRow = ({ action }: { action: AvailableAction }) => (
  <div className="panel-row">
    <p className="m-0 text-[13px] leading-snug font-semibold text-[var(--unshafted-text)]">{action.action}</p>
    <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">{action.howTo}</p>
    {action.deadline ? (
      <p className="m-0 mt-1 text-xs font-semibold text-violet-700">{describeDeadline(action.deadline)}</p>
    ) : null}
    {action.reference ? <ReferenceLine reference={action.reference} /> : null}
  </div>
);

/**
 * A required disclosure the policy does not contain (#86) — and the reason it is shaped like an
 * `ExposureRow` rather than a tinted panel of its own.
 *
 * It used to be `border-rose-200 bg-rose-50`, which after #82 is **risk Low** exactly: the grade
 * that means the document treats you well, painting a missing statutory notice.
 *
 * Which rose replaced it was the decision, and #84 settles only half of it: this is a finding about
 * the document, not the app talking about itself, so it stays on the tinted side of that wall —
 * rose, never `.unshafted-danger-tone`. What it does NOT settle is whether the tint belongs on the
 * fill, and #86's own second requirement — that the row not be lighter than the card around it —
 * answers that in the negative. The graded element in this card is the summary box above, carrying
 * `RISK_TONE`: `bg-rose-200` at High, `bg-rose-300` at Very High. `--unshafted-severity-high-bg` is
 * `rose-200`. Filling this row with it would make the row IDENTICAL to a High summary and LIGHTER
 * than a Very High one — failing on the documents where a missing disclosure matters most, and
 * standing a second full-fill rose vocabulary next to the grade fill, which is the collision #82
 * spent a release removing.
 *
 * So the tint goes where every other finding in this file already puts it. `ExposureRow` is a
 * neutral `.panel-row` with a severity BADGE; only the pill is tinted. This row is now the same
 * shape, and it cannot compete with the grade on fill weight because it no longer has a fill.
 *
 * A consequence worth recording: #86 asked whether `--unshafted-severity-high-border` should
 * finally exist, since this row would be its first consumer. It should not — there is no border to
 * tint. #78 declined that token for having no consumer and that reasoning survives intact, which is
 * the better outcome for a palette three issues into shedding tokens.
 *
 * Still buried, and deliberately out of scope: this renders under "Missing disclosures", below
 * exposures and actions. That is a placement problem, not a colour one.
 */
const AbsentDisclosureRow = ({ disclosure }: { disclosure: RequiredDisclosure }) => (
  <div className="panel-row">
    <div className="flex items-start justify-between gap-2">
      <p className="m-0 text-[13px] leading-snug font-semibold text-[var(--unshafted-text)]">
        {disclosure.name} <span className="font-normal text-[var(--unshafted-text-muted)]">({disclosure.regime})</span>
      </p>
      <span
        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_TONE.high}`}>
        Missing
      </span>
    </div>
    <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">{disclosure.note}</p>
  </div>
);

const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="panel-group">
    <p className="panel-eyebrow">{label}</p>
    {children}
  </div>
);

/**
 * `freshness: null` means NO freshness claim is available for this document, and the line is
 * omitted rather than defaulted. Part 6 (S3) is the case: an analysis the user ran on their own
 * key was never read by us, so every label above — including "as we read it on <date>" — would
 * attribute their work to us. A missing line says nothing; a wrong one says something false.
 */
export const DocumentCard = ({
  analysis,
  freshness,
}: {
  analysis: SitePolicyAnalysis;
  freshness: DocumentFreshness | null;
}) => {
  const changed = freshness === 'changed';
  const absent = analysis.requiredDisclosures.filter(disclosure => disclosure.status === 'absent');

  return (
    <details className="panel-doc">
      <summary>
        <span className="panel-doc-title">{DOC_TYPE_LABELS[analysis.docType]}</span>
        {/* No risk pill on a changed document — that grade describes a page nobody can see now. */}
        {changed ? null : (
          <span className={`panel-risk-pill ${RISK_TONE[analysis.riskLevel]}`}>{analysis.riskLevel}</span>
        )}
        <span className="panel-doc-chevron" aria-hidden="true" />
      </summary>

      <div className="panel-doc-body">
        {freshness ? (
          <p className={`m-0 text-[11px] font-semibold ${FRESHNESS_TONE[freshness]}`}>
            {FRESHNESS_LABEL[freshness](analysis.analyzedAt)}
          </p>
        ) : null}

        {changed ? (
          <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2">
            <p className="m-0 text-xs leading-relaxed text-violet-900">
              This page is not the version we read on {formatAnalysedDate(analysis.analyzedAt)}. The findings below
              describe that earlier version, so they are shown with the wording they were drawn from — search the live
              page for a quote to see whether it still stands.
            </p>
            {/*
              We can say the document moved. We cannot say WHICH sections moved: that needs the
              earlier document's text, and D5 is that we never ship or serve anyone else's text.
              `diff.ts` stays written and dormant until Part 2 gives it a source.
            */}
            <p className="m-0 mt-1 text-[11px] text-violet-700">
              We are not showing a risk level or a summary for this version — we would have no way to back them up.
            </p>
          </div>
        ) : (
          <div className={`rounded-xl border px-3 py-2 ${RISK_TONE[analysis.riskLevel]}`}>
            <p className="m-0 text-xs leading-relaxed">{analysis.summary}</p>
          </div>
        )}

        {analysis.exposures.length > 0 ? (
          <Group label="What you gave up">
            {analysis.exposures.map(exposure => (
              <ExposureRow key={exposure.title} exposure={exposure} />
            ))}
          </Group>
        ) : null}

        {analysis.availableActions.length > 0 ? (
          <Group label="What you can still do">
            {analysis.availableActions.map(action => (
              <ActionRow key={action.action} action={action} />
            ))}
          </Group>
        ) : null}

        {absent.length > 0 ? (
          <Group label="Missing disclosures">
            {absent.map(disclosure => (
              <AbsentDisclosureRow key={disclosure.name} disclosure={disclosure} />
            ))}
          </Group>
        ) : null}

        <p className="m-0 text-[10px] leading-relaxed text-[var(--unshafted-text-faint)]">
          Read {formatAnalysedDate(analysis.analyzedAt)} from{' '}
          <a className="panel-link" href={analysis.sourceUrl} target="_blank" rel="noreferrer">
            {shortenUrl(analysis.sourceUrl)}
          </a>
          {' · '}
          {analysis.model}
        </p>
      </div>
    </details>
  );
};

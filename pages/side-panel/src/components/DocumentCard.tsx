import { RISK_TONE } from '@extension/ui';
import { useElementHeight } from '@src/hooks/useElementHeight';
import {
  DOC_TYPE_LABELS,
  SEVERITY_TONE,
  describeDeadline,
  formatAnalysedDate,
  shortenUrl,
} from '@src/lib/presentation';
import { useId, useState } from 'react';
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

/** A reference with no quote: the section name is the whole payload, so it just renders. */
const ReferenceLabel = ({ label }: { label: string }) => (
  <p className="m-0 mt-1.5 text-[10px] font-semibold tracking-wide text-[var(--unshafted-text-faint)] uppercase">
    {label}
  </p>
);

/**
 * LAYER TWO, and the only one. The document's own `<details>` is layer one; this is the quiet
 * control that reveals a finding's elaboration, and nothing nests inside what it opens.
 *
 * The constraint this exists to satisfy is that a document must not become 23 chevroned
 * `<details>`. The median document is 17 rows and the worst is 40, so a collapsible per row —
 * each with its own marker, its own focus stop and its own open state — would replace one long
 * page with forty small ones and call it an improvement.
 *
 * It is a button rather than a nested `<details>` on purpose: nesting native disclosures inside a
 * native disclosure gives a screen reader two levels of the same affordance to announce, and gives
 * the reader a marker that looks identical to the one that opened the document.
 *
 * The content stays in the DOM under `hidden` rather than being unmounted. That keeps
 * `aria-controls` pointing at something real in both states, keeps find-in-page honest about what
 * the document contains, and means expansion is a single attribute flip — which is what makes
 * instantaneous expansion the simple option rather than the cheap one.
 *
 * `sr-only` carries the finding's own name into the accessible name, because a document with 40
 * rows otherwise offers 40 controls all called "Why this matters".
 */
const FindingReveal = ({ label, finding, children }: { label: string; finding: string; children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const regionId = useId();

  return (
    <>
      <button
        type="button"
        className="panel-reveal"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen(current => !current)}>
        {open ? 'Show less' : label}
        <span className="sr-only"> — {finding}</span>
      </button>
      <div id={regionId} hidden={!open}>
        {children}
      </div>
    </>
  );
};

/**
 * THE THREE ROW TYPES DO NOT SPLIT THE SAME WAY, which is why they are three renderers and not one
 * with a prop. Measured over the real corpus — 83 analyses, 37 domains, 1,445 rows — the exposure
 * is the only one that divides cleanly down the middle.
 *
 * `title` names the thing and `whatItMeans` says what it means for you: 324 characters that have to
 * survive a collapsed read. `whyItMatters` and the quote are 327 more — 50% of the row — and they
 * are elaboration on a claim already fully stated above them. Severity stays: it is the one
 * property that lets a reader skim 40 rows and stop at the right one.
 */
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
    {/*
      Every exposure has a `whyItMatters` — the schema requires it — so every exposure has something
      real behind the control. There is no branch here for "nothing to reveal" because there is no
      such exposure.
    */}
    <FindingReveal label="Why this matters" finding={exposure.title}>
      <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--unshafted-text-faint)]">{exposure.whyItMatters}</p>
      {exposure.reference ? <ReferenceLine reference={exposure.reference} /> : null}
    </FindingReveal>
  </div>
);

/**
 * AN ACTION HIDES ALMOST NOTHING, and applying the exposure's rule to it would gut the row.
 *
 * `howTo` is not elaboration on the action — it *is* the action, in the only form that helps:
 * "opt out" without the steps is a fact, not something you can do. It stays. The deadline stays for
 * a different reason: 49 actions across the corpus carry a real one, browse splits the whole corpus
 * on that property, and a deadline the reader has to press a control to see is a deadline the
 * product has decided not to tell them about.
 *
 * So only quoted evidence hides. And where the reference carries a label with no quote, the label
 * simply renders — a control that opens to show one line of section name is worse than no control,
 * because the reader pays a click to learn there was nothing behind it.
 */
const ActionRow = ({ action }: { action: AvailableAction }) => (
  <div className="panel-row">
    <p className="m-0 text-[13px] leading-snug font-semibold text-[var(--unshafted-text)]">{action.action}</p>
    <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">{action.howTo}</p>
    {action.deadline ? (
      <p className="m-0 mt-1 text-xs font-semibold text-violet-700">{describeDeadline(action.deadline)}</p>
    ) : null}
    {action.reference?.quote ? (
      <FindingReveal label="The wording this comes from" finding={action.action}>
        <ReferenceLine reference={action.reference} />
      </FindingReveal>
    ) : action.reference ? (
      <ReferenceLabel label={action.reference.label} />
    ) : null}
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
 *
 * AND IT GETS NO EXPAND CONTROL, which is not a styling preference but a fact about the schema.
 * `RequiredDisclosure` is name, regime, status and note — there is no optional field, no quote, no
 * second paragraph. Everything the row knows is already on screen, so a control could only ever
 * open onto nothing. That removes 232 of the corpus's 1,445 rows from the chevron count outright,
 * which is most of the answer to "this must not become 23 chevroned disclosures": a sixth of them
 * were never eligible.
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

const Group = ({ label, stickyTop, children }: { label: string; stickyTop: number; children: ReactNode }) => (
  <div className="panel-group">
    <p className="panel-eyebrow panel-doc-section-label" style={{ top: stickyTop }}>
      {label}
    </p>
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
  headerOffset = 0,
}: {
  analysis: SitePolicyAnalysis;
  freshness: DocumentFreshness | null;
  /** P13: the current view's own sticky header height, so this card's summary sticks below it
   *  rather than under it — every view measures its own, since none is the same height. */
  headerOffset?: number;
}) => {
  const changed = freshness === 'changed';
  const absent = analysis.requiredDisclosures.filter(disclosure => disclosure.status === 'absent');
  const [summaryRef, summaryHeight] = useElementHeight<HTMLElement>();
  const sectionOffset = headerOffset + summaryHeight;

  return (
    <details className="panel-doc">
      <summary ref={summaryRef} style={{ top: headerOffset }}>
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
          <Group label="What you gave up" stickyTop={sectionOffset}>
            {analysis.exposures.map(exposure => (
              <ExposureRow key={exposure.title} exposure={exposure} />
            ))}
          </Group>
        ) : null}

        {analysis.availableActions.length > 0 ? (
          <Group label="What you can still do" stickyTop={sectionOffset}>
            {analysis.availableActions.map(action => (
              <ActionRow key={action.action} action={action} />
            ))}
          </Group>
        ) : null}

        {absent.length > 0 ? (
          <Group label="Missing disclosures" stickyTop={sectionOffset}>
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

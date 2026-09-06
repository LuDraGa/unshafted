import '@src/SidePanel.css';
import { domainRiskSummary } from '@extension/unshafted-core';
import { DocumentCard } from '@src/components/DocumentCard';
import { DocumentReader } from '@src/components/DocumentReader';
import { useActiveTabSite } from '@src/hooks/useActiveTabSite';
import { useDomainAnalyses } from '@src/hooks/useDomainAnalyses';
import { useLivePolicyCheck } from '@src/hooks/useLivePolicyCheck';
import { selectOneThing, worstDocument } from '@src/lib/domain-summary';
import { DOC_TYPE_LABELS, RISK_TONE, describeDeadline, formatAnalysedDate } from '@src/lib/presentation';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';
import type { DocumentFreshness, LivePolicyCheck } from '@src/hooks/useLivePolicyCheck';

/**
 * The side panel — the first place a real analysis reaches a real person.
 *
 * ORDER IS THE DESIGN (D10). Everything above the document cards renders from the bundle, with
 * zero network and no page access, and it renders before the live check has done anything:
 *
 *  1. `example.com — 3 documents read.` Instant, always true.
 *  2. The worst risk level, naming the document that earned it. Per D1 that is the point of the
 *     product — 36 of 37 domains land on High or Very High, and the finding IS that the products
 *     people use daily are predatory. It does not get buried under a neutral summary.
 *  3. The one thing: a deadline if the domain has one, otherwise the highest-severity exposure.
 *     Not the `summary` — that is prose about a document, and an exposure is a fact about the
 *     reader.
 *  4. Per-document cards, collapsed, worst first.
 *
 * The live confirmation (D6) is an upgrade layered on top, never a precondition. If it cannot
 * run — and on 7 of 36 domains it structurally cannot — nothing above changes and no error
 * appears. "As we read it on 4 Sep 2026" is the honest resting state.
 */

/** Rollup of the per-document states. Per D3 the document is the real unit; this is a summary. */
const overallFreshness = (
  analyses: readonly SitePolicyAnalysis[],
  freshness: Record<string, DocumentFreshness>,
): DocumentFreshness => {
  const states = analyses.map(analysis => freshness[analysis.contentHash] ?? 'pending');
  if (states.includes('pending')) return 'pending';
  if (states.includes('changed')) return 'changed';
  if (states.every(state => state === 'current')) return 'current';
  return 'unconfirmed';
};

const latestAnalysedAt = (analyses: readonly SitePolicyAnalysis[]): string =>
  analyses.reduce((latest, analysis) => (analysis.analyzedAt > latest ? analysis.analyzedAt : latest), '');

const FreshnessStrip = ({
  analyses,
  freshness,
}: {
  analyses: readonly SitePolicyAnalysis[];
  freshness: Record<string, DocumentFreshness>;
}) => {
  const state = overallFreshness(analyses, freshness);
  const label = {
    pending: 'Checking against the live page…',
    current: 'Current — verified against the live page',
    changed: 'Changed since we read it',
    unconfirmed: `As we read it on ${formatAnalysedDate(latestAnalysedAt(analyses))}`,
  }[state];

  return (
    <p className="panel-freshness" data-state={state}>
      {label}
    </p>
  );
};

const WorstRisk = ({
  analyses,
  freshness,
}: {
  analyses: readonly SitePolicyAnalysis[];
  freshness: Record<string, DocumentFreshness>;
}) => {
  const summary = domainRiskSummary(analyses);
  const worst = worstDocument(analyses);
  if (!summary || !worst) return null;

  return (
    <section className={`panel-verdict ${RISK_TONE[summary.riskLevel]}`}>
      <p className="m-0 text-lg font-semibold leading-tight tracking-tight">{summary.riskLevel} risk</p>
      <p className="m-0 mt-1 text-xs leading-relaxed">
        The worst of {summary.documentCount === 1 ? 'the one document' : `${summary.documentCount} documents`} we read
        here. Earned by the {DOC_TYPE_LABELS[worst.docType].toLowerCase()}.
      </p>
      {/*
        Open Q4: the grade still comes from the bundled worst-of even when that very document has
        moved. Rather than degrade the badge silently, say so — the reader can then weigh it.
      */}
      {freshness[worst.contentHash] === 'changed' ? (
        <p className="m-0 mt-1 text-[11px] font-semibold">
          That document has changed since we read it, so treat this grade as being about the earlier version.
        </p>
      ) : null}
    </section>
  );
};

const OneThing = ({ analyses }: { analyses: readonly SitePolicyAnalysis[] }) => {
  const one = selectOneThing(analyses);
  if (!one) return null;

  return (
    <section className="panel-one-thing">
      <p className="panel-eyebrow">{one.kind === 'deadline' ? 'On a clock' : 'The one thing'}</p>
      {one.kind === 'deadline' ? (
        <>
          <p className="m-0 text-sm font-semibold leading-snug text-[var(--unshafted-text)]">{one.action.action}</p>
          <p className="m-0 mt-1 text-xs font-semibold text-violet-700">{describeDeadline(one.deadline)}</p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">{one.action.howTo}</p>
        </>
      ) : (
        <>
          <p className="m-0 text-sm font-semibold leading-snug text-[var(--unshafted-text)]">{one.exposure.title}</p>
          <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
            {one.exposure.whatItMeans}
          </p>
        </>
      )}
      <p className="m-0 mt-1.5 text-[10px] uppercase tracking-wide text-[var(--unshafted-text-faint)]">
        From the {DOC_TYPE_LABELS[one.analysis.docType].toLowerCase()}
      </p>
    </section>
  );
};

const CoveredView = ({
  domain,
  analyses,
  check,
}: {
  domain: string;
  analyses: readonly SitePolicyAnalysis[];
  check: LivePolicyCheck;
}) => (
  <>
    <FreshnessStrip analyses={analyses} freshness={check.freshness} />
    <WorstRisk analyses={analyses} freshness={check.freshness} />
    <OneThing analyses={analyses} />

    <section className="panel-group">
      <p className="panel-eyebrow">Every document</p>
      {analyses.map(analysis => (
        <DocumentCard
          key={analysis.contentHash}
          analysis={analysis}
          freshness={check.freshness[analysis.contentHash] ?? 'pending'}
        />
      ))}
    </section>

    <DocumentReader domain={domain} analyses={analyses} check={check} />
  </>
);

const SidePanel = () => {
  const site = useActiveTabSite();
  const { status, domain, analyses } = useDomainAnalyses(site.hostname);
  const check = useLivePolicyCheck(site.tabId, site.url, analyses);

  const covered = domain !== null && analyses.length > 0;

  return (
    <main className="panel-shell">
      <header className="flex flex-col gap-1">
        <p className="panel-eyebrow">This site</p>
        <h1 className="m-0 text-lg font-semibold leading-tight tracking-tight text-[var(--unshafted-text)]">
          {domain ?? site.hostname ?? 'No site here'}
        </h1>
        {covered ? (
          <p className="m-0 text-xs text-[var(--unshafted-text-muted)]">
            {analyses.length === 1 ? '1 document read.' : `${analyses.length} documents read.`}
          </p>
        ) : null}
      </header>

      {covered ? (
        <CoveredView domain={domain} analyses={analyses} check={check} />
      ) : (
        /*
         * The background disables the panel per tab on uncovered sites, so this branch is nearly
         * unreachable — a tab navigating away while the panel is open is the way in. It states
         * the fact and stops; there is nothing to apologise for.
         */
        <section className="panel-one-thing">
          <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
            {status === 'loading' || site.status === 'loading'
              ? 'Reading the current tab…'
              : 'We have not read this site’s policies.'}
          </p>
        </section>
      )}

      <p className="m-0 mt-auto pt-2 text-[10px] leading-relaxed text-[var(--unshafted-text-faint)]">
        Analyses ship inside the extension and are read from disk. Nothing about the site you are on leaves this
        browser.
      </p>
    </main>
  );
};

export default SidePanel;

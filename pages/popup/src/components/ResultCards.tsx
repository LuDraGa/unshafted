import { cn } from '@extension/ui';
import { DISCLAIMER_LINE, toVerdictTone } from '@extension/unshafted-core';
import type {
  CurrentAnalysis,
  DetailedFinding,
  HistoryRecord,
  MissingProtection,
  PotentialAdvantage,
  QuickScanResult,
  TopicConcern,
} from '@extension/unshafted-core';

const verdictToneClasses: Record<'LOW' | 'CAUTION' | 'HIGH' | 'DANGER', string> = {
  LOW: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  CAUTION: 'border-amber-300 bg-amber-50 text-amber-900',
  HIGH: 'border-orange-300 bg-orange-50 text-orange-900',
  DANGER: 'border-rose-300 bg-rose-50 text-rose-900',
};

const severityClasses: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-stone-200 text-stone-700',
  medium: 'bg-amber-100 text-amber-900',
  high: 'bg-rose-100 text-rose-900',
};

const RiskBadge = ({ label }: { label: 'LOW' | 'CAUTION' | 'HIGH' | 'DANGER' }) => (
  <span
    className={cn(
      'rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
      verdictToneClasses[label],
    )}>
    {label}
  </span>
);

const SeverityBadge = ({ severity }: { severity: 'low' | 'medium' | 'high' }) => (
  <span
    className={cn(
      'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
      severityClasses[severity],
    )}>
    {severity}
  </span>
);

const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="space-y-1">
    <h2 className="text-base font-semibold tracking-[-0.03em] text-stone-950">{title}</h2>
    {subtitle ? <p className="text-xs text-stone-600">{subtitle}</p> : null}
  </div>
);

/** Reusable accordion for deep analysis sections */
const ResultAccordion = ({
  title,
  count,
  severity,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  severity?: 'low' | 'medium' | 'high';
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => (
  <details className="popup-accordion" open={defaultOpen || undefined}>
    <summary>
      <span>{title}</span>
      {count !== undefined ? (
        <span
          className={cn(
            'popup-accordion-count',
            severity === 'high' && 'severity-high',
            severity === 'medium' && 'severity-medium',
          )}>
          {count}
        </span>
      ) : null}
    </summary>
    <div className="popup-accordion-body">{children}</div>
  </details>
);

const FindingDetails = ({ item }: { item: DetailedFinding }) => (
  <details className="group rounded-2xl border border-stone-200 bg-white/80 p-3">
    <summary className="flex cursor-pointer list-none items-start justify-between gap-2">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-stone-950">{item.title}</p>
        {item.reference?.label ? <p className="text-[11px] text-stone-500">{item.reference.label}</p> : null}
      </div>
      <SeverityBadge severity={item.severity} />
    </summary>
    <div className="mt-3 space-y-2 border-t border-dashed border-stone-200 pt-3 text-xs text-stone-700">
      {item.reference?.quote ? (
        <div className="rounded-xl bg-stone-100 px-3 py-2 text-stone-700">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">From the contract</p>
          <p className="mt-1 leading-5">"{item.reference.quote}"</p>
        </div>
      ) : null}
      <div>
        <p className="font-semibold text-stone-900">What this means</p>
        <p className="mt-1 leading-5">{item.whatItMeans}</p>
      </div>
      <div>
        <p className="font-semibold text-stone-900">Why it matters</p>
        <p className="mt-1 leading-5">{item.whyItMatters}</p>
      </div>
    </div>
  </details>
);

const MissingProtectionCard = ({ item }: { item: MissingProtection }) => (
  <div className="rounded-2xl border border-amber-200 bg-amber-50/85 p-3">
    <p className="text-sm font-semibold text-amber-950">{item.title}</p>
    <p className="mt-1.5 text-xs leading-5 text-amber-900">{item.whyMissingMatters}</p>
    <p className="mt-2 text-xs text-amber-800">
      <span className="font-semibold">Common fix:</span> {item.commonFix}
    </p>
  </div>
);

const TopicConcernCard = ({ item }: { item: TopicConcern }) => (
  <div className="rounded-2xl border border-stone-200 bg-white/80 p-3">
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">{item.category}</p>
        <p className="mt-1 text-sm font-semibold text-stone-950">{item.title}</p>
      </div>
      <SeverityBadge severity={item.severity} />
    </div>
    <p className="mt-2 text-xs leading-5 text-stone-700">{item.whyItMatters}</p>
    {item.reference?.label ? (
      <p className="mt-2 text-[11px] text-stone-500">Reference: {item.reference.label}</p>
    ) : null}
  </div>
);

const AdvantageCard = ({ item }: { item: PotentialAdvantage }) => (
  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3">
    <p className="text-sm font-semibold text-emerald-950">{item.title}</p>
    <p className="mt-1.5 text-xs leading-5 text-emerald-900">{item.whyItHelps}</p>
    {item.reference?.label ? (
      <p className="mt-2 text-[11px] text-emerald-800">Reference: {item.reference.label}</p>
    ) : null}
  </div>
);

type QuickFlag = QuickScanResult['redFlags'][number];

const QuickFlagCard = ({ item }: { item: QuickFlag }) => (
  <div className="rounded-lg bg-stone-100/80 px-2.5 py-2 text-xs text-stone-700">
    <div className="flex items-center justify-between gap-2">
      <p className="font-semibold text-stone-950">{item.title}</p>
      <SeverityBadge severity={item.severity} />
    </div>
    <p className="mt-1 leading-5">{item.reason}</p>
    {item.reference?.label ? <p className="mt-1 text-[11px] text-stone-500">{item.reference.label}</p> : null}
    {item.reference?.quote ? (
      <div className="mt-2 rounded-xl bg-stone-100 px-3 py-2 text-xs leading-5 text-stone-700">
        "{item.reference.quote}"
      </div>
    ) : null}
  </div>
);

/** Helper: highest severity in a list of findings */
const maxSeverity = (items: { severity: 'low' | 'medium' | 'high' }[]): 'low' | 'medium' | 'high' => {
  const order = { low: 0, medium: 1, high: 2 } as const;
  return items.reduce<'low' | 'medium' | 'high'>(
    (max, item) => (order[item.severity] > order[max] ? item.severity : max),
    'low',
  );
};

const severityRank = { low: 0, medium: 1, high: 2 } as const;

const maxQuickFlagSeverity = (items: QuickFlag[]): 'low' | 'medium' | 'high' | undefined =>
  items.length > 0 ? maxSeverity(items) : undefined;

const getDecisionCopy = (riskLevel: 'Low' | 'Medium' | 'High' | 'Very High') => {
  switch (riskLevel) {
    case 'Low':
      return {
        action: 'Likely okay to proceed',
        rationale: 'No major blockers surfaced, but confirm the facts and any missing context.',
      };
    case 'Medium':
      return {
        action: 'Review before signing',
        rationale: 'There are issues worth clarifying or tightening before you commit.',
      };
    case 'High':
      return {
        action: 'Negotiate first',
        rationale: 'Several terms could materially affect cost, control, liability, or exit options.',
      };
    case 'Very High':
      return {
        action: 'Pause and get help',
        rationale: 'The agreement appears risky enough that you should not treat this as routine.',
      };
    default:
      return {
        action: 'Review before signing',
        rationale: 'Check the highlighted risks before you commit.',
      };
  }
};

type ActionSummaryItem = {
  title: string;
  detail: string;
  severity?: 'low' | 'medium' | 'high';
};

const buildQuickBlockers = (quick: QuickScanResult): ActionSummaryItem[] =>
  quick.redFlags
    .slice()
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
    .slice(0, 3)
    .map(flag => ({
      title: flag.title,
      detail: flag.reason,
      severity: flag.severity,
    }));

const buildQuickAsks = (quick: QuickScanResult): ActionSummaryItem[] => {
  const flagAsks = quick.redFlags.slice(0, 2).map(flag => ({
    title: `Clarify ${flag.title}`,
    detail: flag.reference?.label
      ? `Ask how ${flag.reference.label} applies to you and whether it can be narrowed.`
      : 'Ask the other side to explain this term plainly and whether it can be narrowed.',
    severity: flag.severity,
  }));

  const obligationAsks = quick.keyObligations.slice(0, 3 - flagAsks.length).map(item => ({
    title: 'Confirm this obligation',
    detail: item,
  }));

  return [...flagAsks, ...obligationAsks].slice(0, 3);
};

const ActionSummaryGrid = ({ blockers, asks }: { blockers: ActionSummaryItem[]; asks: ActionSummaryItem[] }) => (
  <section className="grid gap-2">
    <div className="rounded-2xl border border-rose-100 bg-rose-50/80 px-3 py-3">
      <p className="text-sm font-semibold text-rose-950">Top blockers</p>
      {blockers.length > 0 ? (
        <div className="mt-2 space-y-2">
          {blockers.map(item => (
            <div key={item.title} className="text-xs leading-5 text-rose-900">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{item.title}</p>
                {item.severity ? <SeverityBadge severity={item.severity} /> : null}
              </div>
              <p className="mt-0.5">{item.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs leading-5 text-rose-900">
          No major blockers surfaced. Still confirm the facts, missing context, and any extraction warnings.
        </p>
      )}
    </div>
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-3 py-3">
      <p className="text-sm font-semibold text-emerald-950">Ask for this</p>
      {asks.length > 0 ? (
        <div className="mt-2 space-y-2 text-xs leading-5 text-emerald-900">
          {asks.map(item => (
            <div key={`${item.title}-${item.detail}`}>
              <p className="font-semibold">{item.title}</p>
              <p className="mt-0.5">{item.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-xs leading-5 text-emerald-900">
          No specific asks were generated. Ask the other side to confirm the summary and any obligations in writing.
        </p>
      )}
    </div>
  </section>
);

type ResultsViewRecord =
  | Pick<CurrentAnalysis, 'quickScan' | 'deepAnalysis' | 'selectedRole' | 'customRole' | 'source'>
  | HistoryRecord;

const QuickDecisionSummary = ({
  quick,
  reviewedAs,
  coverageLine,
  sourceWarnings = [],
  action,
}: {
  quick: QuickScanResult;
  reviewedAs: string;
  coverageLine: string;
  sourceWarnings?: string[];
  action?: React.ReactNode;
}) => {
  const decision = getDecisionCopy(quick.roughRiskLevel);
  const blockers = buildQuickBlockers(quick);
  const asks = buildQuickAsks(quick);

  return (
    <div className="space-y-3">
      <section className="popup-card !border-stone-950 !bg-stone-950 !text-stone-50">
        <div className="flex items-start justify-between gap-3">
          <RiskBadge label={toVerdictTone(quick.roughRiskLevel)} />
          {action}
        </div>
        <div className="mt-3 space-y-2">
          <h2 className="text-lg font-semibold tracking-[-0.04em]">{decision.action}</h2>
          <p className="text-sm font-semibold text-stone-200">{quick.cautionLine}</p>
          <p className="text-xs leading-5 text-stone-300">{quick.summary}</p>
        </div>
        <div className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-stone-200">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">
            Why this recommendation
          </p>
          <p className="mt-1 font-semibold text-stone-50">{decision.rationale}</p>
          <p className="mt-2 text-[11px] text-stone-400">
            {coverageLine} · Reviewed as {reviewedAs}
          </p>
          <p className="mt-0.5 text-[11px] text-stone-400">{quick.documentType}</p>
        </div>
      </section>

      <ActionSummaryGrid blockers={blockers} asks={asks} />

      {quick.extractionConcerns.length > 0 || sourceWarnings.length > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
          Check extraction warnings before relying on this result. Scanned PDFs, tables, and missing text can reduce
          accuracy.
        </section>
      ) : null}
    </div>
  );
};

const QuickScanReadout = ({
  quick,
  reviewedAs,
  sourceWarnings = [],
}: {
  quick: QuickScanResult;
  reviewedAs: string;
  sourceWarnings?: string[];
}) => (
  <div className="space-y-3">
    <QuickDecisionSummary
      quick={quick}
      reviewedAs={reviewedAs}
      coverageLine="Saved quick scan"
      sourceWarnings={sourceWarnings}
    />

    <ResultAccordion title="Summary" defaultOpen>
      <div className="space-y-2">
        <span className="inline-block rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-700">
          {quick.documentType}
        </span>
        <p className="text-xs leading-5 text-stone-700">{quick.summary}</p>
      </div>
    </ResultAccordion>

    {quick.parties.length > 0 ? (
      <ResultAccordion title="Parties" count={quick.parties.length}>
        <div className="flex flex-wrap gap-1.5">
          {quick.parties.map(party => (
            <span
              key={`${party.name}-${party.role}`}
              className="rounded-full bg-stone-100/80 px-2.5 py-1.5 text-xs text-stone-700">
              <span className="font-semibold text-stone-950">{party.name}</span>
              <span className="text-stone-500"> · {party.role}</span>
            </span>
          ))}
        </div>
      </ResultAccordion>
    ) : null}

    {quick.redFlags.length > 0 ? (
      <ResultAccordion title="Flags" count={quick.redFlags.length} severity={maxQuickFlagSeverity(quick.redFlags)}>
        <div className="space-y-1.5">
          {quick.redFlags.map(flag => (
            <QuickFlagCard key={flag.title} item={flag} />
          ))}
        </div>
      </ResultAccordion>
    ) : (
      <section className="mt-1 rounded-2xl border border-emerald-200 bg-emerald-50/85 px-3 py-2 text-xs leading-5 text-emerald-900">
        <p className="font-semibold">No major quick-scan flags found</p>
        <p>
          Still review the summary, extraction coverage, and detailed analysis before relying on this for a high-stakes
          contract.
        </p>
      </section>
    )}

    {quick.keyObligations.length > 0 ? (
      <ResultAccordion title="Key obligations" count={quick.keyObligations.length}>
        <ul className="space-y-2 text-xs leading-5 text-stone-700">
          {quick.keyObligations.map(item => (
            <li key={item} className="rounded-2xl border border-stone-200 bg-white/80 px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      </ResultAccordion>
    ) : null}

    {quick.topics.length > 0 ? (
      <ResultAccordion title="Topics detected" count={quick.topics.length}>
        <div className="flex flex-wrap gap-2">
          {quick.topics.map(topic => (
            <span
              key={topic}
              className="rounded-full border border-stone-200 bg-white/80 px-3 py-1 text-xs font-semibold text-stone-700">
              {topic}
            </span>
          ))}
        </div>
      </ResultAccordion>
    ) : null}

    {quick.extractionConcerns.length > 0 || sourceWarnings.length > 0 ? (
      <ResultAccordion title="Coverage warnings" count={quick.extractionConcerns.length + sourceWarnings.length}>
        <div className="space-y-2 text-xs leading-5 text-amber-900">
          {[...quick.extractionConcerns, ...sourceWarnings].map(item => (
            <div key={item} className="rounded-2xl border border-amber-200 bg-amber-50/85 px-3 py-2">
              {item}
            </div>
          ))}
        </div>
      </ResultAccordion>
    ) : null}
  </div>
);

const ResultsView = ({
  record,
  includeQuickReadout = false,
}: {
  record: ResultsViewRecord;
  includeQuickReadout?: boolean;
}) => {
  const deep = record.deepAnalysis;
  const quick = record.quickScan;

  if (!quick) {
    return null;
  }

  const reviewedAs = 'customRole' in record && record.customRole.trim() ? record.customRole : record.selectedRole;
  const sourceWarnings = 'source' in record ? record.source.warnings : [];

  if (!deep) {
    return (
      <div className="space-y-3">
        <QuickScanReadout quick={quick} reviewedAs={reviewedAs} sourceWarnings={sourceWarnings} />
        <section className="rounded-2xl border border-stone-200 bg-white/70 px-3 py-3 text-[11px] text-stone-600">
          {DISCLAIMER_LINE}
        </section>
      </div>
    );
  }

  const tone = toVerdictTone(deep.overallRiskLevel);
  const decision = getDecisionCopy(deep.overallRiskLevel);
  const topRisks = [
    ...deep.immediateWorries,
    ...deep.oneSidedClauses,
    ...deep.timingAndLockIn,
    ...deep.couldShaftYouLater,
  ]
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
    .slice(0, 3);
  const topAsks = [
    ...deep.negotiationIdeas.map(item => ({ title: item.ask, detail: item.why })),
    ...deep.suggestedEdits.map(item => ({ title: item.title, detail: item.plainEnglishEdit })),
    ...deep.missingProtections.map(item => ({ title: item.title, detail: item.commonFix })),
  ].slice(0, 3);
  const detailedBlockers = topRisks.map(item => ({
    title: item.title,
    detail: item.whyItMatters,
    severity: item.severity,
  }));
  const detailedAsks = topAsks.map(item => ({
    title: item.title,
    detail: item.detail,
  }));

  return (
    <div className="space-y-3">
      {includeQuickReadout ? (
        <>
          <QuickScanReadout quick={quick} reviewedAs={reviewedAs} sourceWarnings={sourceWarnings} />
          <section className="rounded-2xl border border-stone-200 bg-white/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
            Detailed analysis
          </section>
        </>
      ) : null}

      {/* Verdict banner — always visible */}
      <section className="popup-card !border-stone-950 !bg-stone-950 !text-stone-50">
        <div className="space-y-2">
          <RiskBadge label={tone} />
          <h2 className="text-lg font-semibold tracking-[-0.04em]">{decision.action}</h2>
          <p className="text-sm font-semibold text-stone-200">{deep.bottomLine}</p>
          <p className="text-xs leading-5 text-stone-300">{deep.plainEnglishSummary}</p>
        </div>
        <div className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-stone-200">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">Next best action</p>
          <p className="mt-1 font-semibold text-stone-50">{decision.rationale}</p>
          <p className="mt-2 text-[11px] text-stone-400">Reviewed as {reviewedAs}</p>
          {quick?.documentType ? <p className="mt-0.5 text-[11px] text-stone-400">{quick.documentType}</p> : null}
        </div>
      </section>

      <ActionSummaryGrid blockers={detailedBlockers} asks={detailedAsks} />

      {deep.overallRiskLevel === 'Very High' ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-900">
          <p className="font-semibold">High-stakes warning</p>
          <p className="mt-1 leading-5">
            This agreement has significant risk areas. For anything material, consider a contracts or commercial lawyer
            before signing.
          </p>
        </section>
      ) : null}

      {/* Accordion sections — empty sections are omitted */}

      {deep.immediateWorries.length > 0 ? (
        <ResultAccordion
          title="Top risks: immediate issues"
          count={deep.immediateWorries.length}
          severity={maxSeverity(deep.immediateWorries)}>
          <div className="space-y-2">
            {deep.immediateWorries.map(item => (
              <FindingDetails key={item.title} item={item} />
            ))}
          </div>
        </ResultAccordion>
      ) : null}

      {deep.oneSidedClauses.length > 0 ? (
        <ResultAccordion
          title="Top risks: one-sided terms"
          count={deep.oneSidedClauses.length}
          severity={maxSeverity(deep.oneSidedClauses)}>
          <div className="space-y-2">
            {deep.oneSidedClauses.map(item => (
              <FindingDetails key={item.title} item={item} />
            ))}
          </div>
        </ResultAccordion>
      ) : null}

      {deep.missingProtections.length > 0 ? (
        <ResultAccordion title="Missing protections" count={deep.missingProtections.length}>
          <div className="space-y-2">
            {deep.missingProtections.map(item => (
              <MissingProtectionCard key={item.title} item={item} />
            ))}
          </div>
        </ResultAccordion>
      ) : null}

      {deep.timingAndLockIn.length > 0 ? (
        <ResultAccordion
          title="Deadlines, renewals, lock-ins"
          count={deep.timingAndLockIn.length}
          severity={maxSeverity(deep.timingAndLockIn)}>
          <div className="space-y-2">
            {deep.timingAndLockIn.map(item => (
              <FindingDetails key={item.title} item={item} />
            ))}
          </div>
        </ResultAccordion>
      ) : null}

      {deep.topicConcerns.length > 0 ? (
        <ResultAccordion
          title="Core concerns"
          count={deep.topicConcerns.length}
          severity={maxSeverity(deep.topicConcerns)}>
          <div className="space-y-2">
            {deep.topicConcerns.map(item => (
              <TopicConcernCard key={`${item.category}-${item.title}`} item={item} />
            ))}
          </div>
        </ResultAccordion>
      ) : null}

      {deep.negotiationIdeas.length > 0 ? (
        <ResultAccordion title="What to negotiate" count={deep.negotiationIdeas.length}>
          <div className="space-y-2">
            {deep.negotiationIdeas.map(item => (
              <div key={item.ask} className="rounded-2xl border border-stone-200 bg-white/80 p-3">
                <p className="text-sm font-semibold text-stone-950">{item.ask}</p>
                <p className="mt-1.5 text-xs leading-5 text-stone-700">{item.why}</p>
                {item.fallback ? (
                  <p className="mt-2 text-xs text-stone-600">
                    <span className="font-semibold text-stone-900">Fallback:</span> {item.fallback}
                  </p>
                ) : null}
                {item.targetClause ? (
                  <p className="mt-2 text-[11px] text-stone-500">Target clause: {item.targetClause}</p>
                ) : null}
              </div>
            ))}
          </div>
        </ResultAccordion>
      ) : null}

      {deep.suggestedEdits.length > 0 ? (
        <ResultAccordion title="Suggested edits" count={deep.suggestedEdits.length}>
          <div className="space-y-2">
            {deep.suggestedEdits.map(item => (
              <div key={item.title} className="rounded-2xl border border-stone-200 bg-white/80 p-3">
                <p className="text-sm font-semibold text-stone-950">{item.title}</p>
                <p className="mt-1.5 text-xs leading-5 text-stone-700">{item.plainEnglishEdit}</p>
                <p className="mt-2 text-xs text-stone-600">{item.why}</p>
              </div>
            ))}
          </div>
        </ResultAccordion>
      ) : null}

      {deep.questionsToAsk.length > 0 ? (
        <ResultAccordion title="Questions to ask before signing" count={deep.questionsToAsk.length}>
          <ul className="space-y-2 text-xs leading-5 text-stone-700">
            {deep.questionsToAsk.map(question => (
              <li key={question} className="rounded-2xl border border-stone-200 bg-white/80 px-3 py-2">
                {question}
              </li>
            ))}
          </ul>
        </ResultAccordion>
      ) : null}

      {deep.couldShaftYouLater.length > 0 ? (
        <ResultAccordion
          title="Later risks"
          count={deep.couldShaftYouLater.length}
          severity={maxSeverity(deep.couldShaftYouLater)}>
          <div className="space-y-2">
            {deep.couldShaftYouLater.map(item => (
              <FindingDetails key={item.title} item={item} />
            ))}
          </div>
        </ResultAccordion>
      ) : null}

      {deep.potentialAdvantages.length > 0 ? (
        <ResultAccordion title="Advantages for you" count={deep.potentialAdvantages.length}>
          <div className="space-y-2">
            {deep.potentialAdvantages.map(item => (
              <AdvantageCard key={item.title} item={item} />
            ))}
          </div>
        </ResultAccordion>
      ) : null}

      {deep.protectionChecklist.length > 0 ? (
        <ResultAccordion
          title="Protection checklist"
          count={deep.protectionChecklist.reduce((sum, g) => sum + g.items.length, 0)}>
          <div className="space-y-2">
            {deep.protectionChecklist.map(group => (
              <div key={group.label} className="rounded-2xl border border-stone-200 bg-white/80 p-3">
                <p className="text-sm font-semibold text-stone-950">{group.label}</p>
                <ul className="mt-2 space-y-1.5 text-xs leading-5 text-stone-700">
                  {group.items.map(item => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-stone-950" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ResultAccordion>
      ) : null}

      {/* Clause references — only if content exists */}
      {deep.clauseReferenceNotes.length > 0 || deep.assumptionsAndUnknowns.length > 0 ? (
        <ResultAccordion
          title="References and caveats"
          count={deep.clauseReferenceNotes.length + deep.assumptionsAndUnknowns.length}>
          <div className="space-y-2 text-xs leading-5 text-stone-700">
            {deep.clauseReferenceNotes.map(note => (
              <div key={note} className="rounded-2xl border border-stone-200 bg-white/80 px-3 py-2">
                {note}
              </div>
            ))}
            {deep.assumptionsAndUnknowns.map(note => (
              <div key={note} className="rounded-2xl border border-stone-200 bg-stone-100/80 px-3 py-2 text-stone-600">
                {note}
              </div>
            ))}
          </div>
        </ResultAccordion>
      ) : null}

      <section className="rounded-2xl border border-stone-200 bg-white/70 px-3 py-3 text-[11px] text-stone-600">
        {deep.disclaimer || DISCLAIMER_LINE}
      </section>
    </div>
  );
};

export { ResultsView, RiskBadge, SectionHeader, SeverityBadge, QuickDecisionSummary };

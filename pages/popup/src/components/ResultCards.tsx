import { cn } from '@extension/ui';
import { useMemo, useState } from 'react';
import type {
  CurrentAnalysis,
  DeepAnalysisResult,
  DetailedFinding,
  HistoryRecord,
  QuickScanResult,
} from '@extension/unshafted-core';

type Severity = 'low' | 'medium' | 'high';
type VerdictTone = 'LOW' | 'CAUTION' | 'HIGH' | 'DANGER';

const verdictToneClasses: Record<VerdictTone, string> = {
  LOW: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  CAUTION: 'border-amber-300 bg-amber-50 text-amber-900',
  HIGH: 'border-orange-300 bg-orange-50 text-orange-900',
  DANGER: 'border-rose-300 bg-rose-50 text-rose-900',
};

const severityClasses: Record<Severity, string> = {
  low: 'bg-stone-200 text-stone-700',
  medium: 'bg-amber-100 text-amber-900',
  high: 'bg-rose-100 text-rose-900',
};

const RiskBadge = ({ label }: { label: VerdictTone }) => (
  <span
    className={cn(
      'rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
      verdictToneClasses[label],
    )}>
    {label}
  </span>
);

const SeverityBadge = ({ severity }: { severity: Severity }) => (
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

const severityRank: Record<Severity, number> = { low: 0, medium: 1, high: 2 };

const maxSeverity = (items: { severity: Severity }[]): Severity =>
  items.reduce<Severity>(
    (max, item) => (severityRank[item.severity] > severityRank[max] ? item.severity : max),
    'low',
  );

const getDecisionAction = (riskLevel: 'Low' | 'Medium' | 'High' | 'Very High') => {
  switch (riskLevel) {
    case 'Low':
      return 'Likely okay to proceed';
    case 'Medium':
      return 'Review before signing';
    case 'High':
      return 'Negotiate first';
    case 'Very High':
      return 'Pause and get help';
    default:
      return 'Review before signing';
  }
};

// ── v0.10 primitives ─────────────────────────────────────────────────────

const DocStrip = ({
  name,
  type,
  partyCount,
}: {
  name: string;
  type?: string;
  partyCount?: number | null;
}) => (
  <div className="popup-doc-strip">
    <p className="popup-doc-strip-name" title={name}>
      {name}
    </p>
    <p className="popup-doc-strip-meta">
      <span>{type ?? 'Document'}</span>
      <span> · </span>
      {partyCount === null || partyCount === undefined ? (
        <span className="popup-doc-strip-skeleton">— parties</span>
      ) : (
        <span>{partyCount === 1 ? '1 party' : `${partyCount} parties`}</span>
      )}
    </p>
  </div>
);

const CompactVerdict = ({
  tone,
  action,
  preview,
}: {
  tone: VerdictTone;
  action: string;
  preview?: string;
}) => (
  <section className="popup-verdict" data-onboarding-target="summary">
    <div className="popup-verdict-headline">
      <RiskBadge label={tone} />
      <h2 className="popup-verdict-action">{action}</h2>
    </div>
    {preview ? <p className="popup-verdict-preview">{preview}</p> : null}
  </section>
);

const VerdictSkeleton = ({ ariaLabel = 'Loading analysis' }: { ariaLabel?: string }) => (
  <div className="popup-verdict-skeleton" aria-busy="true" aria-label={ariaLabel} />
);

const CollapsibleItem = ({
  title,
  severity,
  defaultOpen = false,
  children,
}: {
  title: string;
  severity?: Severity;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => (
  <details className="popup-item" open={defaultOpen || undefined}>
    <summary>
      <span className="popup-item-chevron" aria-hidden="true">
        ▸
      </span>
      <span className="popup-item-title">{title}</span>
      {severity ? <SeverityBadge severity={severity} /> : null}
    </summary>
    <div className="popup-item-body">{children}</div>
  </details>
);

// ── Lens definitions + builders ──────────────────────────────────────────

type LensId = 'blockers' | 'asks' | 'obligations' | 'evidence' | 'wins' | 'doc' | 'caveats';

type LensDef = {
  id: LensId;
  label: string;
  count?: number;
  severity?: Severity;
  onboardingTarget?: string;
  content: React.ReactNode;
};

const LensStrip = ({
  lenses,
  openId,
  onChange,
}: {
  lenses: LensDef[];
  openId: LensId;
  onChange: (id: LensId) => void;
}) => (
  <div className="popup-lens-strip" role="tablist" aria-label="Analysis lens">
    {lenses.map(lens => {
      const active = lens.id === openId;
      return (
        <button
          key={lens.id}
          type="button"
          role="tab"
          id={`lens-tab-${lens.id}`}
          aria-selected={active}
          aria-controls={`lens-panel-${lens.id}`}
          data-onboarding-target={lens.onboardingTarget}
          data-severity={!active && lens.severity ? lens.severity : undefined}
          className="popup-lens-tab"
          onClick={() => onChange(lens.id)}>
          <span>{lens.label}</span>
          {lens.count !== undefined && lens.count > 0 ? (
            <span className="popup-lens-count">{lens.count}</span>
          ) : null}
        </button>
      );
    })}
  </div>
);

const LensPanel = ({ lens }: { lens: LensDef }) => (
  <div
    className="popup-lens-panel"
    role="tabpanel"
    id={`lens-panel-${lens.id}`}
    aria-labelledby={`lens-tab-${lens.id}`}>
    {lens.content}
  </div>
);

const EmptyState = ({ message }: { message: string }) => <p className="popup-lens-panel-empty">{message}</p>;

const QuoteBlock = ({ text }: { text: string }) => <p className="popup-item-quote">"{text}"</p>;

const FindingBody = ({ item }: { item: DetailedFinding }) => (
  <>
    {item.reference?.quote ? <QuoteBlock text={item.reference.quote} /> : null}
    <p>
      <strong className="text-stone-900">What this means.</strong> {item.whatItMeans}
    </p>
    <p>
      <strong className="text-stone-900">Why it matters.</strong> {item.whyItMatters}
    </p>
    {item.reference?.label ? <p className="text-[11px] text-stone-500">Reference: {item.reference.label}</p> : null}
  </>
);

const QuickFlagBody = ({ item }: { item: QuickScanResult['redFlags'][number] }) => (
  <>
    <p>{item.reason}</p>
    {item.reference?.quote ? <QuoteBlock text={item.reference.quote} /> : null}
    {item.reference?.label ? <p className="text-[11px] text-stone-500">Reference: {item.reference.label}</p> : null}
  </>
);

const buildBlockerLens = (quick: QuickScanResult, deep: DeepAnalysisResult | null | undefined): LensDef => {
  if (deep) {
    const items = [
      ...deep.immediateWorries,
      ...deep.oneSidedClauses,
      ...deep.timingAndLockIn,
      ...deep.couldShaftYouLater,
    ].sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);

    return {
      id: 'blockers',
      label: 'Blockers',
      count: items.length,
      severity: items.length > 0 ? maxSeverity(items) : undefined,
      onboardingTarget: 'flags',
      content:
        items.length > 0 ? (
          <>
            {items.map((item, i) => (
              <CollapsibleItem
                key={`${item.title}-${item.reference?.label ?? i}`}
                title={item.title}
                severity={item.severity}
                defaultOpen={i === 0}>
                <FindingBody item={item} />
              </CollapsibleItem>
            ))}
          </>
        ) : (
          <EmptyState message="No major blockers in detailed analysis. Confirm facts and missing context before signing." />
        ),
    };
  }

  const flags = quick.redFlags.slice().sort((a, b) => severityRank[b.severity] - severityRank[a.severity]);
  return {
    id: 'blockers',
    label: 'Blockers',
    count: flags.length,
    severity: flags.length > 0 ? maxSeverity(flags) : undefined,
    onboardingTarget: 'flags',
    content:
      flags.length > 0 ? (
        <>
          {flags.map((flag, i) => (
            <CollapsibleItem
              key={`${flag.title}-${i}`}
              title={flag.title}
              severity={flag.severity}
              defaultOpen={i === 0}>
              <QuickFlagBody item={flag} />
            </CollapsibleItem>
          ))}
        </>
      ) : (
        <EmptyState message="No major blockers in the quick scan. Run detailed analysis for a deeper look." />
      ),
  };
};

const buildAsksLens = (quick: QuickScanResult, deep: DeepAnalysisResult | null | undefined): LensDef => {
  if (deep) {
    const total =
      deep.negotiationIdeas.length +
      deep.suggestedEdits.length +
      deep.missingProtections.length +
      deep.questionsToAsk.length +
      deep.protectionChecklist.reduce((sum, g) => sum + g.items.length, 0);

    return {
      id: 'asks',
      label: 'Asks',
      count: total,
      content:
        total > 0 ? (
          <>
            {deep.negotiationIdeas.map(item => (
              <CollapsibleItem key={`neg-${item.ask}`} title={item.ask}>
                <p>{item.why}</p>
                {item.fallback ? (
                  <p>
                    <strong className="text-stone-900">Fallback.</strong> {item.fallback}
                  </p>
                ) : null}
                {item.targetClause ? <p className="text-[11px] text-stone-500">Target: {item.targetClause}</p> : null}
              </CollapsibleItem>
            ))}
            {deep.suggestedEdits.map(item => (
              <CollapsibleItem key={`edit-${item.title}`} title={item.title}>
                <p>
                  <strong className="text-stone-900">Edit.</strong> {item.plainEnglishEdit}
                </p>
                <p>{item.why}</p>
              </CollapsibleItem>
            ))}
            {deep.missingProtections.map(item => (
              <CollapsibleItem key={`miss-${item.title}`} title={`Missing: ${item.title}`}>
                <p>{item.whyMissingMatters}</p>
                <p>
                  <strong className="text-stone-900">Common fix.</strong> {item.commonFix}
                </p>
              </CollapsibleItem>
            ))}
            {deep.questionsToAsk.map(q => (
              <CollapsibleItem key={`q-${q}`} title={q}>
                <p>Bring this up before signing — get the answer in writing if it materially affects the deal.</p>
              </CollapsibleItem>
            ))}
            {deep.protectionChecklist.map(group => (
              <CollapsibleItem key={`chk-${group.label}`} title={group.label}>
                <ul className="list-disc space-y-1 pl-4">
                  {group.items.map(it => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              </CollapsibleItem>
            ))}
          </>
        ) : (
          <EmptyState message="No specific asks generated. Confirm the summary and obligations in writing." />
        ),
    };
  }

  const flagAsks = quick.redFlags.slice(0, 3).map(flag => ({
    title: `Clarify ${flag.title}`,
    detail: flag.reference?.label
      ? `Ask how ${flag.reference.label} applies to you and whether it can be narrowed.`
      : 'Ask the other side to explain this term plainly and whether it can be narrowed.',
  }));
  const obligationAsks = quick.keyObligations.slice(0, Math.max(0, 5 - flagAsks.length)).map(item => ({
    title: 'Confirm this obligation',
    detail: item,
  }));
  const items = [...flagAsks, ...obligationAsks];

  return {
    id: 'asks',
    label: 'Asks',
    count: items.length,
    content:
      items.length > 0 ? (
        <>
          {items.map((item, i) => (
            <CollapsibleItem key={`${item.title}-${i}`} title={item.title}>
              <p>{item.detail}</p>
            </CollapsibleItem>
          ))}
        </>
      ) : (
        <EmptyState message="No specific asks. Run detailed analysis for negotiation ideas." />
      ),
  };
};

const buildObligationsLens = (quick: QuickScanResult): LensDef | null => {
  if (quick.keyObligations.length === 0) return null;
  return {
    id: 'obligations',
    label: 'Obligations',
    count: quick.keyObligations.length,
    content: (
      <ul className="list-disc space-y-1.5 px-3 py-2 pl-7 text-xs leading-5 text-stone-700">
        {quick.keyObligations.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    ),
  };
};

const buildEvidenceLens = (deep: DeepAnalysisResult | null | undefined): LensDef | null => {
  if (!deep) return null;
  const findings = [
    ...deep.immediateWorries,
    ...deep.oneSidedClauses,
    ...deep.timingAndLockIn,
    ...deep.couldShaftYouLater,
  ];
  const total = findings.length + deep.topicConcerns.length;
  if (total === 0) return null;

  return {
    id: 'evidence',
    label: 'Evidence',
    count: total,
    severity: findings.length > 0 ? maxSeverity(findings) : undefined,
    content: (
      <>
        {findings.map((item, i) => (
          <CollapsibleItem
            key={`ev-${item.title}-${i}`}
            title={item.title}
            severity={item.severity}>
            <FindingBody item={item} />
          </CollapsibleItem>
        ))}
        {deep.topicConcerns.map(item => (
          <CollapsibleItem
            key={`tc-${item.category}-${item.title}`}
            title={`${item.category}: ${item.title}`}
            severity={item.severity}>
            <p>{item.whyItMatters}</p>
            {item.reference?.label ? (
              <p className="text-[11px] text-stone-500">Reference: {item.reference.label}</p>
            ) : null}
          </CollapsibleItem>
        ))}
      </>
    ),
  };
};

const buildWinsLens = (deep: DeepAnalysisResult | null | undefined): LensDef | null => {
  if (!deep || deep.potentialAdvantages.length === 0) return null;
  return {
    id: 'wins',
    label: 'Wins',
    count: deep.potentialAdvantages.length,
    content: (
      <>
        {deep.potentialAdvantages.map(item => (
          <CollapsibleItem key={`win-${item.title}`} title={item.title}>
            <p>{item.whyItHelps}</p>
            {item.reference?.label ? (
              <p className="text-[11px] text-stone-500">Reference: {item.reference.label}</p>
            ) : null}
          </CollapsibleItem>
        ))}
      </>
    ),
  };
};

const buildDocLens = (
  quick: QuickScanResult,
  deep: DeepAnalysisResult | null | undefined,
  reviewedAs: string,
): LensDef => ({
  id: 'doc',
  label: 'Doc',
  content: (
    <div className="space-y-3 px-3 py-2 text-xs leading-5 text-stone-700">
      {quick.parties.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Parties</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quick.parties.map(p => (
              <span
                key={`${p.name}-${p.role}`}
                className="rounded-full bg-stone-100/80 px-2.5 py-1 text-xs text-stone-700">
                <span className="font-semibold text-stone-950">{p.name}</span>
                <span className="text-stone-500"> · {p.role}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {quick.topics.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Topics</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quick.topics.map(t => (
              <span
                key={t}
                className="rounded-full border border-stone-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-stone-700">
                {t}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Summary</p>
        <p className="mt-1">{deep?.plainEnglishSummary ?? quick.summary}</p>
      </div>
      <p className="text-[11px] text-stone-500">
        {quick.documentType} · Reviewed as {reviewedAs}
      </p>
    </div>
  ),
});

const buildCaveatsLens = (
  quick: QuickScanResult,
  deep: DeepAnalysisResult | null | undefined,
  sourceWarnings: string[],
): LensDef | null => {
  const extraction = [...quick.extractionConcerns, ...sourceWarnings];
  const clauseRefs = deep?.clauseReferenceNotes ?? [];
  const assumptions = deep?.assumptionsAndUnknowns ?? [];
  const total = extraction.length + clauseRefs.length + assumptions.length;
  if (total === 0) return null;

  return {
    id: 'caveats',
    label: 'Caveats',
    count: total,
    content: (
      <div className="space-y-2 px-2 py-2 text-xs leading-5 text-stone-700">
        {extraction.map(note => (
          <div key={`ex-${note}`} className="rounded-xl border border-amber-200 bg-amber-50/85 px-3 py-2 text-amber-900">
            {note}
          </div>
        ))}
        {clauseRefs.map(note => (
          <div key={`cr-${note}`} className="rounded-xl border border-stone-200 bg-white/80 px-3 py-2">
            {note}
          </div>
        ))}
        {assumptions.map(note => (
          <div key={`as-${note}`} className="rounded-xl border border-stone-200 bg-stone-100/80 px-3 py-2 text-stone-600">
            {note}
          </div>
        ))}
      </div>
    ),
  };
};

const pickInitialLens = (lenses: LensDef[]): LensId => {
  const blockers = lenses.find(l => l.id === 'blockers');
  if (blockers && (blockers.count ?? 0) > 0) return 'blockers';
  const asks = lenses.find(l => l.id === 'asks');
  if (asks && (asks.count ?? 0) > 0) return 'asks';
  return lenses[0]?.id ?? 'doc';
};

// ── ResultsView ─────────────────────────────────────────────────────────

type ResultsViewRecord =
  | Pick<CurrentAnalysis, 'quickScan' | 'deepAnalysis' | 'selectedRole' | 'customRole' | 'source'>
  | HistoryRecord;

const ResultsView = ({ record }: { record: ResultsViewRecord }) => {
  const quick = record.quickScan;
  const deep = record.deepAnalysis;
  const sourceWarnings = 'source' in record ? record.source.warnings : [];
  const reviewedAs =
    'customRole' in record && record.customRole.trim() ? record.customRole : record.selectedRole;

  const lenses = useMemo<LensDef[]>(() => {
    if (!quick) return [];
    return [
      buildBlockerLens(quick, deep),
      buildAsksLens(quick, deep),
      buildObligationsLens(quick),
      buildEvidenceLens(deep),
      buildWinsLens(deep),
      buildDocLens(quick, deep, reviewedAs),
      buildCaveatsLens(quick, deep, sourceWarnings),
    ].filter((l): l is LensDef => l !== null);
  }, [quick, deep, reviewedAs, sourceWarnings]);

  const [openId, setOpenId] = useState<LensId>(() => pickInitialLens(lenses));

  if (!quick) return null;

  const activeLens = lenses.find(l => l.id === openId) ?? lenses[0];
  if (!activeLens) return null;

  return (
    <div className="space-y-2.5">
      <LensStrip lenses={lenses} openId={activeLens.id} onChange={setOpenId} />
      <LensPanel lens={activeLens} />
    </div>
  );
};

const buildVerdictPreview = (
  quick: QuickScanResult,
  deep: DeepAnalysisResult | null | undefined,
): string => (deep ? deep.bottomLine : quick.cautionLine);

export {
  ResultsView,
  RiskBadge,
  SectionHeader,
  SeverityBadge,
  DocStrip,
  CompactVerdict,
  VerdictSkeleton,
  buildVerdictPreview,
  getDecisionAction,
};

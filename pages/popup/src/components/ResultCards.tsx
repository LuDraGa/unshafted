import { DISCLAIMER_LINE, toVerdictTone } from '@extension/unshafted-core';
import type {
  CurrentAnalysis,
  DetailedFinding,
  HistoryRecord,
  MissingProtection,
  PotentialAdvantage,
  TopicConcern,
} from '@extension/unshafted-core';
import { cn } from '@extension/ui';

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

export const RiskBadge = ({ label }: { label: 'LOW' | 'CAUTION' | 'HIGH' | 'DANGER' }) => (
  <span className={cn('rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]', verdictToneClasses[label])}>
    {label}
  </span>
);

export const SeverityBadge = ({ severity }: { severity: 'low' | 'medium' | 'high' }) => (
  <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', severityClasses[severity])}>
    {severity}
  </span>
);

export const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="space-y-1">
    <h2 className="text-base font-semibold tracking-[-0.03em] text-stone-950">{title}</h2>
    {subtitle ? <p className="text-xs text-stone-600">{subtitle}</p> : null}
  </div>
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
    {item.reference?.label ? <p className="mt-2 text-[11px] text-stone-500">Reference: {item.reference.label}</p> : null}
  </div>
);

const AdvantageCard = ({ item }: { item: PotentialAdvantage }) => (
  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3">
    <p className="text-sm font-semibold text-emerald-950">{item.title}</p>
    <p className="mt-1.5 text-xs leading-5 text-emerald-900">{item.whyItHelps}</p>
    {item.reference?.label ? <p className="mt-2 text-[11px] text-emerald-800">Reference: {item.reference.label}</p> : null}
  </div>
);

type ResultsViewRecord = Pick<CurrentAnalysis, 'quickScan' | 'deepAnalysis' | 'selectedRole' | 'customRole'> | HistoryRecord;

export const ResultsView = ({ record }: { record: ResultsViewRecord }) => {
  const deep = record.deepAnalysis;
  const quick = record.quickScan;

  if (!deep) {
    return null;
  }

  const tone = toVerdictTone(deep.overallRiskLevel);
  const reviewedAs = 'customRole' in record && record.customRole.trim() ? record.customRole : record.selectedRole;

  return (
    <div className="space-y-4">
      {/* Verdict banner */}
      <section className="popup-card !border-stone-950 !bg-stone-950 !text-stone-50">
        <div className="space-y-2">
          <RiskBadge label={tone} />
          <h2 className="text-lg font-semibold tracking-[-0.04em]">{deep.bottomLine}</h2>
          <p className="text-xs leading-5 text-stone-300">{deep.plainEnglishSummary}</p>
        </div>
        <div className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs text-stone-200">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">Reviewed as</p>
          <p className="mt-1 font-semibold text-stone-50">{reviewedAs}</p>
          {quick?.documentType ? <p className="mt-0.5 text-[11px] text-stone-400">{quick.documentType}</p> : null}
        </div>
      </section>

      {deep.overallRiskLevel === 'Very High' ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-900">
          <p className="font-semibold">High-stakes warning</p>
          <p className="mt-1 leading-5">
            This agreement has significant risk areas. For anything material, consider a contracts or commercial lawyer before signing.
          </p>
        </section>
      ) : null}

      {/* Immediate worries */}
      <section className="popup-card space-y-3">
        <SectionHeader title="What should immediately worry you" />
        {deep.immediateWorries.length > 0 ? (
          deep.immediateWorries.map(item => <FindingDetails key={item.title} item={item} />)
        ) : (
          <p className="text-xs text-stone-600">No immediate red alert stood out beyond the general concerns below.</p>
        )}
      </section>

      {/* One-sided clauses */}
      <section className="popup-card space-y-3">
        <SectionHeader title="One-sided or unfavorable clauses" />
        {deep.oneSidedClauses.length > 0 ? (
          deep.oneSidedClauses.map(item => <FindingDetails key={item.title} item={item} />)
        ) : (
          <p className="text-xs text-stone-600">The model did not flag strongly one-sided clauses here.</p>
        )}
      </section>

      {/* Missing protections */}
      <section className="popup-card space-y-3">
        <SectionHeader title="Missing protections" subtitle="Guardrails that should probably exist but do not." />
        {deep.missingProtections.length > 0 ? (
          deep.missingProtections.map(item => <MissingProtectionCard key={item.title} item={item} />)
        ) : (
          <p className="text-xs text-stone-600">No obvious missing protections were identified.</p>
        )}
      </section>

      {/* Timing & lock-in */}
      <section className="popup-card space-y-3">
        <SectionHeader title="Deadlines, renewals, lock-ins, termination" />
        {deep.timingAndLockIn.length > 0 ? (
          deep.timingAndLockIn.map(item => <FindingDetails key={item.title} item={item} />)
        ) : (
          <p className="text-xs text-stone-600">No material lock-in or timing trap stood out.</p>
        )}
      </section>

      {/* Topic concerns */}
      <section className="popup-card space-y-3">
        <SectionHeader title="Core concerns" subtitle="Payment, liability, IP, confidentiality, dispute" />
        {deep.topicConcerns.length > 0 ? (
          <div className="space-y-3">
            {deep.topicConcerns.map(item => (
              <TopicConcernCard key={`${item.category}-${item.title}`} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-stone-600">No extra category-level concerns were returned.</p>
        )}
      </section>

      {/* Negotiation ideas */}
      <section className="popup-card space-y-3">
        <SectionHeader title="What you can try to negotiate" />
        {deep.negotiationIdeas.length > 0 ? (
          deep.negotiationIdeas.map(item => (
            <div key={item.ask} className="rounded-2xl border border-stone-200 bg-white/80 p-3">
              <p className="text-sm font-semibold text-stone-950">{item.ask}</p>
              <p className="mt-1.5 text-xs leading-5 text-stone-700">{item.why}</p>
              {item.fallback ? (
                <p className="mt-2 text-xs text-stone-600">
                  <span className="font-semibold text-stone-900">Fallback:</span> {item.fallback}
                </p>
              ) : null}
              {item.targetClause ? <p className="mt-2 text-[11px] text-stone-500">Target clause: {item.targetClause}</p> : null}
            </div>
          ))
        ) : (
          <p className="text-xs text-stone-600">No negotiation ideas were returned.</p>
        )}
      </section>

      {/* Suggested edits */}
      <section className="popup-card space-y-3">
        <SectionHeader title="Suggested edits in plain English" />
        {deep.suggestedEdits.length > 0 ? (
          deep.suggestedEdits.map(item => (
            <div key={item.title} className="rounded-2xl border border-stone-200 bg-white/80 p-3">
              <p className="text-sm font-semibold text-stone-950">{item.title}</p>
              <p className="mt-1.5 text-xs leading-5 text-stone-700">{item.plainEnglishEdit}</p>
              <p className="mt-2 text-xs text-stone-600">{item.why}</p>
            </div>
          ))
        ) : (
          <p className="text-xs text-stone-600">No specific edit suggestions were returned.</p>
        )}
      </section>

      {/* Questions to ask */}
      <section className="popup-card space-y-3">
        <SectionHeader title="Questions to ask before signing" />
        {deep.questionsToAsk.length > 0 ? (
          <ul className="space-y-2 text-xs leading-5 text-stone-700">
            {deep.questionsToAsk.map(question => (
              <li key={question} className="rounded-2xl border border-stone-200 bg-white/80 px-3 py-2">
                {question}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-stone-600">No extra diligence questions were returned.</p>
        )}
      </section>

      {/* Could shaft you later */}
      <section className="popup-card space-y-3">
        <SectionHeader title="Could shaft you later" subtitle="Small now, expensive later." />
        {deep.couldShaftYouLater.length > 0 ? (
          deep.couldShaftYouLater.map(item => <FindingDetails key={item.title} item={item} />)
        ) : (
          <p className="text-xs text-stone-600">No delayed-action traps stood out beyond the main risks.</p>
        )}
      </section>

      {/* Advantages */}
      <section className="popup-card space-y-3">
        <SectionHeader title="Potential advantage for you" />
        {deep.potentialAdvantages.length > 0 ? (
          deep.potentialAdvantages.map(item => <AdvantageCard key={item.title} item={item} />)
        ) : (
          <p className="text-xs text-stone-600">No real upside clause stood out. That does happen.</p>
        )}
      </section>

      {/* Protection checklist */}
      <section className="popup-card space-y-3">
        <SectionHeader title="Protection checklist" />
        {deep.protectionChecklist.length > 0 ? (
          deep.protectionChecklist.map(group => (
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
          ))
        ) : (
          <p className="text-xs text-stone-600">No checklist items were returned.</p>
        )}
      </section>

      {/* Clause references */}
      <section className="popup-card space-y-3">
        <SectionHeader title="Clause references and caveats" />
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
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white/70 px-3 py-3 text-[11px] text-stone-600">
        {deep.disclaimer || DISCLAIMER_LINE}
      </section>
    </div>
  );
};

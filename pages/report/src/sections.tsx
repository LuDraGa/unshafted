/**
 * The report's sections, in the popup's lens order: Verdict · Blockers · Asks · Obligations ·
 * Evidence · Wins · Doc · Caveats, then the disclaimer.
 *
 * Staging follows plan §11.2. Layer 1 (what, how bad, where from) and layer 2 (the quote) are in
 * every row's summary and never behind a control; layer 3 (the explanation) is what a row opens.
 * Deal-breakers open by default because the reader must act on them; everything that supports a
 * decision already made starts closed.
 */
import { RISK_TONE, cn } from '@extension/ui';
import { describePerspective, getDecisionAction, toVerdictTone } from '@extension/unshafted-core';
import { Disclosure, ExpandAll, JumpLink } from '@src/disclosure';
import { useState } from 'react';
import type { DeepAnalysisResult, Severity } from '@extension/unshafted-core';
import type {
  Asks,
  BlockerFinding,
  Caveats,
  ChecklistGroup,
  DeepRecord,
  EvidenceGroup,
  GlanceItem,
  Keyed,
  SectionId,
  Tier,
} from '@src/report-model';

// ── Shared pieces ───────────────────────────────────────────────────────

const SeverityPill = ({ severity }: { severity: Severity }) => (
  <span className="report-pill" data-severity={severity}>
    {severity}
  </span>
);

/** A clause the model cited. The mark says "clause" so a bare "Fees" is not read as a topic. */
const ClauseRef = ({ label, chip = false }: { label: string; chip?: boolean }) => (
  <span className={cn('report-clause-ref', chip && 'report-chip')}>{label}</span>
);

const Quote = ({ text }: { text: string }) => <span className="report-quote">“{text}”</span>;

const Section = ({
  id,
  title,
  intro,
  children,
}: {
  id: SectionId;
  title: string;
  intro: string;
  children: React.ReactNode;
}) => (
  <section id={id} className="report-section" aria-labelledby={`${id}-heading`}>
    <header className="report-section-head">
      <h2 id={`${id}-heading`} className="report-section-title" tabIndex={-1}>
        {title}
      </h2>
      <p className="report-section-intro">{intro}</p>
    </header>
    {children}
  </section>
);

/** A tier or an Asks subsection: a small heading on a hairline, its count, and its Expand all. */
const Group = ({
  id,
  title,
  count,
  tools,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  tools?: React.ReactNode;
  children: React.ReactNode;
}) => (
  <div id={id} className="report-group">
    <div className="report-group-head">
      <h3 className="report-group-title" tabIndex={-1}>
        {title}
        {count !== undefined ? <span className="report-group-count">{count}</span> : null}
      </h3>
      {tools ? <div className="report-group-tools">{tools}</div> : null}
    </div>
    {children}
  </div>
);

type CopyState = 'idle' | 'copied' | 'failed';

/** A text button that copies, says so, and says so if it could not. */
const CopyButton = ({
  text,
  label,
  idle = 'Copy',
  className,
}: {
  text: string;
  label: string;
  idle?: string;
  className?: string;
}) => {
  const [state, setState] = useState<CopyState>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    window.setTimeout(() => setState('idle'), 1800);
  };
  return (
    <button type="button" className={cn('report-text-button', className)} aria-label={label} onClick={copy}>
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Couldn’t copy' : idle}</span>
    </button>
  );
};

// ── Verdict ─────────────────────────────────────────────────────────────

const Verdict = ({ deep, glance }: { deep: DeepAnalysisResult; glance: GlanceItem[] }) => {
  const level = deep.overallRiskLevel;
  return (
    <section id="verdict" className="report-verdict" aria-labelledby="verdict-heading">
      <div className="report-verdict-headline">
        <span className={cn('report-risk', RISK_TONE[level])}>{toVerdictTone(level)}</span>
        <h2 id="verdict-heading" className="report-verdict-action" tabIndex={-1}>
          {getDecisionAction(level)}
        </h2>
      </div>
      <p className="report-verdict-bottomline">{deep.bottomLine}</p>
      <p className="report-verdict-summary">{deep.plainEnglishSummary}</p>
      <p className="report-verdict-perspective">{describePerspective(deep.rolePerspective)}</p>
      {glance.length > 0 ? (
        <nav className="report-glance" aria-label="At a glance">
          <ul>
            {glance.map(item => (
              <li key={item.target}>
                <JumpLink to={item.target} className="report-glance-link">
                  {item.severity ? <span className="report-glance-mark" data-severity={item.severity} /> : null}
                  {item.label}
                </JumpLink>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </section>
  );
};

// ── Blockers ────────────────────────────────────────────────────────────

const FindingRow = ({ finding, card }: { finding: BlockerFinding; card: boolean }) => {
  const label = finding.reference?.label;
  const quote = finding.reference?.quote;
  return (
    <Disclosure
      id={finding.key}
      defaultOpen={card}
      className={cn('report-finding', card && 'report-finding-card')}
      summary={
        <>
          <span className="report-row-head">
            <span className="report-row-title">{finding.title}</span>
            <SeverityPill severity={finding.severity} />
          </span>
          <span className="report-row-meta">
            <span className="report-tag">{finding.originLabel}</span>
            {label ? <ClauseRef label={label} /> : null}
          </span>
          {quote ? <Quote text={quote} /> : null}
        </>
      }
      severity={finding.severity}>
      <div className="report-understand">
        <div>
          <p className="report-label">What this means</p>
          <p>{finding.whatItMeans}</p>
        </div>
        <div>
          <p className="report-label">Why it matters</p>
          <p>{finding.whyItMatters}</p>
        </div>
      </div>
      {finding.ask ? (
        <JumpLink to={finding.ask.key} className="report-pair">
          <span aria-hidden="true">→ </span>
          <span className="report-pair-label">Your ask:</span> {finding.ask.ask}
        </JumpLink>
      ) : null}
    </Disclosure>
  );
};

const Blockers = ({ tiers }: { tiers: Tier[] }) => (
  <Section id="blockers" title="Blockers" intro="What could cost you, worst first.">
    {tiers.map(tier => (
      <Group
        key={tier.id}
        id={tier.anchor}
        title={tier.label}
        count={tier.findings.length}
        tools={
          <ExpandAll
            keys={tier.findings.map(f => f.key)}
            defaultOpen={tier.defaultOpen}
            label={tier.label.toLowerCase()}
          />
        }>
        <div className={cn('report-rows', tier.defaultOpen && 'report-rows-cards')} data-severity={tier.id}>
          {tier.findings.map(finding => (
            <FindingRow key={finding.key} finding={finding} card={tier.defaultOpen} />
          ))}
        </div>
      </Group>
    ))}
  </Section>
);

// ── Asks ────────────────────────────────────────────────────────────────

const Checklist = ({
  groups,
  ticked,
  onTick,
  total,
}: {
  groups: ChecklistGroup[];
  ticked: ReadonlySet<string>;
  onTick: (tickKey: string, on: boolean) => void;
  total: number;
}) => {
  const done = groups.reduce((sum, g) => sum + g.items.filter(i => ticked.has(i.tickKey)).length, 0);
  return (
    <Group
      id="asks-checklist"
      title="Checklist"
      tools={
        <span className="report-progress" aria-live="polite">
          {done} of {total} done
        </span>
      }>
      <div className="report-checklist">
        {groups.map(group => (
          <fieldset key={group.key} className="report-checklist-group">
            <legend className="report-checklist-label">{group.label}</legend>
            <ul>
              {group.items.map(item => (
                <li key={item.tickKey}>
                  <label className="report-check">
                    <input
                      type="checkbox"
                      checked={ticked.has(item.tickKey)}
                      onChange={event => onTick(item.tickKey, event.currentTarget.checked)}
                    />
                    <span>{item.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      </div>
    </Group>
  );
};

const keysOf = (items: Keyed<unknown>[]) => items.map(i => i.key);

const AsksSection = ({
  asks,
  ticked,
  onTick,
}: {
  asks: Asks;
  ticked: ReadonlySet<string>;
  onTick: (tickKey: string, on: boolean) => void;
}) => (
  <Section id="asks" title="Asks" intro="What to take to the other side, and how to put it.">
    {asks.negotiate.length > 0 ? (
      <Group
        id="asks-negotiate"
        title="Negotiate"
        count={asks.negotiate.length}
        tools={<ExpandAll keys={keysOf(asks.negotiate)} defaultOpen={false} label="asks" />}>
        <div className="report-rows">
          {asks.negotiate.map(idea => (
            <Disclosure
              key={idea.key}
              id={idea.key}
              className="report-ask"
              summary={
                <>
                  <span className="report-row-title">{idea.ask}</span>
                  {idea.targetClause ? (
                    <span className="report-row-meta">
                      <ClauseRef label={idea.targetClause} chip />
                    </span>
                  ) : null}
                </>
              }>
              <p className="report-label">Why</p>
              <p>{idea.why}</p>
              {idea.fallback ? (
                <>
                  <p className="report-label">Fallback</p>
                  <p>{idea.fallback}</p>
                </>
              ) : null}
            </Disclosure>
          ))}
        </div>
      </Group>
    ) : null}

    {asks.edits.length > 0 ? (
      <Group
        id="asks-edits"
        title="Proposed wording"
        count={asks.edits.length}
        tools={<ExpandAll keys={keysOf(asks.edits)} defaultOpen={false} label="proposed wording" />}>
        <div className="report-rows">
          {asks.edits.map(edit => (
            <div key={edit.key} className="report-row-with-tool">
              <Disclosure
                id={edit.key}
                className="report-ask report-edit"
                summary={
                  <>
                    <span className="report-row-title">{edit.title}</span>
                    <span className="report-clause">{edit.plainEnglishEdit}</span>
                  </>
                }>
                <p className="report-label">Why</p>
                <p>{edit.why}</p>
              </Disclosure>
              {/* Outside the summary: a button inside one would toggle the row it sits in. */}
              <CopyButton
                text={edit.plainEnglishEdit}
                label={`Copy wording: ${edit.title}`}
                className="report-row-tool"
              />
            </div>
          ))}
        </div>
      </Group>
    ) : null}

    {asks.protections.length > 0 ? (
      <Group
        id="asks-protections"
        title="Protections to add"
        count={asks.protections.length}
        tools={<ExpandAll keys={keysOf(asks.protections)} defaultOpen={false} label="protections" />}>
        <div className="report-rows">
          {asks.protections.map(p => (
            <Disclosure
              key={p.key}
              id={p.key}
              className="report-ask"
              summary={
                <>
                  <span className="report-row-title">{p.title}</span>
                  <span className="report-row-detail">
                    <span className="report-inline-label">Common fix.</span> {p.commonFix}
                  </span>
                </>
              }>
              <p className="report-label">Why it’s missed</p>
              <p>{p.whyMissingMatters}</p>
            </Disclosure>
          ))}
        </div>
      </Group>
    ) : null}

    {asks.questions.length > 0 ? (
      <Group
        id="asks-questions"
        title="Questions"
        count={asks.questions.length}
        tools={
          <CopyButton
            text={asks.questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
            label="Copy all questions"
            idle="Copy all"
          />
        }>
        <ol className="report-questions">
          {asks.questions.map((q, i) => (
            // Questions can repeat word for word; position is what tells two identical ones apart.
            <li key={`${i}-${q}`}>{q}</li>
          ))}
        </ol>
      </Group>
    ) : null}

    {asks.checklist.length > 0 ? (
      <Checklist groups={asks.checklist} ticked={ticked} onTick={onTick} total={asks.checklistItemCount} />
    ) : null}
  </Section>
);

// ── Obligations, Evidence, Wins, Doc, Caveats ───────────────────────────

const Obligations = ({ items }: { items: string[] }) => (
  <Section id="obligations" title="Obligations" intro="What you are signing up to do.">
    <ul className="report-list">
      {items.map(item => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  </Section>
);

const Evidence = ({ groups }: { groups: EvidenceGroup[] }) => (
  <Section id="evidence" title="Evidence" intro="Concerns by topic, with the clause behind each.">
    <div className="report-evidence">
      {groups.map(group => (
        <Group
          key={group.category}
          id={`evidence-${group.category.toLowerCase().replace(/[^a-z]+/g, '-')}`}
          title={group.category}
          count={group.items.length}
          tools={<ExpandAll keys={keysOf(group.items)} defaultOpen={false} label={group.category} />}>
          <div className="report-rows">
            {group.items.map(item => (
              <Disclosure
                key={item.key}
                id={item.key}
                className="report-finding"
                summary={
                  <>
                    <span className="report-row-head">
                      <span className="report-row-title">{item.title}</span>
                      <SeverityPill severity={item.severity} />
                    </span>
                    {item.reference?.label ? (
                      <span className="report-row-meta">
                        <ClauseRef label={item.reference.label} />
                      </span>
                    ) : null}
                    {item.reference?.quote ? <Quote text={item.reference.quote} /> : null}
                  </>
                }
                severity={item.severity}>
                <p className="report-label">Why it matters</p>
                <p>{item.whyItMatters}</p>
              </Disclosure>
            ))}
          </div>
        </Group>
      ))}
    </div>
  </Section>
);

const Wins = ({ items }: { items: DeepAnalysisResult['potentialAdvantages'] }) => (
  <Section id="wins" title="Wins" intro="Where the agreement works in your favour.">
    <ul className="report-wins">
      {items.map(item => (
        <li key={item.title}>
          <p className="report-row-title">{item.title}</p>
          <p>{item.whyItHelps}</p>
          {item.reference?.label ? (
            <p className="report-row-meta">
              <ClauseRef label={item.reference.label} />
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  </Section>
);

const Doc = ({ record }: { record: DeepRecord }) => {
  const { quickScan, selectedRole, priorities } = record;
  return (
    <Section id="doc" title="Doc" intro="What was read, and from whose side.">
      <dl className="report-facts">
        <div>
          <dt>Document</dt>
          <dd>{quickScan.documentType}</dd>
        </div>
        {quickScan.parties.length > 0 ? (
          <div>
            <dt>Parties</dt>
            <dd>
              <ul className="report-parties">
                {quickScan.parties.map(p => (
                  <li key={`${p.name}-${p.role}`}>
                    <strong>{p.name}</strong> · {p.role}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Reviewed as</dt>
          <dd>
            {selectedRole}
            {priorities.length > 0 ? `, weighing ${priorities.join(', ')}` : null}
          </dd>
        </div>
        {quickScan.topics.length > 0 ? (
          <div>
            <dt>Topics</dt>
            <dd>
              <ul className="report-chips">
                {quickScan.topics.map(t => (
                  <li key={t} className="report-chip">
                    {t}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>
    </Section>
  );
};

const CaveatGroup = ({ id, title, items }: { id: string; title: string; items: string[] }) =>
  items.length > 0 ? (
    <Disclosure
      id={id}
      className="report-caveat"
      summary={
        <span className="report-row-head">
          <span className="report-row-title">{title}</span>
          <span className="report-group-count">{items.length}</span>
        </span>
      }>
      <ul className="report-list">
        {items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </Disclosure>
  ) : null;

const CaveatsSection = ({ caveats }: { caveats: Caveats }) => (
  <Section id="caveats" title="Caveats" intro="What could make this reading wrong.">
    {caveats.extraction.length > 0 ? (
      <ul className="report-notices">
        {caveats.extraction.map(note => (
          <li key={note} className="report-notice-line">
            {note}
          </li>
        ))}
      </ul>
    ) : null}
    <div className="report-rows">
      <CaveatGroup id="caveats-assumptions" title="Assumptions and unknowns" items={caveats.assumptions} />
      <CaveatGroup id="caveats-references" title="How clauses are referenced" items={caveats.referenceNotes} />
    </div>
  </Section>
);

const Footer = ({ disclaimer }: { disclaimer: string }) => (
  <footer className="report-footer">
    <p>{disclaimer}</p>
  </footer>
);

export { AsksSection, Blockers, CaveatsSection, Doc, Evidence, Footer, Obligations, Verdict, Wins };

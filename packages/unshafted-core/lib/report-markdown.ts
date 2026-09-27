/**
 * A report as Markdown: what Copy and Export put on the clipboard or on disk, from the report page
 * and from the popup's History.
 *
 * It follows the report page section by section, and it is complete. The first version kept the
 * first 6 risks, 8 asks, 5 edits and 5 flags, which was defensible while the popup was the only
 * place a report was read. Once there is a full page, an export that silently drops the seventh
 * deal-breaker is worse than none (plan §7, "Actions").
 */
import { DISCLAIMER_LINE } from './constants.js';
import { getDecisionAction } from './runtime.js';
import type { DeepAnalysisResult, DetailedFinding, HistoryRecord, Severity } from './types.js';

type FindingField = 'immediateWorries' | 'oneSidedClauses' | 'timingAndLockIn' | 'couldShaftYouLater';

/**
 * Where a finding came from. On the page this is a tag on the finding, not a grouping (plan §11.2);
 * the export says it the same way, from the same list.
 */
const FINDING_ORIGINS: readonly { field: FindingField; label: string }[] = [
  { field: 'immediateWorries', label: 'Immediate worry' },
  { field: 'oneSidedClauses', label: 'One-sided' },
  { field: 'timingAndLockIn', label: 'Timing & lock-in' },
  { field: 'couldShaftYouLater', label: 'Could shaft you later' },
];

/** Findings are grouped by severity, worst first, under these names on the page and in the export. */
const SEVERITY_TIERS: readonly { id: Severity; label: string }[] = [
  { id: 'high', label: 'Deal-breakers' },
  { id: 'medium', label: 'Worth negotiating' },
  { id: 'low', label: 'Minor' },
];

/**
 * A checklist item's identity for ticks: the group label and the item text, NUL-separated. A NUL
 * cannot appear in either, so no item can forge another's key, and a tick survives any re-run that
 * keeps the item word for word. The report page stores ticks under it and the export reads them.
 */
const checklistTickKey = (groupLabel: string, item: string): string => `${groupLabel}\u0000${item}`;

type ReportMarkdownOptions = {
  /** Checklist state, when the caller has it. Without it every item exports unticked. */
  isTicked?: (groupLabel: string, item: string) => boolean;
};

// ── Building blocks ─────────────────────────────────────────────────────

type Block = string | null | undefined | false;

/** Paragraph-separated, with empty and absent blocks dropped, so optional parts leave no gaps. */
const blocks = (...items: Block[]): string =>
  items.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join('\n\n');

const quote = (text: string) =>
  `“${text}”`
    .split('\n')
    .map(line => `> ${line}`)
    .join('\n');

const meta = (...parts: Block[]) => parts.filter(Boolean).join(' · ');

const clause = (label: string | undefined) => (label ? `§ ${label}` : null);

const bullets = (items: string[]) => items.map(item => `- ${item}`).join('\n');

/**
 * Sub-bullets under a list item. Plain continuation lines would render as one run-on paragraph in
 * CommonMark; a nested list keeps each on its own line, rendered or read as plain text.
 */
const under = (indent: number, ...lines: Block[]) =>
  lines
    .filter((line): line is string => typeof line === 'string' && line.length > 0)
    .map(line => `\n${' '.repeat(indent)}- ${line}`)
    .join('');

/**
 * `rolePerspective` is free text. Usually it is just the role, which the meta line already names,
 * so it reads as the side the verdict was argued from; when the model wrote a sentence, it is
 * shown as one. The report page and the export both say it this way.
 */
const describePerspective = (text: string): string => {
  const trimmed = text.trim();
  const isRole = trimmed.length <= 40 && !/[.!?]/.test(trimmed);
  return isRole ? `Read from the ${trimmed}’s side.` : trimmed;
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const header = (record: HistoryRecord, kind: string) => {
  const parties = record.quickScan.parties.length;
  return blocks(
    `# Unshafted report: ${record.source.name}`,
    `*${meta(
      kind,
      record.quickScan.documentType,
      parties > 0 && (parties === 1 ? '1 party' : `${parties} parties`),
      `Reviewed as ${record.selectedRole}`,
      formatDate(record.createdAt),
    )}*`,
  );
};

const verdictLine = (level: HistoryRecord['quickScan']['roughRiskLevel']) =>
  `**${getDecisionAction(level)}** · ${level} risk`;

const doc = (record: HistoryRecord) => {
  const { quickScan, selectedRole, priorities } = record;
  return blocks(
    '## Doc',
    bullets(
      [
        `Document: ${quickScan.documentType}`,
        quickScan.parties.length > 0 && `Parties: ${quickScan.parties.map(p => `${p.name} (${p.role})`).join('; ')}`,
        `Reviewed as: ${selectedRole}${priorities.length > 0 ? `, weighing ${priorities.join(', ')}` : ''}`,
        quickScan.topics.length > 0 && `Topics: ${quickScan.topics.join(', ')}`,
      ].filter((line): line is string => typeof line === 'string'),
    ),
  );
};

const obligations = (items: string[]) => items.length > 0 && blocks('## Obligations', bullets(items));

const extractionNotes = (record: HistoryRecord) => [...record.quickScan.extractionConcerns, ...record.source.warnings];

// ── Deep ────────────────────────────────────────────────────────────────

const finding = (f: DetailedFinding, origin: string) =>
  blocks(
    `#### ${f.title} · ${f.severity.toUpperCase()}`,
    `*${meta(origin, clause(f.reference?.label))}*`,
    f.reference?.quote && quote(f.reference.quote),
    `**What this means.** ${f.whatItMeans}`,
    `**Why it matters.** ${f.whyItMatters}`,
  );

const blockers = (deep: DeepAnalysisResult) => {
  const all = FINDING_ORIGINS.flatMap(origin => deep[origin.field].map(f => ({ f, origin: origin.label })));
  const tiers = SEVERITY_TIERS.map(tier => ({ ...tier, items: all.filter(x => x.f.severity === tier.id) })).filter(
    tier => tier.items.length > 0,
  );
  return (
    tiers.length > 0 &&
    blocks(
      '## Blockers',
      ...tiers.map(tier =>
        blocks(`### ${tier.label} (${tier.items.length})`, ...tier.items.map(x => finding(x.f, x.origin))),
      ),
    )
  );
};

const asks = (deep: DeepAnalysisResult, isTicked: ReportMarkdownOptions['isTicked']) => {
  const { negotiationIdeas, suggestedEdits, missingProtections, questionsToAsk, protectionChecklist } = deep;
  const any =
    negotiationIdeas.length +
      suggestedEdits.length +
      missingProtections.length +
      questionsToAsk.length +
      protectionChecklist.length >
    0;
  return (
    any &&
    blocks(
      '## Asks',
      negotiationIdeas.length > 0 &&
        blocks(
          '### Negotiate',
          negotiationIdeas
            .map((idea, i) => {
              const indent = `${i + 1}. `.length;
              return `${i + 1}. **${idea.ask}**${idea.targetClause ? ` (§ ${idea.targetClause})` : ''}${under(
                indent,
                `Why: ${idea.why}`,
                idea.fallback && `Fallback: ${idea.fallback}`,
              )}`;
            })
            .join('\n'),
        ),
      suggestedEdits.length > 0 &&
        blocks(
          '### Proposed wording',
          ...suggestedEdits.map(edit => blocks(`#### ${edit.title}`, quote(edit.plainEnglishEdit), `Why: ${edit.why}`)),
        ),
      missingProtections.length > 0 &&
        blocks(
          '### Protections to add',
          missingProtections
            .map(
              p => `- **${p.title}.** Common fix: ${p.commonFix}${under(2, `Why it’s missed: ${p.whyMissingMatters}`)}`,
            )
            .join('\n'),
        ),
      questionsToAsk.length > 0 && blocks('### Questions', questionsToAsk.map((q, i) => `${i + 1}. ${q}`).join('\n')),
      protectionChecklist.length > 0 &&
        blocks(
          '### Checklist',
          ...protectionChecklist.map(group =>
            blocks(
              `**${group.label}**`,
              group.items.map(item => `- [${isTicked?.(group.label, item) ? 'x' : ' '}] ${item}`).join('\n'),
            ),
          ),
        ),
    )
  );
};

const evidence = (deep: DeepAnalysisResult) => {
  const groups = new Map<string, DeepAnalysisResult['topicConcerns']>();
  for (const c of deep.topicConcerns) groups.set(c.category, [...(groups.get(c.category) ?? []), c]);
  return (
    groups.size > 0 &&
    blocks(
      '## Evidence',
      ...[...groups].map(([category, items]) =>
        blocks(
          `### ${category}`,
          ...items.map(c =>
            blocks(
              `#### ${c.title} · ${c.severity.toUpperCase()}`,
              c.reference?.label && `*${clause(c.reference.label)}*`,
              c.reference?.quote && quote(c.reference.quote),
              `**Why it matters.** ${c.whyItMatters}`,
            ),
          ),
        ),
      ),
    )
  );
};

const wins = (deep: DeepAnalysisResult) =>
  deep.potentialAdvantages.length > 0 &&
  blocks(
    '## Wins',
    bullets(
      deep.potentialAdvantages.map(
        a => `**${a.title}.** ${a.whyItHelps}${a.reference?.label ? ` (§ ${a.reference.label})` : ''}`,
      ),
    ),
  );

const deepCaveats = (record: HistoryRecord, deep: DeepAnalysisResult) => {
  const extraction = extractionNotes(record);
  return (
    extraction.length + deep.assumptionsAndUnknowns.length + deep.clauseReferenceNotes.length > 0 &&
    blocks(
      '## Caveats',
      extraction.length > 0 && bullets(extraction),
      deep.assumptionsAndUnknowns.length > 0 &&
        blocks('### Assumptions and unknowns', bullets(deep.assumptionsAndUnknowns)),
      deep.clauseReferenceNotes.length > 0 &&
        blocks('### How clauses are referenced', bullets(deep.clauseReferenceNotes)),
    )
  );
};

const deepMarkdown = (record: HistoryRecord, deep: DeepAnalysisResult, options: ReportMarkdownOptions) =>
  blocks(
    header(record, 'Detailed analysis'),
    blocks(
      '## Verdict',
      verdictLine(deep.overallRiskLevel),
      deep.bottomLine,
      deep.plainEnglishSummary,
      `*${describePerspective(deep.rolePerspective)}*`,
    ),
    blockers(deep),
    asks(deep, options.isTicked),
    obligations(record.quickScan.keyObligations),
    evidence(deep),
    wins(deep),
    doc(record),
    deepCaveats(record, deep),
    '---',
    deep.disclaimer,
  );

// ── Quick ───────────────────────────────────────────────────────────────

const quickMarkdown = (record: HistoryRecord) => {
  const { quickScan } = record;
  const extraction = extractionNotes(record);
  return blocks(
    header(record, 'Quick scan'),
    blocks(
      '## Verdict',
      verdictLine(quickScan.roughRiskLevel),
      quickScan.cautionLine,
      quickScan.summary,
      '*This is a quick scan. The detailed analysis, with asks and proposed wording, runs from the Unshafted popup.*',
    ),
    quickScan.redFlags.length > 0 &&
      blocks(
        '## Red flags',
        ...quickScan.redFlags.map(flag =>
          blocks(
            `#### ${flag.title} · ${flag.severity.toUpperCase()}`,
            flag.reference?.label && `*${clause(flag.reference.label)}*`,
            flag.reference?.quote && quote(flag.reference.quote),
            flag.reason,
          ),
        ),
      ),
    obligations(quickScan.keyObligations),
    doc(record),
    extraction.length > 0 && blocks('## Caveats', bullets(extraction)),
    '---',
    DISCLAIMER_LINE,
  );
};

const createReportMarkdown = (record: HistoryRecord, options: ReportMarkdownOptions = {}): string =>
  `${record.deepAnalysis ? deepMarkdown(record, record.deepAnalysis, options) : quickMarkdown(record)}\n`;

/** `service-agreement-2026-09-24.md`: the document's slug and the day it was analysed. */
const createReportFilename = (record: HistoryRecord): string =>
  `${record.source.slug || 'unshafted-report'}-${record.createdAt.slice(0, 10)}.md`;

export {
  FINDING_ORIGINS,
  SEVERITY_TIERS,
  checklistTickKey,
  createReportFilename,
  createReportMarkdown,
  describePerspective,
};
export type { FindingField, ReportMarkdownOptions };

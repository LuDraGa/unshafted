/**
 * The report's shape, worked out before anything renders: which tier each finding sits in, what
 * every count says, and which finding points at which ask.
 *
 * Kept pure and apart from the components for one reason: the rail, the at-a-glance strip and the
 * sections all read their numbers from here, so they cannot disagree with each other — and #89 is
 * what it looks like in the popup when a badge and its list are counted in two places.
 *
 * Plan: execution-docs/deep-report-page-plan.md §11.2–11.3.
 */
import { FINDING_ORIGINS, SEVERITY_TIERS, checklistTickKey } from '@extension/unshafted-core';
import type { DeepAnalysisResult, DetailedFinding, HistoryRecord, Severity } from '@extension/unshafted-core';

type DeepRecord = HistoryRecord & { deepAnalysis: DeepAnalysisResult };

type NegotiationIdea = DeepAnalysisResult['negotiationIdeas'][number];
type SuggestedEdit = DeepAnalysisResult['suggestedEdits'][number];
type MissingProtection = DeepAnalysisResult['missingProtections'][number];
type TopicConcern = DeepAnalysisResult['topicConcerns'][number];

/** Anything the page can open, jump to, or remember state for. The key doubles as the element id. */
type Keyed<T> = T & { key: string };

/** The page renders deep records only; a quick scan stays in the popup (plan §11.7, D8). */
const isDeepRecord = (record: HistoryRecord): record is DeepRecord => record.deepAnalysis !== undefined;

// ── Keys ────────────────────────────────────────────────────────────────

/** FNV-1a, 32-bit. Not for security — only a short, stable, id-safe name for a piece of content. */
const hash = (text: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
};

/**
 * Keys on content, never on position.
 *
 * A deep re-run replaces the record in place (same id), and the reader may be mid-read with rows
 * open. Keyed by index, every row after an insertion would inherit its neighbour's open state; keyed
 * by content, a finding that survives the re-run keeps its own. Two identical items are told apart
 * by order of appearance, which is the only thing left to tell them apart by.
 */
const keyAll = (prefix: string, contents: string[]): string[] => {
  const seen = new Map<string, number>();
  return contents.map(content => {
    const base = `${prefix}-${hash(content)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  });
};

const withKeys = <T>(prefix: string, items: T[], contentOf: (item: T) => string): Keyed<T>[] => {
  const keys = keyAll(prefix, items.map(contentOf));
  return items.map((item, i) => ({ ...item, key: keys[i] }));
};

// ── Clause matching ─────────────────────────────────────────────────────

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const containsRun = (haystack: string[], needle: string[]): boolean => {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((word, i) => haystack[start + i] === word)) return true;
  }
  return false;
};

/** A label with no letters — "2.", "§ 4" — names a position, not a clause, and pairs with nothing. */
const hasLetters = (ws: string[]) => ws.some(w => /\p{L}/u.test(w));

/**
 * 2 for the same clause, 1 when one names a clause the other contains, 0 for no match.
 *
 * Containment is by whole words, not characters. The plan's "allow either to contain the other"
 * read as substrings would pair "IP" with "Relationship" and "Fees" with "Feedback", and a
 * confident "→ Your ask" link pointing at the wrong clause is worse than no link at all.
 */
const clauseScore = (a: string, b: string): number => {
  const wa = words(a);
  const wb = words(b);
  if (!hasLetters(wa) || !hasLetters(wb)) return 0;
  if (wa.join(' ') === wb.join(' ')) return 2;
  return containsRun(wa, wb) || containsRun(wb, wa) ? 1 : 0;
};

const clauseMatches = (a: string, b: string): boolean => clauseScore(a, b) > 0;

/**
 * The ask a finding's clause is the target of, or null. Never a guess: a finding with no clause
 * label, or asks with no target clause, pair with nothing (plan §11.3). An exact clause wins over
 * one that merely contains it, then the first ask the model listed.
 *
 * Suggested edits and missing protections carry no clause field, so they are not paired at all.
 * The plan allowed "an obvious title match", but the sample shows why that is not worth it:
 * "Your liability is effectively uncapped", "No liability cap" and "Add a liability cap" are one
 * subject in three unrelated titles, and a rule loose enough to catch that would catch far worse.
 */
const pairAsk = (finding: DetailedFinding, ideas: Keyed<NegotiationIdea>[]): Keyed<NegotiationIdea> | null => {
  const label = finding.reference?.label;
  if (!label) return null;
  let best: Keyed<NegotiationIdea> | null = null;
  let bestScore = 0;
  for (const idea of ideas) {
    const score = idea.targetClause ? clauseScore(label, idea.targetClause) : 0;
    if (score > bestScore) {
      best = idea;
      bestScore = score;
    }
  }
  return best;
};

// ── Blockers ────────────────────────────────────────────────────────────

type BlockerFinding = Keyed<DetailedFinding> & {
  originLabel: string;
  ask: Keyed<NegotiationIdea> | null;
};

type Tier = {
  id: Severity;
  label: string;
  /** The anchor the at-a-glance strip jumps to. */
  anchor: string;
  /** Open what the reader must act on; close what supports a decision already made. */
  defaultOpen: boolean;
  findings: BlockerFinding[];
};

/** Names shared with the export; whether a tier starts open is this page's own call. */
const TIERS = SEVERITY_TIERS.map(tier => ({ ...tier, defaultOpen: tier.id === 'high' }));

const findingContent = (f: DetailedFinding) => `${f.title}\u0000${f.reference?.label ?? ''}`;

const buildBlockerTiers = (deep: DeepAnalysisResult, asks?: Asks): Tier[] => {
  // The origin is a tag on a finding, not a grouping (plan §11.2, settling Q1).
  const tagged = FINDING_ORIGINS.flatMap(origin => deep[origin.field].map(f => ({ ...f, originLabel: origin.label })));
  const keyed = withKeys('finding', tagged, findingContent).map((f): BlockerFinding => ({
    ...f,
    ask: asks ? pairAsk(f, asks.negotiate) : null,
  }));

  return TIERS.map(tier => ({
    ...tier,
    anchor: `tier-${tier.id}`,
    findings: keyed.filter(f => f.severity === tier.id),
  })).filter(tier => tier.findings.length > 0);
};

// ── Asks ────────────────────────────────────────────────────────────────

type ChecklistItem = { text: string; tickKey: string };
type ChecklistGroup = { label: string; key: string; items: ChecklistItem[] };

type Asks = {
  negotiate: Keyed<NegotiationIdea>[];
  edits: Keyed<SuggestedEdit>[];
  protections: Keyed<MissingProtection>[];
  questions: string[];
  checklist: ChecklistGroup[];
  /** One per rendered unit — and a checklist group renders as one unit (#89). */
  count: number;
  checklistItemCount: number;
};

/** Ticks are keyed by `checklistTickKey`, shared with the export and the popup (plan §11.6). */
const tickKeyFor = checklistTickKey;

const buildAsks = (deep: DeepAnalysisResult): Asks => {
  const groupKeys = keyAll(
    'checklist',
    deep.protectionChecklist.map(g => g.label),
  );
  const checklist = deep.protectionChecklist.map((group, i) => ({
    label: group.label,
    key: groupKeys[i],
    items: group.items.map(text => ({ text, tickKey: tickKeyFor(group.label, text) })),
  }));

  return {
    negotiate: withKeys('ask', deep.negotiationIdeas, idea => `${idea.ask}\u0000${idea.targetClause ?? ''}`),
    edits: withKeys('edit', deep.suggestedEdits, edit => edit.title),
    protections: withKeys('protection', deep.missingProtections, p => p.title),
    questions: deep.questionsToAsk,
    checklist,
    count:
      deep.negotiationIdeas.length +
      deep.suggestedEdits.length +
      deep.missingProtections.length +
      deep.questionsToAsk.length +
      deep.protectionChecklist.length,
    checklistItemCount: checklist.reduce((sum, g) => sum + g.items.length, 0),
  };
};

// ── Evidence and caveats ────────────────────────────────────────────────

type EvidenceGroup = { category: TopicConcern['category']; items: Keyed<TopicConcern>[] };

/** Grouped by category, in the order each category first appears. */
const buildEvidence = (deep: DeepAnalysisResult): EvidenceGroup[] => {
  const keyed = withKeys('evidence', deep.topicConcerns, c => `${c.category}\u0000${c.title}`);
  const groups = new Map<TopicConcern['category'], Keyed<TopicConcern>[]>();
  for (const item of keyed) groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
  return [...groups].map(([category, items]) => ({ category, items }));
};

type Caveats = {
  /** Extraction problems qualify everything above them, so they come first and stay visible. */
  extraction: string[];
  assumptions: string[];
  referenceNotes: string[];
  count: number;
};

const buildCaveats = (record: DeepRecord): Caveats => {
  const extraction = [...record.quickScan.extractionConcerns, ...record.source.warnings];
  const { assumptionsAndUnknowns: assumptions, clauseReferenceNotes: referenceNotes } = record.deepAnalysis;
  return {
    extraction,
    assumptions,
    referenceNotes,
    count: extraction.length + assumptions.length + referenceNotes.length,
  };
};

// ── Sections (the rail) and the at-a-glance strip ───────────────────────

type SectionId = 'verdict' | 'blockers' | 'asks' | 'obligations' | 'evidence' | 'wins' | 'doc' | 'caveats';

type Section = {
  id: SectionId;
  label: string;
  /** Absent for sections that are not a list of things: the verdict and the document facts. */
  count?: number;
  /** Blockers only: how the count splits by severity, for the rail's mark. */
  split?: Record<Severity, number>;
};

/**
 * Popup lens order, so the preview's *Asks* lands on the page's *Asks*. Only sections with
 * something in them, the same rule the popup's lens filter uses.
 */
const buildSections = (record: DeepRecord): Section[] => {
  const deep = record.deepAnalysis;
  const tiers = buildBlockerTiers(deep);
  const blockerCount = tiers.reduce((sum, t) => sum + t.findings.length, 0);
  const split = { high: 0, medium: 0, low: 0 };
  for (const tier of tiers) split[tier.id] = tier.findings.length;

  const sections: (Section | null)[] = [
    { id: 'verdict', label: 'Verdict' },
    blockerCount > 0 ? { id: 'blockers', label: 'Blockers', count: blockerCount, split } : null,
    listSection('asks', 'Asks', buildAsks(deep).count),
    listSection('obligations', 'Obligations', record.quickScan.keyObligations.length),
    listSection('evidence', 'Evidence', deep.topicConcerns.length),
    listSection('wins', 'Wins', deep.potentialAdvantages.length),
    { id: 'doc', label: 'Doc' },
    listSection('caveats', 'Caveats', buildCaveats(record).count),
  ];
  return sections.filter((s): s is Section => s !== null);
};

const listSection = (id: SectionId, label: string, count: number): Section | null =>
  count > 0 ? { id, label, count } : null;

type GlanceItem = { label: string; target: string; severity?: Severity };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const TIER_GLANCE: Record<Severity, [string, string]> = {
  high: ['deal-breaker', 'deal-breakers'],
  medium: ['to negotiate', 'to negotiate'],
  low: ['minor', 'minor'],
};

/**
 * The verdict's bottom edge: how much there is, and where. Each entry is a jump target, and a
 * kind there is none of is left out rather than shown as a zero.
 */
const buildGlance = (tiers: Tier[], asks: Asks, ticked: number): GlanceItem[] => {
  const items: GlanceItem[] = tiers.map(tier => ({
    label: plural(tier.findings.length, ...TIER_GLANCE[tier.id]),
    target: tier.anchor,
    severity: tier.id,
  }));
  if (asks.negotiate.length > 0)
    items.push({ label: plural(asks.negotiate.length, 'ask', 'asks'), target: 'asks-negotiate' });
  if (asks.edits.length > 0) items.push({ label: plural(asks.edits.length, 'edit', 'edits'), target: 'asks-edits' });
  if (asks.questions.length > 0)
    items.push({ label: plural(asks.questions.length, 'question', 'questions'), target: 'asks-questions' });
  if (asks.checklistItemCount > 0)
    items.push({ label: `Checklist ${ticked} of ${asks.checklistItemCount}`, target: 'asks-checklist' });
  return items;
};

export {
  buildAsks,
  buildBlockerTiers,
  buildCaveats,
  buildEvidence,
  buildGlance,
  buildSections,
  clauseMatches,
  isDeepRecord,
  tickKeyFor,
};
export type {
  Asks,
  BlockerFinding,
  Caveats,
  ChecklistGroup,
  DeepRecord,
  EvidenceGroup,
  GlanceItem,
  Keyed,
  Section,
  SectionId,
  Tier,
};

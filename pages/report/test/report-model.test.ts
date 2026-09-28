/**
 * The pure half of the report: what goes in which tier, what each count says, and which finding
 * points at which ask. Everything the page renders is read off these, so a count that disagrees
 * with the list beside it is a bug here before it is a bug on screen.
 */
import { sampleDeepAnalysis, sampleQuickScan } from '@extension/unshafted-core';
import {
  buildAsks,
  buildBlockerTiers,
  buildGlance,
  buildSections,
  clauseMatches,
  isDeepRecord,
} from '@src/report-model';
import { describe, expect, it } from 'vitest';
import type { DeepAnalysisResult, DetailedFinding, HistoryRecord } from '@extension/unshafted-core';

const finding = (title: string, severity: DetailedFinding['severity'], label?: string): DetailedFinding => ({
  title,
  severity,
  whatItMeans: `${title}: meaning`,
  whyItMatters: `${title}: why`,
  reference: label ? { label } : undefined,
});

const deepWith = (overrides: Partial<DeepAnalysisResult>): DeepAnalysisResult => ({
  ...sampleDeepAnalysis,
  immediateWorries: [],
  oneSidedClauses: [],
  timingAndLockIn: [],
  couldShaftYouLater: [],
  ...overrides,
});

const recordWith = (deepAnalysis: DeepAnalysisResult | undefined, warnings: string[] = []): HistoryRecord => ({
  id: 'r1',
  createdAt: '2026-09-23T10:00:00.000Z',
  source: {
    kind: 'file',
    name: 'service-agreement.pdf',
    slug: 'service-agreement',
    contentHash: 'hash',
    charCount: 1200,
    estimatedTokens: 300,
    preview: 'A service agreement.',
    quality: 'good',
    warnings,
    capturedAt: '2026-09-23T10:00:00.000Z',
  },
  quickScan: sampleQuickScan,
  deepAnalysis,
  selectedRole: 'Contractor',
  priorities: [],
  storageState: 'local-only',
});

describe('blocker tiers', () => {
  it('puts every finding from the four origins into exactly one tier, worst tier first', () => {
    const tiers = buildBlockerTiers(sampleDeepAnalysis);
    const all = [
      ...sampleDeepAnalysis.immediateWorries,
      ...sampleDeepAnalysis.oneSidedClauses,
      ...sampleDeepAnalysis.timingAndLockIn,
      ...sampleDeepAnalysis.couldShaftYouLater,
    ];

    expect(tiers.map(t => t.id)).toEqual(['high', 'medium']);
    expect(tiers.flatMap(t => t.findings).length).toBe(all.length);
    for (const tier of tiers) expect(tier.findings.every(f => f.severity === tier.id)).toBe(true);
  });

  it('names the tiers for what the reader does with them, and opens only the deal-breakers', () => {
    const tiers = buildBlockerTiers(
      deepWith({ immediateWorries: [finding('A', 'high'), finding('B', 'medium'), finding('C', 'low')] }),
    );
    expect(tiers.map(t => [t.label, t.defaultOpen])).toEqual([
      ['Deal-breakers', true],
      ['Worth negotiating', false],
      ['Minor', false],
    ]);
  });

  it('does not render a tier with nothing in it', () => {
    const tiers = buildBlockerTiers(deepWith({ oneSidedClauses: [finding('Only low', 'low')] }));
    expect(tiers.map(t => t.id)).toEqual(['low']);
    expect(buildBlockerTiers(deepWith({}))).toEqual([]);
  });

  it('tags each finding with where it came from instead of grouping by it', () => {
    const tiers = buildBlockerTiers(
      deepWith({
        immediateWorries: [finding('Worry', 'high')],
        oneSidedClauses: [finding('Lopsided', 'high')],
        timingAndLockIn: [finding('Locked', 'high')],
        couldShaftYouLater: [finding('Later', 'high')],
      }),
    );
    expect(tiers[0].findings.map(f => f.originLabel)).toEqual([
      'Immediate worry',
      'One-sided',
      'Timing & lock-in',
      'Could shaft you later',
    ]);
  });

  it('keys findings on content, so a re-run that reorders them keeps each key with its finding', () => {
    const a = finding('Alpha', 'medium', 'Fees');
    const b = finding('Beta', 'medium', 'Scope');
    const first = buildBlockerTiers(deepWith({ immediateWorries: [a, b] }))[0].findings;
    const reordered = buildBlockerTiers(deepWith({ immediateWorries: [b, a] }))[0].findings;

    expect(first.find(f => f.title === 'Alpha')?.key).toBe(reordered.find(f => f.title === 'Alpha')?.key);
    expect(first[0].key).not.toBe(first[1].key);
  });

  it('keeps keys unique, and usable as element ids, even for two identical findings', () => {
    const twin = finding('Same title', 'high', 'Fees');
    const keys = buildBlockerTiers(deepWith({ immediateWorries: [twin, twin] }))[0].findings.map(f => f.key);
    expect(new Set(keys).size).toBe(2);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9-]*$/);
  });
});

describe('clause matching (just-in-time pairing)', () => {
  it.each([
    ['Fees', 'Fees'],
    [' fees ', 'FEES'],
    ['Fees', 'Section 2. Fees'],
    ['2. Fees and payment', 'Fees'],
    ['Term', 'Term and Termination'],
    ['Intellectual Property', 'intellectual property'],
  ])('pairs %j with %j', (label, target) => {
    expect(clauseMatches(label, target)).toBe(true);
  });

  it.each([
    ['IP', 'Relationship'],
    ['Termination', 'Term'],
    ['Fees', 'Feedback'],
    ['Liability', 'Indemnity'],
    ['', 'Fees'],
    ['Fees', ''],
    ['  ', '  '],
    ['2.', '2. Fees'],
  ])('does not pair %j with %j', (label, target) => {
    expect(clauseMatches(label, target)).toBe(false);
  });

  it('pairs the sample: Fees with Fees, Intellectual Property with Intellectual Property, and nothing else', () => {
    const asks = buildAsks(sampleDeepAnalysis);
    const findings = buildBlockerTiers(sampleDeepAnalysis, asks).flatMap(t => t.findings);
    const paired = Object.fromEntries(findings.map(f => [f.title, f.ask?.ask ?? null]));

    expect(paired).toEqual({
      'You can lose payment based on vague dissatisfaction': sampleDeepAnalysis.negotiationIdeas[0].ask,
      'Your liability is effectively uncapped': null,
      'Immediate IP ownership transfer': sampleDeepAnalysis.negotiationIdeas[1].ask,
      'One-way confidentiality': null,
      'Three-day termination right is too short': null,
      'The venue clause can make disputes expensive': null,
    });
  });

  it('points at the ask by the same key the ask renders under', () => {
    const asks = buildAsks(sampleDeepAnalysis);
    const findings = buildBlockerTiers(sampleDeepAnalysis, asks).flatMap(t => t.findings);
    const feesFinding = findings.find(f => f.reference?.label === 'Fees');
    expect(feesFinding?.ask?.key).toBe(asks.negotiate[0].key);
  });

  it('prefers an exact clause over one that merely contains it', () => {
    const deep = deepWith({
      immediateWorries: [finding('Late fees bite', 'high', 'Fees')],
      negotiationIdeas: [
        { ask: 'Cap late interest', why: 'why', targetClause: 'Late Fees' },
        { ask: 'Fix the fee clause', why: 'why', targetClause: 'Fees' },
      ],
    });
    const [tier] = buildBlockerTiers(deep, buildAsks(deep));
    expect(tier.findings[0].ask?.ask).toBe('Fix the fee clause');
  });

  it('never invents a pairing: no clause, no target, or no asks means no link', () => {
    const deep = deepWith({
      immediateWorries: [finding('No reference', 'high'), finding('Has one', 'high', 'Fees')],
      negotiationIdeas: [{ ask: 'Untargeted', why: 'why' }],
    });
    const [tier] = buildBlockerTiers(deep, buildAsks(deep));
    expect(tier.findings.map(f => f.ask)).toEqual([null, null]);
    expect(buildBlockerTiers(deep)[0].findings.map(f => f.ask)).toEqual([null, null]);
  });
});

describe('asks', () => {
  it('splits into the five kinds, each keyed on content', () => {
    const asks = buildAsks(sampleDeepAnalysis);
    expect(asks.negotiate.length).toBe(sampleDeepAnalysis.negotiationIdeas.length);
    expect(asks.edits.length).toBe(sampleDeepAnalysis.suggestedEdits.length);
    expect(asks.protections.length).toBe(sampleDeepAnalysis.missingProtections.length);
    expect(asks.questions.length).toBe(sampleDeepAnalysis.questionsToAsk.length);
    expect(asks.checklist.map(g => g.label)).toEqual(sampleDeepAnalysis.protectionChecklist.map(g => g.label));
  });

  it('gives each checklist item a tick key of its group and its text, so ticks outlive a re-run', () => {
    const asks = buildAsks(sampleDeepAnalysis);
    expect(asks.checklist[0].items[0].tickKey).toBe(
      `Before signing\u0000${sampleDeepAnalysis.protectionChecklist[0].items[0]}`,
    );
  });

  it('counts one per checklist GROUP, which is what renders as a unit (#89)', () => {
    const asks = buildAsks(sampleDeepAnalysis);
    const d = sampleDeepAnalysis;
    expect(asks.count).toBe(
      d.negotiationIdeas.length +
        d.suggestedEdits.length +
        d.missingProtections.length +
        d.questionsToAsk.length +
        d.protectionChecklist.length,
    );
    expect(asks.checklistItemCount).toBe(5);
  });
});

describe('sections (the rail)', () => {
  it('lists the popup lens order and only the sections with something in them', () => {
    const sections = buildSections(recordWith(sampleDeepAnalysis));
    expect(sections.map(s => s.id)).toEqual([
      'verdict',
      'blockers',
      'asks',
      'obligations',
      'evidence',
      'wins',
      'doc',
      'caveats',
    ]);

    const bare = buildSections(
      recordWith(
        deepWith({
          topicConcerns: [],
          potentialAdvantages: [],
          assumptionsAndUnknowns: [],
          clauseReferenceNotes: [],
        }),
      ),
    );
    expect(bare.map(s => s.id)).toEqual(['verdict', 'asks', 'obligations', 'doc']);
  });

  it('counts what each section renders', () => {
    const d = sampleDeepAnalysis;
    const counts = Object.fromEntries(buildSections(recordWith(d, ['Scanned PDF'])).map(s => [s.id, s.count ?? null]));
    expect(counts).toEqual({
      verdict: null,
      blockers: 6,
      asks: buildAsks(d).count,
      obligations: sampleQuickScan.keyObligations.length,
      evidence: d.topicConcerns.length,
      wins: d.potentialAdvantages.length,
      doc: null,
      caveats: 1 + d.assumptionsAndUnknowns.length + d.clauseReferenceNotes.length,
    });
  });

  it('carries the blocker severity split for the rail mark', () => {
    const blockers = buildSections(recordWith(sampleDeepAnalysis)).find(s => s.id === 'blockers');
    expect(blockers?.split).toEqual({ high: 3, medium: 3, low: 0 });
  });
});

describe('at-a-glance strip', () => {
  it('reads tier counts, then ask, edit and question counts, then checklist progress, each a jump target', () => {
    const asks = buildAsks(sampleDeepAnalysis);
    const glance = buildGlance(buildBlockerTiers(sampleDeepAnalysis, asks), asks, 2);
    expect(glance.map(g => g.label)).toEqual([
      '3 deal-breakers',
      '3 to negotiate',
      '2 asks',
      '2 edits',
      '3 questions',
      'Checklist 2 of 5',
    ]);
    expect(glance.every(g => g.target.length > 0)).toBe(true);
  });

  it('says one without an s, and leaves out what there is none of', () => {
    const deep = deepWith({
      immediateWorries: [finding('Only one', 'high')],
      negotiationIdeas: [{ ask: 'One ask', why: 'why' }],
      suggestedEdits: [],
      questionsToAsk: ['One?'],
      protectionChecklist: [],
    });
    const asks = buildAsks(deep);
    expect(buildGlance(buildBlockerTiers(deep, asks), asks, 0).map(g => g.label)).toEqual([
      '1 deal-breaker',
      '1 ask',
      '1 question',
    ]);
  });
});

describe('quick-only guard', () => {
  it('admits a record with a deep analysis and turns away a quick scan', () => {
    expect(isDeepRecord(recordWith(sampleDeepAnalysis))).toBe(true);
    expect(isDeepRecord(recordWith(undefined))).toBe(false);
  });
});

import {
  DeepAnalysisResultSchema,
  QuickScanResultSchema,
  buildBalancedExcerpt,
  createHistoryRecord,
  createReportMarkdown,
  createSampleAnalysis,
  extractJsonFromText,
  HistoryRecordSchema,
  sampleDeepAnalysis,
  sampleQuickScan,
} from '../index.mts';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { CurrentAnalysis } from '../index.mts';

/** `createSampleAnalysis` without the async content hash, which these tests do not look at. */
const createSampleAnalysisSync = (): CurrentAnalysis =>
  ({
    id: 'sample',
    createdAt: '2026-09-24T10:00:00.000Z',
    updatedAt: '2026-09-24T10:00:00.000Z',
    source: {
      kind: 'file',
      name: 'service-agreement.pdf',
      slug: 'service-agreement',
      contentHash: 'hash',
      charCount: 1200,
      estimatedTokens: 300,
      preview: 'A service agreement.',
      text: 'The agreement text.',
      quality: 'good',
      warnings: ['Two pages looked scanned.'],
      capturedAt: '2026-09-24T10:00:00.000Z',
    },
    quickScan: sampleQuickScan,
    deepAnalysis: sampleDeepAnalysis,
    selectedRole: 'Contractor',
    customRole: '',
    priorities: [],
    status: 'complete',
    error: null,
  }) as CurrentAnalysis;

test('extractJsonFromText pulls JSON out of fenced blocks', () => {
  const raw = 'Here you go:\n```json\n{"ok":true,"nested":{"value":1}}\n```';
  assert.equal(extractJsonFromText(raw), '{"ok":true,"nested":{"value":1}}');
});

test('extractJsonFromText still reads fences whose padding varied', () => {
  const fence = '`'.repeat(3);
  // The `\s*` that used to sit before the capture is gone; the trim has to cover these instead.
  assert.equal(extractJsonFromText(`${fence}json\n  {"ok":true}  \n${fence}`), '{"ok":true}');
  assert.equal(extractJsonFromText(`${fence} {"ok":true} ${fence}`), '{"ok":true}');
  assert.equal(extractJsonFromText(`${fence}JSON\n{"ok":true}\n${fence}`), '{"ok":true}');
  assert.equal(extractJsonFromText(`${fence}\n{"ok":true}\n${fence}`), '{"ok":true}');
});

test('extractJsonFromText does not backtrack on an unterminated fence', () => {
  // Model output reaches this function, and the page under analysis reaches the prompt, so a
  // hostile page can influence what lands here. With `\s*` in front of the capture this input
  // was quadratic: 160k spaces cost ~2.1s, and every doubling quadrupled it.
  const evil = '`'.repeat(3) + ' '.repeat(160_000);
  const started = Date.now();
  extractJsonFromText(evil);
  assert.ok(Date.now() - started < 250, 'fence pattern backtracked on an unterminated fence');
});

test('sample fixtures satisfy schemas', () => {
  assert.doesNotThrow(() => QuickScanResultSchema.parse(sampleQuickScan));
  assert.doesNotThrow(() => DeepAnalysisResultSchema.parse(sampleDeepAnalysis));
});

test('balanced excerpt marks truncation and stays within rough bounds', () => {
  const longText = 'alpha '.repeat(20_000);
  const result = buildBalancedExcerpt(longText, 1_000);
  assert.equal(result.truncated, true);
  assert.match(result.text, /\[\.\.\. omitted/);
  assert.ok(result.text.length < 1_400);
});

test('history records default to local-only storage state', async () => {
  const analysis = await createSampleAnalysis();
  const record = createHistoryRecord(analysis);
  assert.equal(record.storageState, 'local-only');
  assert.equal(HistoryRecordSchema.parse({ ...record, storageState: undefined }).storageState, 'local-only');
});

test('report markdown follows the report page, section by section', async () => {
  const analysis = await createSampleAnalysis();
  const report = createReportMarkdown(createHistoryRecord(analysis, { storageState: 'drive-backup-requested' }));
  assert.match(report, /^# Unshafted report: /);
  const order = [
    '## Verdict',
    '## Blockers',
    '## Asks',
    '## Obligations',
    '## Evidence',
    '## Wins',
    '## Doc',
    '## Caveats',
  ];
  const at = order.map(heading => report.indexOf(`\n${heading}\n`));
  assert.ok(
    at.every(i => i > 0),
    `missing: ${order.filter((_, i) => at[i] < 0)}`,
  );
  assert.deepEqual(
    [...at].sort((a, b) => a - b),
    at,
  );
  assert.ok(report.trimEnd().endsWith(sampleDeepAnalysis.disclaimer));
});

/**
 * The export used to keep the first 6 risks, 8 asks, 5 edits and 5 flags. With a full page to
 * export from, a report that silently drops the seventh deal-breaker is worse than no export.
 */
test('report markdown leaves nothing out of a deep analysis', () => {
  const deep = DeepAnalysisResultSchema.parse({
    ...sampleDeepAnalysis,
    immediateWorries: Array.from({ length: 9 }, (_, i) => ({
      title: `Worry ${i + 1}`,
      severity: 'high',
      whatItMeans: `Means ${i + 1}`,
      whyItMatters: `Matters ${i + 1}`,
      reference: { label: `Clause ${i + 1}`, quote: `quoted words ${i + 1}` },
    })),
    negotiationIdeas: Array.from({ length: 12 }, (_, i) => ({
      ask: `Ask ${i + 1}`,
      why: `Because ${i + 1}`,
      fallback: `Fallback ${i + 1}`,
      targetClause: `Target ${i + 1}`,
    })),
    suggestedEdits: Array.from({ length: 7 }, (_, i) => ({
      title: `Edit ${i + 1}`,
      plainEnglishEdit: `Wording ${i + 1}`,
      why: `Edit why ${i + 1}`,
    })),
    questionsToAsk: Array.from({ length: 10 }, (_, i) => `Question ${i + 1}?`),
  });
  const record = HistoryRecordSchema.parse({
    ...createHistoryRecord({ ...createSampleAnalysisSync(), deepAnalysis: deep }),
  });
  const report = createReportMarkdown(record);

  const expected = [
    ...deep.immediateWorries.flatMap(f => [
      f.title,
      f.whatItMeans,
      f.whyItMatters,
      f.reference!.label,
      f.reference!.quote!,
    ]),
    ...[...deep.oneSidedClauses, ...deep.timingAndLockIn, ...deep.couldShaftYouLater].flatMap(f => [
      f.title,
      f.whatItMeans,
      f.whyItMatters,
    ]),
    ...deep.negotiationIdeas.flatMap(n => [n.ask, n.why, n.fallback!, n.targetClause!]),
    ...deep.suggestedEdits.flatMap(e => [e.title, e.plainEnglishEdit, e.why]),
    ...deep.missingProtections.flatMap(p => [p.title, p.commonFix, p.whyMissingMatters]),
    ...deep.questionsToAsk,
    ...deep.protectionChecklist.flatMap(g => [g.label, ...g.items]),
    ...deep.topicConcerns.flatMap(c => [c.category, c.title, c.whyItMatters]),
    ...deep.potentialAdvantages.flatMap(a => [a.title, a.whyItHelps]),
    ...deep.assumptionsAndUnknowns,
    ...deep.clauseReferenceNotes,
    deep.bottomLine,
    deep.plainEnglishSummary,
    ...record.quickScan.keyObligations,
    ...record.quickScan.extractionConcerns,
    ...record.quickScan.parties.map(p => p.name),
    ...record.quickScan.topics,
  ];
  const missing = expected.filter(text => !report.includes(text));
  assert.deepEqual(missing, []);
});

test('report markdown ticks the checklist items the reader ticked', () => {
  const record = createHistoryRecord(createSampleAnalysisSync());
  const [group] = sampleDeepAnalysis.protectionChecklist;
  const report = createReportMarkdown(record, {
    isTicked: (label, item) => label === group.label && item === group.items[0],
  });
  assert.ok(report.includes(`- [x] ${group.items[0]}`));
  for (const item of group.items.slice(1)) assert.ok(report.includes(`- [ ] ${item}`));
  assert.equal((report.match(/- \[x\]/g) ?? []).length, 1);
});

test('report markdown gives a quick scan everything it has, and says it is a quick scan', () => {
  const analysis = createSampleAnalysisSync();
  const record = createHistoryRecord({ ...analysis, deepAnalysis: null });
  const report = createReportMarkdown(record);
  assert.match(report, /quick scan/i);
  const expected = [
    sampleQuickScan.cautionLine,
    sampleQuickScan.summary,
    ...sampleQuickScan.redFlags.flatMap(f => [f.title, f.reason]),
    ...sampleQuickScan.keyObligations,
  ];
  assert.deepEqual(
    expected.filter(text => !report.includes(text)),
    [],
  );
  assert.equal(report.includes('## Asks'), false);
});

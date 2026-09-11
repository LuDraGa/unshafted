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

test('report markdown includes user-facing report sections', async () => {
  const analysis = await createSampleAnalysis();
  const report = createReportMarkdown(createHistoryRecord(analysis, { storageState: 'drive-backup-requested' }));
  assert.match(report, /^# Unshafted Report:/);
  assert.match(report, /## Decision/);
  assert.match(report, /## Bottom Line/);
  assert.match(report, /## Top Risks/);
  assert.match(report, /## What To Ask For/);
  assert.match(report, /## Evidence/);
  assert.match(report, /## Disclaimer/);
});

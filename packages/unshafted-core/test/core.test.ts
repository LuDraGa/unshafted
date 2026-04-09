import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DeepAnalysisResultSchema,
  QuickScanResultSchema,
  buildBalancedExcerpt,
  extractJsonFromText,
  sampleDeepAnalysis,
  sampleQuickScan,
} from '../index.mts';

test('extractJsonFromText pulls JSON out of fenced blocks', () => {
  const raw = 'Here you go:\n```json\n{"ok":true,"nested":{"value":1}}\n```';
  assert.equal(extractJsonFromText(raw), '{"ok":true,"nested":{"value":1}}');
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

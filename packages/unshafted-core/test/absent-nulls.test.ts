import { ClauseReferenceSchema, dropAbsentNulls, parseStructuredJson, SitePolicyAnalysisSchema } from '../index.mts';
import { z } from 'zod';
import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The live failure, reduced. Under OpenAI strict mode `quote` is emitted as
 * `anyOf: [{type:'string'}, {type:'null'}]` and named in `required`, because strict mode allows no
 * other way to say "optional". The model sends `null`; `.optional()` means `undefined`; the parse
 * of an otherwise perfect response fails. 3 of 7 first attempts, measured (#46).
 */
test('a null where the schema says optional is read as absent', () => {
  const raw = JSON.stringify({ label: 'Liability cap', quote: null });

  const parsed = parseStructuredJson(ClauseReferenceSchema, raw);

  assert.deepEqual(parsed, { label: 'Liability cap' });
  assert.equal('quote' in parsed, false, 'the key must be gone, not present and undefined');
});

/** The inverse must hold, or the fix would quietly rewrite meaning. */
test('a null where the schema says nullable is kept and means null', () => {
  const schema = z.object({ etag: z.string().nullable() });

  assert.deepEqual(parseStructuredJson(schema, JSON.stringify({ etag: null })), { etag: null });
});

test('a nullable with a default keeps null rather than falling back to the default', () => {
  const schema = z.object({ etag: z.string().nullable().default('x') });

  assert.deepEqual(parseStructuredJson(schema, JSON.stringify({ etag: null })), { etag: null });
});

/** `.default()` carries the same null affordance as `.optional()`, and the default must win. */
test('a null where the schema has a default falls back to the default', () => {
  const schema = z.object({ topics: z.array(z.string()).default([]) });

  assert.deepEqual(parseStructuredJson(schema, JSON.stringify({ topics: null })), { topics: [] });
});

test('nulls are dropped at every depth, not just the top level', () => {
  const raw = JSON.stringify({
    summary: 'ok',
    riskLevel: 'Medium',
    confidence: 'medium',
    exposures: [],
    availableActions: [
      {
        action: 'Opt out',
        howTo: 'Email them',
        effort: 'low',
        deadline: null,
        reference: { label: 'Arb', quote: null },
      },
    ],
    requiredDisclosures: [],
  });

  const schema = SitePolicyAnalysisSchema.pick({
    summary: true,
    riskLevel: true,
    confidence: true,
    exposures: true,
    availableActions: true,
    requiredDisclosures: true,
  });

  const parsed = parseStructuredJson(schema, raw);

  assert.equal('deadline' in parsed.availableActions[0], false);
  assert.equal('quote' in (parsed.availableActions[0].reference ?? {}), false);
  assert.equal(parsed.availableActions[0].reference?.label, 'Arb');
});

/**
 * A null ELEMENT is not an absent element: there is no index to leave out without shifting every
 * later one, so it stays and the schema rejects it on its own terms.
 */
test('a null array element is left for the schema to reject', () => {
  const schema = z.object({ topics: z.array(z.string()) });

  assert.throws(() => parseStructuredJson(schema, JSON.stringify({ topics: ['a', null] })), z.ZodError);
});

/** This repairs one known mismatch. Anything else must still fail loudly. */
test('a key the schema does not describe is left alone, not silently dropped', () => {
  const schema = z.object({ label: z.string() });

  assert.deepEqual(dropAbsentNulls(schema, { label: 'x', surprise: 1 }), { label: 'x', surprise: 1 });
});

test('a wrong type is still a parse error', () => {
  const schema = z.object({ label: z.string() });

  assert.throws(() => parseStructuredJson(schema, JSON.stringify({ label: 42 })), z.ZodError);
});

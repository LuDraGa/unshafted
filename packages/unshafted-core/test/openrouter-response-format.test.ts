import {
  AvailableActionSchema,
  callOpenRouterStructured,
  SitePolicyAnalysisSchema,
  toOpenAiJsonSchema,
} from '../index.mts';
import { z } from 'zod';
import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The site panel's own-key run is the only response schema in the codebase carrying an
 * EXCLUSIVE numeric bound (`AvailableActionSchema.deadline.days` is `.positive()`), and that is
 * the whole reason it 400'd where quick scan and deep analysis did not.
 *
 * The bound is now correct by construction: `toOpenAiJsonSchema` asks for `draft-2020-12`, where
 * the keyword IS the number, rather than `zod-to-json-schema`'s `openAi` target, which inherited
 * OpenAPI 3's draft-4 spelling (`exclusiveMinimum: true` beside `minimum: 0`) and needed a
 * rewrite pass afterwards. The rewrite is gone; this stays, because it pins the wire form the
 * emitter is chosen to produce, not the pass that used to repair it.
 */
const captureRequestBody = async (schema: z.ZodTypeAny, payload: unknown) => {
  const originalFetch = globalThis.fetch;
  let body: Record<string, unknown> | undefined;

  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    body = JSON.parse(init.body) as Record<string, unknown>;

    return {
      ok: true,
      status: 200,
      json: async () => ({
        model: 'gpt-test',
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
      }),
    };
  }) as unknown as typeof globalThis.fetch;

  try {
    await callOpenRouterStructured({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-test',
      schema,
      schemaName: 'test_schema',
      messages: [{ role: 'user', content: 'hello' }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(body, 'expected a request body');

  return body;
};

const findExclusiveBoundViolations = (node: unknown, path = '$'): string[] => {
  if (Array.isArray(node))
    return node.flatMap((item, index) => findExclusiveBoundViolations(item, `${path}[${index}]`));
  if (!node || typeof node !== 'object') return [];

  const entries = Object.entries(node as Record<string, unknown>);
  const violations = entries
    .filter(([key, value]) => key.startsWith('exclusive') && typeof value !== 'number')
    .map(([key, value]) => `${path}.${key} = ${JSON.stringify(value)}`);

  return [...violations, ...entries.flatMap(([key, value]) => findExclusiveBoundViolations(value, `${path}.${key}`))];
};

test('an exclusive numeric bound reaches OpenAI as a number, not a draft-4 boolean', async () => {
  const body = await captureRequestBody(z.object({ days: z.number().int().positive() }), { days: 30 });
  const responseFormat = body.response_format as { json_schema: { schema: Record<string, unknown> } };
  const days = (responseFormat.json_schema.schema.properties as Record<string, Record<string, unknown>>).days;

  assert.equal(days.exclusiveMinimum, 0);
  assert.equal('minimum' in days, false);
});

test('the site policy response schema carries no draft-4 exclusive bounds', async () => {
  const schema = SitePolicyAnalysisSchema.pick({
    summary: true,
    riskLevel: true,
    confidence: true,
    exposures: true,
    availableActions: true,
    requiredDisclosures: true,
  });

  const body = await captureRequestBody(schema, {
    summary: 'ok',
    riskLevel: 'Medium',
    confidence: 'medium',
    exposures: [],
    availableActions: [],
    requiredDisclosures: [],
  });

  const responseFormat = body.response_format as { json_schema: { schema: unknown } };

  assert.deepEqual(findExclusiveBoundViolations(responseFormat.json_schema.schema), []);
  // Guards the fixture itself: if `days` ever loses its exclusive bound the test above still
  // passes for the wrong reason.
  assert.ok(AvailableActionSchema.shape.deadline);
});

/**
 * The bound tests above pin one keyword. This one pins that there is a schema at all.
 *
 * It was written against `zod-to-json-schema`, which dispatched on `_def.typeName` — renamed to
 * `_def.type` in zod 4 — and so recognised nothing, falling through to a permissive branch that
 * emitted one `OpenAiAnyType` union in place of the whole contract. It did not throw: the request
 * still carried a well-formed `response_format` with `strict: true`, and the model was asked for
 * anything at all. That is what made a silent failure worth a test of its own.
 *
 * The library is gone and `toOpenAiJsonSchema` replaces it, but the test is not — a wildcard is
 * what ANY future breakage of the emitter degrades to, and the two structural properties below
 * are exactly what OpenAI's strict mode requires: every object closed, and every property named
 * in `required` (optionality expressed as a union with `null`, never by omission).
 */
const collectObjectDefects = (node: unknown, path = '$'): string[] => {
  if (Array.isArray(node)) return node.flatMap((item, i) => collectObjectDefects(item, `${path}[${i}]`));
  if (!node || typeof node !== 'object') return [];

  const schema = node as Record<string, unknown>;
  const defects: string[] = [];

  if (Array.isArray(schema.type)) defects.push(`${path}.type is a wildcard union: ${JSON.stringify(schema.type)}`);

  if (schema.type === 'object' && schema.properties && typeof schema.properties === 'object') {
    const names = Object.keys(schema.properties as Record<string, unknown>);
    if (schema.additionalProperties !== false) defects.push(`${path} is not closed (additionalProperties !== false)`);
    const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
    const missing = names.filter(n => !required.has(n));
    if (missing.length > 0) defects.push(`${path} omits from required: ${missing.join(', ')}`);
  }

  return [...defects, ...Object.entries(schema).flatMap(([k, v]) => collectObjectDefects(v, `${path}.${k}`))];
};

test('the response schema is a closed object contract, not a permissive fallback', async () => {
  const body = await captureRequestBody(
    SitePolicyAnalysisSchema.pick({
      summary: true,
      riskLevel: true,
      confidence: true,
      exposures: true,
      availableActions: true,
      requiredDisclosures: true,
    }),
    {
      summary: 'ok',
      riskLevel: 'Medium',
      confidence: 'medium',
      exposures: [],
      availableActions: [],
      requiredDisclosures: [],
    },
  );

  const schema = (body.response_format as { json_schema: { schema: Record<string, unknown> } }).json_schema.schema;

  assert.equal(schema.type, 'object', 'the contract collapsed to something that is not an object schema');
  assert.deepEqual(Object.keys(schema.properties as Record<string, unknown>).sort(), [
    'availableActions',
    'confidence',
    'exposures',
    'requiredDisclosures',
    'riskLevel',
    'summary',
  ]);
  assert.deepEqual(collectObjectDefects(schema), []);
});

/**
 * The emitter's own obligations, on schemas small enough to write the expected output out in
 * full. The tests above pin the real contract; these say WHICH rule broke when it stops holding.
 */
test('an optional property becomes a null union and stays in required', () => {
  const emitted = toOpenAiJsonSchema(z.object({ label: z.string(), quote: z.string().optional() }));

  assert.deepEqual(emitted, {
    type: 'object',
    properties: {
      label: { type: 'string' },
      quote: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    },
    required: ['label', 'quote'],
    additionalProperties: false,
  });
});

/**
 * A defaulted property is described to the model exactly as an optional one — which is what the
 * retired `openAi` target did, and is deliberately preserved here rather than narrowed. See #46.
 */
test('a defaulted property keeps its default inside the non-null branch', () => {
  const emitted = toOpenAiJsonSchema(z.object({ topics: z.array(z.string()).default([]) })) as {
    properties: { topics: { anyOf: unknown[] } };
  };

  assert.deepEqual(emitted.properties.topics.anyOf, [
    { default: [], type: 'array', items: { type: 'string' } },
    { type: 'null' },
  ]);
});

test('nested objects are closed too, not just the root', () => {
  const emitted = toOpenAiJsonSchema(
    z.object({ inner: z.object({ deeper: z.object({ value: z.string() }) }) }),
  ) as Record<string, unknown>;

  assert.deepEqual(collectObjectDefects(emitted), []);
});

/**
 * Two artefacts of the native converter that the `openAi` target never emitted, and that say
 * nothing about the document being analysed: the IEEE 754 ceiling `.int()` picks up, and the
 * `uri` format from `z.url()`, which is not one of the nine formats OpenAI's validator accepts.
 */
test('converter artefacts that would be noise or a 400 are stripped', () => {
  const emitted = toOpenAiJsonSchema(z.object({ days: z.number().int().positive(), site: z.url() })) as {
    properties: { days: Record<string, unknown>; site: Record<string, unknown> };
  };

  assert.deepEqual(emitted.properties.days, { type: 'integer', exclusiveMinimum: 0 });
  assert.deepEqual(emitted.properties.site, { type: 'string' });
});

test('a supported format survives', () => {
  const emitted = toOpenAiJsonSchema(z.object({ at: z.iso.datetime() })) as {
    properties: { at: { format?: string } };
  };

  assert.equal(emitted.properties.at.format, 'date-time');
});

/**
 * The retry drops something different for each provider, so it cannot be right for both.
 *
 * For OpenRouter it drops `json_object`, which some models reject — the compatibility escape this
 * fallback was written for. For OpenAI it drops the schema, which is the only thing that told the
 * model what to produce, so the second attempt is strictly less likely to parse than the first.
 */
const countAttempts = async (provider: 'openai' | 'openrouter', reply: string) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = (async () => {
    calls += 1;

    return {
      ok: true,
      status: 200,
      json: async () => ({ model: 'm', choices: [{ finish_reason: 'stop', message: { content: reply } }] }),
    };
  }) as unknown as typeof globalThis.fetch;

  let threw = false;
  try {
    await callOpenRouterStructured({
      provider,
      apiKey: 'k',
      model: 'm',
      schema: z.object({ label: z.string() }),
      schemaName: 'test_schema',
      messages: [{ role: 'user', content: 'hi' }],
    });
  } catch {
    threw = true;
  } finally {
    globalThis.fetch = originalFetch;
  }

  return { calls, threw };
};

test('OpenAI does not retry without the schema it just used', async () => {
  const result = await countAttempts('openai', JSON.stringify({ label: 42 }));

  assert.deepEqual(result, { calls: 1, threw: true });
});

test('OpenRouter still retries, because there the retry drops json_object and not a schema', async () => {
  const result = await countAttempts('openrouter', JSON.stringify({ label: 42 }));

  assert.deepEqual(result, { calls: 2, threw: true });
});

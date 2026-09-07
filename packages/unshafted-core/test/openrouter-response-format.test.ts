import { AvailableActionSchema, callOpenRouterStructured, SitePolicyAnalysisSchema } from '../index.mts';
import { z } from 'zod';
import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The site panel's own-key run is the only response schema in the codebase carrying an
 * EXCLUSIVE numeric bound (`AvailableActionSchema.deadline.days` is `.positive()`), and that is
 * the whole reason it 400'd where quick scan and deep analysis did not.
 *
 * `zodToJsonSchema`'s `openAi` target speaks the OpenAPI 3 dialect, which spells an exclusive
 * bound as `exclusiveMinimum: true` + `minimum: 0`; OpenAI validates `response_format` as draft
 * 2020-12, where the keyword IS the number. The mismatch is invisible from the Zod side, so it
 * is pinned here on the wire body rather than on the schema.
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

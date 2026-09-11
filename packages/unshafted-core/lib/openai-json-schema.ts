import { z } from 'zod';

/**
 * Emits the JSON Schema OpenAI's strict structured outputs actually accept.
 *
 * This replaces `zod-to-json-schema`'s `openAi` target, which zod 4 broke silently: that library
 * dispatches on `def.typeName`, zod 4 renamed it to `_def.type`, so it recognises nothing and
 * falls through to a permissive branch emitting a single wildcard union in place of the whole
 * contract. It does not throw, the request stays well-formed, and the model is asked for anything
 * at all. 3.25.2 is its final release, so there is nothing to wait for.
 *
 * zod 4's own `z.toJSONSchema()` is the right foundation but not a drop-in — it has no `openAi`
 * target, and that target was doing load-bearing work. Everything below is the difference between
 * valid JSON Schema and the subset strict mode will accept.
 */

/**
 * The string formats OpenAI's validator recognises. Anything else — `uri`, which is what
 * `z.url()` produces, being the one this repo can actually reach — is dropped rather than sent,
 * because an unrecognised `format` is a 400 and the constraint it expresses is not worth one.
 */
const SUPPORTED_FORMATS = new Set([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
  'uuid',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * `z.number().int()` picks up `minimum`/`maximum` at ±`Number.MAX_SAFE_INTEGER` from the native
 * converter. That is a fact about IEEE 754, not about the document being analysed, and the
 * `openAi` target never emitted it. A domain schema that genuinely meant `.max(9007199254740991)`
 * would lose the bound here — which is the trade this makes, knowingly, against carrying a
 * meaningless ceiling into every integer the model sees.
 */
const stripSafeIntegerBounds = (node: Record<string, unknown>) => {
  if (node.type !== 'integer' && node.type !== 'number') return;

  if (node.maximum === Number.MAX_SAFE_INTEGER) delete node.maximum;
  if (node.minimum === -Number.MAX_SAFE_INTEGER) delete node.minimum;
};

/**
 * Strict mode requires every property named in `required` and every object closed, so optionality
 * cannot be expressed by omission — it has to be a union with `null`, which is how the `openAi`
 * target expressed it too. The native converter does the opposite: it drops optional and
 * defaulted properties from `required` and leaves objects open.
 *
 * `default` stays where it lands, inside the non-null branch, matching the previous output.
 */
const closeObject = (node: Record<string, unknown>) => {
  if (node.type !== 'object' || !isPlainObject(node.properties)) return;

  const properties = node.properties;
  const names = Object.keys(properties);
  const alreadyRequired = new Set(Array.isArray(node.required) ? (node.required as string[]) : []);

  for (const name of names) {
    if (alreadyRequired.has(name)) continue;

    properties[name] = { anyOf: [properties[name], { type: 'null' }] };
  }

  node.required = names;
  node.additionalProperties = false;
};

const applyOpenAiConstraints = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(applyOpenAiConstraints);
  if (!isPlainObject(node)) return node;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    result[key] = applyOpenAiConstraints(value);
  }

  if (typeof result.format === 'string' && !SUPPORTED_FORMATS.has(result.format)) {
    delete result.format;
  }

  stripSafeIntegerBounds(result);
  // Last: it rewrites `properties`, which must already have been walked.
  closeObject(result);

  return result;
};

/**
 * `io: 'input'` because the model produces what goes INTO `schema.parse()` — under `'output'` a
 * defaulted property is described as one the model must supply and can never omit, which is a
 * claim about the parsed value, not about the response.
 *
 * `reused: 'inline'` keeps `$ref`/`$defs` out of the emitted schema, as `$refStrategy: 'none'`
 * did before it.
 *
 * `unrepresentable` is left at its default, `'throw'`. A schema type with no JSON Schema form
 * cannot be sent either way; failing at the call is at least visible to a test, where the
 * alternative silently emits `{}` and gets a 400 from OpenAI instead.
 */
export const toOpenAiJsonSchema = (schema: z.ZodType): Record<string, unknown> => {
  const native = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io: 'input',
    reused: 'inline',
  });

  const { $schema: _unused, ...rest } = native as Record<string, unknown>;

  return applyOpenAiConstraints(rest) as Record<string, unknown>;
};

/**
 * The type-level statement of the shape `toOpenAiJsonSchema` asks a model for — and the mirror of
 * what `dropAbsentNulls` undoes on the way back.
 *
 * Strict mode names every property in `required`, so an optional one cannot say "absent" by being
 * missing; it says it with `null`. Applied to a PARSED result type, this yields what a reply must
 * actually look like on the wire: every key present, every optional widened to `| null`.
 *
 * Because it starts from the parsed type, a defaulted property comes out required and non-null.
 * The emitted schema also allows `null` there — a default is optional on the wire — so this
 * describes one valid response rather than the whole set of them. That is what a fixture wants to
 * be, and it is why this is a fixture-and-test type rather than one to parse against.
 */
export type StrictModeResponse<T> = T extends (infer Element)[]
  ? StrictModeResponse<Element>[]
  : T extends object
    ? {
        [Key in keyof T]-?: undefined extends T[Key]
          ? StrictModeResponse<NonNullable<T[Key]>> | null
          : StrictModeResponse<T[Key]>;
      }
    : T;

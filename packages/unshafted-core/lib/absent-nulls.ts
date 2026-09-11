import type { ZodType } from 'zod';

/**
 * Reads `null` back as "absent" wherever the OpenAI emitter offered it as a way of saying so.
 *
 * This is the inverse of `toOpenAiJsonSchema`, and it exists because that emitter has no choice.
 * OpenAI's strict mode requires every property to appear in `required`, so an optional property
 * cannot express absence by being missing — the only spelling left is a union with `null`:
 *
 *     "quote": { "anyOf": [ { "type": "string" }, { "type": "null" } ] }
 *
 * The model then does exactly what it was told and sends `"quote": null`. But zod's `.optional()`
 * means `undefined`, not `null`, so `schema.parse()` rejects a response that is perfectly valid
 * against the schema we ourselves sent. Measured against live OpenAI calls, that was 3 of 7 first
 * attempts — every reply containing at least one `null` failed, every reply without one passed
 * (#46).
 *
 * The repair belongs here rather than in the domain schemas. Making the fields `.nullish()` would
 * work, but `SitePolicyAnalysisSchema` also describes the objects PUBLISHED to the corpus, and
 * widening those to admit `null` changes what a published object is allowed to contain — a large
 * blast radius for what is only ever a wire-format detail. This keeps the detail at the wire.
 *
 * The test is the schema's own: a `null` is dropped only where the schema will not accept one, so
 * a genuinely `.nullable()` field keeps its `null` and means it.
 */

type ZodDef = {
  type: string;
  shape?: Record<string, ZodType>;
  element?: ZodType;
  innerType?: ZodType;
  options?: ZodType[];
};

const defOf = (schema: ZodType): ZodDef => (schema as unknown as { def: ZodDef }).def;

/**
 * `.optional()`, `.default()`, `.nullable()` and friends wrap the type that actually describes the
 * shape. Unwrapping is what lets `z.array(Exposure).default([])` still be recognised as an array
 * whose items are worth walking.
 */
const WRAPPERS = new Set(['optional', 'nullable', 'default', 'prefault', 'catch', 'readonly', 'nonoptional']);

const unwrap = (schema: ZodType): ZodType => {
  let current = schema;
  let def = defOf(current);

  while (WRAPPERS.has(def.type) && def.innerType) {
    current = def.innerType;
    def = defOf(current);
  }

  return current;
};

/**
 * Returns the value with absent-meaning nulls removed. `undefined` means "this whole value was a
 * null the schema will not take" — the caller deletes the key, which is precisely what
 * `.optional()` is waiting for.
 */
const strip = (schema: ZodType, value: unknown): unknown => {
  if (value === null) {
    // The schema is the authority. A `.nullable()` field keeps its null; an `.optional()` one
    // cannot hold it, and the emitter only offered it as a way of saying nothing.
    return schema.safeParse(null).success ? null : undefined;
  }

  const inner = unwrap(schema);
  const def = defOf(inner);

  if (def.type === 'object' && def.shape && value && typeof value === 'object' && !Array.isArray(value)) {
    const shape = def.shape;
    const result: Record<string, unknown> = {};

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const property = shape[key];
      // A key the schema does not describe is left exactly as it is: this function repairs one
      // known mismatch, and silently dropping unknown keys would hide a different one.
      if (!property) {
        result[key] = entry;
        continue;
      }

      const stripped = strip(property, entry);
      if (stripped !== undefined) result[key] = stripped;
    }

    return result;
  }

  if (def.type === 'array' && def.element && Array.isArray(value)) {
    // A null ELEMENT is not an absent element — there is no index to leave out without shifting
    // every later one — so it is left in place for the schema to reject on its own terms.
    return value.map(item => strip(def.element as ZodType, item) ?? null);
  }

  return value;
};

/**
 * Unions are deliberately not walked. Choosing a branch means guessing which one the model meant,
 * and guessing wrong would rewrite the value under a schema that was never going to match anyway.
 * `.optional()` and `.nullable()` are unions in spirit but are unwrapped above, so the response
 * schemas in this repo do not reach that case.
 */
export const dropAbsentNulls = <T>(schema: ZodType<T>, value: unknown): unknown => strip(schema, value);

# Adopting zod 4 by writing the OpenAI schema emitter

Closes [#23](https://github.com/LuDraGa/unshafted/issues/23). Supersedes dependabot
[#35](https://github.com/LuDraGa/unshafted/pull/35), which proposed the zod bump on its own.

Branch: `chore/zod-4-openai-emitter`, cut from `release`. Squash-merges back into `release`.

## Status

| Step | State |
|---|---|
| Capture the zod-3 baseline for all three live response schemas | done |
| Bump `zod` to 4 in `@extension/unshafted-core` | done |
| Write `lib/openai-json-schema.ts` | done |
| Rewire `openrouter.ts` onto it; drop `zod-to-json-schema` | done |
| Retire `toDraft2020ExclusiveBounds` | done |
| Extend `test/openrouter-response-format.test.ts` | done — 8 tests, 5 new |
| Prove the emitted contract matches the zod-3 baseline | done — all three schemas identical |
| Real model call against OpenAI strict mode | **not done — both API keys exhausted ([#47](https://github.com/LuDraGa/unshafted/issues/47))** |
| Offline substitute: ajv compile + strict-subset audit | done |
| Lift the zod-major ignore from `.github/dependabot.yml` | done |
| Raise follow-up issues | done — [#46](https://github.com/LuDraGa/unshafted/issues/46), [#47](https://github.com/LuDraGa/unshafted/issues/47), [#48](https://github.com/LuDraGa/unshafted/issues/48) |
| Type-check, lint, full test suite | done — 12/12 type-check, 14/14 test, lint clean |
| CI on the PR | `build`, `test`, `type-check`, `Prettier`, `CodeQL`, `eslint` green; the red checks are [#51](https://github.com/LuDraGa/unshafted/issues/51) |

## Why this is not a dependency bump

`zod-to-json-schema` dispatches on `def.typeName`. zod 4 renamed that to `_def.type`, so the
library recognises nothing and falls through to its permissive branch — silently. The peer range
`^3.25.28 || ^4` claims compatibility, and the code does run; it just stops emitting a contract.

Measured on this branch's own baseline capture (minified `response_format.json_schema.schema`):

| Schema | zod 3 | zod 4 + `zod-to-json-schema` |
|---|---|---|
| `quick_scan` | 1,845 B | 239 B |
| `deep_analysis` | 6,536 B | 239 B |
| `site_policy_analysis` (the 6-field pick actually sent) | 2,553 B | 239 B |

All three collapse to the same 239 bytes, because all three collapse to the same wildcard. The
absolute figures are a little under those in #23 — different measurement point on the same object,
not a different object; every number here is `JSON.stringify(response_format.json_schema.schema).length`
taken from the captured request body.

What replaces the contract is a single wildcard:

```json
{ "$ref": "#/definitions/OpenAiAnyType",
  "definitions": { "OpenAiAnyType": {
    "type": ["string","number","integer","boolean","array","null"],
    "items": { "$ref": "#/definitions/OpenAiAnyType" } } } }
```

`strict: true` still rides along, so the request is well-formed and the model is asked for
anything at all. `zod-to-json-schema` 3.25.2 is its final release, so this does not get fixed
upstream.

## Why native `z.toJSONSchema()` is not the replacement either

zod 4 ships a converter, but it has no `openAi` target, and that target was doing load-bearing
work. Against `draft-2020-12` / `io: 'input'` / `reused: 'inline'`, three differences matter:

1. **No `additionalProperties: false`.** OpenAI strict mode requires every object closed.
2. **Optional and defaulted properties are dropped from `required`.** Strict mode requires every
   property named in `required`; optionality has to be spelled as a union with `null` instead.
3. **`maximum: 9007199254740991` on every `.int()`.** A `Number.MAX_SAFE_INTEGER` artefact of the
   converter, not a domain constraint, and absent from the zod-3 output.

(1) and (2) are exactly what strict mode rejects, so native output alone trades a silent failure
for a 400.

## The emitter

`packages/unshafted-core/lib/openai-json-schema.ts`, one export, `toOpenAiJsonSchema`. Native
conversion, then a single recursive post-pass that:

- **closes every object** — `additionalProperties: false`;
- **forces every property into `required`**, in `properties` order;
- **rewrites optionality as a null union** — any property the native converter left out of
  `required` becomes `anyOf: [T, { type: 'null' }]`, which is how the retired `openAi` target
  expressed it;
- **strips the safe-integer ceiling** that `.int()` picks up;
- **strips `format` values outside OpenAI's accepted set** (`date-time`, `time`, `date`,
  `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`) — `uri`, from `z.url()`, is the one
  this repo can actually produce;
- **drops the root `$schema`**, which the wrapper does not need.

### `toDraft2020ExclusiveBounds` is gone, not carried over

It existed because the `openAi` target inherited OpenAPI 3's draft-4 spelling of an exclusive
bound — boolean `exclusiveMinimum: true` beside `minimum: 0` — while OpenAI validates as draft
2020-12, where the keyword *is* the number. Native `draft-2020-12` output writes
`exclusiveMinimum: 0` directly, so the rewrite has nothing left to rewrite. Keeping a no-op that
looks like a safeguard is worse than deleting it; the test that pins the wire form stays, and now
pins it against the emitter instead.

### What is deliberately unchanged

A property with `.default()` is emitted as `anyOf: [T, null]` and marked required — same as zod 3.
zod's `.default()` only fills in for `undefined`, so a literal `null` back from the model fails
`schema.parse()` and falls through to the `json_object` retry. That mismatch is inherited, not
introduced, and is filed as [#46](https://github.com/LuDraGa/unshafted/issues/46) rather than folded
in here, because narrowing it changes what the model is asked for.

## Evidence

### The contract survives

`quick_scan`, `deep_analysis` and the `site_policy_analysis` pick each emit a schema **identical to
the zod-3 baseline** — same keys, same values, same nesting — differing only in key order (the native
converter puts `default` first) and the dropped root `$schema`. Captured by driving the real
`callOpenRouterStructured` path against a stubbed `fetch` on both `origin/release` and this branch.

### It is valid, and inside OpenAI's strict subset

Each emitted schema compiles as JSON Schema 2020-12 under ajv 8, and an audit for the keywords,
formats and `$ref`s OpenAI's strict mode rejects returns nothing on all three.

`sampleQuickScan` validates against the emitted `quick_scan` schema, so it is not over-constrained.
`sampleDeepAnalysis` does not — that fixture is output-shaped, and the zod-3 schema rejects it with
the identical errors, so it is a fixture gap rather than a regression
([#48](https://github.com/LuDraGa/unshafted/issues/48)).

### What is missing

A live call. `CEB_OPENAI_API_KEY` returns `credit_balance_exhausted` and `CEB_OPENROUTER_API_KEY`
returns `Key limit exceeded (total limit)`, so nothing here has been in front of OpenAI's own
validator. Identity with a schema that was accepted in production is strong, but it is not an HTTP
200; tracked as [#47](https://github.com/LuDraGa/unshafted/issues/47) and worth clearing before the
next submission.

## Other zod-4 breakages found and fixed

- `ZodSchema` is type-only in v4. `openrouter.ts` and `json.ts` already imported it as a type;
  the `TS2345` in #23 was the `zodToJsonSchema` call, which is gone.
- `ZodError.errors` is `.issues` in v4 — nothing in this workspace read it. `instanceof ZodError`
  is unchanged.
- `z.string().url()` and `z.string().datetime()` are deprecated in favour of `z.url()` /
  `z.iso.datetime()`, and both still work.

## Follow-ups raised

- [#46](https://github.com/LuDraGa/unshafted/issues/46) — a defaulted property is offered `null`,
  which zod then rejects. Inherited from the `openAi` target, unchanged here, and narrowing it
  changes what the model is asked for.
- [#47](https://github.com/LuDraGa/unshafted/issues/47) — run the live strict-mode call once a key
  has credit.
- [#48](https://github.com/LuDraGa/unshafted/issues/48) — `sampleDeepAnalysis` cannot stand in for a
  model response.
- [#51](https://github.com/LuDraGa/unshafted/issues/51) — every PR into `release` inherits a failing
  duplicate `eslint` check and ~20 dead E2E checks from workflow definitions that survive only on
  `main`. Not caused by this change, and it clears itself at the next publish merge.

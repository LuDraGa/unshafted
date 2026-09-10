# Reading `null` back as "absent"

Fixes [#46](https://github.com/LuDraGa/unshafted/issues/46). Found while clearing
[#47](https://github.com/LuDraGa/unshafted/issues/47), the live verification of the zod 4 emitter
([#49](https://github.com/LuDraGa/unshafted/pull/49)).

Branch: `fix/null-means-absent`, cut from `release`. Squash-merges back into `release`.

## Status

| Step | State |
|---|---|
| Reproduce against live OpenAI calls, and measure | done — 3 of 7 first attempts failed |
| Confirm it is inherited, not a zod 4 regression | done |
| Write `lib/absent-nulls.ts` | done |
| Apply it in `parseStructuredJson` | done |
| Stop the OpenAI retry from dropping its own schema | done |
| Tests | done — 8 new for the strip, 2 for the retry |
| Live re-run of the failing trials | done — **7/7**, including three replies carrying nulls |
| Type-check, lint, full test suite | done |

## The bug

OpenAI strict mode requires every property to appear in `required`. An optional property therefore
cannot express absence by being missing, and the only spelling left is a union with `null`:

```json
"quote": { "anyOf": [ { "type": "string", "minLength": 1 }, { "type": "null" } ] }
```

The model does exactly what it is told:

```json
"reference": { "label": "Liability cap action", "quote": null }
```

`ClauseReferenceSchema.quote` is `z.string().min(1).optional()`, and in zod `.optional()` means
`undefined`, not `null`. So `schema.parse()` rejects a response that is perfectly valid against the
schema we ourselves sent.

Measured live against `gpt-5-nano` on `release` @ 94b1d9d:

| Trial | Schema | HTTP | Nulls | Outcome |
|---|---|---|---|---|
| 1 | `quick_scan` | 200 | 0 | OK |
| 1 | `site_policy_analysis` | 200 | 6 | **ZodError** |
| 2 | `quick_scan` | 200 | 0 | OK |
| 2 | `site_policy_analysis` | 200 | 10 | **SyntaxError** |
| 3 | `quick_scan` | 200 | 5 | **ZodError** |
| 3 | `site_policy_analysis` | 200 | 0 | OK |
| — | `deep_analysis` (gpt-5.4) | 200 | 0 | OK |

3 of 7, and the correlation is exact: every reply containing at least one `null` failed, every reply
without one passed.

**Not a zod 4 regression.** `zod-to-json-schema`'s `openAi` target emitted the identical
`anyOf: [T, null]` with the property in `required`, and zod 3's `.optional()` also rejects `null`.
This has been live for own-key OpenAI users all along; #49 reproduced it faithfully, and this is the
cost of that fidelity.

## The fix

`packages/unshafted-core/lib/absent-nulls.ts` — the inverse of `toOpenAiJsonSchema`, applied in
`parseStructuredJson` before `schema.parse()`. It walks the zod schema alongside the parsed value
and drops a `null` wherever the schema will not accept one.

The test is the schema's own — `schema.safeParse(null).success` — so no list of field names has to
be maintained, and a genuinely `.nullable()` field keeps its `null` and means it.

### Why not `.nullish()` on the domain schemas

That would work, and it is the obvious move. But `SitePolicyAnalysisSchema` also describes the
objects **published to the corpus**, so widening its fields to admit `null` changes what a published
object is allowed to contain — and those objects are already out there. That is a large blast radius
for what is only ever a wire-format detail, so the detail stays at the wire.

### Deliberate limits

- **A null array element is left alone.** There is no index to leave out without shifting every
  later one, so it stays and the schema rejects it on its own terms.
- **Unknown keys are left alone.** This repairs one known mismatch; silently dropping keys the
  schema does not describe would hide a different one.
- **Unions are not walked.** Picking a branch means guessing which one the model meant.
  `.optional()` and `.nullable()` are unwrapped before that case is reached, so no response schema
  in this repo gets there.

## The retry was making it worse

`callOpenRouterStructured` caught the `ZodError` and retried with `jsonMode: false`. What that drops
is not the same thing for both providers:

- **OpenRouter:** it drops `json_object`, which some models reject outright. A real compatibility
  escape, and the reason the fallback exists. **Kept.**
- **OpenAI:** it drops the *schema* — the only thing that told the model what shape to produce. The
  observed retry answered with an entirely invented shape, `{id, name, description}` where the
  contract asks for `{action, howTo, effort}`. Two calls, no result, where reading one `null` as
  absent was all it needed. **Removed.**

## After the fix

Same trials, same models, same document, on this branch:

| Trial | Schema | Nulls in the strict reply | Outcome |
|---|---|---|---|
| 1 | `quick_scan` | 0 | first-attempt OK |
| 1 | `site_policy_analysis` | 0 | first-attempt OK |
| 2 | `quick_scan` | **6** | first-attempt OK |
| 2 | `site_policy_analysis` | 0 | first-attempt OK |
| 3 | `quick_scan` | **5** | first-attempt OK |
| 3 | `site_policy_analysis` | **13** | first-attempt OK |
| — | `deep_analysis` (gpt-5.4) | 0 | first-attempt OK |

**7 of 7**, with no retries at all. Three of those replies carried nulls — 6, 5 and 13 of them —
and every one of those would have failed before. That is the case the fix exists for, and it is the
column to read: not the pass rate, but that a reply with nulls now parses.

## Follow-ups raised

None. Nothing deferred is left in this document.

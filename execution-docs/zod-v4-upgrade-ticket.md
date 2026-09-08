# zod 3.25.76 → 4.5.4 — it changes the OpenRouter model contract

**Status:** Ticket — open, not started
**Date raised:** 2026-09-08
**Owner:** @LuDraGa
**Parent:** `execution-docs/dependency-sweep-2026-09.md`
**Held out of:** dependabot PR #8, and the September dependency sweep
**Related:** `execution-docs/ci-test-task-ticket.md` — the guard for this change is not wired to CI

---

## The problem, in one sentence

zod is not just validating our data — it is **generating the JSON Schema we send to OpenRouter as
the structured-output contract** — so a major bump can change what the model is asked to produce,
and the one test that would notice never runs in CI.

## Where the contract is built

```ts
// packages/unshafted-core/lib/openrouter.ts:143
const converted = toDraft2020ExclusiveBounds(
  zodToJsonSchema(schema, { target: 'openAi', $refStrategy: 'none' })
);
```

That output goes into the request's `response_format`. If its shape shifts, the failure is not a
crash — it is the model returning subtly different JSON, and analysis quality degrading in a way no
type-checker or build can see.

## What is and is not a blocker

**Not a blocker:** `zod-to-json-schema@3.25.2` declares `peerDependencies: { zod: "^3.25.28 || ^4" }`,
so v4 is supported. This ticket originally suspected a hard incompatibility; there isn't one.

**Still the real risk:** a supported peer range says the library *runs* under zod 4. It does not say
the emitted schema is byte-identical for a v4-authored schema, and the `openAi` target plus the
local `toDraft2020ExclusiveBounds` post-processing both sit on assumptions about that output.

**Also in scope:** `openrouter.ts:260` branches on `error instanceof ZodError`. That still exists in
v4, but `ZodError.errors` was dropped in favour of `.issues`, and message formatting changed — so
any error surfaced to the user from this path needs a look.

## The API surface actually used

Narrow, which is the good news. Across `packages/unshafted-core/lib/`:

`z.string()` ×106, `z.array()` ×35, `z.object()` ×32, `z.enum()` ×22, `z.number()` ×16,
`z.boolean()` ×4, `z.literal()` ×2, plus `z.infer` throughout `types.ts` and `ZodSchema` as the
parameter type in `json.ts`. No `z.record()`, no custom error maps, no `.refine()` chains in the
schemas that feed OpenRouter. Core constructors all survive into v4; `ZodSchema` is worth confirming
as still exported rather than assumed.

## The work

1. Bump `zod` to `^4.5.4` in `packages/unshafted-core/package.json`. Leave `zod-to-json-schema` where
   it is unless the diff below says otherwise.
2. **Diff the generated schema before and after.** Serialise `zodToJsonSchema(...)` for each schema
   handed to OpenRouter on both versions and compare. This is the whole ticket; everything else is
   secondary.
3. Run `pnpm --filter @extension/unshafted-core test`, in particular
   `test/openrouter-response-format.test.ts`, which exists precisely to pin this payload.
4. Check `ZodSchema` is still exported from zod v4; switch `json.ts` to `ZodType` if not.
5. Audit `.errors` → `.issues` on any `ZodError` the UI surfaces.
6. Confirm `toDraft2020ExclusiveBounds` still has the input shape it expects — its whole reason for
   existing is patching up the `openAi` target's exclusive-bounds representation.

## Why not now

`release` is in front of CWS review for v0.8.0. A change that alters what the extension asks the
model for is a product change wearing a dependency bump's clothes, and it wants its own PR with the
schema diff visible in the description.

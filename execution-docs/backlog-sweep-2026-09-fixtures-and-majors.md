# Backlog sweep — September 2026: two fixtures and two majors (#45, #48, #40, #41)

**Worked:** 2026-09-10 · **Base:** `release` at `87be28d`
**Status:** all four complete, four PRs open awaiting merge. One new issue raised (#55).

Four issues left open after the `zod` 4 work (#49, #50, #52). Worked in the order they were
raised in: the two fixture problems first, because they are self-contained and make the suite a
more honest signal for the two dependency majors that follow.

Each item branches from `release` and squash-merges back, per `CLAUDE.md`.

## Outcome

| # | What | Branch | PR | Result |
|---|---|---|---|---|
| 45 | Options settings-form mock collapses every URL to `'#'` | `fix/options-test-distinct-urls` | #53 | Fixed in the fixture |
| 48 | `sampleDeepAnalysis` is not a valid *model response* | `fix/response-shaped-analysis-fixture` | #54 | Second fixture, not a rewrite |
| 40 | `eslint` 9 → 10, plus its four findings | `chore/eslint-10` | #56 | Taken; four findings paid down |
| 41 | `vite` 6 → 8, `watchOption` and a capped peer | `chore/vite-8` | #57 | Taken; `buildDelay` replaces `awaitWriteFinish` |

Raised on the way: **#55** — `eslint.config.ts` spreads two react configs into one object, so 20 of
the 22 recommended rules have never loaded. Found while checking `eslint-plugin-react`'s unmet peer,
left out of #40 deliberately: see below.

## Explicitly not in this sweep

- **#43 (Tailwind 4)** and **#44 (TypeScript 7)** are migrations, not bumps. #44 touches all 17
  tsconfigs and has to land in one commit or the workspace will not install. Each wants its own
  session.
- **#37 and #51 are one knot.** #37 wants `lint` made a required check; it cannot be until the
  duplicate `eslint` context coming from stale `main` clears, which is #51. Both dissolve at the
  next publish merge, so neither is worth acting on now.
- **#1** is a feature.

---

## #45 — the mock made React warn, and hid the keying it meant to exercise

`pages/options/test/settings-form.test.tsx` mocked all six provider-help URL constants to `'#'`.
`Options.tsx:473` keys the help-link list by `href`, which is right in production — the real
constants in `packages/unshafted-core/lib/constants.ts` are all distinct — but under the mock every
link collapsed onto the same key.

Fixed in the fixture: six distinct, URL-shaped values on `*.test` hosts, with a comment saying why
they have to stay distinct.

### The wrinkle that makes "verify the warnings are gone" harder than it sounds

Vitest 5 does not print console output for tests that **pass**. So the baseline run looked clean:

```
$ pnpm vitest run test/settings-form.test.tsx
Test Files  1 passed (1) · Tests  5 passed (5)
```

…while eleven duplicate-key warnings were being swallowed. They only appear with `--silent=false`,
and they would reappear in full the moment any test in the file failed — which is exactly when the
noise costs the most.

| | duplicate-key warnings | tests |
|---|---|---|
| before | **11**, across all 5 tests | 5 passed |
| after | **0** | 5 passed |

Both measured with:

```
pnpm vitest run test/settings-form.test.tsx --silent=false --reporter=verbose
```

That flag is the only way to see this class of regression. Worth remembering the next time a run
"looks clean".

The issue said four of five tests warned; it is in fact all five. The count differs because
`shows what was actually stored after a save` and `keeps an edit in progress…` re-render, and each
re-render warns again.

---

## #48 — two shapes, so two fixtures

Reproduced first, against the emitted schema rather than from the issue text. Five sites, one more
than the issue lists:

```
/topicConcerns/{0,1,2}/reference   must have required property 'quote'
/negotiationIdeas/1                must have required property 'fallback'   <- not in the issue
/potentialAdvantages/0/reference   must have required property 'quote'
```

### The decision

The issue offered `quote: null` in place, or a sibling fixture, and leaned at the second. Since #52
the first genuinely works end-to-end — the parse seam reads those nulls as absent — so this was a
choice between two working options, not a forced hand.

Took the sibling, for a reason the issue did not state: `sampleDeepAnalysis` is typed
`DeepAnalysisResult`, where `quote` is `string | undefined`. Writing `quote: null` into it makes the
annotation false, and widening the domain type to admit a `null` pushes a wire-format detail into
the objects the UI renders. That is the same trade `absent-nulls.ts` already declined for
`SitePolicyAnalysisSchema`, and declining it there while accepting it here would be incoherent.

### Keeping the two honest without duplicating 150 lines

- Content is **derived** from `sampleDeepAnalysis`, so they cannot drift on anything but spelling.
- `StrictModeResponse<T>` — new, in `openai-json-schema.ts` — is the type-level mirror of what the
  emitter asks for, so the compiler checks the spelling. Confirmed load-bearing by removing one
  mapping and watching the build fail.
- A walk over the emitted schema asserts the response fixture is missing nothing `required`, **and**
  asserts the rendering fixture still is. The distinction is pinned by a test, not by a comment.
- A full-size round-trip: the reply parses back into exactly `sampleDeepAnalysis`.

No ajv. The walker follows the hand-rolled precedent already in `openrouter-response-format.test.ts`.

### Confirmed against a live model

One real `gpt-4o-mini` call with this exact schema, since a fixture asserting "this is what a model
sends" is worth checking against one. Fourteen explicit nulls, every absent optional among them, and
the reply parsed cleanly. `disclaimer` came back `null` — a *defaulted* property, which the emitted
schema does allow to be null and which the seam correctly falls back on. That is the one way the
fixture is narrower than the wire format, and it is noted in the type's doc comment.

---

## #40 — eslint 10

The issue's central claim held: `typescript-eslint@8.70.0` already peers `^10`, so the TypeScript
toolchain does not move. All four findings appeared exactly where predicted and all four were worth
fixing.

The `pdf.ts` pair mattered most. Both rewrite a caught error into something readable in a dialog and
dropped pdf.js's own error, so a PDF failing for an interesting reason reported the rewritten
sentence and no stack. `{ cause: err }` on both; user-facing text unchanged.

The two `no-useless-assignment` sites were dead assignments describing state their loops do not
carry — `inLowerPage = false` in a `catch` whose only throwing statement runs before the assignment,
and a `let match = null` that the `while` condition overwrites before anything reads it.

### The three unmet peers: no release helps, so verify instead

None of `jsx-a11y`, `react` or `import` has a release declaring `^10`; the first two are already at
their latest, and neither prerelease helps. `eslint-plugin-import` turns out not to be used at all —
it is an *optional* peer of `eslint-import-resolver-typescript`, and this repo lints with `import-x`,
which does declare `^10`.

So each was exercised rather than assumed: jsx-a11y reports four rules on a probe file, react-hooks
reports `rules-of-hooks`, and react reports `jsx-key` when forced on. A metadata cap, not a break.

### What that probe turned up — #55

`eslint-plugin-react`'s recommended rules have **never been enabled here.** `eslint.config.ts`
spreads `flat.recommended` and `flat['jsx-runtime']` into one object literal, so the second `rules`
key replaces the first — 22 rules collapse to 2. `eslint --print-config` reports 0 enabled `react/`
rules, and `react/jsx-key` is not even present. A tell that it was never intended: the config below
explicitly switches `react/react-in-jsx-scope` and `react/prop-types` **off**, which only makes sense
if the recommended set was believed to be on.

Pure JavaScript semantics, so it predates eslint 10 and is not caused by it. Left out of #40: the fix
turns on 20 rules across the codebase at once, which is its own change with its own fallout, not a
rider on a dependency bump.

Notable given #45 was about a *duplicate* key: `react/jsx-key`, which catches a *missing* one, has
never run in this repo.

---

## #41 — vite 8, and the trap that makes a green build meaningless

`awaitWriteFinish` had nowhere to go — vite 8 bundles rolldown, which does its own watching, and the
`chokidar` key is gone. But the *reason* for it did not go anywhere, so this was not a deletion:

```ts
export const watchOption = IS_DEV ? { buildDelay: 100 } : undefined;
```

`buildDelay` waits for a quiet window before rebuilding and each further change restarts the wait, so
a file arriving in pieces is built once it has stopped moving. Rolldown's docs describe the exact
failure `awaitWriteFinish` guarded: "a broken intermediate build before generating a successful final
build". 100ms rather than chokidar's 2000ms — that default was a stability threshold for a *polling*
watcher, and two seconds on every save is the wrong price for a dev loop.

### Verifying it where it actually lives

The option is `IS_DEV`-gated, so `pnpm build` passes over broken code and says nothing. Everything
worth believing came from `pnpm dev`:

- vite 8.3.0 starts, all four targets reach `watching for file changes...`, HMR server on `:8081`.
- An edit rebuilds in ~190ms and the marker string is in the new bundle, absent from the old.
- A WebSocket probe on the HMR socket receives `{"type":"do_update", ...}` after the rebuild — the
  reload signal reaches a client, which is what "hot-reloads" actually means.

And `buildDelay` was measured against a control rather than assumed. Five writes 40ms apart:

| `buildDelay` | rebuilds |
|---|---|
| `100` | **1** |
| `0` (control) | **2** |

Without it the burst produces more than one build. The option is doing real work.

### The capped peer

`@laynezh/vite-plugin-lib-assets` has a **2.2.0** the issue predates (2025-12-02, on `next`, not
`latest`) — and it still caps at `^7`. Nothing to upgrade to, so the unmet peer stays, verified
working instead.

### Build comparison

Built vite 6 and vite 8 and diffed the ZIPs: **32 entries both ways**, the only differing names are
content hashes, and `manifest.json` is byte-identical — same MV3, same six permissions, same
`<all_urls>`. 1,899,159 → 1,865,541 bytes.

---

## Standing note on CI

Every PR here shows a failing duplicate `eslint` and ~20 dead E2E checks. That is #51 —
`pull_request_target` reads its workflow definition from the *default* branch, and `main` is behind
`release`. The checks that mean anything are `build`, `test`, `type-check`, `Prettier Check`,
`CodeQL` and the **passing** `eslint`; all are green on all four PRs. It resolves itself at the next
publish merge.

# Backlog sweep — September 2026: two fixtures and two majors (#45, #48, #40, #41)

**Worked:** 2026-09-10 · **Base:** `release` at `87be28d`
**Status:** in progress — #45 done, #48 / #40 / #41 pending

Four issues left open after the `zod` 4 work (#49, #50, #52). Worked in the order they were
raised in: the two fixture problems first, because they are self-contained and make the suite a
more honest signal for the two dependency majors that follow.

Each item branches from `release` and squash-merges back, per `CLAUDE.md`.

## Outcome

| # | What | Branch | PR | Result |
|---|---|---|---|---|
| 45 | Options settings-form mock collapses every URL to `'#'` | `fix/options-test-distinct-urls` | — | Done |
| 48 | `sampleDeepAnalysis` is not a valid *model response* | — | — | Pending |
| 40 | `eslint` 9 → 10, plus its four findings | — | — | Pending |
| 41 | `vite` 6 → 8, `watchOption` and a capped peer | — | — | Pending |

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

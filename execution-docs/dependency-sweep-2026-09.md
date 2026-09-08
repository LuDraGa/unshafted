# Dependency Sweep — September 2026

**Status:** In progress — bumps applied, verification pending
**Date raised:** 2026-09-08
**Owner:** @LuDraGa
**Branch:** `chore/dependency-sweep` (from `release`, squash-merges back into `release`)
**Replaces:** dependabot PRs #2–#8, closed in favour of this sweep

---

## Why this is one branch and not seven merges

Dependabot was retargeted from `dev` to `release`, and seven PRs appeared at once. Merging them
individually would put seven squash commits on `release` — the branch that is, right now, the tree
in front of Chrome Web Store review for **v0.8.0**. Each merge is a separate chance to move the
submitted tree, and a separate thing to unpick if review comes back.

One branch, one PR, one squash commit. It does not merge until 0.8.0 is settled.

The branch is `chore/*`, not `dev/vX.Y.Z`: this maintenance belongs to no version, and calling it
`dev/v0.9.0` would claim it is the next release when it is not. `CLAUDE.md` now lists `chore/*` in
the work-branch table.

## What went in

**GitHub Actions — all five bumps (PRs #2–#6).** These touch only `.github/workflows/`. They cannot
affect the shipped ZIP, which is why they are safe to take while a version is in review.

| Action | From | To | Note |
|---|---|---|---|
| `actions/checkout` | v4 | v7 | v7 adds a fork-PR guard — see below |
| `actions/upload-artifact` | v4 | v7 | node24 runtime (v6), ESM + optional `archive` input (v7) |
| `github/codeql-action` | v3 | v4 | v4 line is current; minimum CodeQL bundle 2.19.4, nothing here pins one |
| `pnpm/action-setup` | v4 | v6 | v5 node24, v6 adds pnpm 11 support |
| `dependabot/fetch-metadata` | v2 | v3 | node24 runtime only |

**On the checkout v7 guard.** v7 refuses to check out *fork* PR code under `pull_request_target`
and `workflow_run` unless `allow-unsafe-pr-checkout: true`. Reading
[`unsafe-pr-checkout-helper.ts`](https://github.com/actions/checkout/blob/v7.0.1/src/unsafe-pr-checkout-helper.ts),
it throws only when all three hold: the event is one of those two, the PR head repo is a fork, and
the resolved checkout target points at the fork head (by `repository` input, a `refs/pull/N/*` ref,
or a commit matching the PR head SHA). Every `pull_request_target` workflow here uses bare
`actions/checkout` with no `ref` and no `repository`, so it resolves to the base branch. The guard
does not fire.

**npm dev-dependencies — all of PR #7 (42 updates).** Only eight crossed their declared floor and
needed a `package.json` change; the rest move in the lockfile alone. The majors worth watching
during verification: `@types/chrome` 0.0.323→0.2.8 (most likely type-check breaker),
`eslint-plugin-react-hooks` 5→7 (ships React Compiler rules), `prettier` 3.6→3.9 with
`prettier-plugin-tailwindcss` 0.6→0.8 (formatting churn the Prettier CI check will see), and the
three Vite-side majors — `@vitejs/plugin-react-swc` 3→4, `@laynezh/vite-plugin-lib-assets` 1→2,
`vite-plugin-node-polyfills` 0.23→0.28 — which are what actually produce the shipped bundle.

**npm production — six of the eight in PR #8.** `react`/`react-dom` 19.1.1→19.2.8,
`@dotenvx/dotenvx`, `react-error-boundary`, `@supabase/supabase-js`, `tailwind-merge`. All minor or
patch within existing ranges.

## What was held back, and why

Two production bumps in PR #8 are not dependency bumps. Each is a behaviour change with real work
attached, and neither belongs in a tree that is mid-review. Both are ticketed:

- **`pdfjs-dist` 4.10.38 → 6.3.289** — [#11](https://github.com/LuDraGa/unshafted/issues/11).
  The worker is vendored and version-locked; taking the bump alone ships a build that is green in CI
  and broken on every PDF.
- **`zod` 3.25.76 → 4.5.4** — [#12](https://github.com/LuDraGa/unshafted/issues/12). It changes the
  JSON Schema handed to OpenRouter, and the test that would catch a regression does not run in CI.

## Adjacent work, ticketed rather than folded in

Three things surfaced while reading the workflows. None is a dependency bump, so none is in this
sweep:

- [#13](https://github.com/LuDraGa/unshafted/issues/13) — `actions/setup-node@v4` is three majors
  behind and is queued behind Dependabot's 5-PR cap.
- [#14](https://github.com/LuDraGa/unshafted/issues/14) — the auto-merge workflow is
  armed against `release` and inert only by accident.
- [#15](https://github.com/LuDraGa/unshafted/issues/15) — two packages have test suites that no
  workflow runs.
- [#16](https://github.com/LuDraGa/unshafted/issues/16) — `eslint-plugin-react-hooks` v7 flags 16
  findings in code that was never previously checked.
- [#17](https://github.com/LuDraGa/unshafted/issues/17) — the build shipped the previous build's
  dead bundles. **Fixed in this sweep.**

## What the bumps actually broke

Two type errors, both from `@types/chrome` 0.0.323 → 0.2.8, and one from `react-error-boundary`
6.0.0 → 6.1.5. All three are fixed on this branch:

- **`packages/ui/.../ErrorDisplay.tsx`** — `FallbackProps.error` is now `unknown` rather than
  `Error`, which is the honest type for a thrown value. The component annotated it `error?: Error`.
  Narrowed at the top of the component instead; a thrown string now renders its own text rather than
  "Unknown error".
- **`pages/side-panel/.../useActiveTabSite.ts`** — `chrome.tabs.TabChangeInfo` was renamed
  `chrome.tabs.OnUpdatedInfo`.
- **`chrome-extension/src/background/side-panel.ts`** — `chrome.storage.session.get()` no longer
  yields `any` per key, so `new Set<number>(stored[KEY] ?? [])` stopped compiling. The read is now
  typed to the shape `rememberOfferedTab` writes.

## Verification

**`pnpm type-check` — clean, 12/12 packages.**

**`pnpm build` — clean. ZIP structurally identical to the 0.8.0 baseline:** same 32 entries, same
paths, only content hashes differ. Bundle growth is +56 KB uncompressed (+3.4%), +27 KB in the
compressed ZIP (+1.5%), which is consistent with react 19.1.1→19.2.8 plus the Vite/SWC plugin
majors. No new files, none missing, `popup/pdf.worker.min.mjs` unchanged — as it must be, since
`pdfjs-dist` was held.

**`pnpm lint` — now green.** It was failing on `release` before this sweep: 83 problems, which the
sweep took to 110. The path to zero errors:

- `lint:fix` cleared everything mechanical — all 43 prettier reflows from prettier 3.6→3.9 and
  `prettier-plugin-tailwindcss` 0.6→0.8, plus import ordering and type-specifier style.
- **41 `import-x/exports-last`** across 13 files, all pre-existing. The rule is explicitly enabled in
  this project's own rules block, not inherited, so the violations were fixed rather than the rule
  disabled. Each file's `export const` / `export type` declarations were stripped of the keyword and
  re-exported from a trailing block, which satisfies the rule without moving any declaration — so no
  temporal-dead-zone risk and no change in evaluation order.
- **2 `@typescript-eslint/no-unused-vars`**: `handleDemo` in `Popup.tsx` was genuinely dead (only its
  own declaration referenced it) and is deleted along with its now-unused `createSampleAnalysis`
  import; `_focusedOnboardingTarget` is deliberately unused and documented as such, so the rule now
  honours the `^_` prefix the codebase already uses for exactly this.
- **14 errors from `eslint-plugin-react-hooks` v7** — `set-state-in-effect` ×11, `refs` ×2,
  `preserve-manual-memoization` ×1 — are **adopted as warnings**, not fixed. They are new rules that
  v5 did not have, firing on code this sweep never touched, and every fix means restructuring an
  effect: the settings form's props-into-state sync, the side-panel data hooks, and `use-storage`,
  which every page depends on. That is a behaviour change, and this branch sits next to a tree in
  front of review. They stay visible as warnings and are tracked in
  [#16](https://github.com/LuDraGa/unshafted/issues/16) to be paid down after v0.8.0 ships.

`react-hooks/exhaustive-deps` has one remaining warning, pre-existing and unchanged.

The Lint Check workflow had been red on `release` for some time — the giveaway is that a docs-only
branch and the YAML-only Dependabot branches all failed it, and under `pull_request_target` with a
bare checkout those runs lint the *base branch*, not the PR.

**Unit tests** — 76 in `unshafted-core`, 13 in `storage`, all passing after the export
restructuring. They are not run by any workflow; see
[#15](https://github.com/LuDraGa/unshafted/issues/15).

## Two more things the sweep found, and fixed

**`pnpm build` was shipping the previous build's dead bundles.** It zips into the *existing*
archive, and Vite's content-hashed filenames mean a changed bundle lands at a new path while the
old one is never replaced — ~1.67 MB of orphaned JS/CSS in this case. `clean:bundle` now removes
the archive as well as `dist/`, verified by two consecutive builds both producing 32 entries. The
**v0.8.0 ZIP was checked and was clean** (exactly six asset files, one build's worth), so nothing
stale reached review. [#17](https://github.com/LuDraGa/unshafted/issues/17), closed.

**Nineteen CI jobs had never once passed.** `e2e.yml` and `e2e-modular.yml` invoke `pnpm e2e`,
`pnpm e2e:firefox` and `pnpm module-manager` — none of which exist — and the modular matrix names
`content`, `content-ui`, `content-runtime`, `devtools` and `new-tab` pages this repo does not have.
Leftovers from the boilerplate the project started from. They failed on every branch, including
docs-only ones, and drowned out the checks that do work. Both are deleted.


## Status

- [x] Branch `chore/dependency-sweep` cut from `release`
- [x] Five GitHub Actions bumps applied
- [x] `package.json` floors raised (8 dev, 2 production)
- [x] `CLAUDE.md` branch table extended with `chore/*`
- [x] Seven issues raised on GitHub (#11–#17) for held-back, adjacent and newly-found work
- [x] `pnpm-lock.yaml` regenerated; `--frozen-lockfile` install verified
- [x] Three type breakages fixed
- [x] `pnpm type-check` clean, 12/12
- [x] `pnpm build` clean, ZIP structurally unchanged
- [x] `pnpm lint` green — 41 `exports-last` fixed, 2 unused vars cleared, react-hooks v7 rules
      adopted as warnings under #16
- [x] Unit tests pass — 76 + 13, after the export restructuring
- [x] Stale-ZIP build bug fixed; v0.8.0 ZIP confirmed clean
- [x] Dead `e2e.yml` / `e2e-modular.yml` removed — 19 jobs that had never passed
- [x] Dependabot PRs #2–#8 closed with a pointer to the sweep PR
- [x] Sweep PR [#10](https://github.com/LuDraGa/unshafted/pull/10) opened against `release`
- [ ] **Held unmerged until v0.8.0 clears CWS review**

## Merge condition

This does not merge while v0.8.0 is in front of review. When 0.8.0 publishes and `release` merges to
`main`, this squash-merges into `release` and the next cycle branches from it.

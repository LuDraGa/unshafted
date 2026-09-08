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

- **`pdfjs-dist` 4.10.38 → 6.3.289** — [`pdfjs-dist-v6-upgrade-ticket.md`](pdfjs-dist-v6-upgrade-ticket.md).
  The worker is vendored and version-locked; taking the bump alone ships a build that is green in CI
  and broken on every PDF.
- **`zod` 3.25.76 → 4.5.4** — [`zod-v4-upgrade-ticket.md`](zod-v4-upgrade-ticket.md). It changes the
  JSON Schema handed to OpenRouter, and the test that would catch a regression does not run in CI.

## Adjacent work, ticketed rather than folded in

Three things surfaced while reading the workflows. None is a dependency bump, so none is in this
sweep:

- [`setup-node-v7-ticket.md`](setup-node-v7-ticket.md) — `actions/setup-node@v4` is three majors
  behind and is queued behind Dependabot's 5-PR cap.
- [`dependabot-auto-merge-ticket.md`](dependabot-auto-merge-ticket.md) — the auto-merge workflow is
  armed against `release` and inert only by accident.
- [`ci-test-task-ticket.md`](ci-test-task-ticket.md) — two packages have test suites that no
  workflow runs.

## Status

- [x] Branch `chore/dependency-sweep` cut from `release`
- [x] Five GitHub Actions bumps applied
- [x] `package.json` floors raised (8 dev, 2 production)
- [x] `CLAUDE.md` branch table extended with `chore/*`
- [x] Five tickets written for held-back and adjacent work
- [ ] `pnpm-lock.yaml` regenerated for the sweep's package set
- [ ] `pnpm type-check` clean
- [ ] `pnpm lint` clean
- [ ] `pnpm build` clean, ZIP shape unchanged against the 0.8.0 baseline
- [ ] Dependabot PRs #2–#8 closed with a pointer to the sweep PR
- [ ] Sweep PR opened against `release` — **held unmerged until v0.8.0 clears CWS review**

## Merge condition

This does not merge while v0.8.0 is in front of review. When 0.8.0 publishes and `release` merges to
`main`, this squash-merges into `release` and the next cycle branches from it.

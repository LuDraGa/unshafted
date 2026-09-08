# Tests and type-check actually run now (#15)

**Worked:** 2026-09-08 · **Base:** `release` at `fce2180` · **Branch:** `chore/test-and-type-check-in-ci`
**Status:** complete.

Two suites and a type-check that everyone believed in and nothing ran. Worth doing now rather than
earlier because #26 made PR checks read the pull request — before that, a new check would have been
a third thing reporting on the wrong tree.

`chore/*` rather than `dev/vX.Y.Z`: this is maintenance belonging to no version.

## What was missing

`packages/unshafted-core` and `packages/storage` both define
`"test": "node --import tsx --test test/**/*.test.ts"`, but `turbo.json` had no `test` task, the
root had no `test` script, and no workflow invoked one.

The comment on #15 added the other half: nothing ran `pnpm type-check` either. `build-zip` runs
`pnpm build`, which builds packages through `ready` (`tsc -b`) but never type-checks the pages —
`pages/*/tsconfig.json` is exercised by `pnpm type-check` alone. A type error in `pages/popup/src`
reached `release` unless somebody happened to run it locally.

## The dependsOn question, checked rather than assumed

The ticket was explicit that `lint` had turned out to need `dependsOn: ["^ready"]` and that `test`
and `type-check` should be checked for the same need. They came out differently, and the difference
is the whole finding.

Method: delete every `dist/` in the tree (`pnpm clean:bundle`), then run each task.

**`type-check` does not need it.** 12/12 successful on a tree with no build output anywhere. Both
workspace packages point `types` at their source entry — `@extension/unshafted-core` at `index.mts`,
`@extension/ui` at `index.ts` — so TypeScript reads them directly. Nothing under `type-check`
*executes* a workspace package the way `lint` executes `pages/*/tailwind.config.ts`, which is what
forced `^ready` there. So it is declared without one, with a comment saying it was measured.

**`test` does need it**, because of `@extension/storage` specifically:

```
Error: Cannot find package '…/packages/storage/node_modules/@extension/unshafted-core/dist/index.mjs'
  imported from …/packages/storage/lib/impl/unshafted-policy-storage.ts
# tests 1
# pass 0
# fail 1
```

`storage` imports `unshafted-core` at **runtime**, which resolves through `main: dist/index.mjs` —
built output, not source. `unshafted-core`'s own suite imports source and passes on a clean tree
either way, so had only that one been checked, the dependency would have looked unnecessary.

The failure mode is worth naming: the import throws before any test registers, so the run reports
**1 failing test** instead of **13**. That reads like one broken case rather than a suite that never
executed — a fast way to spend an afternoon debugging the wrong thing. With `^ready` declared:

```
@extension/unshafted-core:test: # tests 77   pass 77   fail 0
@extension/storage:test:        # tests 13   pass 13   fail 0
```

**90 tests**, from a tree with every `dist/` deleted.

`cache: false`, matching `lint` and `type-check`. No remote cache is configured, so caching buys
nothing in CI while making a stale green possible if inputs were ever declared wrong.

## The workflow

`.github/workflows/test-and-type-check.yml`, on **`pull_request`** — never `pull_request_target`,
for the reason #25 and #26 established: `pull_request_target` refuses to check out the PR's code and
reads the base instead, so a workflow that tests code reports on a tree nobody proposed. Adding two
checks that had never run at all, under a trigger that would stop them running on the PR, would have
been a worse outcome than leaving them out.

Two jobs rather than one, so a red tick names which of the two failed without opening the log. They
share no state and take about the same time, so the parallelism is free. `permissions: contents:
read`, matching the three workflows #26 moved.

## Left for the repo owner

The checks exist but gate nothing until they are marked **required** in branch protection. That is a
repository settings change, not a repo change, so it is not in this PR.

Note also that the ghost checks called out in the standing context — a stale `eslint` job linting
`main`, 19 dead e2e jobs, a `dependabot` job from a deleted workflow — persist until `release`
reaches `main`, because `pull_request_target` workflows resolve from the default branch. The two
checks added here are unaffected; they run from the PR.

## Verification

From a tree with every `dist/` removed: `pnpm test` (**90 tests**, 77 + 13, all passing) and
`pnpm type-check` (12/12). Then `pnpm lint` (0 errors, 19/19) and `npx prettier --check` on a normal
tree. The workflow YAML was parsed and its job/step structure confirmed, and `turbo test --dry-run`
confirms `@extension/storage#test` now depends on `@extension/unshafted-core#ready`.

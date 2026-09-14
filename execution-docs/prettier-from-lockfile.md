# Run prettier from the lockfile, not from npm's mood

Closes #69. Branch `chore/prettier-from-lockfile`, cut from `release`, squash-merges back.

`chore/*` rather than `dev/*` deliberately: this is maintenance that belongs to no version, and
naming it `dev/v0.8.2` would claim it is the next release when it is not (`CLAUDE.md`, step 2).

## Why

`prettier.yml` runs formatting through `rutajdash/prettier-cli-action@v1.0.2`, whose entire body is
`npm install --global prettier@${{ inputs.prettier_version }}`, defaulting to `latest`. Since
`Prettier Check` became a **required** context on both `main` and `release` with
`enforce_admins: true`, CI formatting against whatever npm serves that morning is a liability: the
day prettier majors, every PR goes red against nobody's change, and that blocks dependabot,
`releasefix/*`, and the push that refreshes the privacy-policy gist CWS review reads.

The pin `prettier_version: 3.9.6` mitigates it today, but dependabot's `github-actions` ecosystem
bumps `uses:` refs and never a `with:` value, so it drifts by hand, silently, forever.

## What the work actually found

The issue scoped this as "add `format:check`, swap the workflow". Two things turned up that it did
not anticipate, and both change the shape of the change.

### 1. The required check has only ever read the repository root

`prettier.yml` passes `file_pattern: "*.{js,jsx,ts,tsx,json}"`. That glob is **root-anchored** —
prettier resolves `*` within a single path segment. Probed directly by planting two badly-formatted
files and running the CI pattern against them:

| probe | matched by CI pattern |
|---|---|
| `__probe_root.ts` | yes |
| `packages/shared/lib/__probe.ts` | **no** |

So nothing under `packages/`, `pages/`, `chrome-extension/` or `tools/` has ever been format-checked
in CI. The green tick has been reporting on the root directory alone. Moving to `pnpm format:check`
does not merely change *which prettier* runs — it is the first time the check covers the workspace,
which is the substance of the fix rather than a side effect of it.

### 2. `packages/unshafted-core` has 24 files prettier would rewrite, and rewriting them is wrong

Per-package counts, `prettier . --list-different --ignore-path ../../.prettierignore`:

| package | unformatted | had a `format` script |
|---|---:|---|
| `packages/unshafted-core` | **24** | yes |
| every other package | 0 | see below |

All 24 are HTML fixtures under `test/fixtures/site-policy/`, consumed byte-for-byte by
`readFileSync` in `site-policy.test.ts` and `policy-diff.test.ts`. The `stable/` pairs exist to
assert that **cosmetic** markup differences hash identically — the fixture names are the test plan:
`whitespace-minified`, `attribute-noise`, `entity-encoding`, `wrapper-divs`, `nav-markup`.

Running prettier over them normalises away precisely the differences under test. The pairs would
not fail — they would become trivially identical, and the suite would keep passing while testing
nothing. A silent vacuous green is worse than a red.

They are therefore added to `.prettierignore`, alongside the generated-corpus entries already there
for the same class of reason (the shape is the fixture's business, not prettier's).

This also explains why they were never noticed: CI could not see them (root-anchored), and
`pnpm format` delegates through turbo to the per-package scripts, so anyone running it locally on
`unshafted-core` would have quietly corrupted the fixtures.

### 3. Four workspace packages had no `format` script at all

`chrome-extension`, `packages/tsconfig`, `packages/vite-config`, `tools/corpus` — absent from
`pnpm format` entirely. All four measure clean today, so closing the gap costs nothing now and
stops it reopening. They get both scripts, not just `format:check`: a package that can be *checked*
but not *fixed* is a trap for whoever hits the red.

### 4. `chrome-extension` was invisible to `pnpm format` under a different name

Its script was called **`prettier`**, not `format`. The turbo task is `format`, so it never matched
and the package has never been formatted by `pnpm format`. Renamed (nothing referenced the old
name; `lint-staged` invokes the binary, and the husky pre-commit hook is `# disabled`).

That exposed `chrome-extension/manifest.js`, which prettier wants to rewrite — it is `tsc` output,
emitted from `manifest.ts` by the `ready` script, and **gitignored**. CI never sees it, so this
would have been red locally for anyone who had run a build and green in CI: precisely the
local/CI divergence this issue exists to remove. Prettier does not read `.gitignore`, so it is
named in `.prettierignore` explicitly.

### 5. Per-package tasks alone would have *lost* coverage at the root

The old root-anchored pattern was not checking nothing — it was checking the five root-level files
(`eslint.config.ts`, `package.json`, `tsconfig.json`, `turbo.json`, `vitest.setup.ts`). Turbo tasks
only run inside workspace packages, so a straight swap would have silently dropped them.

The root script therefore runs both halves:

```
turbo format:check --continue && prettier "*.{js,jsx,ts,tsx,json}" --check
```

Turbo first, deliberately: package files vastly outnumber root files, and `--continue` reports
*every* failing package in one run rather than stopping at the first. The root check is five files
and near-instant. All five measure clean today, so restoring the coverage cost nothing.

A *fully* recursive root check would additionally flag 13 unformatted files — `.gitguardian.yaml`
and the `.github/**` workflow YAML, none of which any check has ever read. That is a real gap but a
separate, more opinionated change, so it is filed rather than smuggled in here: #75.

## The change

- `format:check` in all 14 workspace packages, mirroring `format` with `--check` for `--write`.
- `format` added to the four that lacked it.
- Root `format:check` script + a `turbo` task, `cache: false` to match `lint`/`type-check`/`test`
  and for the reason turbo.json already records: no remote cache is configured, so caching buys
  nothing in CI while making a stale green possible. No `--cache-location` either — the root
  `format` uses a prettier cache because it is an interactive fix loop; a verdict should not.
- `prettier.yml` runs `pnpm format:check`, with the repo's own toolchain the way `lint`, `test`,
  `type-check` and `build` already do.
- `.prettierignore` excludes the site-policy fixtures, with the reasoning inline.
- The `prettier_version` pin and its hand-maintenance comment are deleted.

**`name: Prettier Check` is unchanged.** The check-run name is the job name and it is wired into
branch protection on both branches; renaming it stops the required context from ever reporting,
which blocks every merge.

## Status

- [x] Surveyed all 14 workspace packages; measured per-package unformatted counts
- [x] Established the CI pattern is root-anchored (probe files, since removed)
- [x] Confirmed the 24 fixtures are byte-sensitive by reading their consuming tests
- [x] `format:check` added to all 14 packages; `format` backfilled in four
- [x] `chrome-extension`'s `prettier` script renamed to `format`
- [x] Root script (turbo + root-level files) and `format:check` turbo task
- [x] `.prettierignore`: site-policy fixtures and generated `manifest.js`
- [x] `prettier.yml` swapped to `pnpm format:check`; `name: Prettier Check` preserved verbatim
- [x] Workflow setup steps aligned to the repo's own (`pnpm/action-setup@v6`,
      `actions/setup-node@v7`, `--frozen-lockfile --prefer-offline`) rather than the older
      versions first written
- [x] **Green path:** `pnpm format:check` → 14/14 tasks successful, root check clean, exit 0
- [x] **Red path verified in both halves,** because a check that cannot go red is worse than none:
      a bad file in `packages/shared` *and* in `chrome-extension` → both reported, exit 1; a bad
      root `tsconfig.json` → caught by the root half, exit 1
- [x] `pnpm format` (`--write`) run across all 14 — test fixtures untouched, tree unchanged
- [x] Context reports green on a real PR — #74. All five required contexts report exactly once
      and pass; the `Prettier Check` log confirms `Running format:check in 14 packages` plus the
      root half, so the green is the new coverage rather than a vacuous pass
- [x] Follow-up filed for the 13 unformatted root/`.github` YAML files — #75 (which also has to
      ignore `pnpm-lock.yaml`, generated and only in the list because nothing had ever looked)

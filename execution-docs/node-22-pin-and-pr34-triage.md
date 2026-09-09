# Node 22 pin, and the triage of Dependabot #34

**Base:** `release` at `569a2e5` · **Branch:** `chore/node-22-pin-and-safe-dev-bumps`
**Status:** complete. The pin and the three safe bumps are on one branch, verified together; the
remaining eight are held back with reasons below, each with an issue.

Two pieces of one problem. The React test harness (#33) pulled in `jsdom`, pinned to `^27` because
`jsdom@30` requires a Node the repo does not pin. Dependabot then opened #34 proposing `jsdom@30`
among eleven other bumps, so the pin has to move before that half of the PR is even installable —
and the rest of the PR turns out to be a much bigger ask than its title admits.

## Job A — move the Node pin to 22.22.2 *(complete)*

`jsdom@30` declares `engines.node: ^22.22.2 || ^24.15.0 || >=26.0.0`. `.npmrc` sets
`engine-strict=true`, which turns a mismatch into a failed install rather than a warning, so the
22.15.1 pin makes `jsdom@30` unbuildable rather than merely unsupported. This is the reason
`react-hooks-v7-findings.md` step 1 pinned `jsdom` to `^27` in the first place; that note is now
paid off.

Three files hold the pin and they have to move together:

| File | Role |
|---|---|
| `.nvmrc` | what `nvm use` picks, and what CI installs via `node-version-file` |
| `.node-version` | the same pin for `fnm`/`asdf`/Volta users, who do not read `.nvmrc` |
| `engines.node` in `package.json` | the floor `engine-strict` actually enforces at install time |

Nothing in `.github/workflows/` needed editing. `build-zip.yml`, `lint.yml` and
`test-and-type-check.yml` all read `node-version-file: '.nvmrc'`, so they follow the pin. The
fourth workflow that touches JS, `prettier.yml`, runs a marketplace action with no Node setup step
of its own and is unaffected.

**22.22.2 rather than the newest 22.x.** 22.23.2 is the current latest LTS of the Jod line and
would work equally well. The floor jsdom asks for is the smaller, more auditable change, and the
pin can move again on its own merits rather than as a side effect of a jsdom bump.

**`engines.node` moved from `>=22.15.1` to `^22.22.2` — a range, not a floor.** The first draft used
`>=22.22.2` on the reasoning that a floor refuses less than a pin does. Review pointed out that this
is the wrong shape, and it is right: `jsdom@30` declares `^22.22.2 || ^24.15.0 || >=26.0.0`, so a
bare `>=22.22.2` advertises Node 23, 24.0–24.14 and 25 as supported while `engine-strict` fails the
install on all of them. `jsdom@27` accepted every Node from 24 up, so widening the floor without
narrowing the ceiling made the advertised range *less* accurate than it had been.

Mirroring jsdom's disjoint range here was the other option and was not taken: it would tie the
project's own statement of what it supports to one devDependency's support matrix, needing an edit
every time jsdom ships. `^22.22.2` says the true thing instead — **this is a Node 22 project**, which
is already what `.nvmrc`, `.node-version` and every CI workflow say. It also keeps this file honest
against the `@types/node` decision below: holding the types at `^22` because they describe the
runtime, while `engines` advertised Node 26, would have been two halves of one PR disagreeing.

### Verification

Full chain on `node v22.22.2`, from a clean `pnpm install`:

| Check | Result |
|---|---|
| `pnpm install` | clean — **`pnpm-lock.yaml` unchanged**, so no dependency actually moved |
| `pnpm lint` | 19/19 tasks, 0 errors, 0 warnings |
| `pnpm type-check` | 12/12 tasks |
| `pnpm test` | **123 passed, 0 failed** (83 core, 16 side-panel, 13 storage, 5 options, 4 shared, 2 ui) |
| `npx prettier --check "**/*.{js,jsx,ts,tsx,json}"` | all matched files clean |
| `pnpm build` | succeeded |

ZIP audit on `unshafted-extension.zip`:

| Property | Expected | Actual |
|---|---|---|
| entries | 32 | 32 |
| size | ~1.8 MB | 1.8 MB |
| `manifest.json` version | 0.8.1 | 0.8.1 |
| permissions | unchanged | `storage, identity, tabs, activeTab, scripting, sidePanel` + `<all_urls>` |
| `content_scripts` | absent | absent |
| source maps | none | none |

The permissions line is verifiable a second way: `git diff origin/release` on this branch is exactly
three files, none of which the build reads, so the manifest is necessarily byte-identical to the one
`release` produces.

## Job B — triage of #34

#34 is titled "12 updates". That is true and it undersells it: ten of the twelve are majors in the
root `package.json`, and the remaining two are majors in `chrome-extension` and `packages/hmr`. It
is not a dependency sweep, it is four separate migrations and a handful of bumps sharing one branch.
Every verdict below was established by installing the bump and running the checks, not from release
notes.

| Bump | Verdict | Lands as |
|---|---|---|
| `globals` 16→17 | safe | this branch |
| `jsdom` 27→30 | safe, gated on job A | this branch |
| `lint-staged` 16→17 | safe, gated on job A | this branch |
| `esbuild` 0.25→0.28 | safe but pointless — nothing imports it | remove instead, #42 |
| `magic-string` 0.30→1.2 | safe but pointless — nothing imports it | remove instead, #42 |
| `@types/node` 22→26 | reject — overshoots the runtime | `dependabot.yml` ignore |
| `eslint-plugin-tailwindcss` 3→4 | reject — the plugin is dead weight | remove instead, #42 |
| `eslint` 9→10 + `@eslint/js` 9→10 | needs work — 4 new findings, 3 unmet peers | #40 |
| `vite` 6→8 | needs work — one type error, one unmet peer | #41 |
| `typescript` 5→7 | blocked — 17 tsconfigs, and typescript-eslint caps below it | #44 |
| `tailwindcss` 3→4 | blocked — a real framework migration | #43 |

### Safe, and landing

All three ship on one branch. `globals` is independent of the pin and was verified separately to
establish that, but splitting the PR on that distinction would buy nothing: the pin is landing in
the same change, so there is no world where `globals` needs to go in without it.

**`globals` 16→17** supplies only the `browser`, `es2020` and `node` predefined-globals maps that
`eslint.config.ts` spreads into `languageOptions`. All three exports survive the major and its own
floor is Node 18, so it depends on nothing else here. Verified deliberately **on the old 22.15.1
pin** to establish that: lint 19/19, type-check 12/12, 123 tests, prettier clean. It branches from
`release` directly.

**`jsdom` 27→30 and `lint-staged` 16→17** are the two the pin was actually holding, and the hold was
hard rather than advisory. With `engine-strict=true`, pnpm refuses `jsdom@30.0.1` by name:

```
ERR_PNPM_UNSUPPORTED_ENGINE  Your Node version is incompatible with "jsdom@30.0.1".
Expected version: ^22.22.2 || ^24.15.0 || >=26.0.0     Got: v22.15.1
```

`lint-staged@17` declares `>=22.22.1` and was blocked by the same wall without anyone noticing,
because nothing had tried to move it. Both are devDependencies that cannot reach the ZIP, so the
risk surface is the suites, and they pass: lint 19/19, type-check 12/12, 123 tests, prettier clean,
ZIP still 32 entries / 1.8 MB / manifest 0.8.1 / permissions unchanged / no source maps.

This branch **stacks on `chore/node-22.22.2`** rather than on `release`, because it cannot install
without it.

### Rejected, for reasons that outlast this PR

**`@types/node` 22→26 overshoots the runtime.** The types line describes the Node the code runs on;
pointing it at 26 while CI, `.nvmrc` and `engines` all say 22 means the compiler accepts APIs the
runtime does not have. It is a silent class of bug — nothing fails until something calls a Node 26
API in production, at which point it is a `TypeError` in a service worker rather than a red check.

This one is not a deferral, it is a standing rule, so it is written into `.github/dependabot.yml`
as an ignore on major bumps rather than rejected by hand every cycle — the same treatment `zod`
already gets, and for the same reason: the reasoning belongs next to the config that would have to
change for it to stop applying. The entry is tied to the pin, not to a bug, so it is lifted in
whatever change moves `.nvmrc` to a new major line.

**`eslint-plugin-tailwindcss` is never loaded.** It sits in `devDependencies` and appears nowhere in
`eslint.config.ts` — no import, no entry in the config array, no rules. It has been linting nothing.
Bumping it to 4 would additionally drag in a hard `tailwindcss: ^4.0.0` peer, coupling a dead plugin
to a migration the project has not decided to make. The right change is deletion.

**`esbuild` and `magic-string` are the same story** in `packages/hmr` and `chrome-extension`
respectively: declared, never imported anywhere in the workspace, left over from the
boilerplate this repo started from. Their bumps are harmless and equally pointless. Deleting all
three is one small chore that shrinks the install and removes three things Dependabot will otherwise
keep proposing forever.

### Needs real work

**`eslint` 9→10 (with `@eslint/js` 10, which peers `eslint: ^10.0.0` and cannot move separately).**
The feared blocker turned out not to be one: `typescript-eslint@8.70.0` peers
`eslint: ^8.57.0 || ^9.0.0 || ^10.0.0`, so the pinned 8 line already supports eslint 10. Two real
problems remain.

Three plugins do not declare eslint 10 and install with unmet peers — `eslint-plugin-jsx-a11y@6.10.2`
(caps at `^9`), `eslint-plugin-react@7.37.5` (caps at `^9.7`), and `eslint-plugin-import@2.31.0`
transitively. They do load and run; they are simply unvalidated against the major.

More concretely, eslint 10 promotes rules into `recommended` that fire on existing code — the same
shape as the `eslint-plugin-react-hooks` v7 situation in
[`react-hooks-v7-findings.md`](react-hooks-v7-findings.md), and worth treating the same way:

| Site | Rule | What it says |
|---|---|---|
| `packages/unshafted-core/lib/pdf.ts:285` | `preserve-caught-error` | rethrows without `cause` |
| `packages/unshafted-core/lib/pdf.ts:289` | `preserve-caught-error` | rethrows without `cause` |
| `packages/unshafted-core/lib/site-policy/discover.ts:252` | `no-useless-assignment` | `inLowerPage` reassigned to the value it already holds |
| `packages/unshafted-core/lib/site-policy/normalize.ts:207` | `no-useless-assignment` | `match` initialised to `null` before the `while` assigns it |

All four are small and all four are real — the `pdf.ts` pair drops the original error's stack on the
floor, which is a genuine debugging loss rather than a style complaint. Worth doing on its own
branch, where the fixes can be reviewed as fixes.

Noted in passing: npm marks `eslint@9.39.5` deprecated, so this is not indefinitely deferrable.

**`vite` 6→8** is closer than it looks. It builds, and the ZIP it produces is the expected 32 entries
at 1.7 MB with the manifest and permissions unchanged; all 123 tests pass; `vitest@5` already peers
`vite: ^6.4 || ^7 || ^8` and `@vitejs/plugin-react-swc@4.3.3` already peers `^8`. Two things block it:

1. **One type error.** `watchOption` in `packages/vite-config/lib/with-page-config.ts:26` passes
   `{ chokidar: { awaitWriteFinish: true } }`, and vite 8 removed the `chokidar` sub-option. It is
   dev-only (`IS_DEV ? … : undefined`), which is why the production build passes and only
   `tsc --noEmit` fails — and it means the fix has to be checked against `pnpm dev`, not just the
   build.
2. **One unmet peer.** `@laynezh/vite-plugin-lib-assets@2.1.3` caps at `vite ^7`.

### Blocked

**`typescript` 5→7** fails before any check runs — during `pnpm install`, in the `postinstall`
`tsc -b`:

```
tsconfig.json(3,3): error TS5102: Option 'downlevelIteration' has been removed.
tsconfig.json(4,5): error TS5102: Option 'baseUrl' has been removed. Use '"paths": {"*": ["./*"]}'
```

`downlevelIteration` lives in `packages/tsconfig/base.json`, which all 17 tsconfigs in the workspace
inherit, so this is a workspace-wide config migration rather than a bump. It also cannot move alone:
`typescript-eslint@8` peers `typescript: >=4.8.4 <6.1.0`, so the whole lint toolchain has to move
with it.

**`tailwindcss` 3→4** breaks all three page builds immediately:

```
[vite:css] [postcss] It looks like you're trying to use `tailwindcss` directly as a PostCSS plugin.
The PostCSS plugin has moved to a separate package … install `@tailwindcss/postcss`
```

That package is not in the PR, so #34 as written cannot build even in principle. Behind it sits the
actual v4 migration: the `@tailwind base/components/utilities` directives in `packages/ui/global.css`
become `@import "tailwindcss"`; the `postcss.plugins.tailwindcss` entries in all three
`pages/*/package.json` become `@tailwindcss/postcss`; the JS `tailwind.config.ts` files and the
`withUI` helper in `packages/ui/lib/with-ui.ts` move to CSS-first `@theme`; and
`packages/vite-config/tailwind.d.ts` declares `tailwindcss/lib/cli/build`, an internal path v4 does
not have.

### #34's own CI proves nothing about most of #34

Worth recording, because it is a trap. All three failing `[pull_request]` checks on #34 — build,
lint, tests-and-type-check — fail at the same line, and it is not any of the ten majors:

```
Run pnpm install --frozen-lockfile --prefer-offline
ERR_PNPM_UNSUPPORTED_ENGINE  Your Node version is incompatible with "jsdom@30.0.1".
Expected version: ^22.22.2 || ^24.15.0 || >=26.0.0     Got: v22.15.1
```

The branch dies at install, so nothing in it was ever compiled, linted or run. A reader glancing at
three red checks would conclude the PR is broken and be right for entirely the wrong reason: the
`tailwindcss`, `typescript` and `eslint` problems documented above are all *downstream* of a failure
that happens first. Move the pin and #34's CI would get further and fail differently — which is the
argument for landing job A before drawing any conclusion from a Dependabot re-run.

(Separately: the ~20 other red crosses on this PR are `pull_request_target` ghosts testing `main`,
including entire workflows that no longer exist in this repo — `Modular E2E Tests Matrix`,
`Run E2E Tests`. Read the `[pull_request]` runs only. This clears when `release` reaches `main`.)

### What #34 itself should become

Nothing in #34 can be merged as it stands — `tailwindcss` alone guarantees a broken build. Once #39
lands, Dependabot recalculates the group and reopens a much smaller PR: `@types/node` is now ignored
at major, three packages are proposed for deletion in #42, and the three safe bumps are already in.
What is left is four deliberate pieces of work, and #34 should be closed in favour of them rather
than left open as a group PR nobody can ever say yes to.

### Issues raised

| Issue | What |
|---|---|
| #40 | eslint 10 — four findings to pay down first; typescript-eslint 8 already supports it |
| #41 | vite 8 — the removed `chokidar` watch option, which only `tsc` catches |
| #42 | delete `eslint-plugin-tailwindcss`, `esbuild` and `magic-string`, which nothing imports |
| #43 | Tailwind 4 — CSS-first migration, and what becomes of `withUI` |
| #44 | TypeScript 7 — 17 tsconfigs, blocked on typescript-eslint upstream |
| #45 | noticed in passing: the options test fixture keys every help link to `'#'` |

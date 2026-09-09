# Node 22 pin, and the triage of Dependabot #34

**Base:** `release` at `569a2e5` · **Branches:** `chore/node-22.22.2`, then one `chore/*` per
landable group out of [#34](https://github.com/LuDraGa/unshafted/pull/34)
**Status:** job A complete and verified. Job B assessed in full; two branches cut, the rest
held back with reasons below.

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

`engines.node` moved from `>=22.15.1` to `>=22.22.2`. It is a floor, not a pin, so it does not
forbid the 24 or 26 lines — it only stops an install on a Node that `jsdom` has already said it
does not run on.

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
| `globals` 16→17 | safe | `chore/globals-17` |
| `jsdom` 27→30 | safe, gated on job A | `chore/jsdom-30-lint-staged-17` |
| `lint-staged` 16→17 | safe, gated on job A | same branch |
| `esbuild` 0.25→0.28 | safe but pointless — nothing imports it | remove instead |
| `magic-string` 0.30→1.2 | safe but pointless — nothing imports it | remove instead |
| `@types/node` 22→26 | reject — overshoots the runtime | held at `^22` |
| `eslint-plugin-tailwindcss` 3→4 | reject — the plugin is dead weight | remove instead |
| `eslint` 9→10 + `@eslint/js` 9→10 | needs work — 4 new findings, 3 unmet peers | own branch, later |
| `vite` 6→8 | needs work — one type error, one unmet peer | own branch, later |
| `typescript` 5→7 | blocked — 17 tsconfigs, and typescript-eslint caps below it | own effort |
| `tailwindcss` 3→4 | blocked — a real framework migration | own effort |

### Safe, and landing

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
API in production. It stays on `^22` and moves when the runtime moves, not before.

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

### What #34 itself should become

Nothing in #34 can be merged as it stands — `tailwindcss` alone guarantees a broken build. Once the
branches above land, Dependabot will recalculate the group and reopen a much smaller PR. The
remaining majors want to be closed out deliberately rather than left to accumulate in a rolling
group PR that nobody can ever say yes to.

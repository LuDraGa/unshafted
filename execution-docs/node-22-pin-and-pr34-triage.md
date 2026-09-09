# Node 22 pin, and the triage of Dependabot #34

**Base:** `release` at `569a2e5` · **Branches:** `chore/node-22.22.2`, then one `chore/*` per
landable group out of [#34](https://github.com/LuDraGa/unshafted/pull/34)
**Status:** job A complete and verified. Job B assessment in progress.

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

*In progress. Findings recorded below as each is established.*

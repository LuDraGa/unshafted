# React Compiler rule findings — #16

**Base:** `release` at `ff0f538` · **Branches:** `chore/react-testing-setup`, then
`fix/react-hooks-v7-findings`
**Status:** complete. All 15 findings resolved, rules promoted to `error`.

`eslint-plugin-react-hooks` 5→7, taken in the September sweep (#10), ships React Compiler rules that
did not exist in v5. They flag 15 findings in code this project never changed. Adopted as warnings
at the time so the sweep would not carry a behaviour change onto the branch in front of CWS review;
this is the paying-down.

The issue says 16. One cleared on its own in the sweep — both `react/use` findings went and one
`exhaustive-deps` is counted here that the issue's table did not list. The live number is 15, and
that is what this document works from.

## The findings

Counted from `pnpm lint` on `release` at `ff0f538`.

| Group | Sites | Rule | Shape of the fix |
|---|---|---|---|
| Side-panel data hooks | `useDomainAnalyses:35`, `useLocalAnalyses:48`, `useLivePolicyCheck:149` | `set-state-in-effect` | Key the result by its input; derive `status` during render |
| Derived UI state | `AnalysisWorkspace:169`, `Popup:583`, `Popup:589` | `set-state-in-effect` | Derive during render, or move into the handler that causes it |
| Async kickoff | `Popup:465`, `Popup:675`, `RunStatus:58` | `set-state-in-effect` | setState runs before the first `await`; move it behind one |
| Settings form sync | `Options:75` | `set-state-in-effect` | props-into-state reset — see below |
| Measurement | `SpotlightTour:39` | `set-state-in-effect` | Measures foreign DOM; no ref to attach |
| Suspense cache | `use-storage:50`, `:52` | `refs` | Ref read and written during render |
| Memoization | `Popup:843` | `preserve-manual-memoization` | Inferred dep is `currentAnalysis`; the list names two of its fields |
| Memoization | `ResultCards:547` | `exhaustive-deps` | `sourceWarnings` array literal rebuilt every render |

### `Options.tsx:75` is a live bug, not just a warning

The form's initial state honours `?provider=` — the deep link the popup opens when it sends someone
to set up a provider (`openOptions(withOnboarding = true)` builds
`options/index.html?onboarding=true&provider=…`).

```ts
const [form, setForm] = useState<FormState>({ provider: preferredProvider ?? settings.provider, … });

useEffect(() => {
  setForm({ provider: settings.provider, … });   // ← no preferredProvider
}, [settings.provider, …]);
```

`useEffect` runs after the first render whatever its deps say, so the effect immediately overwrites
`provider` with `settings.provider`. Line 55 is the only use of `preferredProvider` in the file and
nothing re-applies it. **The deep link is honoured for one frame and then reverts.**

The same effect also discards whatever the user has typed if settings change from another surface,
which is the usual reason this pattern is a smell rather than a style preference.

### The side-panel hooks show stale data for a frame

All three share a shape: an async fetch keyed on a parameter, with a synchronous reset at the top of
the effect. Because the reset happens in an effect rather than during render, there is one committed
render after the parameter changes where `status` is still `ready` from the *previous* parameter and
the data is still the previous parameter's. Deriving the status from the stored key removes the
frame rather than papering over it.

## Step 1 — a way to test React at all *(complete)*

The workspace had no React test infrastructure. Both existing suites run under
`node --import tsx --test` against pure modules — no DOM, no renderer — so there was no way to test
a props-into-state sync or a data hook before restructuring it.

Added at the root, following the precedent that already puts `tsx`, `eslint`, `prettier` and
`typescript` there and lets package scripts reach them: `vitest`, `jsdom`, `@testing-library/react`,
`@testing-library/dom`, `@testing-library/jest-dom`. All devDependencies, so none of it can reach
the ZIP or the review surface.

`jsdom` is pinned to `^27` deliberately. `jsdom@30` declares
`engines.node: ^22.22.2 || ^24.15.0 || >=26.0.0`, the repo pins 22.15.1 in `.nvmrc`, and
`engine-strict=true` in `.npmrc` turns that into a hard install failure rather than a warning. 27 is
the newest line that runs on the pinned Node.

Per package: a `vitest.config.ts` and a `test: vitest run` script, which turbo's existing `test`
task picks up with no change to `turbo.json`. Shared setup lives in the root `vitest.setup.ts`, which
each config reaches by relative path — the same way each package's `format` script reaches the root
`.prettierignore`.

**A package is wired only in the commit that gives it its first test.** `vitest run` fails on an
empty match, and the alternative (`passWithNoTests`) would let a suite that quietly stopped running
report green. So `packages/ui` is wired here, and the other four arrive with their tests in step 2.

`packages/ui/test/harness.test.tsx` proves the chain end to end — jsdom environment, RTL renderer,
jest-dom matchers, and the setup file's cleanup — so a broken harness fails in one obvious place
rather than inside whichever real suite happens to run first. It queries the rendered container
rather than a `data-testid`, so proving the harness costs the shipped component nothing.

Test dirs get their own `tsconfig.json`, as `packages/unshafted-core/test` already does. That makes
each a real project for `projectService` instead of spending the `allowDefaultProject` allowance,
which caps at 8 files and is already partly used by `packages/storage/test`.

**Checks after step 1:** 98 tests (83 core, 13 storage, 2 ui), type-check 12/12, lint 0 errors,
prettier clean.

## Step 2 — the fixes *(complete)*

Every finding was either restructured or, in one case, answered with a recorded suppression. Nothing
was silenced to make a number go down.

| Site | Rule | What happened |
|---|---|---|
| `useDomainAnalyses:35` | `set-state-in-effect` | Resolution tagged with its hostname; status derived |
| `useLocalAnalyses:48` | `set-state-in-effect` | Load tagged with domain + refresh token; status derived |
| `useLivePolicyCheck:149` | `set-state-in-effect` | Four states became one record tagged with its run |
| `Options:75` | `set-state-in-effect` | Sync effect deleted; normalising moved into `save` |
| `Popup:465` | `set-state-in-effect` | Key hash tagged with the key it hashes; derived |
| `Popup:583`, `:589` | `set-state-in-effect` | Walkthrough step keyed by analysis + onboarding step |
| `Popup:675` | `set-state-in-effect` | `onlyWhenEmpty` moved to the one caller that wanted it |
| `AnalysisWorkspace:169` | `set-state-in-effect` | Scope sheet keyed by the analysis it was opened for |
| `RunStatus:58` | `set-state-in-effect` | Effect owns its first read, with the guard it lacked |
| `use-storage:50`, `:52` | `refs` | Render-time ref moved onto the entry map |
| `Popup:843` | `preserve-manual-memoization` | Depend on `currentAnalysis`, not two of its fields |
| `ResultCards:547` | `exhaustive-deps` | Hoisted a stable empty array for the no-source case |

### The shape most of them shared

Nine of the eleven `set-state-in-effect` sites were the same mistake wearing different clothes: an
effect that reset state when its input changed. An effect runs *after* the render that scheduled
it, so every one of them showed a frame of the previous input's answer before correcting it. The fix
is always the same — store the result tagged with the input it answers for, and derive the reported
state by comparing that tag against the current input. Nothing to reset, so nothing to reset late.

### What actually changed for a user

- **The `?provider=` deep link works.** The popup's setup link opens
  `options/index.html?onboarding=true&provider=…`, and the removed effect overwrote `provider` from
  storage on the first commit after mount. Line 55 was the only reader of `preferredProvider` and
  nothing re-applied it, so the link was honoured for one frame and then reverted.
- **The options form no longer discards typing.** Any settings write re-seeded every field.
- **The side panel stops showing the last site's documents.** `useDomainAnalyses` spread its
  previous value into the loading state, so a new hostname was served the previous hostname's
  `domain` and `analyses` for the whole resolve.
- **The live check stops offering the previous page's reads.** Same cause, four states at once.
- **The syncing indicator stops flashing.** `hydrateHistoryFromDrive` raised it before deciding
  whether there was anything to sync, then dropped it in `finally` — every popup open with existing
  local history.
- **`hasTestedActiveKey` stops being briefly wrong.** The key hash was cleared a render late, so for
  one commit the old key's hash was compared against the new key.

Two changes were deliberately behaviour-preserving, and their tests say so by passing against both
versions: `use-storage`, which is behind the first paint of three surfaces, and the
"keep the list while re-reading the same domain" case in `useLocalAnalyses` — a domain change must
drop the list, a refresh of the same domain must not.

### The one suppression

`SpotlightTour:39` measures DOM this project does not own — the tour points at whatever carries
`data-onboarding-target`, anywhere in the document — so there is no ref to attach and no render-time
derivation available. It must be a *layout* effect, because `scrollIntoView` has to run before paint
or the spotlight draws in the wrong place and jumps. Only one path sets state synchronously,
`setRect(null)` when the target is missing; the rest already goes through `requestAnimationFrame`.
Pushing that branch into a frame as well would satisfy the rule by leaving a stale spotlight up for
a frame — the exact class of bug the rest of this change removed. Disabled on the line, with the
reasoning beside it.

### Tests

96 → 123. The new suites are the point of step 1, and each one was checked against the pre-change
code to confirm it actually fails there — a test that passes either way proves nothing.

| Suite | Tests | Fail against the old code |
|---|---:|---|
| `pages/side-panel/test/useDomainAnalyses` | 5 | 1 |
| `pages/side-panel/test/useLocalAnalyses` | 6 | 1 |
| `pages/side-panel/test/useLivePolicyCheck` | 5 | 1 |
| `pages/options/test/settings-form` | 5 | 3 |
| `packages/shared/test/use-storage` | 4 | 0, deliberately |

`useLivePolicyCheck`'s regression needed a render log rather than a DOM assertion. The stale frame
lives between the state change and the effect that corrected it, and `act()` collapses exactly that
gap — read only the settled DOM and the old code passes. The test asserts over every render instead.

`packages/popup` is wired for tests but has none yet: its two remaining findings were dependency-list
corrections, and rendering `Popup.tsx` would mean standing up storage, chrome APIs and a Supabase
session for no assertion those fixes need.

## Step 3 — promote the rules *(complete)*

`set-state-in-effect`, `refs` and `preserve-manual-memoization` are `error` in `eslint.config.ts`,
and the comment explaining the warning period is replaced by one explaining the promotion. Warnings
were right for a known debt with a ticket on it; once the debt is paid they only guarantee the next
one goes unnoticed, because nothing fails on a warning.

`react-hooks/exhaustive-deps` is deliberately left at `warn`, where `react-hooks/recommended` puts
it. It is a different kind of rule — heuristic, and wrong often enough that erroring on it blocks
legitimate work — and with the check now at zero problems, the first warning to appear will be
visible on its own. Worth revisiting, but not as part of this.

## Checks

123 tests (83 core, 13 storage, 16 side-panel, 5 options, 4 shared, 2 ui), type-check 12/12, lint 0
problems across 19 packages, prettier clean.

The production ZIP was rebuilt and re-audited against the 0.8.1 baseline: 32 entries, 1.8 MB,
manifest reads 0.8.1, permissions identical, no `content_scripts`, no source maps.

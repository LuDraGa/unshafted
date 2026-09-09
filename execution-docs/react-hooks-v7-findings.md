# React Compiler rule findings — #16

**Base:** `release` at `ff0f538` · **Branches:** `chore/react-testing-setup`, then
`fix/react-hooks-v7-findings`
**Status:** step 1 complete (test harness). Steps 2–3 pending.

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

## Step 2 — the fixes *(pending)*

One branch, `fix/react-hooks-v7-findings`, with a test alongside each behaviour change. There are no
installed users to hold compatibility for, so where current behaviour is wrong — `Options.tsx:75`
above — it gets corrected rather than preserved, and the test asserts the corrected behaviour.

`SpotlightTour:39` and `use-storage:50/52` may end as recorded suppressions rather than restructures;
both are decided on their merits in that branch and the reasoning goes next to the disable, not here.

## Step 3 — promote the rules *(pending)*

`set-state-in-effect`, `refs` and `preserve-manual-memoization` move from `warn` to `error` in
`eslint.config.ts`, and the comment explaining why they were warnings comes out with them. Nothing
holds the line otherwise: a warning in a check that already passes is a warning nobody sees.

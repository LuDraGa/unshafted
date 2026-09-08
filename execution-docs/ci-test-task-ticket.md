# Two packages have test suites that CI never runs

**Status:** Ticket — open, not started
**Date raised:** 2026-09-08
**Owner:** @LuDraGa
**Parent:** `execution-docs/dependency-sweep-2026-09.md`
**Related:** `execution-docs/zod-v4-upgrade-ticket.md` — this is the gap that made that bump unsafe

---

## The problem, in one sentence

`packages/unshafted-core` and `packages/storage` both define
`"test": "node --import tsx --test test/**/*.test.ts"`, but `turbo.json` has **no `test` task** and
no workflow invokes one — so those suites only ever run when someone remembers to run them.

## How it surfaced

Assessing zod 3→4 for the September sweep. The change alters the JSON Schema sent to OpenRouter, and
there is a test written for exactly that — `test/openrouter-response-format.test.ts`. The right
verification was "does that test still pass", and the answer was that CI has never had an opinion,
because CI does not run it.

The corpus and site-policy suites in `packages/unshafted-core/test/` are in the same position:
`policy-corpus.test.ts`, `policy-index.test.ts`, `site-policy.test.ts`, `core.test.ts`.

## What CI does run

`lint` (eslint), `prettier`, `e2e` and `e2e-modular` (Playwright, both browsers, nine scenarios),
`build-zip`, and CodeQL. So the extension is exercised end to end and the code is linted — but the
unit tests over schema, parsing and corpus logic are absent.

That gap is widest exactly where it hurts most: the analysis core, whose failures are quiet. A
broken schema does not crash, it just returns worse answers.

## The work

1. Add a `test` task to `turbo.json`. It needs no `dependsOn` beyond `^ready` for workspace types,
   and can cache on inputs.
2. Add a `test` script at the root that fans out via turbo.
3. Add a workflow that runs it. Follow the shape of `lint.yml` — but consider `pull_request` rather
   than `pull_request_target`, see the note below.
4. Confirm both suites actually pass on `release` today before wiring them to a required check.

## A related observation, worth its own decision

Every CI workflow here triggers on `pull_request_target` and checks out with bare
`actions/checkout` — no `ref`. Under `pull_request_target`, that resolves to the **base branch**,
not the PR head. So `lint`, `e2e`, `e2e-modular` and `build-zip` have been testing the target branch
on every PR, not the proposed change.

That is safe — it is the reason `pull_request_target` plus fork PRs is survivable at all, and
`actions/checkout@v7` now enforces it — but it means these checks have never validated a PR's
contents. A new test workflow that inherits the same pattern would inherit the same blind spot.

The conventional split is worth adopting: `pull_request` for anything that runs the PR's code, and
`pull_request_target` reserved for jobs that genuinely need base-repo secrets.

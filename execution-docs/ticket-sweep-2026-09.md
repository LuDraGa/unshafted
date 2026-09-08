# Ticket sweep — September 2026 (#14, #13, #11, #12)

**Worked:** 2026-09-08 · **Base:** `release` at `bb4f286`
**Status:** all four complete, four PRs open awaiting merge.

The issues left open after the September dependency sweep (#10), worked in risk order rather than
number order: the one that can act on its own first, then the one that was about to arrive on its
own, then the two real changes.

## Standing context

`v0.8.0` is **published** — tagged on `main` at `ad43546` via the merge `90e5f73`. The "why not now"
sections in #11 and #12 were written while that version sat in front of CWS review; it has since
shipped, so the hold expired and this was the window both changes wanted. No submission is open.

## Outcome

| # | What | Branch | PR | Result |
|---|---|---|---|---|
| 14 | Disarm `dependencies-auto-merge.yml` | `chore/disarm-dependabot-auto-merge` | #19 | Deleted, not gated |
| 13 | `setup-node` v4→v7, `first-interaction` v1→v3 | `chore/action-majors` | #20 | Bumped; inputs renamed |
| 11 | `pdfjs-dist` 4→6 + vendored worker | `fix/pdfjs-6-worker` | #21 | Done, verified in a browser |
| 12 | `zod` 3→4 | `chore/zod-4` | #24 | **Not bumped** — see below |

Each branches from `release` and squash-merges back, per `CLAUDE.md`. #19 and #24 both touch
`.github/dependabot.yml`; verified they auto-merge cleanly in either order.

## Decisions taken

- **#14 — deleted the workflow rather than gating it.** Dependabot sets `target-branch: 'release'`
  for both ecosystems, so a base-branch condition would leave a workflow that can never fire but
  still reads as armed. The reasoning moved into `.github/dependabot.yml` and the branch model.
- **#13 — kept `open-pull-requests-limit` at 5, stated explicitly.** The complaint in the ticket is
  that the cap was invisible, not that it was wrong. Raising it would put more PRs against the tree
  that goes to review.
- **#12 — did not bump zod.** The diff the ticket asked for settled the question against it.

## What the two real tickets turned out to be

**#11 was the trap it advertised.** Regenerating the worker from the same 6.3.289 legacy build was
the easy half; proving it was the point. Verified in a real browser with a real `Worker`, because
Node falls back to a fake worker and never performs the version handshake at all. Negative control
with the old worker reproduces exactly `The API version "6.3.289" does not match the Worker version
"4.10.38"` — while type-check, lint, build, the 32-entry ZIP and all 76 tests stayed green through
it. Two things settled on the way: `isEvalSupported` no longer exists in v6 (the eval path it gated
is gone, which is better for MV3 than the flag was), and the new `wasm/`/`iccs/` decoders sit behind
the render path, confirmed by instrumenting extraction and watching for wasm activity — none, so
nothing extra ships.

**#12 was not a dependency bump at all.** Under zod 4, `zod-to-json-schema` dispatches on
`_def.typeName`, which zod 4 renamed to `_def.type`, so it recognises nothing and emits one
`OpenAiAnyType` wildcard in place of the entire OpenAI contract — `quick_scan` 1,927 bytes → 321,
`deep_analysis` 6,621 → 324. No throw; the request still carries `strict: true`. zod 4's native
`toJSONSchema` is not the swap either: no `openAi` target, no `additionalProperties: false`, and
optional keys dropped from `required`, which strict mode rejects. So zod is held at 3, Dependabot
now ignores zod majors, and the response-format test gained a case pinning the contract's *shape*
rather than one keyword inside it. Migration split out to #23.

## Raised on the way

- **#22** — nothing keeps the vendored pdf.js worker in step with `pdfjs-dist`. #11 fixed the
  instance, not the class, and `pdfjs-dist` is a Dependabot target.
- **#23** — replacing the OpenAI schema emitter, the prerequisite for zod 4.
- **#25** — `lint`, `build-zip` and `prettier` use `pull_request_target`, which by design checks out
  the base rather than the PR. The `eslint` job logs `git checkout -B main refs/remotes/origin/main`
  and then lints `main`. **No check on a PR into `release` has ever tested that PR**, CodeQL aside.
  This is the largest finding of the sweep and it is not one of the four tickets.

## Notes

- #13 said `setup-node` appears in five workflows including `e2e`/`e2e-modular`. It does not: #10
  deleted those from `release`, leaving `lint.yml` and `build-zip.yml` as the whole set.
- #12 said the `zod-to-json-schema` peer range `^3.25.28 || ^4` meant "not a blocker". It means the
  library runs, not that it emits anything. It also fails `tsc` under v4 at `openrouter.ts:143`.
- #11's worry that the v5 notes read as though legacy builds were going away was unfounded —
  `legacy/build/pdf.mjs` still ships in v6 and the import path is unchanged.
- Because `pull_request_target` workflows resolve from the default branch, #14's deletion and #13's
  bumps are not exercised by CI and do not take effect until `release` reaches `main`. #14's
  `dependabot.yml` change is unaffected — Dependabot reads config from the target branch.

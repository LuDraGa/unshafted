# CI hygiene — workflow permissions and required status checks

**Worked:** 2026-09-13 · **Base:** `release` at `e1946db` · **Branch:**
`chore/workflow-permissions-and-required-checks`
**Status:** complete.

Two things that belong to no version and so went on a `chore/*` branch per `CLAUDE.md`: the last two
open CodeQL alerts, both `actions/missing-workflow-permissions`; and #37, which had been waiting on
the `v0.8.1` publish merge to clear a duplicate check context.

## Outcome

| Item | Result |
|---|---|
| CodeQL alert 15 — `sync-privacy-policy.yml` | `permissions: contents: read` |
| CodeQL alert 7 — `supabase-heartbeat.yml` | `permissions: {}` |
| #37 — required status checks | five contexts, on **both** `main` and `release` |
| Fallout of the above | `prettier.yml` pinned off `latest`; cycle step 3 became a PR |

---

## A. Workflow permissions

Both alerts were recorded at `refs/heads/main` @ `9d63cb1` — alert 15 on 2026-09-08, alert 7 back on
2026-05-19. The other five workflows already declare permissions; `codeql.yml`, `greetings.yml` and
`cancel-other-workflows-on-close.yml` declare them per-job, which satisfies the rule, which is why
only two alerts existed.

**`sync-privacy-policy.yml` → `contents: read`.** Checked before writing it:
`popsiclestick/gist-sync-action@v1.2.0` is a Docker action whose only auth input is `auth`, fed from
`secrets.GIST_PAT`. It never touches `GITHUB_TOKEN`. The sole `GITHUB_TOKEN` consumer in the file is
`actions/checkout@v7`, which needs exactly `contents: read`.

**`supabase-heartbeat.yml` → `{}`.** No checkout, no action that takes a token, two `run:` steps
doing `curl` against Supabase with the `SUPABASE_*` secrets. Nothing reads `GITHUB_TOKEN`, so an
empty block is the floor rather than a placeholder.

**Neither alert closes today.** CodeQL closes against the **default branch**, which is `main`. The
fix lands on `release`, so both stay open until the next publish merge carries it across — the same
shape as alert 8 in `codeql-triage-2026-09.md`. Expected; not a failed fix.

---

## B. #37 — required status checks

### The blocker was already clear

Confirmed, not re-derived: `main` and `release` carry byte-identical workflow trees after `9d63cb1`;
the `e2e` and `dependencies-auto-merge` workflows are gone from `main`; only `greetings.yml` and
`cancel-other-workflows-on-close.yml` still use `pull_request_target`, and neither reports a context
that collides with the test/build ones.

### Context table, read off #67 and #68

Both merged after `9d63cb1`, so no throwaway PR was needed.

| Context | #67 | #68 | Source job | Required? |
|---|---|---|---|---|
| `eslint` | ✅ ×1 | ✅ ×1 | `lint.yml` → `eslint` | **yes** |
| `type-check` | ✅ ×1 | ✅ ×1 | `test-and-type-check.yml` → `type-check` | **yes** |
| `test` | ✅ ×1 | ✅ ×1 | `test-and-type-check.yml` → `test` | **yes** |
| `build` | ✅ ×1 | ✅ ×1 | `build-zip.yml` → `build` | **yes** |
| `Prettier Check` | ✅ ×1 | ✅ ×1 | `prettier.yml` → job `prettier`, `name: Prettier Check` | **yes** |
| `Analyze (actions)` | ✅ ×1 | ✅ ×1 | `codeql.yml` matrix | no |
| `Analyze (javascript-typescript)` | ✅ ×1 | ✅ ×1 | `codeql.yml` matrix | no |
| `CodeQL` | ✅ ×1 | ✅ ×1 | CodeQL summary check | no |
| `greeting` | ✅ ×1 | ✅ ×1 | `greetings.yml` (`pull_request_target`) | no |
| `cancel` | ⏭ | ⏭ | `cancel-…-on-close.yml` (`pull_request_target`) | **never** |

Every candidate appears exactly once. Two traps recorded because both are silent:

- The prettier context is **`Prettier Check`**, not `prettier` — the job carries an explicit `name:`,
  and the check-run name is the job name. Requiring `prettier` wires in a context that never reports.
- `cancel` is `if: merged == false` on `closed`. It never reports on an open PR, so requiring it
  would block every merge permanently.

### `main` + `release`, not `main` only

`.github/dependabot.yml` targets `release` — npm and github-actions, daily, five PRs each. That is
the path where a bump breaking `type-check` or `test` used to merge on a glance. `main`-only
enforcement would not have touched it, because the publish PR merges a tree CWS has already reviewed
and published: valuable for the record and for the next cycle's branch point, but too late to
protect anyone.

### What that forced: step 3 of the cycle becomes a PR

Required status checks are evaluated against the SHA being pushed. A `--no-ff` merge commit made
locally is a brand-new SHA carrying no check runs, so the push is rejected — and adding a `push:`
trigger to the check workflows does **not** fix it, because the workflow that would produce those
checks only runs once the push has landed. Chicken-and-egg.

GitHub's *Create a merge commit* is the same `--no-ff`, still produces a push to `release`, and so
still fires the privacy-policy gist sync. `delete_branch_on_merge` handles the branch. One changed
verb in `CLAUDE.md` step 3; the first-parent history property is untouched.

### `Prettier Check` had to be defused before it could be required

`rutajdash/prettier-cli-action@v1.0.2` is a composite action whose entire body is
`npm install --global prettier@${{ inputs.prettier_version }}`, and `prettier_version` defaults to
**`latest`**. The workflow did not set it. Its last release was 2024-02-01.

So CI was formatting against whatever npm served that morning while the repo formats against its
lockfile. Harmless as an advisory check; as a *required* check on `release` with
`enforce_admins: true`, the first prettier major would have turned every PR red against nobody's
change — blocking dependabot, `releasefix/*`, and the push that refreshes the gist CWS review reads.
That is the Purple Nickel scenario arriving by way of a formatter.

Pinned to **3.9.6** — what `pnpm-lock.yaml:119` actually resolves, not the `^3.5.3` in
`package.json`. Dependabot's `github-actions` ecosystem bumps `uses:` refs and never a `with:` value,
so the pin is maintained by hand. Replacing the action with the repo's own prettier is the real fix
and is filed separately; it needs a `format:check` script, and all thirteen packages currently define
`format` as `prettier . --write` with no check variant.

### Settings applied

`strict: false` on both. "Require branches to be up to date" buys nothing when `main` only moves via
the publish merge, and would re-run all five whenever a base moved under an open PR.

`release` keeps `required_pull_request_reviews: null` — direct pushes are already blocked by the
checks, and adding a PR requirement would only improve the error message while making a larger
semantic change than the work called for.

`allow_deletions: false` re-verified on both branches after the `PUT`. That setting is the one the
branch-protection section of `CLAUDE.md` exists to protect, and a full-object `PUT` is exactly how it
gets dropped by accident.

---

## Raised from this work

- Replace `rutajdash/prettier-cli-action` with the repo's own prettier — #69
- `gist-sync-action` is missing its required `gist_description` input — #70

# Unshafted — working agreement

## Release flow

`main` is published versions only. It moves when a version goes live on the Chrome Web
Store, never before, and never by a direct push.

| Branch | Means |
|---|---|
| `main` | what users actually have installed — one merge commit per published version |
| `release` | what is, or is about to be, in front of Chrome Web Store review |
| `dev/vX.Y.Z` | the version trunk; transient, deleted after merge |
| `fix/*`, `hotfix/*`, `releasefix/*`, `chore/*` | transient work branches |
| `main_backup` | pre-rewrite history, archived, never merged |

**Everything branches from `release`.** Between cycles `release` equals `main`; during a
cycle it is correctly ahead. One rule, no exceptions.

### The cycle

1. **Branch.** Cut `dev/vX.Y.Z` from `release` at the start of the version. Everything for
   that version goes there — code, `cws/` snapshots, `execution-docs/`, version bumps. Push
   consistently; it is the working trunk for the version, not a holding pen for a finished
   one.
2. **Work branches squash.** `fix/*`, `hotfix/*`, `chore/*` and dependabot PRs branch from
   `release` and squash-merge back into it — one tidy commit each. Only the trunk path uses
   merges. `chore/*` is for maintenance that belongs to no version — dependency sweeps,
   tooling, CI — and it is deliberately not version-numbered, because naming it `dev/vX.Y.Z`
   would claim it is the next release when it is not.

   Dependabot PRs are work branches like any other, and a human merges them. There is no
   auto-merge and there should not be: an automatic merge into `release` changes what is in
   front of review without anyone deciding to, and it re-syncs the privacy-policy gist while
   doing it. The reasoning is kept in `.github/dependabot.yml`, next to the config that would
   have to change for it to matter.
3. **Merge the version.** Once the version is feature-complete, open a PR from `dev/vX.Y.Z`
   to `release` and merge it with GitHub's **Create a merge commit** — that is `--no-ff`, so
   the first-parent history below still holds. `delete_branch_on_merge` removes the branch.
   The merge is still a push to `release`, so it still refreshes the privacy-policy gist that
   CWS review actually reads (see below).

   It cannot be a local `--no-ff` merge pushed straight up any more, and the reason is worth
   knowing rather than rediscovering: `release` now requires status checks, those are
   evaluated against the SHA being pushed, and a merge commit made locally is a brand-new SHA
   with no check runs attached — so the push is rejected. Adding a `push:` trigger to the
   check workflows does not rescue it, because the workflow that would produce those checks
   only runs once the push lands. See *Required status checks* below.
4. **Submit, and tag what you submitted.** Submit that tree to CWS and tag it
   `submitted/vX.Y.Z-rN` — `-r1` for the first round, `-r2` after a rejection, and so on.
   The branch says what is *intended* for review; the tag says what was actually sent.
5. **Rejections land on `release`.** Anything review forces — a rewritten permission
   justification, listing copy, a manifest change, a rebuilt ZIP, a
   `cws/rejection-history.md` entry — goes on a `releasefix/*` branch and squash-merges into
   `release`. Resubmit, tag the next round.
6. **Publish, then merge.** When CWS publishes the version, open the PR from `release` to
   `main` and merge it with `--no-ff`. Tag `vX.Y.Z` on `main`. `release` and `main` now share
   ancestry and hold the same tree, so the next cycle branches from either.

### Why merges and not squashes

`git log main --first-parent` shows exactly one commit per version — the blocks view, for
seeing at a glance what changed between releases. Full `git log main` still contains every
underlying commit, so the per-change reasoning survives. And `git diff v0.8.0 v0.9.0` gives
the version-to-version comparison directly off the tags.

Squashing the trunk path would give the first of those and destroy the second. Worse, a
squash shares no ancestry with its source, so `release` and `main` would diverge a little
further every cycle. Merges keep them on one line of history — no reset step, no drift to
manage.

Squash is still right for `fix/*`, `hotfix/*`, `releasefix/*` and `chore/*`, whose internal
history is noise.

### Why `release` exists: the privacy-policy gist

`.github/workflows/sync-privacy-policy.yml` publishes `cws/privacy-policy.md` to the public
[gist](https://gist.github.com/LuDraGa/782b874f1e7fe0076fb2bf1509937e95). CWS review fetches
the gist, not the repo — and under this flow the policy change is sitting unmerged in the
`release` → `main` PR at exactly the moment review reads it. A stale gist is a Purple Nickel
citation waiting to happen (see `cws/rejection-history.md`).

So the workflow fires on push to **`main` or `release`**. The gist is one document and last
push wins; `release` is always at or ahead of `main` for this file, so the publish merge just
re-syncs identical content. Re-confirm gist and repo match immediately before hitting submit
anyway.

### Pushing to `main` directly

Don't — `main` is branch-protected against it. If something looks like it genuinely needs to
bypass the flow, **stop and say so explicitly before pushing, and get an OK.** Name what it
is and why the flow does not fit. Silence is not approval; neither is the change being small.

A change reaching `main` outside the publish merge also rewrites the live gist if it touches
`cws/privacy-policy.md`, so it is never only a repo change.

### Branch protection: what is actually configured

This exists because the question *"will merging the publish PR delete `release`?"* gets re-litigated
roughly every time someone looks at the flow. The answer is **no**, and here is the configuration it
rests on rather than the reassurance.

The repository has **no rulesets**. Protection is classic branch protection, on two branches:

| | `main` | `release` |
|---|---|---|
| Deletion | blocked (`allow_deletions: false`) | blocked (`allow_deletions: false`) |
| Force push | blocked | blocked |
| Applies to admins | yes (`enforce_admins: true`) | yes (`enforce_admins: true`) |
| PR required to push | **yes** | no rule — but see below: required checks block a direct push anyway |
| Required status checks | `eslint`, `type-check`, `test`, `build`, `Prettier Check` | same five |

Repository-wide, **`delete_branch_on_merge` is `true`**. Every merged PR has its head branch deleted
automatically, which is what you want for `fix/*`, `releasefix/*`, `chore/*` and dependabot branches
— nobody should be cleaning those up by hand.

**The publish merge is the case that looks dangerous.** Its PR is `release` → `main`, so the head
branch *is* `release`, and repo-wide auto-delete would otherwise take it. It does not, because GitHub
skips branches protected against deletion. `release` surviving the publish merge is therefore not a
property of the flow or of anyone remembering a flag — it is `allow_deletions: false` doing one
specific job.

**Which is exactly why that setting is load-bearing and must not be relaxed.** If deletion protection
on `release` is ever turned off, the next publish merge deletes the branch, and GitHub silently
retargets every open PR that was based on `release` to the default branch — `main`. Mid-cycle `main`
carries a different tree, so those PRs then show a diff nobody wrote, against a base nobody chose, and
the retarget produces no notification. The damage is not the missing branch, which is one `git push`
away; it is the open work quietly re-pointed.

**This is not hypothetical.** It happened on 2026-09-08, before the protection existed: the publish
merge deleted `release`, and PR #10 — the dependency sweep — was silently retargeted onto `main`,
which would have put unreviewed dependency changes into the branch whose entire meaning is *what users
actually have installed*. Protection was added the same day. That is the incident this section exists
to stop someone from re-enabling.

If it ever does recur, recreate the branch with `git push origin origin/main:refs/heads/release` and
put each retargeted PR back with `gh pr edit <n> --base release`. Note also that force-pushing
`release` now requires lifting protection deliberately — which is the point.

Nothing here needs taking on trust. Re-check it in full with:

```bash
gh api repos/LuDraGa/unshafted --jq '{default_branch,delete_branch_on_merge}' && gh api repos/LuDraGa/unshafted/rulesets && for b in main release; do gh api "repos/LuDraGa/unshafted/branches/$b/protection" --jq "{branch:\"$b\",deletions:.allow_deletions.enabled,force_push:.allow_force_pushes.enabled,admins:.enforce_admins.enabled,pr_required:has(\"required_pull_request_reviews\"),checks:(.required_status_checks.contexts // \"none\"),strict:.required_status_checks.strict}"; done
```

Verified 2026-09-13. If a future check disagrees with the table above, the settings changed — fix the
table, and ask whether the change was deliberate.

### Required status checks

Both branches require the same five contexts, `strict: false`. Turned on 2026-09-13, closing #37.

```
eslint   type-check   test   build   Prettier Check
```

**They are job names, not workflow names.** `lint.yml` reports as `eslint`, `build-zip.yml` as
`build`, and `test-and-type-check.yml` as two, `type-check` and `test`. The one that catches people
is `prettier.yml`, whose job carries an explicit `name: Prettier Check` — requiring the string
`prettier` would wire in a context that never reports, and nothing would merge again. Read the names
off a real PR's check list, never off the filenames.

Verified on #67 and #68, the two PRs merged after the `v0.8.1` publish (`9d63cb1`): each of the five
appears exactly once, green. The duplicate `eslint` that held #37 open for a cycle is gone, because
`main` no longer carries the `pull_request_target` copies that produced it. The two
`pull_request_target` workflows that remain report as `greeting` and `cancel` and collide with
nothing. `cancel` must never be required — it is `if: merged == false` on `closed`, so on an open PR
it never reports at all, and a required context that never reports is a permanent block.

**`release` is where this actually bites.** `.github/dependabot.yml` targets `release`, daily, npm
and github-actions. Before this, a bump that broke `type-check` or `test` merged on a glance at a
list that looked green. `main`-only enforcement would never have touched that path: the publish PR
merges a tree CWS has already reviewed and shipped, so gating it protects the record and the next
cycle's branch point, not the users. Gating `release` is the half that catches things while they are
still cheap.

The cost is step 3 of the cycle, which can no longer be a locally-merged `--no-ff` pushed straight
up — see the step itself for why, and for what it became.

`strict: false` is deliberate. "Require branches to be up to date before merging" buys nothing here:
`main` only moves via the publish merge, and enabling it would re-run all five every time a base
moved under an open PR.

**CodeQL is deliberately not required.** `Analyze (actions)`, `Analyze (javascript-typescript)` and
`CodeQL` pass whether or not there are findings — all three were green on #67 and #68 while alerts 7
and 15 stood open. They gate *that the scanner ran*, which is not the property anyone wants. The
alert list is the real guard. Note also that CodeQL records against the **default branch**, so a
workflow fix landing on `release` does not close its alert until the publish merge carries it to
`main`; that gap is expected, not a failed fix.

**The escape hatch, because `enforce_admins: true` means there is no implicit one.** You cannot click
past your own red check, and the privacy-policy push now sits behind these five. If a required
context goes red for reasons unrelated to the change — `Prettier Check` is the likeliest candidate,
see the comment in `prettier.yml` — lift admin enforcement for the one merge and put it straight
back:

```bash
gh api -X DELETE repos/LuDraGa/unshafted/branches/main/protection/enforce_admins
# merge, then immediately:
gh api -X POST   repos/LuDraGa/unshafted/branches/main/protection/enforce_admins
```

Those are dedicated endpoints and touch nothing else. Do **not** reach for a full
`PUT .../protection` to do it: that replaces the entire object, and a field dropped there is exactly
how `allow_deletions: false` stops being true — which the section above exists to prevent.

## Conventions

- **Execution docs.** Significant or long-tail work gets a doc in `execution-docs/`, named for the
  version or the feature (`v0.9-ux-revamp-execution.md`, `site-policy-part4-analysis.md`), kept
  current with completion status as the work proceeds. An execution doc tracks *work in progress* —
  what is being done, and how far along it is.
- **Tickets are GitHub issues, not files.** Anything deferred, held back, or noticed-in-passing goes
  to `gh issue create` — not a `*-ticket.md` in `execution-docs/`. A ticket is a thing someone picks
  up later, so it belongs where the backlog is visible, assignable and closable. Execution docs link
  out to the issues they raised; they do not restate them. (Two `*-ticket.md` files predate this
  convention and are left alone.)
- **`cws/` is the source of truth** for the store dashboard, which is not diffable. A dashboard
  change and its snapshot update belong in the same commit. See `cws/README.md`.
- **Commit messages** name the goal, not the files. One holistic message per change, written like a
  human reflecting on what they built. No AI attribution.

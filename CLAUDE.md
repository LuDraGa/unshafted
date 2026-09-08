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
3. **Merge the version.** Once the version is feature-complete, merge `dev/vX.Y.Z` into
   `release` with `--no-ff`, then delete the branch. Pushing `release` is what refreshes the
   privacy-policy gist that CWS review actually reads (see below).
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

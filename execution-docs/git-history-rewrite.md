# Git history rewrite and branch model

**Status:** complete — both live
**Date:** 2026-09-08
**Result:** the rewritten history is `main`; the old history is preserved as `main_backup`
**Backup:** tag `backup/pre-rewrite-main` → `8f3ac27f`

## Why

The repo was started from
[chrome-extension-boilerplate-react-vite](https://github.com/Jonghakseo/chrome-extension-boilerplate-react-vite).
Its 733 commits are still in the history, so GitHub's contributor graph credits ~60 people
who never worked on Unshafted. Separately, the project's own commits are split across two
of my identities, 12 carry Claude co-author trailers, and 51 have essay-length bodies that
belong in `execution-docs/`, not in `git log`.

## Shape of the history

| | |
|---|---|
| Total commits before | 837 |
| Template commits (`6fde1ac` and older) | 733 |
| Unshafted commits (`ce2ffdd`..`8f3ac27`) | 104 |
| Merge commits in the Unshafted range | 0 |

Zero merges means the 104 can be replayed tree-by-tree with `git commit-tree` — every
rewritten commit reuses the original's exact tree, so the final tree is bit-identical to
`main` and no conflict is possible.

## What the rewrite does

1. **Collapse the template to one root commit.** A new orphan commit carrying `6fde1ac`'s
   tree, authored by LuDraGa, messaged as the template import. 733 → 1.
2. **Unify authorship.** `waldoBear <waldoBear002@gmail.com>` (59 commits) →
   `LuDraGa <abhirooprasad@gmail.com>`. Both author and committer, dates preserved.
3. **Attribute the template properly.** The root commit names the upstream repo, the
   commit it was imported at, and its MIT licence and authors. `LICENSE` stays in the tree
   unchanged.
4. **Strip Claude attribution.** `Co-Authored-By: Claude*` and `Generated with [Claude Code]`
   trailers removed from the 12 commits carrying them.
5. **Trim bodies to 3–5 lines.** 51 commits have bodies longer than that. Subjects are kept
   verbatim — they already read the way the working agreement asks for.

## Verification

- [x] `git diff clean_main main` is empty — trees bit-identical
- [x] `git shortlog -sne clean_main` → `105  LuDraGa <abhirooprasad@gmail.com>`, nobody else
- [x] no Claude trailers anywhere (`Co-authored-by` / `Generated with` / 🤖 → 0 hits)
- [x] every body ≤ 5 lines, except the root commit's 8-line upstream attribution
- [x] commit count = 105 (1 template root + 104)

## Progress

- [x] Backup tag cut
- [x] 51 bodies trimmed to ≤ 5 lines; the other 53 already were
- [x] History replayed with `git commit-tree`, reusing each original tree
- [x] `clean_main` created and verified — root `cf3608b`, tip `ad43546`
- [x] Old history pushed to `origin/main_backup` before anything was overwritten
- [x] Force-pushed over `origin/main` with `--force-with-lease`; local `main` moved to match

Note: `origin/main` was three commits behind local when this ran (it sat at `050524f`).
`main_backup` was cut from the local tip, so it carries the full old history including
those three. None of them touched `cws/privacy-policy.md`, so the gist workflow's path
filter kept it from firing on the force-push.

Three stale branches — `UX_Rework`, `feat/site-policy-corpus-capture`,
`feature/onboarding-wizard` — were all fully merged into the old `main` before the rewrite,
so their work is in the new history too. Deleted, local and remote; the tips
(`c86623e`, `ccb3a76`, `205ffda`) stay reachable through `main_backup`. A local-only
`consolidation` branch (`4a52216`) was merged as well and went the same way.

Anyone else holding a clone of this repo has a history that no longer matches the remote
and has to re-clone.

---

# Part 2 — the branch model

The rewrite cleaned up the past. This settles how the repo moves forward. The full rules
live in `CLAUDE.md`; this records what changed and why.

## Why `dev` had to go

The old flow used `dev` as a marker for "the tree currently in front of CWS review". Two
problems, one of them armed:

1. **The name needed a disclaimer.** `CLAUDE.md` had to spend a sentence saying "`dev` is
   never worked on directly", because every reader's instinct is that `dev` is a git-flow
   integration branch. A name that needs a warning label is the wrong name.
2. **Leftover boilerplate automation believed the other definition.** Three inherited files
   still treated `dev` as the integration branch, and `.github/workflows/auto-change-prs-branch.yml`
   was the dangerous one: on any PR opened against `main` it rewrote the base to `dev`. Under
   this flow that silently hijacks the publish PR. It ran on `pull_request_target`, which
   executes the workflow file from the **base** branch — so deleting it anywhere but `main`
   would have left it live on exactly the branch it hurt.

## The model

| Branch | Means |
|---|---|
| `main` | published versions only — one merge commit per version, branch-protected |
| `release` | what is, or is about to be, in front of CWS review |
| `dev/vX.Y.Z` | the version trunk; transient, deleted after merge |
| `fix/*`, `hotfix/*`, `releasefix/*` | transient work branches |
| `main_backup` | pre-rewrite history, archived, never merged |

Everything branches from `release`. Between cycles it equals `main`; during a cycle it is
correctly ahead. One rule, no exceptions.

## Merges on the trunk, squashes on the leaves

The goal was two things at once: `main` readable as one block per version, without losing
the per-change reasoning underneath. Squashing gives the first and destroys the second, and
because a squash shares no ancestry with its source, `release` and `main` would drift
further apart every cycle.

So `dev/vX.Y.Z` → `release` and `release` → `main` both merge with `--no-ff`, and
`vX.Y.Z` is tagged on `main` at publish. That gives:

- `git log main --first-parent` — one commit per version, the blocks view
- `git log main` — every underlying commit, reasoning intact
- `git diff v0.8.0 v0.9.0` — version-to-version comparison straight off the tags

`fix/*`, `hotfix/*` and `releasefix/*` squash into `release`; their internal history is
noise. Submissions are tagged `submitted/vX.Y.Z-rN`, one per review round — the branch says
what is *intended* for review, the tag says what was actually sent.

## Config changed

| File | Change |
|---|---|
| `.github/workflows/auto-change-prs-branch.yml` | **deleted** — rewrote PRs targeting `main` to `dev` |
| `.github/workflows/sync-privacy-policy.yml` | triggers on `[main, release]` |
| `.github/workflows/codeql.yml` | runs on `[main, release]` |
| `.github/dependabot.yml` | `target-branch` → `release` |
| `.github/pull_request_template.md` | PRs target `release`; only the publish merge targets `main` |
| `CLAUDE.md` | release-flow section rewritten |

Repo settings: `main` protected (PR required, 0 approvals since this is a solo repo, no
direct or force pushes, admins included). `required_linear_history` is deliberately **off** —
GitHub's linear-history rule would reject the `--no-ff` merges the model depends on.
Merge-commit is the primary merge button, squash kept for the leaf branches, rebase off,
head branches auto-delete on merge.

## Known state, accepted

`main` currently holds 0.8.0, which is still in CWS review — so `main` is ahead of what is
published, which is the one thing the model exists to prevent. Rolling it back to the 0.7.1
boundary (`bb15830`, 2026-05-19) was considered and declined: the model starts fresh at
0.9.0 instead.

Two consequences to expect. There will be no `v0.8.0` merge block in the `--first-parent`
view, because `release` already equals `main` — the blocks view genuinely begins at 0.9.0.
And the `v0.8.0` tag on `ad43546` anticipates the publish rather than recording it; if review
forces changes, move it to whatever actually ships.

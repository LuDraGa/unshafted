# Git history rewrite — `clean_main`

**Status:** complete — live on `main`
**Started:** 2026-09-08
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

## Still open

The three other remote branches — `UX_Rework`, `feat/site-policy-corpus-capture`,
`feature/onboarding-wizard` — still sit on the old history and now share no ancestry with
`main`. They are reachable through `main_backup`. Each needs its unique commits replayed
onto the new trunk, or deleting if dead.

Anyone else holding a clone of this repo has a history that no longer matches the remote
and has to re-clone.

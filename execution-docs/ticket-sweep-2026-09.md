# Ticket sweep — September 2026 (#14, #13, #11, #12)

**Started:** 2026-09-08 · **Branch base:** `release` (at `bb4f286`, one ahead of `main`)
**Status:** in progress

The four issues left open after the September dependency sweep (#10), worked in risk order rather
than number order: the one that can act on its own first, then the one that is about to arrive on
its own, then the two real changes.

## Standing context

`v0.8.0` is **published** — tagged on `main` at `ad43546`, merged via `90e5f73`. The "why not now"
sections in #11 and #12 were written while that version was in front of CWS review; that review has
closed, so the hold has expired. There is no open submission, which is exactly the window these two
changes wanted.

## Order and status

| # | What | Branch | Status |
|---|---|---|---|
| 14 | Disarm `dependencies-auto-merge.yml` | `chore/disarm-dependabot-auto-merge` | not started |
| 13 | `setup-node` v4→v7, `first-interaction` v1→v3, PR-cap decision | `chore/action-majors` | not started |
| 11 | `pdfjs-dist` 4→6 + regenerate vendored worker | `fix/pdfjs-6-worker` | not started |
| 12 | `zod` 3→4 + JSON Schema diff | `chore/zod-4` | not started |

Each branches from `release` and squash-merges back, per `CLAUDE.md`.

## Open decisions

- **#14:** delete the workflow outright, or gate it on base branch. Pending.
- **#13:** `open-pull-requests-limit` — raise it, or leave the default 5 and document it. Pending.

## Notes as they come up

- #13 says `setup-node` appears in five workflows including `e2e` and `e2e-modular`. It does not:
  the only two usages are `lint.yml:11` and `build-zip.yml:11`. No e2e workflows exist in this repo.

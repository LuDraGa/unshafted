# Unshafted — working agreement

## Release flow

Every version ships on its own branch. Nothing lands on `main` except a published release.

Three branch roles:

| Branch | Means |
|---|---|
| `release/vX.Y.Z` | the working trunk for the version in progress |
| `dev` | what is in front of Chrome Web Store review right now |
| `main` | what users actually have installed |

1. **Branch.** Cut `release/vX.Y.Z` from `main` at the start of the version. Everything for that
   version goes there — code, `cws/` snapshots, `execution-docs/`, version bumps. Push
   consistently; the branch is the working trunk for the version, not a holding pen for a finished
   one.
2. **PR.** Open the PR to `main` once the version is feature-complete. It stays open through the
   whole Chrome Web Store round.
3. **Stage on `dev` before submitting.** Push the release branch to `dev` when the build is ready to
   go to CWS. This is what refreshes the privacy-policy gist that review actually reads (see below),
   and it marks the exact tree that was submitted. `dev` is never worked on directly — it only ever
   receives the release branch.
4. **Publish while the PR is open.** Submit the build to CWS from that tree. Anything review
   forces — a rewritten permission justification, listing copy, a manifest change, a rebuilt ZIP,
   a `cws/rejection-history.md` entry — is pushed to the release branch, which updates the same PR;
   push it on to `dev` too if it touched `cws/privacy-policy.md`. The PR is the record of what it
   took to get published, not just what was written before submitting.
5. **Merge on approval only.** When CWS publishes the version, squash-and-merge to `main`. Subject
   line carries the version, body carries the changelist:

   ```
   0.9.0 — <what this release is, in the house voice>

   - <change>
   - <change>
   ```

**`main` means published.** A commit on `main` that is not live on the Chrome Web Store is a bug in
the process. Read `main` to know what users actually have.

### Why `dev` exists: the privacy-policy gist

`.github/workflows/sync-privacy-policy.yml` publishes `cws/privacy-policy.md` to the public
[gist](https://gist.github.com/LuDraGa/782b874f1e7fe0076fb2bf1509937e95). CWS review fetches the
gist, not the repo — and under this flow the policy change is sitting unmerged in the PR at exactly
the moment review reads it. A stale gist is a Purple Nickel citation waiting to happen (see
`cws/rejection-history.md`).

So the workflow fires on push to **`main` or `dev`**, and step 3 is what keeps review honest. The
gist is one document and last push wins; `dev` is always at or ahead of `main` for this file, so the
approval squash-merge just re-syncs identical content. Re-confirm gist and repo match immediately
before hitting submit anyway.

### Pushing to `main` directly

Don't. If something looks like it needs to bypass the branch — a hotfix, a docs-only tweak, a
one-line fix — **stop and say so explicitly before pushing, and get an OK.** Name what it is and why
the branch does not fit. Silence is not approval; neither is the change being small.

This applies to `git push origin main`, commits made while `main` is checked out, and anything that
would fast-forward `main` outside the squash-merge in step 5. A direct push to `main` that touches
`cws/privacy-policy.md` also rewrites the live gist, so it is never only a repo change.

## Conventions

- **Execution docs.** Significant or long-tail work gets a doc in `execution-docs/`, named for the
  version or the feature (`v0.9-ux-revamp-execution.md`, `site-policy-part4-analysis.md`), kept
  current with completion status as the work proceeds.
- **`cws/` is the source of truth** for the store dashboard, which is not diffable. A dashboard
  change and its snapshot update belong in the same commit. See `cws/README.md`.
- **Commit messages** name the goal, not the files. One holistic message per change, written like a
  human reflecting on what they built. No AI attribution.

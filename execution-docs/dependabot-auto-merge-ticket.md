# dependencies-auto-merge.yml is armed against `release` and inert only by accident

**Status:** Ticket — open, not started. **Latent, not active** — see "What is holding it back".
**Date raised:** 2026-09-08
**Owner:** @LuDraGa
**Parent:** `execution-docs/dependency-sweep-2026-09.md`
**Kept out of:** the September dependency sweep — it is a policy change, not a dependency bump

---

## The problem, in one sentence

`.github/workflows/dependencies-auto-merge.yml` will approve and auto-merge non-major Dependabot PRs
into whatever branch they target — and since the retarget, that branch is **`release`**, the tree
that goes in front of Chrome Web Store review.

## What is holding it back

Nothing deliberate. The workflow ran on all seven of the current PRs and failed every time, at the
approve step:

```
failed to create review: GraphQL: GitHub Actions is not permitted to approve pull requests.
(addPullRequestReview)
```

That is a repository/organisation setting, unrelated to the branch model, and it fails *before* the
merge step is reached. Flip that setting on for any other reason and the merge path opens.

A second guard happens to hold too: the merge step is gated on
`update-type != 'version-update:semver-major'`, and both grouped npm PRs contain majors, so they
would be skipped. But that is a property of *these* PRs, not of the workflow. The next grouped
patch-and-minor-only run would sail through.

## Why it matters here specifically

Under the branch model in `CLAUDE.md`, `release` is not a staging area — it is the submitted tree.
An automatic merge into it during an open CWS review changes what is in front of reviewers without
anyone deciding to. Pushing `release` also re-syncs the privacy-policy gist that review actually
reads, so an automated merge is never only a repo change.

The workflow was written when Dependabot targeted `dev`, where auto-merge was reasonable. The
retarget changed what it means without changing what it does.

## Options

1. **Disarm it.** Delete the workflow, or gate the merge step on the base branch not being
   `release`. Simplest, and matches "everything squash-merges into `release` deliberately".
2. **Retarget auto-merge.** Let it run only when the base is a `dev/vX.Y.Z` trunk.
3. **Leave it and rely on the approval setting.** Not recommended — the protection is incidental,
   undocumented, and one settings change away from evaporating.

Preference is (1) or (2). Whichever is chosen, write the reasoning into the workflow so the next
person to read it knows the constraint is deliberate.

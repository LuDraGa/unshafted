# actions/setup-node v4 → v7 (and first-interaction v1 → v3)

**Status:** Ticket — open, not started
**Date raised:** 2026-09-08
**Owner:** @LuDraGa
**Parent:** `execution-docs/dependency-sweep-2026-09.md`
**Kept out of:** the September dependency sweep — it was not one of the seven PRs

---

## The problem, in one sentence

`actions/setup-node@v4` is three majors behind (v7.0.0 shipped 2026-07-14) and Dependabot has not
raised it, because **its default `open-pull-requests-limit` is 5 and all five github-actions slots
were taken** by the checkout, upload-artifact, codeql-action, action-setup and fetch-metadata PRs.

## Why it matters more than the version number suggests

The sweep just moved four actions onto the node24 runtime. `setup-node@v4` is now the odd one out in
five workflows — `build-zip`, `e2e`, `e2e-modular`, `lint`, and wherever else it appears. That is not
a compatibility break: v4 still runs. It is a consistency and support-window question, and it is the
kind of drift that is cheap to fix now and annoying later.

`actions/first-interaction@v1` in `greetings.yml` is in the same position — v3.1.0 is current.

## The mechanism worth remembering

Closing PRs #2–#6 frees the five slots, so Dependabot will raise `setup-node` and
`first-interaction` on its next daily run whether or not this ticket is actioned. The choice is
between doing it deliberately here or receiving two more PRs against `release` shortly.

Raising `open-pull-requests-limit` in `.github/dependabot.yml` would prevent this class of silent
queueing, at the cost of more open PRs at once. Worth a decision either way rather than leaving the
cap invisible.

## The work

1. Bump `actions/setup-node@v4` → `@v7` across the workflows that use it.
2. Bump `actions/first-interaction@v1` → `@v3` in `greetings.yml`.
3. Confirm `node-version-file: '.nvmrc'` and `cache: pnpm` still behave as expected under v7 — both
   are the inputs this repo depends on.
4. Decide on `open-pull-requests-limit` and write the decision into `.github/dependabot.yml`.

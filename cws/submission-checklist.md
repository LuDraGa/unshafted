# CWS Submission Checklist — 0.8.1, maintenance

**Prepared:** 2026-09-09 · **Last updated:** 2026-09-13
**Status:** **Round 1 submitted and REJECTED** on 2026-09-09, Yellow Argon, excessive keywords in
the description. The build was not cited and does not change. **The rectification did not wait for
round 2** — the rewritten description and new graphic assets went up as a listing-only update against
the live 0.8.0 item, submitted 2026-09-11 and published 2026-09-13. So round 2 is the same ZIP
against a listing review has already seen and approved. Nothing to paste.
**Applies to:** a maintenance release — dependency sweep, pdf.js 4→6, a ReDoS fix, and CI work
**Live item:** `fpjjdlffjfkdiibljglmgfkbpkkibpia`, version `0.8.0`, `<all_urls>` already granted

This is the working order for a single submission. The other files in `cws/` are the standing
mirrors. Delete this one once the release is approved — and unlike last time, actually do §5.

---

## What makes this one different from 0.8.0's

0.8.0 was the hard submission: it added the broadest permission Chrome grants to an item with two
rejections on record, and it needed all four review surfaces moved together to carry it.

**0.8.1 moves none of them.** Verified against the `v0.8.0` tag — **not** against `main`, which is no
longer a proxy for what users have installed: it was moved to 0.8.1 ahead of publication, on purpose
and out of order (see §5).

| Surface | Change from what review approved |
|---|---|
| `chrome-extension/manifest.ts` | **comment only.** The permissions array and `host_permissions` are byte-identical; the stale "NOT YET SUBMITTED — the live listing is 0.7.1" note above them was corrected to record that 0.8.0 is approved and live. |
| `cws/privacy-policy.md` | **none** — no data-flow change, gist already matches the repo |
| `cws/privacy-form-snapshot.md` | **none to any form field.** Header only. |
| `cws/store-listing-snapshot.md` | **the description changed — and it is already published**, as the 2026-09-13 listing-only update. Round 2 adds nothing to this tab. |
| ZIP contents | same 32 entries, same worker bytes |

So the reviewer sees the permission story they already approved, the description they already
approved, and a new build behind both. The argument that carried 0.8.0 does not need making again;
it needs *not contradicting*.

## What actually ships

Nine commits, of which these change what a user runs:

- **Dependency sweep (#10)** — seven Dependabot PRs taken as one deliberate change. Mostly
  formatting churn downstream of a Prettier bump, but the dependency versions are real.
- **pdf.js 4→6 (#21)** — the API and the vendored worker moved together. This is the one with real
  user-visible risk: a version handshake failure would break PDF analysis on the first document.
- **ReDoS fix in `json.ts` (#29)** — model-output parsing no longer backtracks quadratically on an
  unterminated code fence.
- **pdf.js worker now emitted from the package (#22)** — build-time change; the shipped bytes are
  identical, which is the point.

The rest (#19, #20, #24, #26, #15) is repo and CI only and reaches no user.

---

## 1. Preflight

- [x] **Version bumped.** All 15 `package.json` files at `0.8.1`; the manifest reads it from
      `packageJson.version`, so there is nothing separate to bump.
- [x] **Lockfile still frozen-installable.** `pnpm install --frozen-lockfile` succeeds, which is
      what `build-zip` and the new `test` / `type-check` jobs run.
- [x] **Gist matches `cws/privacy-policy.md`.** Diffed against the live
      [gist](https://gist.github.com/LuDraGa/782b874f1e7fe0076fb2bf1509937e95) rather than assumed.
      The policy is unchanged this round, so pushing `release` re-syncs identical content — but
      **re-confirm immediately before submitting anyway.** A stale gist is a Purple Nickel citation
      waiting to happen, and it is the cheapest check on this page.
- [x] **Production ZIP built and audited.** `unshafted-extension.zip`, **32 files**, `0.8.1`.
      Verified: `host_permissions: ['<all_urls>']` present, **no `content_scripts` key**, no
      `refresh.js`, no source maps, `pdf.worker.min.mjs` present at 1,317,034 bytes.
- [x] **Worker/API version handshake.** `pdfjs-dist` 6.3.289 for both halves, emitted from one
      install by the popup's build plugin. The vendored copy that could drift is gone (#22).
- [ ] **Open one PDF in the unpacked build before submitting.** The handshake failure only shows up
      in a real browser at `getDocument()` time — Node falls back to a fake worker and never
      performs it, so no test in the suite can catch a mismatch. The bytes are identical to the
      0.8.0 build that was verified this way, so this is confirmation rather than discovery, but it
      is the one manual check worth keeping.

## 2. Privacy tab

- [ ] **Nothing to change.** Single purpose, all seven permission justifications, the data-usage
      grid, remote code (**No**), the three certifications and the policy URL are all as approved
      for 0.8.0 and mirrored in `privacy-form-snapshot.md`.
- [ ] Open the tab and confirm it still reads that way — the mirror was a day stale before this
      release, so verify rather than trust it.

## 3. Store listing tab

**Nothing to change.** Round 1 was rejected on this tab and nothing else, and the fix has already
shipped and published on its own, ahead of the package.

- [ ] **Verify, do not paste.** Confirm the dashboard description still matches the fenced block
      under "### Description" in `store-listing-snapshot.md` verbatim — 2,137 characters. The
      snapshot is the source of truth and the dashboard is not diffable, so drift here is invisible
      until the next rejection.
- [ ] Do not reintroduce a company whose policies the extension analyses, and do not swap the
      category wording for a list of examples. That is the same shape wearing a hat, and shape is
      what the citation was about.
- [ ] Summary stands. It ships in the build via `__MSG_extensionDescription__` and was not cited.
- [ ] Graphic assets stand. Five screenshots and both promo tiles are live; three screenshots and
      both tiles went up in the 2026-09-13 update. `store-assets/README.md` records which files are
      live, which were produced and never uploaded, and the two live captures that have no repo copy
      at all.

## 4. Submit — round 2

Round 2 re-sends the round-1 artefact against a listing that is already clean. Nothing is rebuilt and
nothing is pasted.

- [ ] Re-confirm the gist matches `cws/privacy-policy.md`.
- [ ] Upload `unshafted-extension.zip` (0.8.1, 32 files) — the same ZIP round 1 sent.
- [ ] Submit for review.
- [ ] Tag what was actually sent: `submitted/v0.8.1-r2`.

**On `submitted/v0.8.1-r1`.** It was never created at submission time and will not be created
retroactively. The point of a submission tag is to record what was sent at the moment it was sent; one
applied afterwards from memory records a belief instead, which is worse than its absence. Round 1's
tree is `release` as it stood at the 2026-09-09 submission, and the outcome is in
`rejection-history.md`.

Round 1 expected a shorter review than 0.8.0's on the reasoning that no permission, policy or listing
change was in flight. Two of those three were right. The listing had not changed either, which turned
out not to be the protection it was assumed to be: the paragraph that was cited had already been
approved once, in 0.8.0. See the Yellow Argon entry in `rejection-history.md`. Round 2 stands
somewhere genuinely different — the listing did change, review read the change, and review published
it.

## 5. Once approved — the part that was skipped last time

These were missed when 0.8.0 went live, which left `cws/` claiming 0.7.1 was published for a day.
Nothing in CI reads these files; only a person notices.

- [ ] Update **Version live** and **Snapshot date** in `privacy-form-snapshot.md` and
      `store-listing-snapshot.md` — to 0.8.1, and the publish date read off the dashboard rather than
      worked out from a merge commit.
- [ ] Append the outcome to `rejection-history.md` — approval or citation, either way.
- [x] ~~Merge `release` → `main` with `--no-ff`, tag `v0.8.1`.~~ **Already done — out of order, and on
      purpose.** `9d63cb1` on `main`, tagged `v0.8.1`, merged 2026-09-11 while 0.8.0 was and still is
      the live version. It was done to deregister the stale `pull_request_target` workflow copies that
      existed only on `main` and reddened every PR into `release` (#51), together with CodeQL alerts 4
      and 8 — all of which resolve from the default branch. It worked: `main` and `release` now carry
      identical trees. **Do not re-issue this step when 0.8.1 publishes, and do not read it as the
      model.** Issue #66 records it as a deliberate one-off; from 0.8.2 the flow in `CLAUDE.md` is
      followed without exception.
- [ ] Delete this file. It is a work order, not a mirror.

## 6. If review comes back with a question

- **On `Web history`** — the prepared answer is in `privacy-form-snapshot.md` under that heading.
  Do not improvise it.
- **On `<all_urls>`** — do not reach for per-site permission prompting; the prepared retreat is a
  one-time all-sites `optional_host_permissions` request at onboarding. See D1 in
  `execution-docs/site-policy-part7-page-access.md`.
- Either way it lands on a `releasefix/*` branch squash-merged into `release`, then a resubmission
  tagged `submitted/v0.8.1-r2`.

---

## Standing hazard, outliving this submission

`packages/shared/lib/utils/policy-cdn.ts` will fetch `/d/{sha256(domain)}.json` on popup open the
moment `CEB_POLICY_CDN_URL` is set. It is unset today, which is the only reason the `tabs`
justification can say these lookups never touch the network. **Wiring up the CDN invalidates that
justification, needs a privacy-policy change, and reopens the `Web history` checkbox.** Recorded in
full in `privacy-form-snapshot.md`; repeated here because this file is what someone reads before a
resubmission.

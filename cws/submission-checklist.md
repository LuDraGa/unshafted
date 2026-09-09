# CWS Submission Checklist — 0.8.1, maintenance

**Prepared:** 2026-09-09
**Status:** **Round 1 submitted and REJECTED** on 2026-09-09, Yellow Argon, excessive keywords in
the description. The build was not cited and does not change. Round 2 is a listing-copy resubmission:
paste the new description, then resubmit the same ZIP.
**Applies to:** a maintenance release — dependency sweep, pdf.js 4→6, a ReDoS fix, and CI work
**Live item:** `fpjjdlffjfkdiibljglmgfkbpkkibpia`, version `0.8.0`, `<all_urls>` already granted

This is the working order for a single submission. The other files in `cws/` are the standing
mirrors. Delete this one once the release is approved — and unlike last time, actually do §5.

---

## What makes this one different from 0.8.0's

0.8.0 was the hard submission: it added the broadest permission Chrome grants to an item with two
rejections on record, and it needed all four review surfaces moved together to carry it.

**0.8.1 moves none of them.** Verified against `main`, which is what users have installed:

| Surface | Change |
|---|---|
| `chrome-extension/manifest.ts` | **none** — permissions and `host_permissions` byte-identical |
| `cws/privacy-policy.md` | **none** — no data-flow change, gist already matches the repo |
| `cws/privacy-form-snapshot.md` | header only (0.7.1 → 0.8.0 live); no form field changes |
| `cws/store-listing-snapshot.md` | header only; listing copy unchanged |
| ZIP contents | same 32 entries, same worker bytes |

So the reviewer sees the permission story they already approved, with a new build behind it. The
argument that carried 0.8.0 does not need making again; it needs *not contradicting*.

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

**This is the whole of round 2.** Round 1 assumed there was nothing to change here; the rejection
came from this tab and nothing else.

- [ ] **Paste the new description** from `store-listing-snapshot.md`, the fenced block under
      "### Description". 2,137 characters. It names no company whose policies the extension
      analyses. Do not reintroduce one, and do not replace the category list with a list of examples,
      which is the same shape wearing a hat.
- [ ] Confirm after pasting that the dashboard field and the snapshot match. The snapshot is the
      source of truth and the dashboard is not diffable, so a drift here is invisible until the next
      rejection.
- [ ] Summary and screenshots stand. The summary ships in the build via `__MSG_extensionDescription__`
      and was not cited. The screenshots show real sites in-context, which is functional
      demonstration rather than a keyword list, and were not cited either.
- [ ] The optional promo tiles (440×280 small, 1400×560 marquee) are still unfilled. They feed
      Google's curated placements, not the listing page. Still optional, still cheap, still nobody's
      priority.

## 4. Submit

- [ ] Re-confirm the gist matches `cws/privacy-policy.md`.
- [ ] Upload `unshafted-extension.zip` (0.8.1, 32 files).
- [ ] Submit for review.
- [x] Tag what was actually sent: `submitted/v0.8.1-r1`. Rejected, Yellow Argon.
- [ ] Round 2: after the description is pasted and the `releasefix/` branch is squash-merged into
      `release`, tag `submitted/v0.8.1-r2` and resubmit the **same ZIP**. The build was never cited.

Round 1 expected a shorter review than 0.8.0's on the reasoning that no permission, policy or listing
change was in flight. Two of those three were right. The listing had not changed either, which turned
out not to be the protection it was assumed to be: the paragraph that was cited had already been
approved once, in 0.8.0. See the Yellow Argon entry in `rejection-history.md`.

## 5. Once approved — the part that was skipped last time

All three of these were missed when 0.8.0 went live, which left `cws/` claiming 0.7.1 was published
for a day. Nothing in CI reads these files; only a person notices.

- [ ] Update **Version live** and **Snapshot date** in `privacy-form-snapshot.md` and
      `store-listing-snapshot.md`, and replace the inferred 0.8.0 approval date with the real one
      from the dashboard while signed in.
- [ ] Append the outcome to `rejection-history.md` — approval or citation, either way.
- [ ] Merge `release` → `main` with `--no-ff`, tag `v0.8.1`. **This is the step that finally moves
      `main`**, and it also clears the ghost `pull_request_target` checks and CodeQL alerts 4 and 8,
      all of which resolve from the default branch.
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

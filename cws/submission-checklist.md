# CWS Submission Checklist — 0.8.0, adding `<all_urls>`

**Prepared:** 2026-09-07 · **Last updated:** 2026-09-07
**Status:** dashboard draft filled in. **Screenshots outstanding, then submit.**
**Applies to:** the site-policy release (adds `host_permissions: ['<all_urls>']`)
**Live item:** `fpjjdlffjfkdiibljglmgfkbpkkibpia`, version `0.7.1`, no host permissions

This is the working order for a single submission. The other files in `cws/` are the standing
mirrors. Delete this one once the release is approved.

---

## What review is actually looking at

`<all_urls>` is the broadest permission Chrome grants, and this item has two rejections on record
(Purple Potassium for unused permissions, Purple Nickel for the privacy policy). The lesson from
that round, from `rejection-history.md`:

> the review surface is the *union* of policy + in-product disclosure + listing copy + what's
> actually in the ZIP.

So the reviewer's question is not "is this permission justified in the abstract." It is **"do these
four surfaces tell the same story."** Every item below exists to make sure they do.

The argument that carries it: reading the documents a site links to is not scope drift from telling
people what they agreed to, it **is** that purpose. That only works if the single-purpose field says
so, which is why the single-purpose field in §2 was the most important paste on this page.

---

## 1. Preflight — DONE

- [x] **Version bumped.** `package.json` and `chrome-extension/package.json` both `0.8.0`.
- [x] **Privacy policy pushed and gist synced.** New §5 "Website content (policy documents only)".
      Review fetches the [gist](https://gist.github.com/LuDraGa/782b874f1e7fe0076fb2bf1509937e95),
      not the repo. Re-confirm the two match immediately before hitting submit, since a stale gist
      is a Purple Nickel citation waiting to happen.
- [x] **Production ZIP built and audited.** `unshafted-extension.zip`, 32 files, `0.8.0`.
      Verified: `host_permissions: ["<all_urls>"]` present, **no `content_scripts` key**, no
      `refresh.js`, no source maps. A scraper in the ZIP is precisely what `3657ca0` had to remove,
      and every "no persistent content script" claim on the Privacy tab depends on its absence.
- [x] **Code audited against every justification.** No `registerContentScripts` in source or in the
      built `background.js`. `fetchDocumentInPage` uses `credentials: 'omit'`. The only network
      hosts in the bundles are `accounts.google.com`, `www.googleapis.com`, the Supabase project,
      `api.openai.com` and `openrouter.ai`. `CEB_POLICY_CDN_URL` is unset and absent from the
      bundles, so the "no network request" claim under `tabs` holds for this build.

## 2. Privacy tab — DONE (entered in draft)

- [x] **Single purpose** replaced. Text in `privacy-form-snapshot.md`.
- [x] **Seven permission justifications** entered: `storage`, `identity`, `host_permissions`,
      `tabs`, `activeTab`, `scripting`, `sidePanel`. Every permission in the manifest gets a
      required box; none may be blank. Full text and per-field character counts in
      `privacy-form-snapshot.md`.
- [x] **Data usage grid** set. One change from 0.7.1: `Website content` now checked.
      `Web history` deliberately left unchecked, with the prepared answer recorded in the snapshot.
- [x] Remote code (**No**), the three certifications, and the privacy policy URL unchanged.

## 3. Store listing tab — description DONE, assets outstanding

- [x] **Description** pasted. Restructured from upload-first into a balanced two-column form so the
      listing carries the same emphasis as the rewritten single purpose. Text and rationale in
      `store-listing-snapshot.md`.
- [x] **Summary** ships with the build via `_locales/en/messages.json`. Nothing to paste.
- [ ] **Screenshots — the remaining blocker.** The two live ones show the upload flow only. A
      reviewer weighing `<all_urls>` benefits enormously from seeing the panel open on a real site
      with its documents listed. Not strictly required; cheap, and it makes the permission
      self-evident.

      1280×800 or 640×400, JPEG or 24-bit PNG, **no alpha channel**. Order matters, slot 1 is the
      listing tile.

      - [ ] **1.** Side panel open on a **Very High** covered site (snapchat.com, tiktok.com or
            coinbase.com), verdict and a named exposure visible.
      - [ ] **2.** Side panel on an **uncovered** site showing the discovered document list.
      - [ ] **3.** The `AnalyseConfirm` sheet, with *"runs on your own API key… nothing is sent
            until you press the button"* legible. This one is aimed at the reviewer as much as the
            user.
      - [ ] **4.** Contract upload result (reuse the better of the two live shots).
      - [ ] **5.** Options / onboarding with the BYO-key field.

      macOS `screencapture` writes PNG **with** an alpha channel, which CWS rejects. Capture a 16:10
      region so the downscale does not distort, then flatten:

      ```bash
      sips -s format jpeg -s formatOptions 90 -z 800 1280 shot.png --out shot-1280x800.jpg
      ```

- [ ] **Small promo tile (440×280)** — optional, worth doing. Does not appear on the listing page
      itself; it feeds Google's curated and featured placements on the Store homepage. Absent,
      nothing is substituted and the item is simply never eligible for those slots.
- [ ] **Marquee promo tile (1400×560)** — optional, low priority. Only used if Google features the
      item.

## 4. Submit

- [ ] Re-confirm the gist matches `cws/privacy-policy.md`.
- [ ] Upload `unshafted-extension.zip`.
- [ ] Submit for review.

## 5. After submitting

- [ ] Expect a longer review than 0.7.1's. `<all_urls>` draws scrutiny that `storage`+`identity`
      did not, and this item has two rejections on its record. Budget for one round of questions.
- [ ] **If a question comes back on `Web history`,** the prepared answer is in
      `privacy-form-snapshot.md` under that heading. Do not improvise it.
- [ ] **If `<all_urls>` is refused, do not reach for per-site permission prompting** — one Chrome
      dialog per site is the same defect wearing a hat. The prepared retreat is a one-time all-sites
      `optional_host_permissions` request at onboarding: same end state, no install-time warning,
      and it needs a decline path. See D1 in
      `execution-docs/site-policy-part7-page-access.md`.
- [ ] Whatever happens, append the outcome to `rejection-history.md` — violation ID, root cause,
      and the diff that resolved it.

## 6. Once approved

- [ ] Update the **Version live** and **Snapshot date** headers in `privacy-form-snapshot.md` and
      `store-listing-snapshot.md`, and drop their "not yet submitted" warnings.
- [ ] Append the approval to `rejection-history.md`.
- [ ] Delete this file. It is a work order, not a mirror.

---

## Standing hazard, outliving this submission

`packages/shared/lib/utils/policy-cdn.ts` will fetch `/d/{sha256(domain)}.json` on popup open the
moment `CEB_POLICY_CDN_URL` is set. It is unset today, which is the only reason the `tabs`
justification can say these lookups never touch the network. **Wiring up the CDN invalidates that
justification, needs a privacy-policy change, and reopens the `Web history` checkbox.** Recorded in
full in `privacy-form-snapshot.md`; repeated here because this file is what someone reads before a
resubmission.

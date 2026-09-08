# CWS Rejection Fix — Permissions & Privacy Policy

**Date:** 2026-04-17
**Last updated:** 2026-05-05
**Violation IDs:** Purple Potassium (permissions), Purple Nickel (privacy policy)

## Problem

Chrome Web Store rejected the submission for two violations:

1. **Unused permissions** — `tabs`, `activeTab`, `scripting` declared in manifest but not used in any code path. These were left over after the UI simplification that removed the "Analyze this page" feature (extension is now upload-only).

2. **Incomplete privacy policy** — The old policy made local-only/no-personal-data claims that were outdated after adding Google Sign-In, Supabase auth, and Google Drive sync.

## Root Cause

The page-extraction flow (`getCurrentActiveTab`, `getTabReadability`, `extractCurrentPageDocument` in `packages/shared/lib/utils/unshafted-browser.ts`) was decoupled from the popup during the UI simplification but the corresponding permissions were never removed from the manifest. The content script (`pages/content/`) is also dead — not registered in `content_scripts` and no longer injected via `scripting.executeScript()`.

The privacy policy was written for v0.1 (local-only, no auth) and never updated for the Phase 1 (Supabase auth) and Phase 2 (Google Drive storage) features.

## Changes Made

### 1. Manifest — remove unused permissions

**Files:** `chrome-extension/manifest.ts`, `chrome-extension/manifest.js`

```diff
- permissions: ['storage', 'tabs', 'activeTab', 'scripting', 'identity'],
+ permissions: ['storage', 'identity'],
```

### 2. Privacy policy — full rewrite

**File:** `privacy-policy.md` (new, repo root)

Rewrote to accurately cover:
- Google Sign-In (email, profile)
- Supabase auth storage
- Google Drive backup (`drive.file` scope), including source files for new backed-up scans and report JSON files for quick/deep analyses
- LLM API data transmission (contract text + API key)
- Local storage details
- Data retention and deletion procedures
- Explicit "what we do NOT collect" section

### 2a. Privacy policy — second rejection patch (2026-05-05)

CWS rejected again on Purple Nickel after the first rewrite. Two gaps identified:

1. **Missing Google API Services User Data Policy / Limited Use disclosure.** Required when an extension uses Google OAuth user data (we use Google Sign-In + `drive.file`). Added a dedicated "Google API Services User Data Policy (Limited Use)" section with the verbatim Google statement and the four enumerated Limited Use commitments (no third-party transfer beyond user-facing features, no ads, no human reading, no model training).
2. **Missing data-handling / security section.** Purple Nickel rectification text names four pillars — collection, handling, storage, sharing — and the prior policy collapsed handling into purpose-of-use. Added "How we handle and protect your data" covering TLS in transit, Supabase encryption at rest, `chrome.storage.local` origin scoping, no server-side storage of contract content, no human access, and no model training.

Also tightened:
- Added Chrome Web Store item ID at the top of the policy so it unambiguously refers to this listing.
- Reconciled Drive backup preference description (Supabase profile is source of truth; `chrome.storage.local` is a cache).
- Bumped effective date to 2026-05-05.

### 3. GitHub Actions — auto-sync privacy policy to gist

**File:** `.github/workflows/sync-privacy-policy.yml`

On push to `main` that touches `privacy-policy.md`, syncs the file to the existing public gist (LuDraGa/782b874f1e7fe0076fb2bf1509937e95). Requires a `GIST_PAT` secret with `gist` scope. After privacy-policy edits, verify the workflow ran and that the public gist content matches the local file before resubmitting.

### 4. CWS submission form updates needed

See bottom of this doc for the exact text changes for the Chrome Web Store developer dashboard.

The Chrome Web Store privacy policy URL must be entered in the designated field in the item's **Privacy** tab. Putting the privacy policy URL only in the listing description is not accepted by Chrome Web Store review.

## CWS Submission Form Changes

### Permission justifications

- **Remove** `tabs` justification field entirely (permission removed)
- **Remove** `activeTab` justification field entirely (permission removed)
- **Remove** `scripting` justification field entirely (permission removed)
- **Update** `storage` justification:
  > Stores the user's API key (OpenRouter or OpenAI), model preferences, local analysis history, usage counters, Google auth session tokens, Drive token/cache, and active analysis session state using chrome.storage.local and chrome.storage.session. Drive backup uses a separate Google Drive API flow after the user signs in and enables Drive backup.
- **Keep** `identity` justification as-is (already accurate)

### Data usage checkboxes

- **Keep checked:** Personally identifiable information (email from Google Sign-In)
- **Check:** Authentication information (Google OAuth tokens, Supabase session)
- **Leave unchecked:** Everything else (no health, financial, location, web history, user activity, or website content)

### Privacy policy field

- **Set Privacy policy URL:** `https://gist.github.com/LuDraGa/782b874f1e7fe0076fb2bf1509937e95`
- **Important:** This URL must be pasted into the Chrome Web Store Developer Dashboard's designated privacy policy field under the item's **Privacy** tab. A link in the item description does not satisfy the Purple Nickel requirement.

## Status

- [x] Remove unused permissions from manifest
- [x] Rewrite privacy policy
- [x] Add GitHub Actions workflow for gist sync
- [x] Privacy policy URL set in the dashboard's Privacy tab field (confirmed by user 2026-05-05)
- [x] Public gist content matches local `privacy-policy.md` (confirmed by user 2026-05-05)
- [x] Add Google API Services User Data Policy / Limited Use disclosure
- [x] Add "How we handle and protect your data" section
- [x] Add Chrome Web Store item ID to policy header
- [x] Push privacy-policy.md change, verify gist sync workflow ran, verify gist matches
- [x] Rebuild extension and resubmit to CWS
- [x] Update CWS form fields if anything new applies (no permissions changed this round)

---

## Resolution — v0.7.1 approved (2026-05-11)

**Purple Nickel is cleared.** v0.7.1 passed review and is live on the Chrome
Web Store, published 2026-05-11.

The fix that landed it was not more privacy-policy text — the policy had been
comprehensive since 2026-05-05. It was bringing the other two review surfaces
into line with it:

1. **In-product disclosure before collection** (commit `347205a`) — a consent
   modal gating Google sign-in, plus disclosures under the Drive backup toggle
   and the API key field. Chrome's troubleshooting doc asks for a screen
   presented *before* any data is collected; there wasn't one.
2. **Truthful listing copy** (commit `347205a`) — the description still claimed
   "no accounts, no cloud storage, data stays on your device," which
   contradicted the policy's Supabase + Drive description. A reviewer reading
   both saw a policy that looked partial against the listing's broader claim.
3. **Removed the orphan content script** (commit `3657ca0`) — `pages/content/`
   was unwired in the manifest but still built into the ZIP, shipping a
   60KB page-scraping script alongside a `storage`+`identity`-only manifest.
   The cleanest available "single-purpose drift" citation, now gone.

**Takeaway for future rejections:** Purple Nickel names the privacy policy,
but the review surface is the *union* of policy + in-product disclosure +
listing copy + what's actually in the ZIP. Audit all four before assuming the
policy text is the gap.

Full detail: [`execution-docs/v0.7.1-purple-nickel-disclosure-pass.md`](../execution-docs/v0.7.1-purple-nickel-disclosure-pass.md).

---

## Resolution — v0.8.0 approved (on or before 2026-09-08)

**No rejection.** Recorded here because this file is the running log of what review has
accepted, and an approval is as load-bearing as a refusal — the next submission's baseline is
whatever review last said yes to.

v0.8.0 is the site-policy release: it added `host_permissions: ['<all_urls>']`, rewrote the single
purpose so page reading is stated as the product's purpose rather than an accessory to uploads,
checked `Website content` in the data-usage grid, and supplied justifications for all seven
permissions. It **passed on the first round**, with no questions on `Web history` and no challenge
to `<all_urls>`.

That is the interesting part. Two rejections sit above this entry, one of them (Purple Potassium)
specifically for permissions — and the broadest permission Chrome grants went through unchallenged.
What changed was not the strength of the argument for the permission but the *consistency of the
four surfaces*: the single purpose, the privacy policy, the listing copy and the ZIP were all moved
in the same commit range, so a reviewer comparing them found one story. That is the takeaway from
the v0.7.1 round applied deliberately rather than learned again.

**Retreat position, unused but still prepared.** If `<all_urls>` is ever challenged on a later
submission, the answer is *not* per-site permission prompting — one Chrome dialog per site is the
same defect wearing a hat. It is a one-time all-sites `optional_host_permissions` request at
onboarding, with a decline path. See D1 in
[`execution-docs/site-policy-part7-page-access.md`](../execution-docs/site-policy-part7-page-access.md).

**Bookkeeping note.** The three post-approval steps this round called for — refresh the two snapshot
headers, log the outcome here, delete the transient checklist — were all missed when 0.8.0 went
live, so `cws/` claimed 0.7.1 was the published version for a day. Caught and corrected while
preparing 0.8.1. The lesson is that the standing mirrors go stale silently: nothing in CI reads
them, and only a person opening the dashboard would notice.

**Approval date is inferred**, from the publish merge `90e5f73` (2026-09-08) — under `CLAUDE.md`'s
branch model `main` moves only after CWS publishes. Replace with the exact dashboard date when
someone is next signed in.

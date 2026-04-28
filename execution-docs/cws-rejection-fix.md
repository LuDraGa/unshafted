# CWS Rejection Fix — Permissions & Privacy Policy

**Date:** 2026-04-17
**Last updated:** 2026-04-28
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
- [ ] Confirm `GIST_PAT` repo secret exists and the gist sync workflow has run after the latest `privacy-policy.md` change
- [ ] Confirm public gist content matches local `privacy-policy.md`
- [ ] Rebuild extension and resubmit to CWS
- [ ] Update CWS form fields, including the designated Privacy tab URL field (manual)

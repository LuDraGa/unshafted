# CWS Rejection Fix — Permissions & Privacy Policy

**Date:** 2026-04-17
**Violation IDs:** Purple Potassium (permissions), Purple Nickel (privacy policy)

## Problem

Chrome Web Store rejected the submission for two violations:

1. **Unused permissions** — `tabs`, `activeTab`, `scripting` declared in manifest but not used in any code path. These were left over after the UI simplification that removed the "Analyze this page" feature (extension is now upload-only).

2. **Incomplete privacy policy** — The old policy said "no personal information collected" and "nothing synced to servers," which was outdated after adding Google Sign-In, Supabase auth, and Google Drive sync.

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

**File:** `PRIVACY_POLICY.md` (new, repo root)

Rewrote to accurately cover:
- Google Sign-In (email, profile)
- Supabase auth storage
- Google Drive sync (`drive.file` scope)
- LLM API data transmission (contract text + API key)
- Local storage details
- Data retention and deletion procedures
- Explicit "what we do NOT collect" section

### 3. GitHub Actions — auto-sync privacy policy to gist

**File:** `.github/workflows/sync-privacy-policy.yml`

On push to `main` that touches `PRIVACY_POLICY.md`, syncs the file to the existing gist (LuDraGa/782b874f1e7fe0076fb2bf1509937e95). Requires a `GIST_PAT` secret with `gist` scope.

### 4. CWS submission form updates needed

See bottom of this doc for the exact text changes for the Chrome Web Store developer dashboard.

## CWS Submission Form Changes

### Permission justifications

- **Remove** `tabs` justification field entirely (permission removed)
- **Remove** `activeTab` justification field entirely (permission removed)
- **Remove** `scripting` justification field entirely (permission removed)
- **Update** `storage` justification:
  > Stores the user's API key (OpenRouter or OpenAI), model preferences, current analysis session, local analysis history, usage counters, and Google auth session tokens in chrome.storage.local. No data is synced to external servers from storage — Drive sync uses a separate API flow.
- **Keep** `identity` justification as-is (already accurate)

### Data usage checkboxes

- **Keep checked:** Personally identifiable information (email from Google Sign-In)
- **Check:** Authentication information (Google OAuth tokens, Supabase session)
- **Leave unchecked:** Everything else (no health, financial, location, web history, user activity, or website content)

## Status

- [x] Remove unused permissions from manifest
- [x] Rewrite privacy policy
- [x] Add GitHub Actions workflow for gist sync
- [ ] Create `GIST_PAT` repo secret (manual — needs GitHub PAT with `gist` scope)
- [ ] Rebuild extension and resubmit to CWS
- [ ] Update CWS form fields (manual)

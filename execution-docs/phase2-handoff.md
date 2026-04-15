# Phase 2 Implementation Handoff

## Context for the implementing session

You are implementing Phase 2 of a 3-phase backend rollout for **Unshafted**, a Chrome extension that analyzes legal contracts for risk.

### Product overview
- Chrome extension (MV3) built with React + TypeScript in a monorepo (`pnpm` workspaces, `turbo` build)
- User uploads a contract (PDF/TXT) → quick scan (fast, cheap LLM call) → deep analysis (thorough, expensive LLM call)
- LLM calls run client-side using the user's own API key (BYOK — "bring your own key")
- Supabase handles auth (Google sign-in via `chrome.identity.launchWebAuthFlow` + `signInWithIdToken`)

### Phase history
- **Phase 1 (complete):** Supabase Google auth + profiles. Deep analysis requires sign-in. Anonymous users get 3 quick scans/day. Commit `032a57e`.
- **Phase 2 (this session):** Google Drive storage — save analyses to user's Drive for persistence and cross-device access.
- **Phase 3 (future):** Credits + payments. Not in scope.

### Key codebase locations
- `packages/supabase/` — Supabase client, auth helpers (sign in, sign out, session management)
- `packages/unshafted-core/` — schemas (Zod), document ingestion, prompts, LLM call wrappers
- `packages/storage/` — `chrome.storage.local` abstractions (analysis state, history, usage tracking)
- `pages/popup/src/Popup.tsx` — main popup component with auth state
- `pages/popup/src/components/AnalysisWorkspace.tsx` — analysis workflow UI (quick scan, deep analysis, results)
- `chrome-extension/src/background/index.ts` — background service worker (Supabase session keep-alive)

---

## Task

Implement Phase 2 as specified in `execution-docs/phase2-google-drive-storage.md`.

**Read that doc first** — it contains all architecture decisions, file schemas, naming conventions, sync strategy, and step-by-step code changes.

### Summary of what to build

1. **Doc name sanitization** — `sanitizeDocumentName()` in `unshafted-core/lib/document.ts`. Strips extensions, special chars, lowercases, truncates to 60 chars. Add `slug` field to `IngestedDocumentSchema`.

2. **Content hash** — `computeContentHash()` (SHA256 of extracted text) in `unshafted-core/lib/document.ts`. Add `contentHash` field to `IngestedDocumentSchema`. Computed at ingestion time in `buildDocumentFromFile()`.

3. **Auth flow change** — In `packages/supabase/lib/auth.ts`, change `response_type` from `id_token` to `token id_token` and add `https://www.googleapis.com/auth/drive.file` to scopes. Capture and persist the `access_token` + `expires_at` in `chrome.storage.local`.

4. **Drive token management** — New `packages/supabase/lib/drive-token.ts`. Get valid token (check expiry → silent refresh via `launchWebAuthFlow(interactive: false)` → fallback to null). Clear on sign-out.

5. **Drive API helpers** — New `packages/supabase/lib/drive.ts`. Plain `fetch()` against Google Drive REST API v3. No Google SDK. Functions: `getOrCreateFolder`, `findExistingFile` (by `appProperties`), `upsertAnalysisFile`, `listAnalysisFiles`, `deleteAnalysisFile`.

6. **Drive file types** — New `packages/supabase/lib/drive-types.ts`. `DriveQuickScanFile` and `DriveDeepAnalysisFile` interfaces.

7. **Sync layer** — New `packages/supabase/lib/drive-sync.ts`. Fire-and-forget wrappers that handle token refresh, folder creation, and error swallowing. Functions: `syncQuickScanToDrive`, `syncDeepAnalysisToDrive`, `loadHistoryFromDrive`, `deleteFromDrive`.

8. **Wire into UI** — In `AnalysisWorkspace.tsx`: call `syncQuickScanToDrive` after quick scan, `syncDeepAnalysisToDrive` after deep analysis. In `Popup.tsx`: hydrate local history from Drive when empty + signed in.

9. **Sign-out cleanup** — Clear Drive token in `signOut()`.

### Critical design constraints

- **Drive sync is fire-and-forget.** Never block the UI. Never show errors for sync failures. Local is always the source of truth.
- **Dedup via content hash + analysis type.** Same document re-analyzed = overwrite, not duplicate. Use Drive's `appProperties` for queryable metadata.
- **File naming:** `{slug}_{analysis-type}_{content-hash-8chars}.json`. Dates go in JSON (`createdAt`, `updatedAt`), not in filename.
- **No Google SDK.** Use `fetch()` against `https://www.googleapis.com/drive/v3/files`. Bundle size matters for extensions.
- **Token lifecycle:** Access tokens expire in 1 hour. Silent refresh via `launchWebAuthFlow(interactive: false, prompt=none)`. If refresh fails, Drive is simply unavailable — extension keeps working.

### Pre-requisites already done
- Google Drive API enabled in Google Cloud Console
- `drive.file` scope added to OAuth data access in Google Auth Platform
- Supabase project, auth, profiles all working (Phase 1)

### After implementation
- Run the E2E test plan in the execution doc
- Commit with a single holistic message (no Claude attribution)

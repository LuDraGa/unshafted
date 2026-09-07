# Phase 2 Execution: Google Drive Storage

**Status:** Shipped — see the 2026-09-07 note below for what the code does versus what this plan describes
**Date:** 2026-04-14
**Parent doc:** `execution-docs/supabase-auth-profiles-credits.md`
**Depends on:** Phase 1 (complete)

---

## Note — 2026-09-07: this document was stale, and this is the correction

This said **"Not started"** for months after Drive storage shipped. It cost real time; do not trust
a status line here again without checking the tree.

**What is actually in the tree:**

- [`packages/supabase/lib/drive.ts`](../packages/supabase/lib/drive.ts) — the "Unshafted" folder
  (created on demand, cached in memory with a TTL and in `chrome.storage.local`, single-flighted),
  `upsertAnalysisFile` deduping on `appProperties` `contentHash` + `analysisType`, paginated
  listing, deletion, and original-source-file upload with orphan cleanup.
- [`packages/supabase/lib/drive-sync.ts`](../packages/supabase/lib/drive-sync.ts) —
  `syncQuickScanToDrive`, `syncDeepAnalysisToDrive`, `loadHistoryFromDrive`, `deleteFromDrive`.
- [`packages/supabase/lib/drive-token.ts`](../packages/supabase/lib/drive-token.ts) — token access.
- Call sites: `chrome-extension/src/background/index.ts` (fire-and-forget after each analysis) and
  `pages/popup/src/Popup.tsx` (manual sync, Drive hydration of empty history, delete).

**What this plan describes that did not ship as written:** treat everything below as the original
design intent, not as a description of the code. Where the two disagree, the code is the record.

**Added 2026-09-07 (Part 6, W5):** a third analysis type, `site-policy` — a `DriveSitePolicyFile`
wrapping a `LocalPolicyAnalysis` plus `syncSitePolicyToDrive`, for a site analysis the user ran on
their own key. It rides the same folder, the same upsert and the same never-throw contract. It is
deliberately excluded from `loadHistoryFromDrive`: those analyses belong to the side panel, not to
the popup's upload history. See `execution-docs/site-policy-part6-self-analysis.md` §S9.

---

## What ships in Phase 2

- Document name sanitization at upload time
- Content hash (SHA256) computed at document ingestion for dedup
- Quick scans AND deep analyses saved to user's Google Drive
- Separate files per analysis type — one quick scan file, one deep analysis file per unique document
- Dedup via content hash: re-running analysis on same document overwrites the existing file
- Cross-device history hydration from Drive
- Dedicated "Unshafted" folder in user's Drive, visible and organized
- Local `chrome.storage.local` remains the working copy; Drive is the durable backup

## What does NOT ship

- Real-time sync / conflict resolution (local wins, Drive is overwrite)
- Web app Drive access (same OAuth client enables it later, but no web app yet)
- Credits, payments (Phase 3)

---

## Architecture Decisions

### Scope: `drive.file`

- No 10MB cap (unlike `drive.appdata` which has a hard 10MB limit)
- Files count against user's regular Drive quota (15GB+ free)
- User can see files in Drive (transparency, mental peace, native sharing via Drive UI)
- Risk of user editing/corrupting files → mitigated by Zod validation on read

### Document name sanitization

Sanitize the document name at upload time (in `buildDocumentFromFile`):
- Remove file extension (`.pdf`, `.txt`)
- Replace non-alphanumeric characters with hyphens
- Collapse multiple hyphens, trim leading/trailing hyphens
- Lowercase
- Truncate to 60 characters
- Fallback to `unnamed-document` if empty after sanitization

Store both:
- `name`: original filename (for display in UI)
- `slug`: sanitized name (for Drive filenames)

### Content hash for deduplication

Compute SHA256 of the normalized extracted text at ingestion time. Store as `contentHash` in `IngestedDocument`.

**Dedup logic:** Before saving to Drive, query for existing file with matching `contentHash` + `analysisType` (stored in file's `appProperties`). If found → update in place. If not → create new file.

### Drive file naming

Pattern: `{slug}_{analysis-type}_{content-hash-8chars}.json`

Examples:
```
employment-agreement_quick-scan_a1b2c3d4.json
employment-agreement_deep-analysis_a1b2c3d4.json
lease-contract_quick-scan_f9e8d7c6.json
```

- `slug`: sanitized document name
- `analysis-type`: `quick-scan` or `deep-analysis`
- `content-hash-8chars`: first 8 chars of SHA256 content hash
- Filename never changes on rerun (same doc → same hash → same filename)

### Drive file JSON schema

**Quick scan file:**
```json
{
  "contentHash": "a1b2c3d4e5f67890...",
  "documentName": "Employment Agreement",
  "analysisType": "quick-scan",
  "createdAt": "2026-04-14T10:30:00Z",
  "updatedAt": "2026-04-14T10:30:00Z",
  "role": "Employee",
  "result": { /* QuickScanResult */ }
}
```

**Deep analysis file:**
```json
{
  "contentHash": "a1b2c3d4e5f67890...",
  "documentName": "Employment Agreement",
  "analysisType": "deep-analysis",
  "createdAt": "2026-04-14T10:35:00Z",
  "updatedAt": "2026-04-14T11:00:00Z",
  "role": "Employee",
  "priorities": ["Liability", "Termination"],
  "result": { /* DeepAnalysisResult */ }
}
```

- No document metadata blob (charCount, estimatedTokens, etc.) — derivable from source
- `createdAt`: first time this analysis was saved
- `updatedAt`: last rerun timestamp (used for sorting in UI, dedup maintenance)
- On rerun: `updatedAt` updates, `createdAt` stays, file is updated in place

### Drive file `appProperties`

Google Drive supports `appProperties` — key-value metadata stored on the file, queryable via Drive API, invisible to the user. We use these for dedup queries:

```json
{
  "contentHash": "a1b2c3d4e5f67890...",
  "analysisType": "quick-scan"
}
```

This allows `files.list` with `q: "appProperties has { key='contentHash' and value='a1b2c3d4...' } and appProperties has { key='analysisType' and value='quick-scan' }"` to find duplicates without downloading file contents.

### Token management: implicit flow + silent refresh

Modify the existing `signInWithGoogle()` to request both tokens:

```
response_type=token id_token
scope=openid email profile https://www.googleapis.com/auth/drive.file
```

Returns `access_token` (for Drive API) + `id_token` (for Supabase) in one consent screen.

**Token lifecycle:**
- `access_token` expires in ~1 hour
- Before any Drive call, check if token is expired
- Silent refresh: `launchWebAuthFlow({ interactive: false })` with `prompt=none`
- If silent refresh fails → mark Drive as unavailable, extension still works locally
- Silent refresh failure is very rare (user signed out of Google, consent revoked, or browser profile reset)

### Folder structure in Drive

```
My Drive/
  Unshafted/
    employment-agreement_quick-scan_a1b2c3d4.json
    employment-agreement_deep-analysis_a1b2c3d4.json
    lease-contract_quick-scan_f9e8d7c6.json
    ...
```

- One folder named "Unshafted" created on first save
- Folder ID cached in `chrome.storage.local` after first lookup/creation
- Flat structure — no subfolders

### Sync strategy

| Event | Drive action | Dedup behavior |
|---|---|---|
| Quick scan completes | Save to Drive | Same contentHash + `quick-scan` → overwrite existing |
| Deep analysis completes | Save to Drive | Same contentHash + `deep-analysis` → overwrite existing |
| Re-run quick scan (same doc) | Update existing file, bump `updatedAt` | Same content hash matches |
| Re-run quick scan (different doc) | New file | Different content hash |
| Popup opens (signed in, empty local history) | Load history from Drive | — |
| User deletes from history | Delete from local + Drive | — |
| Drive unavailable (token expired, offline) | Work locally, no error shown | — |

**Key principles:**
- Drive sync is best-effort. Extension always works locally. Drive failures are silent.
- Quick scans are cheap and rerun often → overwrite, don't accumulate.
- Deep analysis is expensive and rare → also overwrite on rerun.
- One quick scan + one deep analysis per unique document (content hash). Drive stays clean.

---

## Pre-requisites (manual steps)

### 1. Google Cloud Console — enable Drive API

- [x] Go to Google Cloud Console → APIs & Services → Library
- [x] Search for "Google Drive API" → Enable it

### 2. Google Cloud Console — update OAuth consent / data access

- [x] Go to Google Auth Platform → Data Access
- [x] Add the `https://www.googleapis.com/auth/drive.file` scope

### 3. No new OAuth clients needed

Existing Web Application client works. Scope is requested at runtime in the auth URL.

---

## Code changes

### Step 1: Document name sanitization + content hash

**File: `packages/unshafted-core/lib/document.ts`**

Add sanitization and hashing utilities:

```ts
/** Sanitize a document name for use in filenames */
export const sanitizeDocumentName = (name: string): string => {
  return name
    .replace(/\.[^.]+$/, '')            // strip file extension
    .replace(/[^a-zA-Z0-9\s-]/g, '')   // remove special chars
    .trim()
    .replace(/\s+/g, '-')              // spaces to hyphens
    .replace(/-+/g, '-')               // collapse multiple hyphens
    .replace(/^-|-$/g, '')             // trim leading/trailing hyphens
    .toLowerCase()
    .slice(0, 60)
    || 'unnamed-document';
};

/** SHA256 hash of text, returned as hex string */
export const computeContentHash = async (text: string): Promise<string> => {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};
```

**File: `packages/unshafted-core/lib/schemas.ts`**

Add `slug` and `contentHash` to `IngestedDocumentSchema`:

```ts
export const IngestedDocumentSchema = z.object({
  kind: SourceKindSchema,
  name: z.string().min(1),
  slug: z.string().min(1).default('unnamed-document'),       // NEW
  contentHash: z.string().min(1).default(''),                 // NEW
  // ... rest stays the same
});
```

**File: `packages/unshafted-core/lib/document.ts`**

Update `buildDocumentFromFile()` to populate both fields:

```ts
return IngestedDocumentSchema.parse({
  kind: 'file',
  name: file.name,
  slug: sanitizeDocumentName(file.name),                      // NEW
  contentHash: await computeContentHash(text),                // NEW
  // ... rest stays the same
});
```

**Status:** [ ] Done

---

### Step 2: Modify auth flow — request Drive scope + capture access_token

**File: `packages/supabase/lib/auth.ts`**

Changes to `signInWithGoogle()`:

```diff
- authUrl.searchParams.set('response_type', 'id_token');
- authUrl.searchParams.set('scope', 'openid email profile');
+ authUrl.searchParams.set('response_type', 'token id_token');
+ authUrl.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/drive.file');
```

After extracting `id_token`, also extract and persist the access_token:

```ts
const accessToken = params.get('access_token');
const expiresIn = params.get('expires_in');
if (accessToken && expiresIn) {
  const expiresAt = Date.now() + parseInt(expiresIn, 10) * 1000;
  await chrome.storage.local.set({
    'unshafted-drive-token': accessToken,
    'unshafted-drive-expires-at': expiresAt,
  });
}
```

**Status:** [ ] Done

---

### Step 3: Drive token management

**New file: `packages/supabase/lib/drive-token.ts`**

```ts
/** Get a valid Drive access token, silently refreshing if expired */
export const getDriveToken = async (): Promise<string | null> => { ... }

/** Silent refresh via launchWebAuthFlow with interactive: false, prompt=none */
const silentRefresh = async (): Promise<string | null> => { ... }

/** Clear Drive token (called on sign-out) */
export const clearDriveToken = async (): Promise<void> => { ... }
```

**Status:** [ ] Done

---

### Step 4: Drive API helpers

**New file: `packages/supabase/lib/drive.ts`**

Plain `fetch()` against `https://www.googleapis.com/drive/v3/files`. No Google SDK.

```ts
/** Ensure "Unshafted" folder exists, cache folder ID */
export const getOrCreateFolder = async (token: string): Promise<string> => { ... }

/** Find existing file by contentHash + analysisType via appProperties query */
export const findExistingFile = async (
  token: string, folderId: string, contentHash: string, analysisType: string
): Promise<string | null> => { ... }   // returns fileId or null

/** Create or update a Drive file (handles dedup via findExistingFile) */
export const upsertAnalysisFile = async (
  token: string, folderId: string, filename: string,
  content: DriveAnalysisFile, contentHash: string, analysisType: string
): Promise<void> => { ... }

/** List all analysis files from the Unshafted folder */
export const listAnalysisFiles = async (
  token: string, folderId: string
): Promise<DriveAnalysisFile[]> => { ... }

/** Delete a file by appProperties match (contentHash + analysisType) */
export const deleteAnalysisFile = async (
  token: string, folderId: string, contentHash: string, analysisType: string
): Promise<void> => { ... }
```

**Status:** [ ] Done

---

### Step 5: Drive file type definitions

**New file: `packages/supabase/lib/drive-types.ts`**

```ts
import type { QuickScanResult, DeepAnalysisResult } from '@extension/unshafted-core';

export type DriveAnalysisFile = DriveQuickScanFile | DriveDeepAnalysisFile;

export interface DriveQuickScanFile {
  contentHash: string;
  documentName: string;
  analysisType: 'quick-scan';
  createdAt: string;
  updatedAt: string;
  role: string;
  result: QuickScanResult;
}

export interface DriveDeepAnalysisFile {
  contentHash: string;
  documentName: string;
  analysisType: 'deep-analysis';
  createdAt: string;
  updatedAt: string;
  role: string;
  priorities: string[];
  result: DeepAnalysisResult;
}
```

**Status:** [ ] Done

---

### Step 6: Sync layer

**New file: `packages/supabase/lib/drive-sync.ts`**

Fire-and-forget wrappers. All functions catch errors internally and never throw.

```ts
/** Save quick scan to Drive (fire-and-forget) */
export const syncQuickScanToDrive = async (
  analysis: CurrentAnalysis
): Promise<void> => { ... }

/** Save deep analysis to Drive (fire-and-forget) */
export const syncDeepAnalysisToDrive = async (
  analysis: CurrentAnalysis
): Promise<void> => { ... }

/** Load all analyses from Drive (for hydrating empty local history) */
export const loadHistoryFromDrive = async (): Promise<DriveAnalysisFile[]> => { ... }

/** Delete analysis from Drive by content hash */
export const deleteFromDrive = async (
  contentHash: string, analysisType: string
): Promise<void> => { ... }
```

**Status:** [ ] Done

---

### Step 7: Wire sync into analysis workflow

**File: `pages/popup/src/components/AnalysisWorkspace.tsx`**

After quick scan completes:
```ts
// After successful quick scan
if (result.quickScan) {
  void syncQuickScanToDrive(result);
}
```

After deep analysis completes:
```ts
if (result.status === 'complete' && result.quickScan && result.deepAnalysis) {
  await usageSnapshotStorage.incrementFullAnalyses();
  await analysisHistoryStorage.push(createHistoryRecord(result));
  void syncDeepAnalysisToDrive(result);
}
```

**Status:** [ ] Done

---

### Step 8: Hydrate local from Drive on new device

**File: `pages/popup/src/Popup.tsx`**

On popup mount, if signed in + local history empty → load from Drive.

**Status:** [ ] Done

---

### Step 9: Clear Drive token on sign-out

**File: `packages/supabase/lib/auth.ts`**

```ts
export const signOut = async () => {
  await supabase.auth.signOut();
  await clearDriveToken();
};
```

**Status:** [ ] Done

---

### Step 10: Export new functions

**File: `packages/supabase/lib/index.ts`**

Add Drive exports.

**Status:** [ ] Done

---

## Execution order

| # | Task | Type | Depends on |
|---|---|---|---|
| 1 | ~~Enable Drive API in Google Cloud Console~~ | ~~Manual~~ | Done |
| 2 | ~~Update OAuth data access with drive.file scope~~ | ~~Manual~~ | Done |
| 3 | Doc name sanitization + content hash in unshafted-core | Code | — |
| 4 | Modify auth flow: `response_type=token id_token`, Drive scope, store access_token | Code | — |
| 5 | Drive token management (get, silent refresh, clear) | Code | 4 |
| 6 | Drive file types | Code | — |
| 7 | Drive API helpers (folder, upsert, list, delete, dedup) | Code | 5, 6 |
| 8 | Sync layer (fire-and-forget wrappers) | Code | 7 |
| 9 | Wire sync into quick scan + deep analysis completion | Code | 3, 8 |
| 10 | Hydrate local from Drive on new device | Code | 8 |
| 11 | Clear Drive token on sign-out | Code | 5 |
| 12 | End-to-end test | Manual | All |

### E2E test plan

1. Sign out → sign back in → consent screen now shows Drive permission
2. Upload a contract → name is sanitized (check `slug` field)
3. Quick scan completes → "Unshafted" folder in Drive → quick scan JSON file with correct naming
4. Re-run quick scan on same document → same file updated (check `updatedAt`), no duplicate
5. Run deep analysis → second file appears in Drive for same document (deep-analysis type)
6. Upload a different contract → new files with different content hash
7. Re-upload same contract → content hash matches → overwrites existing files
8. Clear local extension data → sign in → local history populates from Drive
9. Close popup → reopen after 1+ hour → Drive calls still work (silent refresh)
10. Turn off internet → analysis completes → no error shown

---

## Files changed summary

| File | Change |
|---|---|
| `packages/unshafted-core/lib/document.ts` | Add `sanitizeDocumentName()`, `computeContentHash()` |
| `packages/unshafted-core/lib/schemas.ts` | Add `slug`, `contentHash` to `IngestedDocumentSchema` |
| `packages/supabase/lib/auth.ts` | Add Drive scope, capture access_token, clear on sign-out |
| `packages/supabase/lib/drive-token.ts` | **New** — token management + silent refresh |
| `packages/supabase/lib/drive-types.ts` | **New** — Drive file type definitions |
| `packages/supabase/lib/drive.ts` | **New** — Drive REST API helpers with dedup |
| `packages/supabase/lib/drive-sync.ts` | **New** — high-level fire-and-forget sync layer |
| `packages/supabase/lib/index.ts` | Export new Drive functions |
| `pages/popup/src/components/AnalysisWorkspace.tsx` | Call syncQuickScanToDrive + syncDeepAnalysisToDrive |
| `pages/popup/src/Popup.tsx` | Hydrate from Drive on new device |

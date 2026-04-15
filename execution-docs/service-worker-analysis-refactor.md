# Service Worker Analysis Execution + Early Source Upload

## What and Why

Two architectural fixes for the Unshafted Chrome extension (MV3, React+TypeScript, pnpm monorepo):

1. **Move LLM analysis from popup to service worker.** Currently `runQuickScan()` and `runDeepAnalysis()` execute in the popup context. Closing the popup kills the in-flight `fetch()` to the LLM API. The service worker survives popup close (MV3 keeps it alive during active fetch, up to 5 min).

2. **Upload source file to Drive immediately on document ingestion**, not after quick scan. Decouples source storage from analysis results.

## Architecture

The storage layer (`@extension/storage`) already syncs between popup and service worker via `chrome.storage.onChanged` with `liveUpdate: true`. The `useStorage()` React hook auto-updates when any context writes. This means: **service worker writes results to storage, popup picks them up automatically. No response messages needed.** Only trigger messages (popup → SW) are required.

The functions `runQuickScan` and `runDeepAnalysis` in `packages/shared/lib/utils/analysis-workflow.ts` are pure async — they use `fetch()`, Zod schemas, and nothing else. Zero DOM/React dependencies. Safe to call from the service worker.

---

## Implementation Steps

### Step 1: Add message types to `packages/unshafted-core/lib/runtime.ts`

Add after the existing `ExtractPageResponse` type (around line 19):

```ts
export const RUN_QUICK_SCAN_MESSAGE = 'unshafted/run-quick-scan';
export const RUN_DEEP_ANALYSIS_MESSAGE = 'unshafted/run-deep-analysis';

export type RunQuickScanRequest = {
  type: typeof RUN_QUICK_SCAN_MESSAGE;
  isSignedIn: boolean;
};

export type RunDeepAnalysisRequest = {
  type: typeof RUN_DEEP_ANALYSIS_MESSAGE;
};

export type AnalysisMessageResponse =
  | { ok: true }
  | { ok: false; error: string };
```

`isSignedIn` is passed so the service worker can enforce anonymous daily scan limits without calling Supabase auth. Actual analysis results flow through storage, not the message response.

### Step 2: Expand `chrome-extension/src/background/index.ts`

Currently 9 lines (just Supabase auth). Expand to ~80-100 lines with analysis message handlers.

```ts
import { supabase, syncQuickScanToDrive, syncDeepAnalysisToDrive, getSession } from '@extension/supabase';
import { runQuickScan, runDeepAnalysis } from '@extension/shared';
import {
  currentAnalysisStorage,
  unshaftedSettingsStorage,
  usageSnapshotStorage,
  analysisHistoryStorage,
} from '@extension/storage';
import {
  createHistoryRecord,
  RUN_QUICK_SCAN_MESSAGE,
  RUN_DEEP_ANALYSIS_MESSAGE,
} from '@extension/unshafted-core';
import type {
  RunQuickScanRequest,
  AnalysisMessageResponse,
} from '@extension/unshafted-core';

console.info('[Unshafted] background worker ready');

supabase.auth.onAuthStateChange((event, session) => {
  console.info('[Unshafted] auth state:', event, session?.user?.email ?? 'no user');
});

// ── Analysis message handler ──

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === RUN_QUICK_SCAN_MESSAGE) {
    handleQuickScan(message as RunQuickScanRequest).then(sendResponse);
    return true;
  }
  if (message.type === RUN_DEEP_ANALYSIS_MESSAGE) {
    handleDeepAnalysis().then(sendResponse);
    return true;
  }
});

async function handleQuickScan(req: RunQuickScanRequest): Promise<AnalysisMessageResponse> {
  const analysis = await currentAnalysisStorage.get();
  if (!analysis) return { ok: false, error: 'No analysis loaded.' };
  if (analysis.status === 'quick-running' || analysis.status === 'deep-running') {
    return { ok: false, error: 'Analysis already in progress.' };
  }

  // Anonymous daily limit
  if (!req.isSignedIn) {
    const canScan = await usageSnapshotStorage.canAnonymousQuickScan();
    if (!canScan) {
      return { ok: false, error: "You've used your 3 free quick scans for today. Sign in for unlimited scans." };
    }
  }

  const analysisId = analysis.id;
  await currentAnalysisStorage.set({ ...analysis, status: 'quick-running', error: null });

  const settings = await unshaftedSettingsStorage.get();
  const result = await runQuickScan({ ...analysis, status: 'quick-running', error: null }, settings);

  // Stale check — user may have uploaded a new document while scan was running
  const current = await currentAnalysisStorage.get();
  if (current?.id !== analysisId) return { ok: true };

  await currentAnalysisStorage.set(result);

  // Post-scan bookkeeping
  if (!req.isSignedIn && result.status !== 'error') {
    await usageSnapshotStorage.incrementQuickScans();
  }

  // Drive sync (fire-and-forget)
  if (result.quickScan) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) void syncQuickScanToDrive(result);
  }

  return { ok: true };
}

async function handleDeepAnalysis(): Promise<AnalysisMessageResponse> {
  const analysis = await currentAnalysisStorage.get();
  if (!analysis) return { ok: false, error: 'No analysis loaded.' };
  if (analysis.status === 'deep-running') return { ok: false, error: 'Deep analysis already in progress.' };
  if (!analysis.quickScan) return { ok: false, error: 'Run quick scan first.' };

  const analysisId = analysis.id;
  await currentAnalysisStorage.set({ ...analysis, status: 'deep-running', error: null });

  const settings = await unshaftedSettingsStorage.get();
  const result = await runDeepAnalysis({ ...analysis, status: 'deep-running', error: null }, settings);

  // Stale check
  const current = await currentAnalysisStorage.get();
  if (current?.id !== analysisId) return { ok: true };

  await currentAnalysisStorage.set(result);

  if (result.status === 'complete' && result.quickScan && result.deepAnalysis) {
    await usageSnapshotStorage.incrementFullAnalyses();
    await analysisHistoryStorage.push(createHistoryRecord(result));
    void syncDeepAnalysisToDrive(result);
  }

  return { ok: true };
}
```

### Step 3: Simplify `pages/popup/src/components/AnalysisWorkspace.tsx`

**Remove these imports** (no longer needed in popup):
- `runDeepAnalysis`, `runQuickScan` from `@extension/shared`
- `syncQuickScanToDrive`, `syncDeepAnalysisToDrive` from `@extension/supabase`
- `analysisHistoryStorage`, `usageSnapshotStorage` from `@extension/storage`
- `createHistoryRecord` from `@extension/unshafted-core` (if imported — check)

**Add imports:**
- `RUN_QUICK_SCAN_MESSAGE`, `RUN_DEEP_ANALYSIS_MESSAGE` from `@extension/unshafted-core`
- `type AnalysisMessageResponse` from `@extension/unshafted-core`

**Replace `startQuickScan` function** (currently lines ~107-146) with:

```ts
const startQuickScan = async (analysis: CurrentAnalysis) => {
  setPanelError('');
  setStepIndex(0);

  const response: AnalysisMessageResponse = await chrome.runtime.sendMessage({
    type: RUN_QUICK_SCAN_MESSAGE,
    isSignedIn: !!session,
  });

  if (!response.ok) {
    setPanelError(response.error);
  }
};
```

**Replace `startDeepAnalysis` function** (currently lines ~148-182) with:

```ts
const startDeepAnalysis = async () => {
  if (!currentAnalysis) return;
  if (!session) {
    setPanelError('Sign in with Google to unlock detailed analysis.');
    return;
  }
  setPanelError('');
  setStepIndex(0);

  const response: AnalysisMessageResponse = await chrome.runtime.sendMessage({
    type: RUN_DEEP_ANALYSIS_MESSAGE,
  });

  if (!response.ok) {
    setPanelError(response.error);
  }
};
```

**Keep everything else:** auto-trigger `useEffect` (calls `startQuickScan` which now sends a message), loading animation, all render/display logic, `setCurrent`, `autoQuickScanRef`.

### Step 4: Early source upload in `pages/popup/src/Popup.tsx`

**Add imports:**
```ts
import { getDriveToken, getOrCreateFolder, ensureSourceFile } from '@extension/supabase';
import type { IngestedDocument } from '@extension/unshafted-core';
```

**Add helper function** (before the component or at module scope):
```ts
const uploadSourceToDrive = async (doc: IngestedDocument): Promise<void> => {
  try {
    if (!doc.originalFileBase64 || !doc.contentHash) return;
    const token = await getDriveToken();
    if (!token) return;
    const folderId = await getOrCreateFolder(token);
    const mime = doc.originalMimeType ?? 'text/plain';
    const ext = mime === 'application/pdf' ? '.pdf' : '.txt';
    const filename = `${doc.slug}_source_${doc.contentHash.slice(0, 8)}${ext}`;
    await ensureSourceFile(token, folderId, filename, doc.originalFileBase64, mime, doc.contentHash);
  } catch (e) {
    console.warn('[Drive] early source upload failed:', e);
  }
};
```

**Update `handleFileChosen`** (currently lines 171-187) — add source upload after storage write:

```ts
const handleFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
  const file = event.target.files?.[0];
  if (!file) return;
  setLaunchError('');
  setUploading(true);
  try {
    const document = await buildDocumentFromFile(file);
    await currentAnalysisStorage.set(createCurrentAnalysis(document));

    // Push source file to Drive immediately (fire-and-forget, signed-in only)
    if (session && document.originalFileBase64 && document.contentHash) {
      void uploadSourceToDrive(document);
    }
  } catch (error) {
    setLaunchError(error instanceof Error ? error.message : 'Unable to open this file.');
  } finally {
    event.target.value = '';
    setUploading(false);
  }
};
```

The `ensureSourceFile` calls in `drive-sync.ts` remain as idempotent fallback — don't remove them.

---

## Edge Cases Already Handled

- **Popup closes mid-analysis**: SW continues, popup reads state on reopen via `useStorage`
- **Duplicate triggers**: SW checks `status === 'quick-running'` and rejects. `autoQuickScanRef` in popup also guards.
- **New upload during analysis**: Stale check via `analysisId` comparison — SW discards outdated result
- **SW idle timeout**: MV3 keeps SW alive during active `fetch()` (up to 5 min)
- **`sendMessage` rejected after popup close**: Harmless — SW already received and is processing

---

## Verification Checklist

- [ ] `pnpm build` passes with no TS errors
- [ ] Upload PDF while signed in → source file appears in Drive "Unshafted" folder immediately (before scan)
- [ ] Quick scan runs → close popup → reopen → results are shown
- [ ] Deep analysis runs → close popup → reopen → results are shown
- [ ] Upload new doc while scan is running → old scan result is discarded, new doc shown
- [ ] Anonymous user: 3 quick scans work, 4th shows limit error
- [ ] Check service worker console (`chrome://extensions` → inspect SW) for `[Unshafted]` logs

## Status

- [ ] Step 1: Message types
- [ ] Step 2: Service worker handlers
- [ ] Step 3: Popup simplification
- [ ] Step 4: Early source upload
- [ ] Build verification
- [ ] Manual testing

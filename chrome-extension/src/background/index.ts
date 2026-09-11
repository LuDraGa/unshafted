import { registerSitePolicySidePanel } from './side-panel.js';
import { registerSitePolicyBadge } from './site-policy.js';
import { runQuickScan, runDeepAnalysis, runSitePolicyAnalysis } from '@extension/shared';
import {
  currentAnalysisStorage,
  unshaftedSettingsStorage,
  usageSnapshotStorage,
  analysisHistoryStorage,
  clearLegacyPersistentAnalysisState,
  localSitePolicyStorage,
  sitePolicyRunStorage,
} from '@extension/storage';
import { supabase, syncQuickScanToDrive, syncDeepAnalysisToDrive, syncSitePolicyToDrive } from '@extension/supabase';
import {
  createHistoryRecord,
  RUN_QUICK_SCAN_MESSAGE,
  RUN_DEEP_ANALYSIS_MESSAGE,
  RUN_SITE_POLICY_ANALYSIS_MESSAGE,
} from '@extension/unshafted-core';
import type {
  RunQuickScanRequest,
  RunSitePolicyAnalysisRequest,
  LocalPolicyAnalysis,
  AnalysisMessageResponse,
} from '@extension/unshafted-core';

console.info('[Unshafted] background worker ready');

void clearLegacyPersistentAnalysisState();

registerSitePolicyBadge();
registerSitePolicySidePanel();

supabase.auth.onAuthStateChange(event => {
  console.info('[Unshafted] auth state:', event);
});

// ── Analysis message handler ──

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === RUN_QUICK_SCAN_MESSAGE) {
    respondSafely(handleQuickScan(message as RunQuickScanRequest), sendResponse);
    return true;
  }
  if (message.type === RUN_DEEP_ANALYSIS_MESSAGE) {
    respondSafely(handleDeepAnalysis(), sendResponse);
    return true;
  }
  if (message.type === RUN_SITE_POLICY_ANALYSIS_MESSAGE) {
    respondSafely(handleSitePolicyAnalysis(message as RunSitePolicyAnalysisRequest), sendResponse);
    return true;
  }

  return false;
});

const respondSafely = (
  task: Promise<AnalysisMessageResponse>,
  sendResponse: (response: AnalysisMessageResponse) => void,
) => {
  task.then(sendResponse).catch(error => {
    const message = error instanceof Error ? error.message : 'Unexpected background error.';
    sendResponse({ ok: false, error: message });
  });
};

const handleQuickScan = async (req: RunQuickScanRequest): Promise<AnalysisMessageResponse> => {
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
  const scanInput = {
    ...analysis,
    quickScan: null,
    deepAnalysis: null,
    status: 'quick-running' as const,
    error: null,
  };
  await currentAnalysisStorage.set(scanInput);

  const settings = await unshaftedSettingsStorage.get();
  const result = await runQuickScan(scanInput, settings);

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
    const {
      data: { session },
    } = await supabase.auth.getSession();
    await analysisHistoryStorage.push(
      createHistoryRecord(result, {
        storageState: session && settings.driveBackupEnabled ? 'drive-backup-requested' : 'local-only',
      }),
    );
    if (session && settings.driveBackupEnabled) {
      void syncQuickScanToDrive(result)
        .then(async synced => {
          if (synced) {
            await analysisHistoryStorage.push(createHistoryRecord(result, { storageState: 'drive-backed-up' }));
          }
        })
        .catch(error => console.warn('[Drive sync] unable to mark quick scan as backed up:', error));
    }
  }

  return { ok: true };
};

const handleDeepAnalysis = async (): Promise<AnalysisMessageResponse> => {
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
    await analysisHistoryStorage.push(
      createHistoryRecord(result, {
        storageState: settings.driveBackupEnabled ? 'drive-backup-requested' : 'local-only',
      }),
    );
    if (settings.driveBackupEnabled) {
      void syncDeepAnalysisToDrive(result)
        .then(async synced => {
          if (synced) {
            await analysisHistoryStorage.push(createHistoryRecord(result, { storageState: 'drive-backed-up' }));
          }
        })
        .catch(error => console.warn('[Drive sync] unable to mark detailed analysis as backed up:', error));
    }
  }

  return { ok: true };
};

/**
 * A user-initiated site-policy run over the documents the panel captured (Part 6, S5).
 *
 * The run lives here rather than in the panel because the panel is closed by the user at will,
 * and closing it would kill an in-flight fetch the user is paying for. As with quick scan and
 * deep analysis, the response says only that the run started — every result travels back through
 * `liveUpdate` storage.
 */
const handleSitePolicyAnalysis = async (req: RunSitePolicyAnalysisRequest): Promise<AnalysisMessageResponse> => {
  const targets = req.targets ?? [];
  if (targets.length === 0) return { ok: false, error: 'No policy documents to analyse.' };

  // One run at a time. Two would race on the same storage budget, and the loser would be an
  // analysis the user already paid for.
  const runState = await sitePolicyRunStorage.get();
  if (runState.status === 'running') {
    return { ok: false, error: 'A site policy analysis is already running.' };
  }

  const settings = await unshaftedSettingsStorage.get();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const backupToDrive = Boolean(session) && settings.driveBackupEnabled;

  await sitePolicyRunStorage.start(targets[0].domain, targets.length);

  // Sequential, not `Promise.all`: each save is budget-checked against the ones before it, and
  // parallel runs would spend on documents that a stop decision has already ruled out.
  for (const target of targets) {
    await sitePolicyRunStorage.beginDocument(target.sourceUrl);

    let local: LocalPolicyAnalysis;
    try {
      local = await runSitePolicyAnalysis(target, settings);
    } catch (error) {
      // `runSitePolicyAnalysis` throws a plain `AnalysisError` object, not an `Error`, so the
      // message is read off the shape rather than the class.
      const message =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message
          : 'Site policy analysis failed.';
      // One document failing is not the run failing — record it and read the next one.
      await sitePolicyRunStorage.finishDocument(target.sourceUrl, message);
      continue;
    }

    const saved = await localSitePolicyStorage.save(local);

    if (saved.status === 'over-budget') {
      // Recorded as over-budget and NOT as a failure: the two are deliberately separate
      // conversations. A failure is a document we could not analyse; this one we analysed, the
      // user paid for it, and the fix is theirs to make — free space, then run it again.
      await sitePolicyRunStorage.recordOverBudget(target.sourceUrl, saved.bytes, saved.budgetBytes);
      // Stop the whole run: every further document would spend the user's own API credits on a
      // result we already know we cannot keep.
      break;
    }

    await sitePolicyRunStorage.finishDocument(target.sourceUrl);

    if (backupToDrive) {
      void syncSitePolicyToDrive(local).catch(error =>
        console.warn('[Drive sync] unable to back up site policy analysis:', error),
      );
    }
  }

  await sitePolicyRunStorage.finish();

  return { ok: true };
};

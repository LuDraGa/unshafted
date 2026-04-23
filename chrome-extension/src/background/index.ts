import { supabase, syncQuickScanToDrive, syncDeepAnalysisToDrive } from '@extension/supabase';
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

  return false;
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

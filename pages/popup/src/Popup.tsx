import '@src/Popup.css';
import { AnalysisWorkspace } from './components/AnalysisWorkspace';
import { ResultsView } from './components/ResultCards';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import {
  analysisHistoryStorage,
  clearLegacyPersistentAnalysisState,
  currentAnalysisStorage,
  unshaftedOnboardingStorage,
  unshaftedSettingsStorage,
} from '@extension/storage';
import {
  ensureSourceFile,
  getDriveToken,
  getOrCreateFolder,
  getSession,
  loadHistoryFromDrive,
  onAuthStateChange,
  deleteFromDrive,
  signInWithGoogle,
  signOut,
  syncDeepAnalysisToDrive,
  syncQuickScanToDrive,
} from '@extension/supabase';
import { ErrorDisplay, LoadingSpinner, SpotlightTour } from '@extension/ui';
import {
  buildDocumentFromFile,
  configurePdfWorker,
  createCurrentAnalysis,
  createHistoryRecord,
  createReportMarkdown,
  createSampleAnalysis,
  getActiveProviderConfig,
  getOnboardingKeyHash,
  PRIORITY_OPTIONS,
} from '@extension/unshafted-core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@extension/supabase';
import type { SpotlightTourStep } from '@extension/ui';
import type { HistoryRecord, IngestedDocument, OnboardingState, OnboardingStep } from '@extension/unshafted-core';
import type { ChangeEvent } from 'react';

configurePdfWorker(chrome.runtime.getURL('popup/pdf.worker.min.mjs'));

const onboardingSteps: OnboardingStep[] = [
  'provider',
  'api-key',
  'save-settings',
  'test-connection',
  'sign-in',
  'upload',
  'results',
];
const setupSteps = new Set<OnboardingStep>(['provider', 'api-key', 'save-settings', 'test-connection']);
type SpotlightTarget = 'sign-in' | 'api-key' | 'upload' | 'summary' | 'flags' | 'customize' | 'cta';
type ResultGuideStep = 'summary' | 'flags' | 'customize' | 'cta';

type PopupSpotlightStep = SpotlightTourStep & {
  id: OnboardingStep | ResultGuideStep;
  target: SpotlightTarget;
};

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

const getStepRank = (step: OnboardingStep) => onboardingSteps.indexOf(step);

const getActiveOnboardingStep = ({
  hasActiveApiKey,
  hasTestedActiveKey,
  onboarding,
  hasQuickScan,
  session,
}: {
  hasActiveApiKey: boolean;
  hasTestedActiveKey: boolean;
  onboarding: OnboardingState;
  hasQuickScan: boolean;
  session: Session | null;
}): OnboardingStep | null => {
  if (onboarding.dismissedAt || onboarding.completedAt) {
    return null;
  }

  if (!hasTestedActiveKey) {
    if (setupSteps.has(onboarding.currentStep)) {
      return onboarding.currentStep;
    }

    if (hasActiveApiKey) {
      return 'test-connection';
    }

    return 'provider';
  }

  const startIndex = Math.max(getStepRank('sign-in'), getStepRank(onboarding.currentStep));
  const incomplete = {
    provider: false,
    'api-key': false,
    'save-settings': false,
    'test-connection': false,
    'sign-in': !session,
    upload: !hasQuickScan,
    results: !onboarding.seenResultGuidance,
  } satisfies Record<OnboardingStep, boolean>;

  for (let index = startIndex; index < onboardingSteps.length; index += 1) {
    const step = onboardingSteps[index];
    if (step === 'results' && !hasQuickScan) {
      return 'upload';
    }

    if (incomplete[step]) {
      return step;
    }
  }

  return null;
};

const UserAvatar = ({ avatarUrl, email, onSignOut }: { avatarUrl?: string; email: string; onSignOut: () => void }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const initial = email.charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        className="h-7 w-7 flex-shrink-0 overflow-hidden rounded-full border-2 border-stone-200 transition hover:border-stone-400"
        onClick={() => setMenuOpen(o => !o)}
        title={email}
        type="button">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-stone-900 text-xs font-bold text-stone-50">
            {initial}
          </div>
        )}
      </button>
      {menuOpen ? (
        <div className="absolute right-0 top-9 z-50 min-w-[180px] rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
          <p className="truncate px-2 py-1 text-[11px] text-stone-500">{email}</p>
          <button
            className="w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
            onClick={() => {
              setMenuOpen(false);
              onSignOut();
            }}
            type="button">
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
};

const formatReportDate = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

const storageStateCopy = {
  'local-only': 'Local only',
  'drive-backup-requested': 'Drive backup requested',
  'drive-backed-up': 'Drive backed up',
  'restored-from-drive': 'Restored from Drive',
} satisfies Record<HistoryRecord['storageState'], string>;

const riskToneClasses = {
  Low: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  Medium: 'border-amber-200 bg-amber-50 text-amber-900',
  High: 'border-orange-200 bg-orange-50 text-orange-900',
  'Very High': 'border-rose-200 bg-rose-50 text-rose-900',
} satisfies Record<HistoryRecord['quickScan']['roughRiskLevel'], string>;

const createReportFilename = (record: HistoryRecord): string =>
  `${record.source.slug || 'unshafted-report'}-${record.createdAt.slice(0, 10)}.md`;

const hasReportDetails = (record: HistoryRecord | null | undefined): boolean => Boolean(record?.quickScan);

const Popup = () => {
  const onboarding = useStorage(unshaftedOnboardingStorage);
  const settings = useStorage(unshaftedSettingsStorage);
  const currentAnalysis = useStorage(currentAnalysisStorage);
  const history = useStorage(analysisHistoryStorage);

  const [launchError, setLaunchError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<HistoryRecord | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [historySyncing, setHistorySyncing] = useState(false);
  const [pendingDriveBackupId, setPendingDriveBackupId] = useState<string | null>(null);
  const [pendingDeleteReportId, setPendingDeleteReportId] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState('');
  const [resultGuidanceStep, setResultGuidanceStep] = useState<ResultGuideStep>('summary');
  const [activeKeyHash, setActiveKeyHash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedReportRef = useRef<HTMLElement | null>(null);

  const activeProviderConfig = getActiveProviderConfig(settings);
  const activeProvider = activeProviderConfig.provider;
  const activeProviderApiKey = activeProviderConfig.apiKey;
  const activeProviderModel = activeProviderConfig.model;
  const hasActiveApiKey = Boolean(activeProviderConfig.apiKey);
  const hasTestedActiveKey = Boolean(
    hasActiveApiKey &&
      activeKeyHash &&
      onboarding.testedProvider === activeProviderConfig.provider &&
      onboarding.testedKeyHash === activeKeyHash &&
      onboarding.testedModel === activeProviderConfig.model,
  );
  const hasQuickScan = Boolean(currentAnalysis?.quickScan);

  const activeOnboardingStep = getActiveOnboardingStep({
    hasActiveApiKey,
    hasTestedActiveKey,
    onboarding,
    hasQuickScan,
    session,
  });
  const hasFlags = Boolean(currentAnalysis?.quickScan?.redFlags.length);
  const openedHistoryReport = useMemo(() => {
    if (!selectedHistory) return null;
    if (hasReportDetails(selectedHistory)) return selectedHistory;

    const matchesCurrentAnalysis =
      currentAnalysis?.quickScan &&
      (currentAnalysis.id === selectedHistory.id ||
        (!!currentAnalysis.source.contentHash &&
          currentAnalysis.source.contentHash === selectedHistory.source.contentHash));

    if (!matchesCurrentAnalysis) return selectedHistory;

    return createHistoryRecord(currentAnalysis, { storageState: selectedHistory.storageState });
  }, [currentAnalysis, selectedHistory]);
  const spotlightStep: PopupSpotlightStep | null = activeOnboardingStep
    ? activeOnboardingStep === 'results'
      ? (
          {
            summary: {
              id: 'summary',
              target: 'summary',
              text: 'Start here: this is the practical signing posture and next action.',
            },
            flags: {
              id: 'flags',
              target: 'flags',
              text: 'Check these flags before reading details. They are the fastest risk triage.',
            },
            customize: {
              id: 'customize',
              target: 'customize',
              text: 'Set your role only if you want the deeper review tailored to your side.',
            },
            cta: {
              id: 'cta',
              target: 'cta',
              text: session
                ? 'Run detailed analysis when ready.'
                : 'Sign in for deeper review. Drive backup stays separate.',
              final: true,
            },
          } satisfies Record<ResultGuideStep, PopupSpotlightStep>
        )[resultGuidanceStep]
      : ((
          {
            provider: {
              id: 'provider',
              target: 'api-key',
              text: 'Setup has four steps. Start by choosing the AI provider that will analyze your contract text.',
              nextLabel: 'Open',
            },
            'api-key': {
              id: 'api-key',
              target: 'api-key',
              text: 'Paste your provider key in Options. It stays local in extension storage.',
              nextLabel: 'Open',
            },
            'save-settings': {
              id: 'save-settings',
              target: 'api-key',
              text: 'Save the key locally before testing it.',
              nextLabel: 'Open',
            },
            'test-connection': {
              id: 'test-connection',
              target: 'api-key',
              text: 'Test once before scanning your own contracts.',
              nextLabel: 'Open',
            },
            'sign-in': {
              id: 'sign-in',
              target: 'sign-in',
              text: 'Sign in for detailed analysis. You can enable Drive backup separately.',
              skipLabel: 'Skip',
            },
            upload: {
              id: 'upload',
              target: 'upload',
              text: 'Upload a PDF or TXT contract.',
            },
          } satisfies Partial<Record<OnboardingStep, PopupSpotlightStep>>
        )[activeOnboardingStep] ?? null)
    : null;

  const advanceOnboarding = useCallback(async (nextStep: OnboardingStep) => {
    await unshaftedOnboardingStorage.set(current => {
      if (current.completedAt) return current;
      if (getStepRank(current.currentStep) >= getStepRank(nextStep)) return current;
      return { ...current, currentStep: nextStep };
    });
  }, []);

  const completeOnboarding = useCallback(async () => {
    await unshaftedOnboardingStorage.set(current => ({
      ...current,
      dismissedAt: null,
      completedAt: new Date().toISOString(),
      currentStep: 'results',
      seenResultGuidance: true,
    }));
  }, []);

  useEffect(() => {
    void clearLegacyPersistentAnalysisState();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!activeProviderApiKey) {
      setActiveKeyHash(null);
      return;
    }

    setActiveKeyHash(null);
    void getOnboardingKeyHash({
      provider: activeProvider,
      apiKey: activeProviderApiKey,
      model: activeProviderModel,
    }).then(hash => {
      if (!cancelled) {
        setActiveKeyHash(hash);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeProvider, activeProviderApiKey, activeProviderModel]);

  // Load auth state on mount
  useEffect(() => {
    getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (onboarding.dismissedAt || onboarding.completedAt) {
      return;
    }

    let nextStep = onboarding.currentStep;

    if (!hasTestedActiveKey) {
      if (hasActiveApiKey && !setupSteps.has(nextStep)) {
        nextStep = 'test-connection';
      } else if (!hasActiveApiKey && !setupSteps.has(nextStep)) {
        nextStep = 'provider';
      }
    } else {
      if (setupSteps.has(nextStep)) {
        nextStep = 'sign-in';
      }

      if (nextStep === 'sign-in' && session) {
        nextStep = 'upload';
      }

      if (nextStep === 'upload' && hasQuickScan) {
        nextStep = 'results';
      }
    }

    if (nextStep !== onboarding.currentStep) {
      void unshaftedOnboardingStorage.set(current => ({ ...current, currentStep: nextStep }));
    }
  }, [
    hasActiveApiKey,
    hasQuickScan,
    hasTestedActiveKey,
    onboarding.completedAt,
    onboarding.currentStep,
    onboarding.dismissedAt,
    session,
  ]);

  useEffect(() => {
    if (activeOnboardingStep === 'results' && !onboarding.seenResultGuidance) {
      setResultGuidanceStep('summary');
    }
  }, [activeOnboardingStep, onboarding.seenResultGuidance, currentAnalysis?.id]);

  useEffect(() => {
    if (activeOnboardingStep === 'results' && resultGuidanceStep === 'flags' && !hasFlags) {
      setResultGuidanceStep('customize');
    }
  }, [activeOnboardingStep, hasFlags, resultGuidanceStep]);

  useEffect(() => {
    if (!selectedHistory) return;

    window.requestAnimationFrame(() => {
      selectedReportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      selectedReportRef.current?.focus({ preventScroll: true });
    });
  }, [selectedHistory]);

  const hydrateHistoryFromDrive = useCallback(
    async ({ onlyWhenEmpty = false }: { onlyWhenEmpty?: boolean } = {}) => {
      if (!session) return;

      setHistorySyncing(true);
      try {
        const localHistory = await analysisHistoryStorage.get();
        if (onlyWhenEmpty && localHistory.length > 0) return;

        const driveFiles = await loadHistoryFromDrive();
        if (driveFiles.length === 0) return;

        const byHash = new Map<string, typeof driveFiles>();
        for (const file of driveFiles) {
          const existing = byHash.get(file.contentHash) ?? [];
          existing.push(file);
          byHash.set(file.contentHash, existing);
        }

        const prioritySet = new Set<string>(PRIORITY_OPTIONS);

        for (const [, files] of byHash) {
          try {
            const quickFile = files.find(f => f.analysisType === 'quick-scan');
            const deepFile = files.find(f => f.analysisType === 'deep-analysis');

            if (!quickFile) continue;

            const rawPriorities = deepFile && 'priorities' in deepFile ? deepFile.priorities : [];
            const validPriorities = rawPriorities.filter(priority => prioritySet.has(priority));

            const record = {
              id: crypto.randomUUID(),
              createdAt: quickFile.createdAt,
              source: {
                kind: 'file' as const,
                name: quickFile.documentName,
                slug:
                  quickFile.documentName
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .slice(0, 60) || 'unnamed-document',
                contentHash: quickFile.contentHash,
                charCount: quickFile.charCount || 0,
                estimatedTokens: quickFile.estimatedTokens || 0,
                preview: `Restored from Google Drive: ${quickFile.documentName}`,
                quality: 'good' as const,
                warnings: [],
                capturedAt: quickFile.createdAt,
              },
              quickScan: quickFile.result,
              deepAnalysis: deepFile ? deepFile.result : undefined,
              selectedRole: quickFile.role,
              priorities: validPriorities,
              storageState: 'restored-from-drive' as const,
            };

            await analysisHistoryStorage.push(record as Parameters<typeof analysisHistoryStorage.push>[0]);
          } catch {
            // Best-effort hydration only.
          }
        }
      } catch {
        // Drive hydration is best-effort.
      } finally {
        setHistorySyncing(false);
      }
    },
    [session],
  );

  // Hydrate local history from Drive when signed in + history is empty.
  useEffect(() => {
    void hydrateHistoryFromDrive({ onlyWhenEmpty: true });
  }, [hydrateHistoryFromDrive]);

  const openUrlInTab = useCallback(async (url: string) => {
    try {
      await chrome.tabs.create({ url });
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const openOptions = useCallback(
    async (withOnboarding = false) => {
      setLaunchError('');
      const search = withOnboarding ? `?onboarding=true&provider=${activeProviderConfig.provider}` : '';
      await openUrlInTab(chrome.runtime.getURL(`options/index.html${search}`));
    },
    [activeProviderConfig.provider, openUrlInTab],
  );

  const handleSignIn = useCallback(async () => {
    setSigningIn(true);
    setLaunchError('');
    const result = await signInWithGoogle();
    if (!result.ok) {
      setLaunchError(result.error);
    } else {
      await advanceOnboarding('upload');
    }
    setSigningIn(false);
  }, [advanceOnboarding]);

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, []);

  const handleUploadFlow = useCallback(() => {
    setLaunchError('');
    setSelectedHistory(null);
    fileInputRef.current?.click();
  }, []);

  const handleDemo = useCallback(async () => {
    setLaunchError('');
    setUploading(true);
    try {
      setSelectedHistory(null);
      await currentAnalysisStorage.set(await createSampleAnalysis());
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : 'Unable to load the sample analysis.');
    } finally {
      setUploading(false);
    }
  }, []);

  const dismissWizard = useCallback(async () => {
    await unshaftedOnboardingStorage.set(current => ({
      ...current,
      dismissedAt: new Date().toISOString(),
    }));
  }, []);

  const resumeWizard = useCallback(async () => {
    await unshaftedOnboardingStorage.set(current => ({
      ...current,
      completedAt: null,
      dismissedAt: null,
      currentStep: 'provider',
    }));
  }, []);

  const advanceSpotlight = useCallback(async () => {
    if (!spotlightStep) return;

    switch (spotlightStep.id) {
      case 'provider':
      case 'api-key':
      case 'save-settings':
      case 'test-connection':
        await openOptions(true);
        return;
      case 'sign-in':
        await handleSignIn();
        return;
      case 'upload':
        handleUploadFlow();
        return;
      case 'summary':
        setResultGuidanceStep(hasFlags ? 'flags' : 'customize');
        return;
      case 'flags':
        setResultGuidanceStep('customize');
        return;
      case 'customize':
        setResultGuidanceStep('cta');
        return;
      case 'cta':
        await completeOnboarding();
        return;
      default:
        return;
    }
  }, [completeOnboarding, handleSignIn, handleUploadFlow, hasFlags, openOptions, spotlightStep]);

  const handleFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLaunchError('');
    setSelectedHistory(null);
    setUploading(true);

    try {
      const shouldBackupSource = Boolean(session && settings.driveBackupEnabled);
      const document = await buildDocumentFromFile(file, { includeOriginalFileBase64: shouldBackupSource });
      const storageDocument = { ...document, originalFileBase64: undefined };
      await currentAnalysisStorage.set(createCurrentAnalysis(storageDocument));

      if (shouldBackupSource && document.originalFileBase64 && document.contentHash) {
        void uploadSourceToDrive(document);
      }
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : 'Unable to open this file.');
    } finally {
      event.target.value = '';
      setUploading(false);
    }
  };

  const toggleDriveBackup = useCallback(async () => {
    setSyncNotice('');

    if (!session) {
      await handleSignIn();
      return;
    }

    const nextEnabled = !settings.driveBackupEnabled;
    await unshaftedSettingsStorage.set(current => ({
      ...current,
      driveBackupEnabled: nextEnabled,
    }));

    if (!nextEnabled) {
      setPendingDriveBackupId(null);
      setSyncNotice('Drive backup is off. Existing local reports stay local unless you delete them.');
      return;
    }

    if (!currentAnalysis?.quickScan) {
      setSyncNotice('Drive backup is enabled for future analyses.');
      return;
    }

    setPendingDriveBackupId(currentAnalysis.id);
    setSyncNotice('Drive backup is enabled. Choose whether to back up the current visible analysis.');
  }, [currentAnalysis?.id, currentAnalysis?.quickScan, handleSignIn, session, settings.driveBackupEnabled]);

  const backUpCurrentAnalysisToDrive = useCallback(async () => {
    if (!currentAnalysis?.quickScan) return;

    await analysisHistoryStorage.push(createHistoryRecord(currentAnalysis, { storageState: 'drive-backup-requested' }));
    void (async () => {
      const quickSynced = await syncQuickScanToDrive(currentAnalysis);
      const deepSynced = currentAnalysis.deepAnalysis ? await syncDeepAnalysisToDrive(currentAnalysis) : true;

      if (quickSynced && deepSynced) {
        await analysisHistoryStorage.push(createHistoryRecord(currentAnalysis, { storageState: 'drive-backed-up' }));
      }
    })();

    setPendingDriveBackupId(null);
    setSyncNotice('Current analysis backup requested.');
  }, [currentAnalysis]);

  const dismissCurrentBackupPrompt = useCallback(() => {
    setPendingDriveBackupId(null);
    setSyncNotice('Drive backup is enabled for future analyses.');
  }, []);

  const clearLocalReports = useCallback(async () => {
    setSelectedHistory(null);
    await currentAnalysisStorage.set(null);
    await analysisHistoryStorage.clear();
  }, []);

  const clearAllLocalData = useCallback(async () => {
    setLaunchError('');
    setSelectedHistory(null);
    setHistoryOpen(false);

    try {
      await signOut();
    } catch {
      // Best-effort sign-out; local storage clearing below is the real wipe.
    }

    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
  }, []);

  const requestDeleteHistoryRecord = useCallback((record: HistoryRecord) => {
    setPendingDeleteReportId(record.id);
  }, []);

  const cancelDeleteHistoryRecord = useCallback(() => {
    setPendingDeleteReportId(null);
  }, []);

  const confirmDeleteHistoryRecord = useCallback(
    async (record: HistoryRecord) => {
      if (selectedHistory?.id === record.id) {
        setSelectedHistory(null);
      }

      setPendingDeleteReportId(null);
      await analysisHistoryStorage.removeReport(record);
      if (record.source.contentHash) {
        void deleteFromDrive(record.source.contentHash, 'quick-scan');
        void deleteFromDrive(record.source.contentHash, 'deep-analysis');
      }
    },
    [selectedHistory?.id],
  );

  const copyHistoryRecord = useCallback(async (record: HistoryRecord) => {
    await navigator.clipboard.writeText(createReportMarkdown(record));
  }, []);

  const exportHistoryRecord = useCallback((record: HistoryRecord) => {
    const blob = new Blob([createReportMarkdown(record)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = createReportFilename(record);
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  const openHistoryRecord = useCallback((record: HistoryRecord) => {
    setSelectedHistory(record);
    setHistoryOpen(false);
  }, []);
  const shouldOpenLibraryPanel = Boolean(
    historyOpen || syncNotice || (pendingDriveBackupId && currentAnalysis?.id === pendingDriveBackupId),
  );

  return (
    <div className="popup-shell">
      <div className="popup-frame">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.pdf,text/plain,application/pdf"
          className="hidden"
          onChange={handleFileChosen}
        />

        <div className="popup-sticky-header">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="popup-eyebrow">Unshafted</p>
              <h1 className="popup-title">Contract risk, without the fog.</h1>
              <p className="popup-subtitle truncate">
                {selectedHistory
                  ? selectedHistory.source.name
                  : currentAnalysis
                    ? currentAnalysis.source.name
                    : 'Upload a contract to review (.pdf or .txt).'}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <div className={`popup-status-pill ${hasActiveApiKey ? 'popup-status-pill-ready' : ''}`}>
                {hasActiveApiKey ? 'Ready' : 'Setup'}
              </div>
              {hasActiveApiKey ? (
                <button
                  className="popup-upload-btn"
                  onClick={handleUploadFlow}
                  disabled={uploading}
                  title={currentAnalysis ? 'Analyze another contract' : 'Upload a contract'}
                  data-onboarding-target="upload"
                  type="button">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </button>
              ) : null}
              {!authLoading ? (
                session ? (
                  <UserAvatar
                    avatarUrl={session.user.user_metadata?.avatar_url ?? session.user.user_metadata?.picture}
                    email={session.user.email ?? ''}
                    onSignOut={handleSignOut}
                  />
                ) : (
                  <button
                    className="rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold text-stone-50 transition hover:bg-stone-700"
                    onClick={handleSignIn}
                    disabled={signingIn}
                    data-onboarding-target="sign-in"
                    type="button">
                    {signingIn ? 'Signing in...' : 'Sign in'}
                  </button>
                )
              ) : null}
            </div>
          </div>
        </div>

        <div className="popup-content">
          {selectedHistory ? (
            <section
              ref={selectedReportRef}
              className="space-y-3 rounded-3xl outline-none focus-visible:ring-4 focus-visible:ring-amber-200"
              tabIndex={-1}
              aria-label={`Opened report for ${selectedHistory.source.name}`}>
              <section className="popup-report-toolbar">
                <div>
                  <button className="popup-link-button" onClick={() => setSelectedHistory(null)} type="button">
                    Back to current scan
                  </button>
                  <p className="mt-1 text-xs text-stone-600">
                    {storageStateCopy[selectedHistory.storageState]} · {formatReportDate(selectedHistory.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    className="popup-link-button"
                    onClick={() => void copyHistoryRecord(selectedHistory)}
                    type="button">
                    Copy report
                  </button>
                  <button
                    className="popup-link-button"
                    onClick={() => exportHistoryRecord(selectedHistory)}
                    type="button">
                    Export .md
                  </button>
                  <button
                    className="popup-link-button"
                    onClick={() => requestDeleteHistoryRecord(selectedHistory)}
                    type="button">
                    Delete
                  </button>
                </div>
              </section>
              {pendingDeleteReportId === selectedHistory.id ? (
                <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  <p className="font-semibold">Delete this report?</p>
                  <p className="mt-1 text-xs leading-5">
                    This removes it from local recent analyses. If matching Drive files exist, Unshafted will also ask
                    Drive to remove them.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      className="popup-link-button text-rose-800"
                      onClick={() => void confirmDeleteHistoryRecord(selectedHistory)}
                      type="button">
                      Delete permanently
                    </button>
                    <button className="popup-link-button" onClick={cancelDeleteHistoryRecord} type="button">
                      Cancel
                    </button>
                  </div>
                </section>
              ) : null}
              {openedHistoryReport && hasReportDetails(openedHistoryReport) ? (
                <ResultsView record={openedHistoryReport} includeQuickReadout />
              ) : (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-semibold">Report details are missing</p>
                  <p className="mt-1 text-xs leading-5">
                    This saved entry has metadata, but no quick-scan or detailed-analysis payload. It may be from an
                    older broken save. Reopen the current scan if it is still loaded, or re-run the contract to create a
                    complete report.
                  </p>
                  {currentAnalysis?.quickScan &&
                  (currentAnalysis.id === selectedHistory.id ||
                    (!!currentAnalysis.source.contentHash &&
                      currentAnalysis.source.contentHash === selectedHistory.source.contentHash)) ? (
                    <button
                      className="popup-link-button mt-3"
                      onClick={() =>
                        setSelectedHistory(
                          createHistoryRecord(currentAnalysis, { storageState: selectedHistory.storageState }),
                        )
                      }
                      type="button">
                      Restore details from current scan
                    </button>
                  ) : null}
                </section>
              )}
            </section>
          ) : !currentAnalysis ? (
            <section className="popup-card space-y-3">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  {hasActiveApiKey ? 'Ready to scan' : 'Try it before setup'}
                </p>
                <p className="text-sm leading-5 text-stone-700">
                  Contract text is sent to your selected AI provider for analysis. API keys stay local. Drive backup is
                  off until you enable it.
                </p>
              </div>
              {hasActiveApiKey ? (
                <button
                  className="popup-primary-button"
                  onClick={handleUploadFlow}
                  disabled={uploading}
                  data-onboarding-target="upload"
                  type="button">
                  {uploading ? 'Loading contract...' : 'Upload your contract'}
                </button>
              ) : (
                <button
                  className="popup-primary-button"
                  onClick={() => void openOptions(true)}
                  data-onboarding-target="api-key"
                  type="button">
                  Set up API key
                </button>
              )}
              <button
                className="popup-secondary-button"
                onClick={() => void handleDemo()}
                disabled={uploading}
                type="button">
                View sample analysis
              </button>
            </section>
          ) : (
            <AnalysisWorkspace
              session={session}
              onSignIn={handleSignIn}
              focusedOnboardingTarget={activeOnboardingStep === 'results' ? resultGuidanceStep : null}
            />
          )}

          {!hasActiveApiKey ? (
            <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">API key required for your own contracts</p>
              <p className="mt-1 text-amber-800">
                You can inspect the sample now, then save your{' '}
                {settings.provider === 'openai' ? 'OpenAI' : 'OpenRouter'} key when ready.
              </p>
              <button
                className="popup-link-button mt-3"
                onClick={() => void openOptions(true)}
                data-onboarding-target="api-key"
                type="button">
                Open Options
              </button>
            </section>
          ) : null}

          <details className="popup-management-panel" open={shouldOpenLibraryPanel || undefined}>
            <summary>
              <div>
                <p className="text-sm font-semibold">Library and sync</p>
                <p className="mt-1 text-xs leading-5 text-stone-600">
                  {history.length} saved {history.length === 1 ? 'report' : 'reports'} ·{' '}
                  {session ? (settings.driveBackupEnabled ? 'Drive on' : 'Drive off') : 'Local only unless you sign in'}
                </p>
              </div>
            </summary>
            <div className="popup-management-body space-y-4 text-xs text-stone-700">
              <section className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-stone-950">Privacy</p>
                    <p className="mt-1 leading-5">
                      Reports save locally. Contract text goes only to your selected AI provider when you scan.{' '}
                      {!session
                        ? 'Sign in first if you want optional Drive backup.'
                        : settings.driveBackupEnabled
                          ? 'Drive backup is enabled for signed-in scans.'
                          : 'Drive backup is currently off.'}
                    </p>
                  </div>
                  {session ? (
                    <button className="popup-link-button" onClick={() => void toggleDriveBackup()} type="button">
                      {settings.driveBackupEnabled ? 'Turn off Drive' : 'Enable Drive'}
                    </button>
                  ) : (
                    <button
                      className="popup-link-button"
                      onClick={() => void handleSignIn()}
                      disabled={signingIn}
                      type="button">
                      {signingIn ? 'Signing in...' : 'Sign in'}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button className="popup-link-button" onClick={() => void clearLocalReports()} type="button">
                    Clear local reports
                  </button>
                  <button className="popup-link-button" onClick={() => void clearAllLocalData()} type="button">
                    Clear all local data
                  </button>
                </div>
                {pendingDriveBackupId && currentAnalysis?.id === pendingDriveBackupId ? (
                  <div className="popup-alert popup-alert-guidance">
                    <p className="font-semibold">Back up the current visible analysis?</p>
                    <p className="mt-1">
                      This requests Drive sync for the current report. Original source files are not backfilled unless
                      they are still available in memory.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      <button
                        className="popup-link-button"
                        onClick={() => void backUpCurrentAnalysisToDrive()}
                        type="button">
                        Back up current report
                      </button>
                      <button className="popup-link-button" onClick={dismissCurrentBackupPrompt} type="button">
                        Not now
                      </button>
                    </div>
                  </div>
                ) : null}
                {syncNotice ? <p className="text-xs leading-5 text-stone-600">{syncNotice}</p> : null}
              </section>

              <section className="space-y-3 border-t border-stone-200 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-stone-950">Recent analyses</p>
                    <p className="text-stone-600">
                      {settings.driveBackupEnabled
                        ? 'Local and Drive-backed reports appear here.'
                        : 'Local reports appear here.'}
                    </p>
                  </div>
                  <button
                    className="popup-link-button"
                    onClick={() => {
                      const willOpen = !historyOpen;
                      setHistoryOpen(willOpen);
                      if (willOpen && session) void hydrateHistoryFromDrive();
                    }}
                    type="button">
                    {historyOpen ? 'Hide reports' : 'Show reports'}
                  </button>
                </div>
                {historyOpen ? (
                  <div className="space-y-2">
                    {session ? (
                      <div className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white/60 px-3 py-2 text-xs text-stone-600">
                        <span>{historySyncing ? 'Checking Drive...' : 'Need older synced reports?'}</span>
                        <button
                          className="popup-link-button"
                          onClick={() => void hydrateHistoryFromDrive()}
                          disabled={historySyncing}
                          type="button">
                          Refresh Drive
                        </button>
                      </div>
                    ) : null}
                    {history.length === 0 ? (
                      <div className="rounded-2xl border border-stone-200 bg-white/70 px-3 py-3 text-xs leading-5 text-stone-600">
                        No reports saved yet. Run a quick scan or refresh Drive if you already backed up analyses.
                      </div>
                    ) : null}
                    {history.map(record => {
                      const isPendingDelete = pendingDeleteReportId === record.id;

                      return (
                        <div key={record.id} className="popup-history-row">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-1 font-semibold text-stone-950">{record.source.name}</p>
                              <p className="mt-1 text-stone-500">
                                {formatReportDate(record.createdAt)} ·{' '}
                                {record.deepAnalysis ? 'Detailed report' : 'Quick scan only'}
                              </p>
                            </div>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                riskToneClasses[
                                  record.deepAnalysis?.overallRiskLevel ?? record.quickScan.roughRiskLevel
                                ]
                              }`}>
                              {record.deepAnalysis?.overallRiskLevel ?? record.quickScan.roughRiskLevel}
                            </span>
                          </div>
                          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                            {storageStateCopy[record.storageState]}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-3">
                            <button
                              className="popup-link-button"
                              onClick={() => openHistoryRecord(record)}
                              type="button">
                              Open
                            </button>
                            <button
                              className="popup-link-button"
                              onClick={() => void copyHistoryRecord(record)}
                              type="button">
                              Copy report
                            </button>
                            <button
                              className="popup-link-button"
                              onClick={() => exportHistoryRecord(record)}
                              type="button">
                              Export .md
                            </button>
                            <button
                              className="popup-link-button"
                              onClick={() => requestDeleteHistoryRecord(record)}
                              type="button">
                              Delete
                            </button>
                          </div>
                          {isPendingDelete ? (
                            <div className="popup-alert popup-alert-danger mt-3">
                              <p className="font-semibold">Delete this report?</p>
                              <p className="mt-1">
                                This cannot be undone locally. Matching Drive files will be removed when possible.
                              </p>
                              <div className="mt-3 flex flex-wrap gap-3">
                                <button
                                  className="popup-link-button text-rose-800"
                                  onClick={() => void confirmDeleteHistoryRecord(record)}
                                  type="button">
                                  Delete permanently
                                </button>
                                <button className="popup-link-button" onClick={cancelDeleteHistoryRecord} type="button">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            </div>
          </details>

          {launchError ? (
            <section className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {launchError}
            </section>
          ) : null}
        </div>

        <div className="popup-sticky-footer">
          <p>Informational only. Not legal advice.</p>
          <div className="flex items-center gap-3">
            {!activeOnboardingStep ? (
              <button className="popup-link-button" onClick={() => void resumeWizard()} type="button">
                Guide me
              </button>
            ) : null}
            <button
              className="popup-link-button"
              onClick={() => void openOptions(Boolean(activeOnboardingStep && setupSteps.has(activeOnboardingStep)))}
              data-onboarding-target="api-key"
              type="button">
              Options
            </button>
          </div>
        </div>
        {spotlightStep ? (
          <SpotlightTour
            step={spotlightStep}
            onNext={() => void advanceSpotlight()}
            onSkip={() => {
              if (spotlightStep.id === 'sign-in') {
                void advanceOnboarding('upload');
                return;
              }
              void dismissWizard();
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);

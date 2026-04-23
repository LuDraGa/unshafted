import '@src/Popup.css';
import {
  buildDocumentFromFile,
  configurePdfWorker,
  createCurrentAnalysis,
  getActiveProviderConfig,
  getOnboardingKeyHash,
  PRIORITY_OPTIONS,
} from '@extension/unshafted-core';
import type { IngestedDocument, OnboardingState, OnboardingStep } from '@extension/unshafted-core';

configurePdfWorker(chrome.runtime.getURL('popup/pdf.worker.min.mjs'));

import { useStorage } from '@extension/shared';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import {
  analysisHistoryStorage,
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
  type Session,
  signInWithGoogle,
  signOut,
} from '@extension/supabase';
import { ErrorDisplay, LoadingSpinner, SpotlightTour } from '@extension/ui';
import type { SpotlightTourStep } from '@extension/ui';
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AnalysisWorkspace } from './components/AnalysisWorkspace';

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
    if (
      hasActiveApiKey &&
      (onboarding.currentStep === 'provider' || onboarding.currentStep === 'api-key' || !setupSteps.has(onboarding.currentStep))
    ) {
      return 'test-connection';
    }

    if (setupSteps.has(onboarding.currentStep)) {
      return onboarding.currentStep;
    }

    return hasActiveApiKey ? 'test-connection' : 'provider';
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

const UserAvatar = ({
  avatarUrl,
  email,
  onSignOut,
}: {
  avatarUrl?: string;
  email: string;
  onSignOut: () => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const initial = email.charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        className="h-7 w-7 rounded-full overflow-hidden border-2 border-stone-200 hover:border-stone-400 transition flex-shrink-0"
        onClick={() => setMenuOpen(o => !o)}
        title={email}
        type="button">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="h-full w-full bg-stone-900 text-stone-50 flex items-center justify-center text-xs font-bold">
            {initial}
          </div>
        )}
      </button>
      {menuOpen ? (
        <div className="absolute right-0 top-9 z-50 min-w-[180px] rounded-xl border border-stone-200 bg-white shadow-lg p-2">
          <p className="px-2 py-1 text-[11px] text-stone-500 truncate">{email}</p>
          <button
            className="w-full text-left px-2 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-lg transition"
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

const Popup = () => {
  const onboarding = useStorage(unshaftedOnboardingStorage);
  const settings = useStorage(unshaftedSettingsStorage);
  const currentAnalysis = useStorage(currentAnalysisStorage);

  const [launchError, setLaunchError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [resultGuidanceStep, setResultGuidanceStep] = useState<ResultGuideStep>('summary');
  const [activeKeyHash, setActiveKeyHash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeProviderConfig = getActiveProviderConfig(settings);
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
  const spotlightStep: PopupSpotlightStep | null = activeOnboardingStep
    ? activeOnboardingStep === 'results'
      ? ({
          summary: {
            id: 'summary',
            target: 'summary',
            text: 'Start here for the quick read.',
          },
          flags: {
            id: 'flags',
            target: 'flags',
            text: 'Flags are the fastest risk triage.',
          },
          customize: {
            id: 'customize',
            target: 'customize',
            text: 'Set your role before deeper review.',
          },
          cta: {
            id: 'cta',
            target: 'cta',
            text: session ? 'Run detailed analysis when ready.' : 'Sign in for deeper review and Drive backup.',
            final: true,
          },
        } satisfies Record<ResultGuideStep, PopupSpotlightStep>)[resultGuidanceStep]
      : ({
          provider: {
            id: 'provider',
            target: 'api-key',
            text: 'Start by choosing your AI provider.',
            nextLabel: 'Open',
          },
          'api-key': {
            id: 'api-key',
            target: 'api-key',
            text: 'Paste your API key in Options.',
            nextLabel: 'Open',
          },
          'save-settings': {
            id: 'save-settings',
            target: 'api-key',
            text: 'Save the key before testing it.',
            nextLabel: 'Open',
          },
          'test-connection': {
            id: 'test-connection',
            target: 'api-key',
            text: 'Test the key before your first scan.',
            nextLabel: 'Open',
          },
          'sign-in': {
            id: 'sign-in',
            target: 'sign-in',
            text: 'Sign in for Drive backup and detailed analysis.',
            skipLabel: 'Skip',
          },
          upload: {
            id: 'upload',
            target: 'upload',
            text: 'Upload a PDF or TXT contract.',
          },
        } satisfies Partial<Record<OnboardingStep, PopupSpotlightStep>>)[activeOnboardingStep] ?? null
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
    let cancelled = false;

    if (!activeProviderConfig.apiKey) {
      setActiveKeyHash(null);
      return;
    }

    setActiveKeyHash(null);
    void getOnboardingKeyHash(activeProviderConfig).then(hash => {
      if (!cancelled) {
        setActiveKeyHash(hash);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeProviderConfig.apiKey, activeProviderConfig.model, activeProviderConfig.provider]);

  // Load auth state on mount
  useEffect(() => {
    getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });

    const { data: { subscription } } = onAuthStateChange((_event, s) => {
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
      if (hasActiveApiKey && (nextStep === 'provider' || nextStep === 'api-key' || !setupSteps.has(nextStep))) {
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

  // Hydrate local history from Drive when signed in + history is empty
  useEffect(() => {
    if (!session) return;

    const hydrate = async () => {
      try {
        const history = await analysisHistoryStorage.get();
        if (history.length > 0) return;

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
                slug: quickFile.documentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) || 'unnamed-document',
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
            };

            await analysisHistoryStorage.push(record as Parameters<typeof analysisHistoryStorage.push>[0]);
          } catch {
            // Best-effort hydration only.
          }
        }
      } catch {
        // Drive hydration is best-effort.
      }
    };

    void hydrate();
  }, [session]);

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
    fileInputRef.current?.click();
  }, []);

  const dismissWizard = useCallback(async () => {
    await unshaftedOnboardingStorage.set(current => ({
      ...current,
      dismissedAt: new Date().toISOString(),
    }));
  }, []);

  const resumeWizard = useCallback(async () => {
    const nextStep = !hasTestedActiveKey
      ? hasActiveApiKey
        ? 'test-connection'
        : 'provider'
      : !session
        ? 'sign-in'
        : !hasQuickScan
          ? 'upload'
          : 'results';
    await unshaftedOnboardingStorage.set(current => ({
      ...current,
      completedAt: null,
      dismissedAt: null,
      currentStep: nextStep,
      seenResultGuidance: nextStep === 'results' ? false : current.seenResultGuidance,
    }));
  }, [hasActiveApiKey, hasQuickScan, hasTestedActiveKey, session]);

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
        await advanceOnboarding('upload');
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
  }, [advanceOnboarding, completeOnboarding, handleUploadFlow, hasFlags, openOptions, spotlightStep]);

  const handleFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLaunchError('');
    setUploading(true);

    try {
      const document = await buildDocumentFromFile(file);
      await currentAnalysisStorage.set(createCurrentAnalysis(document));

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
            <div className="space-y-1 min-w-0 flex-1">
              <p className="popup-eyebrow">Unshafted</p>
              <h1 className="popup-title">Contract risk, without the fog.</h1>
              <p className="popup-subtitle truncate">
                {currentAnalysis ? currentAnalysis.source.name : 'Upload a contract to review (.pdf or .txt).'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                  hasActiveApiKey ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'
                }`}>
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
                    className="rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold text-stone-50 hover:bg-stone-700 transition"
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
          {!currentAnalysis ? (
            <button
              className="popup-primary-button"
              onClick={handleUploadFlow}
              disabled={uploading || !hasActiveApiKey}
              data-onboarding-target="upload"
              type="button">
              {uploading ? 'Loading contract...' : 'Upload your contract'}
            </button>
          ) : (
            <AnalysisWorkspace
              session={session}
              onSignIn={handleSignIn}
              focusedOnboardingTarget={activeOnboardingStep === 'results' ? resultGuidanceStep : null}
            />
          )}

          {!hasActiveApiKey ? (
            <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">API key required</p>
              <p className="mt-1 text-amber-800">
                Save your {settings.provider === 'openai' ? 'OpenAI' : 'OpenRouter'} API key in Options first.
              </p>
              <button
                className="mt-3 popup-link-button"
                onClick={() => void openOptions(true)}
                data-onboarding-target="api-key"
                type="button">
                Open Options
              </button>
            </section>
          ) : null}

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

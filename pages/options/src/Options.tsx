import '@src/Options.css';
import {
  APP_NAME,
  DEFAULT_DEEP_MODEL,
  DEFAULT_OPENAI_DEEP_MODEL,
  DEFAULT_OPENAI_QUICK_MODEL,
  DEFAULT_QUICK_MODEL,
  DEFAULT_TEMPERATURE,
  getActiveProviderConfig,
  getOnboardingKeyHash,
  OPENROUTER_API_KEYS_DOCS_URL,
  OPENROUTER_KEYS_URL,
  testOpenRouterConnection,
} from '@extension/unshafted-core';
import type { AppSettings, OnboardingStep } from '@extension/unshafted-core';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { unshaftedOnboardingStorage, unshaftedSettingsStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, SpotlightTour } from '@extension/ui';
import type { SpotlightTourStep } from '@extension/ui';
import { useEffect, useRef, useState } from 'react';

type Provider = AppSettings['provider'];
type OptionsSetupStep = Extract<OnboardingStep, 'provider' | 'api-key' | 'save-settings' | 'test-connection'>;

type FormState = {
  provider: Provider;
  apiKey: string;
  quickModel: string;
  deepModel: string;
  openaiApiKey: string;
  openaiQuickModel: string;
  openaiDeepModel: string;
  temperature: string;
};

const searchParams = new URLSearchParams(window.location.search);
const onboardingMode = searchParams.get('onboarding') === 'true';
const providerParam = searchParams.get('provider');
const preferredProvider: Provider | null = providerParam === 'openrouter' || providerParam === 'openai' ? providerParam : null;
const optionsSetupSteps = new Set<OnboardingStep>(['provider', 'api-key', 'save-settings', 'test-connection']);
const isOptionsSetupStep = (step: OnboardingStep): step is OptionsSetupStep => optionsSetupSteps.has(step);

const Options = () => {
  const onboarding = useStorage(unshaftedOnboardingStorage);
  const settings = useStorage(unshaftedSettingsStorage);
  const apiKeyInputRef = useRef<HTMLInputElement | null>(null);

  const [form, setForm] = useState<FormState>({
    provider: preferredProvider ?? settings.provider,
    apiKey: settings.apiKey,
    quickModel: settings.quickModel,
    deepModel: settings.deepModel,
    openaiApiKey: settings.openaiApiKey,
    openaiQuickModel: settings.openaiQuickModel,
    openaiDeepModel: settings.openaiDeepModel,
    temperature: String(settings.temperature),
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [status, setStatus] = useState<{ tone: 'idle' | 'success' | 'error'; message: string }>({
    tone: 'idle',
    message: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [lastSavedConfig, setLastSavedConfig] = useState<ReturnType<typeof getActiveProviderConfig> | null>(null);

  useEffect(() => {
    setForm({
      provider: settings.provider,
      apiKey: settings.apiKey,
      quickModel: settings.quickModel,
      deepModel: settings.deepModel,
      openaiApiKey: settings.openaiApiKey,
      openaiQuickModel: settings.openaiQuickModel,
      openaiDeepModel: settings.openaiDeepModel,
      temperature: String(settings.temperature),
    });
  }, [
    settings.provider,
    settings.apiKey,
    settings.quickModel,
    settings.deepModel,
    settings.openaiApiKey,
    settings.openaiQuickModel,
    settings.openaiDeepModel,
    settings.temperature,
  ]);

  const setField = (field: keyof FormState, value: string) => {
    setForm(current => ({ ...current, [field]: value }));
  };

  const parseTemperature = () => {
    const parsed = Number.parseFloat(form.temperature);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
      throw new Error('Temperature must be a number between 0 and 1.');
    }

    return parsed;
  };

  const isOpenAI = form.provider === 'openai';

  useEffect(() => {
    if (!onboardingMode || onboarding.currentStep !== 'api-key') return;

    const timer = window.setTimeout(() => {
      apiKeyInputRef.current?.focus();
    }, 80);

    return () => window.clearTimeout(timer);
  }, [onboarding.currentStep]);

  const getFormActiveConfig = () => {
    if (form.provider === 'openai') {
      return {
        provider: form.provider,
        apiKey: form.openaiApiKey.trim(),
        model: form.openaiQuickModel.trim() || DEFAULT_OPENAI_QUICK_MODEL,
      };
    }

    return {
      provider: form.provider,
      apiKey: form.apiKey.trim(),
      model: form.quickModel.trim() || DEFAULT_QUICK_MODEL,
    };
  };

  const setOnboardingStep = async (step: OnboardingStep) => {
    await unshaftedOnboardingStorage.set(current => ({
      ...current,
      currentStep: step,
      dismissedAt: null,
    }));
  };

  const save = async (): Promise<boolean> => {
    setStatus({ tone: 'idle', message: '' });
    setIsSaving(true);

    try {
      await unshaftedSettingsStorage.set({
        provider: form.provider,
        apiKey: form.apiKey.trim(),
        quickModel: form.quickModel.trim() || DEFAULT_QUICK_MODEL,
        deepModel: form.deepModel.trim() || DEFAULT_DEEP_MODEL,
        openaiApiKey: form.openaiApiKey.trim(),
        openaiQuickModel: form.openaiQuickModel.trim() || DEFAULT_OPENAI_QUICK_MODEL,
        openaiDeepModel: form.openaiDeepModel.trim() || DEFAULT_OPENAI_DEEP_MODEL,
        temperature: form.provider === 'openai' ? DEFAULT_TEMPERATURE : parseTemperature(),
        monthlySoftLimit: settings.monthlySoftLimit,
      });

      setStatus({
        tone: 'success',
        message: 'Settings saved locally in chrome.storage.local.',
      });
      setLastSavedConfig(getFormActiveConfig());

      if (onboardingMode && onboarding.currentStep === 'save-settings') {
        await setOnboardingStep('test-connection');
      }

      return true;
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save settings.',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const resetDefaults = async () => {
    setStatus({ tone: 'idle', message: '' });
    setIsSaving(true);

    try {
      await unshaftedSettingsStorage.reset();
      setStatus({ tone: 'success', message: 'Defaults restored.' });
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to reset settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const testConnection = async (): Promise<boolean> => {
    setStatus({ tone: 'idle', message: '' });
    setIsTesting(true);

    try {
      const activeConfig = getFormActiveConfig();
      const savedConfig = getActiveProviderConfig(settings);
      const savedMatches =
        (savedConfig.provider === activeConfig.provider &&
          savedConfig.apiKey === activeConfig.apiKey &&
          savedConfig.model === activeConfig.model) ||
        (lastSavedConfig?.provider === activeConfig.provider &&
          lastSavedConfig.apiKey === activeConfig.apiKey &&
          lastSavedConfig.model === activeConfig.model);

      if (!activeConfig.apiKey) {
        throw new Error(`Enter your ${isOpenAI ? 'OpenAI' : 'OpenRouter'} API key first.`);
      }

      if (!savedMatches) {
        throw new Error('Save settings before testing this key.');
      }

      const model = await testOpenRouterConnection({
        provider: form.provider,
        apiKey: activeConfig.apiKey,
        model: activeConfig.model,
        ...(isOpenAI ? {} : { temperature: parseTemperature() }),
        title: `${APP_NAME} Settings Test`,
      });
      const testedKeyHash = await getOnboardingKeyHash(activeConfig);

      setStatus({
        tone: 'success',
        message: onboardingMode ? `Connection succeeded using ${model}. Return to the popup to continue.` : `Connection succeeded using ${model}.`,
      });

      await unshaftedOnboardingStorage.set(current => ({
        ...current,
        testedProvider: activeConfig.provider,
        testedKeyHash,
        testedModel: activeConfig.model,
        keyTestedAt: new Date().toISOString(),
        ...(onboardingMode && isOptionsSetupStep(current.currentStep)
          ? {
              currentStep: 'sign-in' as const,
              dismissedAt: null,
            }
          : {}),
      }));

      return true;
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Connection test failed.',
      });
      return false;
    } finally {
      setIsTesting(false);
    }
  };

  const activeOptionsStep = onboardingMode && !onboarding.dismissedAt && !onboarding.completedAt && isOptionsSetupStep(onboarding.currentStep)
    ? onboarding.currentStep
    : null;
  const spotlightStep: (SpotlightTourStep & { id: OptionsSetupStep }) | null = activeOptionsStep
    ? ({
        provider: {
          id: 'provider',
          target: 'provider',
          text: 'Choose OpenRouter or OpenAI.',
        },
        'api-key': {
          id: 'api-key',
          target: 'api-key',
          text: 'Paste the key for this provider.',
        },
        'save-settings': {
          id: 'save-settings',
          target: 'save-settings',
          text: 'Save the key locally.',
        },
        'test-connection': {
          id: 'test-connection',
          target: 'test-connection',
          text: 'Test the key before scanning.',
        },
      } satisfies Record<OptionsSetupStep, SpotlightTourStep & { id: OptionsSetupStep }>)[activeOptionsStep]
    : null;

  const advanceSpotlight = async () => {
    if (!spotlightStep) return;

    switch (spotlightStep.id) {
      case 'provider':
        await setOnboardingStep('api-key');
        return;
      case 'api-key':
        await setOnboardingStep('save-settings');
        return;
      case 'save-settings':
        await save();
        return;
      case 'test-connection':
        await testConnection();
        return;
      default:
        return;
    }
  };

  const dismissOnboarding = async () => {
    await unshaftedOnboardingStorage.set(current => ({
      ...current,
      dismissedAt: new Date().toISOString(),
    }));
  };

  return (
    <div className="options-shell">
      <div className="mx-auto max-w-lg px-6 py-12">
        <section className="options-panel">
          <div className="space-y-4">
            <p className="options-eyebrow">Unshafted</p>
            <h1 className="text-2xl font-semibold tracking-[-0.04em] text-stone-950">Bring your own key</h1>
            <p className="text-sm leading-6 text-stone-600">
              Choose your provider, paste a key, test it, and head back to the popup to run your first contract.
            </p>
            <hr className="border-stone-200" />
          </div>

          {onboardingMode ? (
            <section className="options-help-card mt-6">
              <div>
                <p className="options-help-eyebrow">API setup</p>
                <p className="mt-1 text-sm leading-5 text-stone-700">
                  OpenRouter is a good free-first path. Choose a provider, save a key, then test it.
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <a className="options-help-link" href={OPENROUTER_KEYS_URL} target="_blank" rel="noreferrer">
                  Open keys
                </a>
                <a className="options-help-link" href={OPENROUTER_API_KEYS_DOCS_URL} target="_blank" rel="noreferrer">
                  API-key docs
                </a>
              </div>
            </section>
          ) : null}

          <div className="mt-8 grid gap-5">
            {/* Provider toggle */}
            <div className="grid gap-2" data-onboarding-target="provider">
              <span className="options-label">Provider</span>
              <div className="flex gap-2">
                {(['openrouter', 'openai'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    className={cn(
                      'rounded-xl px-4 py-2.5 text-sm font-semibold transition',
                      form.provider === p
                        ? 'bg-stone-900 text-stone-50'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200',
                    )}
                    onClick={() => {
                      setField('provider', p);
                      if (onboardingMode && onboarding.currentStep === 'provider') {
                        void setOnboardingStep('api-key');
                      }
                    }}>
                    {p === 'openrouter' ? 'OpenRouter' : 'OpenAI'}
                  </button>
                ))}
              </div>
            </div>

            {/* API key */}
            <label
              className={cn('grid gap-2', onboardingMode && onboarding.currentStep === 'api-key' && 'options-key-field-active')}
              data-onboarding-target="api-key">
              <span className="options-label">{isOpenAI ? 'OpenAI' : 'OpenRouter'} API key</span>
              <div className="flex gap-3">
                <input
                  ref={apiKeyInputRef}
                  className="options-input flex-1"
                  type={showApiKey ? 'text' : 'password'}
                  value={isOpenAI ? form.openaiApiKey : form.apiKey}
                  onChange={event => setField(isOpenAI ? 'openaiApiKey' : 'apiKey', event.target.value)}
                  placeholder={isOpenAI ? 'sk-proj-...' : 'sk-or-...'}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button className="options-toggle" onClick={() => setShowApiKey(current => !current)} type="button">
                  {showApiKey ? 'Hide' : 'Show'}
                </button>
              </div>
              {!isOpenAI && onboardingMode ? (
                <p className="text-xs leading-5 text-stone-600">
                  OpenRouter keys usually start with sk-or-v1-. Save, test, then return to the popup.
                </p>
              ) : null}
            </label>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              className="options-primary-button"
              onClick={() => void save()}
              type="button"
              disabled={isSaving || isTesting}
              data-onboarding-target="save-settings">
              {isSaving ? 'Saving...' : 'Save settings'}
            </button>
            <button
              className="options-secondary-button"
              onClick={() => void testConnection()}
              type="button"
              disabled={isSaving || isTesting}
              data-onboarding-target="test-connection">
              {isTesting ? 'Testing...' : 'Test connection'}
            </button>
          </div>

          {status.message ? (
            <div
              className={cn(
                'mt-5 rounded-2xl border px-4 py-3 text-sm',
                status.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900',
              )}>
              {status.message}
            </div>
          ) : null}

          {/* Advanced settings */}
          <details className="options-advanced mt-8 rounded-2xl border border-stone-200 bg-white/60 p-5">
            <summary className="cursor-pointer list-none flex items-center justify-between">
              <span className="options-label">Advanced</span>
              <span className="options-chevron text-stone-400">&#9662;</span>
            </summary>
            <hr className="mt-4 border-stone-200" />
            <div className="mt-5 grid gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="options-label">Quick model</span>
                  <input
                    className="options-input"
                    value={isOpenAI ? form.openaiQuickModel : form.quickModel}
                    onChange={event => setField(isOpenAI ? 'openaiQuickModel' : 'quickModel', event.target.value)}
                    placeholder={isOpenAI ? DEFAULT_OPENAI_QUICK_MODEL : DEFAULT_QUICK_MODEL}
                    spellCheck={false}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="options-label">Deep model</span>
                  <input
                    className="options-input"
                    value={isOpenAI ? form.openaiDeepModel : form.deepModel}
                    onChange={event => setField(isOpenAI ? 'openaiDeepModel' : 'deepModel', event.target.value)}
                    placeholder={isOpenAI ? DEFAULT_OPENAI_DEEP_MODEL : DEFAULT_DEEP_MODEL}
                    spellCheck={false}
                  />
                </label>
              </div>

              {!isOpenAI ? (
                <label className="grid gap-2">
                  <span className="options-label">Temperature</span>
                  <input
                    className="options-input"
                    value={form.temperature}
                    onChange={event => setField('temperature', event.target.value)}
                    placeholder={String(DEFAULT_TEMPERATURE)}
                    inputMode="decimal"
                  />
                </label>
              ) : null}

              <button className="options-ghost-button" onClick={resetDefaults} type="button" disabled={isSaving || isTesting}>
                Reset defaults
              </button>
            </div>
          </details>
        </section>
        {spotlightStep ? (
          <SpotlightTour
            step={spotlightStep}
            onNext={() => void advanceSpotlight()}
            onSkip={() => void dismissOnboarding()}
          />
        ) : null}
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <LoadingSpinner />), ErrorDisplay);

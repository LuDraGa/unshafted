import '@src/Options.css';
import {
  APP_NAME,
  DEFAULT_DEEP_MODEL,
  DEFAULT_OPENAI_DEEP_MODEL,
  DEFAULT_OPENAI_QUICK_MODEL,
  DEFAULT_QUICK_MODEL,
  DEFAULT_TEMPERATURE,
  testOpenRouterConnection,
} from '@extension/unshafted-core';
import type { AppSettings } from '@extension/unshafted-core';
import { useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { unshaftedSettingsStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner } from '@extension/ui';
import { useEffect, useState } from 'react';

type Provider = AppSettings['provider'];

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

const Options = () => {
  const settings = useStorage(unshaftedSettingsStorage);

  const [form, setForm] = useState<FormState>({
    provider: settings.provider,
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

  const save = async () => {
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
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Unable to save settings.',
      });
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

  const testConnection = async () => {
    setStatus({ tone: 'idle', message: '' });
    setIsTesting(true);

    try {
      const activeKey = isOpenAI ? form.openaiApiKey.trim() : form.apiKey.trim();
      const activeModel = isOpenAI
        ? form.openaiQuickModel.trim() || DEFAULT_OPENAI_QUICK_MODEL
        : form.quickModel.trim() || DEFAULT_QUICK_MODEL;

      if (!activeKey) {
        throw new Error(`Enter your ${isOpenAI ? 'OpenAI' : 'OpenRouter'} API key first.`);
      }

      const model = await testOpenRouterConnection({
        provider: form.provider,
        apiKey: activeKey,
        model: activeModel,
        ...(isOpenAI ? {} : { temperature: parseTemperature() }),
        title: `${APP_NAME} Settings Test`,
      });

      setStatus({
        tone: 'success',
        message: `Connection succeeded using ${model}.`,
      });
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Connection test failed.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="options-shell">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="options-panel">
            <div className="space-y-3">
              <p className="options-eyebrow">Unshafted setup</p>
              <h1 className="options-title">Keep the setup small. Keep the output sharp.</h1>
              <p className="options-copy">
                This MVP stores your API key and model choices locally in the extension. No account, backend, or cloud sync yet.
              </p>
            </div>

            <div className="mt-8 grid gap-5">
              {/* Provider toggle */}
              <div className="grid gap-2">
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
                      onClick={() => setField('provider', p)}>
                      {p === 'openrouter' ? 'OpenRouter' : 'OpenAI'}
                    </button>
                  ))}
                </div>
              </div>

              {/* API key */}
              <label className="grid gap-2">
                <span className="options-label">{isOpenAI ? 'OpenAI' : 'OpenRouter'} API key</span>
                <div className="flex gap-3">
                  <input
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
              </label>

              {/* Models */}
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
              ) : (
                <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs text-stone-600">
                  GPT-5 models use <strong className="text-stone-900">reasoning effort</strong> instead of temperature.
                  Quick scan uses low effort, deep analysis uses high effort.
                </div>
              )}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              <button className="options-primary-button" onClick={save} type="button" disabled={isSaving || isTesting}>
                {isSaving ? 'Saving...' : 'Save settings'}
              </button>
              <button className="options-secondary-button" onClick={testConnection} type="button" disabled={isSaving || isTesting}>
                {isTesting ? 'Testing...' : 'Test connection'}
              </button>
              <button className="options-ghost-button" onClick={resetDefaults} type="button" disabled={isSaving || isTesting}>
                Reset defaults
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
          </section>

          <aside className="grid gap-5">
            <section className="options-panel">
              <p className="options-label">Recommended defaults</p>
              <ul className="mt-4 space-y-3 text-sm text-stone-700">
                {isOpenAI ? (
                  <>
                    <li>
                      <strong className="text-stone-950">Quick model:</strong> `gpt-5-nano`
                    </li>
                    <li>
                      <strong className="text-stone-950">Deep model:</strong> `gpt-5.4-pro`
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <strong className="text-stone-950">Quick model:</strong> `google/gemma-4-26b-a4b-it:free`
                    </li>
                    <li>
                      <strong className="text-stone-950">Deep model:</strong> `stepfun/step-3.5-flash:free`
                    </li>
                  </>
                )}
                {isOpenAI ? (
                  <li>
                    <strong className="text-stone-950">Reasoning:</strong> low (quick scan), high (deep analysis)
                  </li>
                ) : (
                  <li>
                    <strong className="text-stone-950">Temperature:</strong> `0.2`
                  </li>
                )}
              </ul>
            </section>

            <section className="options-panel">
              <p className="options-label">What the extension stores locally</p>
              <ul className="mt-4 space-y-3 text-sm text-stone-700">
                <li>Your API key and model settings ({isOpenAI ? 'OpenAI' : 'OpenRouter'}).</li>
                <li>The active analysis session plus a short local history.</li>
                <li>A soft monthly counter for detailed analyses.</li>
              </ul>
            </section>

            <section className="options-panel">
              <p className="options-label">Known MVP constraints</p>
              <ul className="mt-4 space-y-3 text-sm text-stone-700">
                <li>No PDF, DOCX, OCR, login, or cloud sync yet.</li>
                <li>Long documents may be analyzed from balanced excerpts instead of full text.</li>
                <li>The extension is informational only and not legal advice.</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Options, <LoadingSpinner />), ErrorDisplay);

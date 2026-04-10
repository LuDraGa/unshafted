import '@src/Popup.css';
import { buildDocumentFromFile, createCurrentAnalysis } from '@extension/unshafted-core';
import { useStorage } from '@extension/shared';
import { currentAnalysisStorage, unshaftedSettingsStorage } from '@extension/storage';
import { ErrorDisplay, LoadingSpinner } from '@extension/ui';
import { type ChangeEvent, useRef, useState } from 'react';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { AnalysisWorkspace } from './components/AnalysisWorkspace';

const Popup = () => {
  const settings = useStorage(unshaftedSettingsStorage);
  const currentAnalysis = useStorage(currentAnalysisStorage);

  const [launchError, setLaunchError] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const openOptions = () => chrome.runtime.openOptionsPage();

  const handleUploadFlow = () => {
    setLaunchError('');
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLaunchError('');
    setUploading(true);

    try {
      const document = await buildDocumentFromFile(file);
      await currentAnalysisStorage.set(createCurrentAnalysis(document));
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : 'Unable to open this file.');
    } finally {
      event.target.value = '';
      setUploading(false);
    }
  };

  const hasApiKey = Boolean(
    settings.provider === 'openai' ? settings.openaiApiKey.trim() : settings.apiKey.trim(),
  );

  return (
    <div className="popup-shell">
      <div className="popup-frame">
        <input ref={fileInputRef} type="file" accept=".txt,text/plain" className="hidden" onChange={handleFileChosen} />

        {/* Sticky header */}
        <div className="popup-sticky-header">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="popup-eyebrow">Unshafted</p>
              <h1 className="popup-title">Contract risk, without the fog.</h1>
              <p className="popup-subtitle">
                {currentAnalysis ? currentAnalysis.source.name : 'Upload a `.txt` contract or agreement to review.'}
              </p>
            </div>
            <div
              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${hasApiKey ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'}`}>
              {hasApiKey ? 'Ready' : 'Setup'}
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="popup-content">
          {!currentAnalysis ? (
            <button
              className="popup-primary-button"
              onClick={handleUploadFlow}
              disabled={uploading || !hasApiKey}>
              {uploading ? 'Loading contract...' : 'Upload your contract'}
            </button>
          ) : (
            <AnalysisWorkspace />
          )}

          {!hasApiKey ? (
            <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">API key required</p>
              <p className="mt-1 text-amber-800">
                Save your {settings.provider === 'openai' ? 'OpenAI' : 'OpenRouter'} API key in Options first.
              </p>
              <button className="mt-3 popup-link-button" onClick={openOptions}>
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

        {/* Sticky footer */}
        <div className="popup-sticky-footer">
          <p>Informational only. Not legal advice.</p>
          <button className="popup-link-button" onClick={openOptions}>
            Options
          </button>
        </div>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);

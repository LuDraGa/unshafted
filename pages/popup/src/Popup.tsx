import '@src/Popup.css';
import { buildDocumentFromFile, createCurrentAnalysis } from '@extension/unshafted-core';
import { extractCurrentPageDocument, getCurrentActiveTab, getTabReadability, useStorage } from '@extension/shared';
import {
  analysisHistoryStorage,
  currentAnalysisStorage,
  pendingActionStorage,
  unshaftedSettingsStorage,
  usageSnapshotStorage,
} from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner } from '@extension/ui';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { AnalysisWorkspace } from './components/AnalysisWorkspace';

type PageState = {
  title: string;
  url: string;
  supported: boolean;
  statusLabel: 'Checking' | 'Readable' | 'PDF' | 'Unsupported';
  reason: string;
};

type View = 'launcher' | 'workspace';

const Popup = () => {
  const settings = useStorage(unshaftedSettingsStorage);
  const usage = useStorage(usageSnapshotStorage);
  const history = useStorage(analysisHistoryStorage);
  const currentAnalysis = useStorage(currentAnalysisStorage);

  const [view, setView] = useState<View>(() => (currentAnalysis ? 'workspace' : 'launcher'));
  const [pageState, setPageState] = useState<PageState>({
    title: 'Checking current page...',
    url: '',
    supported: false,
    statusLabel: 'Checking',
    reason: '',
  });
  const [launchError, setLaunchError] = useState('');
  const [busyAction, setBusyAction] = useState<'analyze' | 'upload' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void usageSnapshotStorage.syncMonth();

    void (async () => {
      const tab = await getCurrentActiveTab();
      const readability = await getTabReadability(tab);
      setPageState({
        title: tab?.title || 'No active page detected',
        url: tab?.url || '',
        supported: readability.supported,
        statusLabel: readability.label,
        reason: readability.reason,
      });
    })();
  }, []);

  // If analysis gets cleared externally, go back to launcher
  useEffect(() => {
    if (!currentAnalysis && view === 'workspace') {
      setView('launcher');
    }
  }, [currentAnalysis, view]);

  const openOptions = () => chrome.runtime.openOptionsPage();

  const handleAnalyzeCurrentPage = async () => {
    setLaunchError('');
    setBusyAction('analyze');

    try {
      const activeKey = settings.provider === 'openai' ? settings.openaiApiKey : settings.apiKey;
      if (!activeKey.trim()) {
        throw new Error(`Add your ${settings.provider === 'openai' ? 'OpenAI' : 'OpenRouter'} API key in Options before analyzing.`);
      }

      const tab = await getCurrentActiveTab();
      const readability = await getTabReadability(tab);
      if (!tab?.id || !readability.supported) {
        throw new Error(readability.reason || 'This browser page cannot be analyzed directly.');
      }

      const extracted = await extractCurrentPageDocument(tab.id);
      if (!extracted.ok) {
        throw new Error(extracted.error);
      }

      await currentAnalysisStorage.set(createCurrentAnalysis(extracted.document));
      await pendingActionStorage.set({ type: 'none' });
      setView('workspace');
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : 'Unable to start page analysis.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleUploadFlow = () => {
    setLaunchError('');
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLaunchError('');
    setBusyAction('upload');

    try {
      const document = await buildDocumentFromFile(file);
      await currentAnalysisStorage.set(createCurrentAnalysis(document));
      await pendingActionStorage.set({ type: 'none' });
      setView('workspace');
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : 'Unable to open this file.');
    } finally {
      event.target.value = '';
      setBusyAction(null);
    }
  };

  const lastAnalysis = history[0];
  const hasApiKey = Boolean(
    settings.provider === 'openai' ? settings.openaiApiKey.trim() : settings.apiKey.trim(),
  );

  if (view === 'workspace') {
    return (
      <div className="popup-shell">
        <div className="popup-frame">
          <AnalysisWorkspace onBack={() => setView('launcher')} />
        </div>
      </div>
    );
  }

  return (
    <div className="popup-shell">
      <div className="popup-frame">
        <input ref={fileInputRef} type="file" accept=".txt,text/plain" className="hidden" onChange={handleFileChosen} />
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="popup-eyebrow">Unshafted</p>
              <h1 className="popup-title">Contract risk, without the fog.</h1>
              <p className="popup-subtitle">Analyze the current page or upload a local `.txt` contract to review.</p>
            </div>
            <div
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
                hasApiKey ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700',
              )}>
              {hasApiKey ? 'Ready' : 'Setup'}
            </div>
          </div>

          <section className="popup-card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Current page</p>
                <p className="line-clamp-2 text-sm font-semibold text-stone-900">{pageState.title}</p>
                <p className="line-clamp-1 text-xs text-stone-500">{pageState.url || 'Open a terms page, agreement, or license to analyze it.'}</p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
                  pageState.supported
                    ? 'bg-stone-900 text-stone-50'
                    : pageState.statusLabel === 'PDF'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-stone-200 text-stone-600',
                )}>
                {pageState.statusLabel}
              </span>
            </div>
            {!pageState.supported && pageState.reason ? <p className="mt-3 text-xs text-stone-600">{pageState.reason}</p> : null}

            <div className="mt-4 grid gap-2">
              <button
                className="popup-primary-button"
                onClick={handleAnalyzeCurrentPage}
                disabled={!pageState.supported || busyAction !== null || !hasApiKey}>
                {busyAction === 'analyze' ? 'Preparing page...' : 'Analyze this page'}
              </button>
              <button className="popup-secondary-button" onClick={handleUploadFlow} disabled={busyAction !== null}>
                {busyAction === 'upload' ? 'Loading contract...' : 'Upload `.txt`'}
              </button>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="popup-card !p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Suggested free quota</p>
              <p className="mt-2 text-2xl font-semibold text-stone-950">
                {usage.fullAnalysesUsed}
                <span className="text-sm text-stone-500"> / {settings.monthlySoftLimit}</span>
              </p>
              <p className="mt-1 text-xs text-stone-500">Detailed reviews this month</p>
            </div>

            <div className="popup-card !p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Last result</p>
              <p className="mt-2 line-clamp-2 text-sm font-semibold text-stone-900">
                {lastAnalysis?.source.name ?? 'Nothing yet'}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {lastAnalysis?.deepAnalysis?.overallRiskLevel ?? lastAnalysis?.quickScan.roughRiskLevel ?? 'Run your first review'}
              </p>
            </div>
          </section>

          {!hasApiKey ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">OpenRouter key required</p>
              <p className="mt-1 text-amber-800">
                Save your API key in Options first. The key stays in `chrome.storage.local` for this MVP.
              </p>
              <button className="mt-3 popup-link-button" onClick={openOptions}>
                Open Options
              </button>
            </section>
          ) : null}

          {launchError ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {launchError}
            </section>
          ) : null}

          <div className="flex items-center justify-between text-xs text-stone-500">
            <p>Informational only. Not legal advice.</p>
            <button className="popup-link-button" onClick={openOptions}>
              Options
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);

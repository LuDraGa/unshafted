import '@src/SidePanel.css';
import {
  APP_NAME,
  CONVERTER_LINKS,
  DISCLAIMER_LINE,
  LOADING_STEPS,
  PRIORITY_OPTIONS,
  buildRoleOptions,
  buildSuggestedPriorities,
  buildDocumentFromFile,
  createCurrentAnalysis,
  createHistoryRecord,
  formatBytes,
  sampleContractText,
  sampleDeepAnalysis,
  sampleQuickScan,
  toVerdictTone,
  estimateTokens,
  makePreview,
  normalizeDocumentText,
} from '@extension/unshafted-core';
import type {
  CurrentAnalysis,
  DetailedFinding,
  HistoryRecord,
  IngestedDocument,
  MissingProtection,
  PotentialAdvantage,
  TopicConcern,
} from '@extension/unshafted-core';
import {
  extractCurrentPageDocument,
  getCurrentActiveTab,
  getTabReadability,
  useStorage,
  withErrorBoundary,
  withSuspense,
} from '@extension/shared';
import {
  analysisHistoryStorage,
  currentAnalysisStorage,
  pendingActionStorage,
  unshaftedSettingsStorage,
  usageSnapshotStorage,
} from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner } from '@extension/ui';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { runDeepAnalysis, runQuickScan } from './lib/analysis-workflow';

const verdictToneClasses: Record<'LOW' | 'CAUTION' | 'HIGH' | 'DANGER', string> = {
  LOW: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  CAUTION: 'border-amber-300 bg-amber-50 text-amber-900',
  HIGH: 'border-orange-300 bg-orange-50 text-orange-900',
  DANGER: 'border-rose-300 bg-rose-50 text-rose-900',
};

const severityClasses: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-stone-200 text-stone-700',
  medium: 'bg-amber-100 text-amber-900',
  high: 'bg-rose-100 text-rose-900',
};

const formatTimestamp = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

const riskToneToLabel = (analysis: Pick<HistoryRecord, 'deepAnalysis' | 'quickScan'> | CurrentAnalysis) =>
  toVerdictTone(analysis.deepAnalysis?.overallRiskLevel ?? analysis.quickScan?.roughRiskLevel ?? 'Medium');

const buildDemoDocument = (): IngestedDocument => {
  const text = normalizeDocumentText(sampleContractText);

  return {
    kind: 'demo',
    name: 'Sample contractor agreement',
    charCount: text.length,
    estimatedTokens: estimateTokens(text),
    preview: makePreview(text),
    text,
    quality: 'good',
    warnings: [],
    capturedAt: new Date().toISOString(),
  };
};

const RiskBadge = ({ label }: { label: 'LOW' | 'CAUTION' | 'HIGH' | 'DANGER' }) => (
  <span className={cn('rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]', verdictToneClasses[label])}>
    {label}
  </span>
);

const SeverityBadge = ({ severity }: { severity: 'low' | 'medium' | 'high' }) => (
  <span className={cn('rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]', severityClasses[severity])}>
    {severity}
  </span>
);

const SectionHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
  <div className="space-y-1">
    <h2 className="text-xl font-semibold tracking-[-0.03em] text-stone-950">{title}</h2>
    {subtitle ? <p className="text-sm text-stone-600">{subtitle}</p> : null}
  </div>
);

const FindingDetails = ({ item }: { item: DetailedFinding }) => (
  <details className="group rounded-2xl border border-stone-200 bg-white/80 p-4">
    <summary className="flex cursor-pointer list-none items-start justify-between gap-3">
      <div className="space-y-1">
        <p className="font-semibold text-stone-950">{item.title}</p>
        {item.reference?.label ? <p className="text-xs text-stone-500">{item.reference.label}</p> : null}
      </div>
      <SeverityBadge severity={item.severity} />
    </summary>
    <div className="mt-4 space-y-3 border-t border-dashed border-stone-200 pt-4 text-sm text-stone-700">
      {item.reference?.quote ? (
        <div className="rounded-xl bg-stone-100 px-3 py-3 text-stone-700">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">From the contract</p>
          <p className="mt-2 leading-6">“{item.reference.quote}”</p>
        </div>
      ) : null}
      <div>
        <p className="font-semibold text-stone-900">What this means</p>
        <p className="mt-1 leading-6">{item.whatItMeans}</p>
      </div>
      <div>
        <p className="font-semibold text-stone-900">Why it matters</p>
        <p className="mt-1 leading-6">{item.whyItMatters}</p>
      </div>
    </div>
  </details>
);

const MissingProtectionCard = ({ item }: { item: MissingProtection }) => (
  <div className="rounded-2xl border border-amber-200 bg-amber-50/85 p-4">
    <p className="font-semibold text-amber-950">{item.title}</p>
    <p className="mt-2 text-sm leading-6 text-amber-900">{item.whyMissingMatters}</p>
    <p className="mt-3 text-sm text-amber-800">
      <span className="font-semibold">Common fix:</span> {item.commonFix}
    </p>
  </div>
);

const TopicConcernCard = ({ item }: { item: TopicConcern }) => (
  <div className="rounded-2xl border border-stone-200 bg-white/80 p-4">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{item.category}</p>
        <p className="mt-1 font-semibold text-stone-950">{item.title}</p>
      </div>
      <SeverityBadge severity={item.severity} />
    </div>
    <p className="mt-3 text-sm leading-6 text-stone-700">{item.whyItMatters}</p>
    {item.reference?.label ? <p className="mt-3 text-xs text-stone-500">Reference: {item.reference.label}</p> : null}
  </div>
);

const AdvantageCard = ({ item }: { item: PotentialAdvantage }) => (
  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4">
    <p className="font-semibold text-emerald-950">{item.title}</p>
    <p className="mt-2 text-sm leading-6 text-emerald-900">{item.whyItHelps}</p>
    {item.reference?.label ? <p className="mt-3 text-xs text-emerald-800">Reference: {item.reference.label}</p> : null}
  </div>
);

const LockedTeaser = ({ title, copy }: { title: string; copy: string }) => (
  <div className="rounded-2xl border border-stone-200 bg-stone-100/80 p-4 opacity-90">
    <div className="flex items-center justify-between gap-3">
      <p className="font-semibold text-stone-900">{title}</p>
      <span className="rounded-full bg-stone-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-700">
        Later
      </span>
    </div>
    <p className="mt-2 text-sm leading-6 text-stone-600">{copy}</p>
  </div>
);

const SidePanel = () => {
  const settings = useStorage(unshaftedSettingsStorage);
  const currentAnalysis = useStorage(currentAnalysisStorage);
  const history = useStorage(analysisHistoryStorage);
  const usage = useStorage(usageSnapshotStorage);
  const pendingAction = useStorage(pendingActionStorage);

  const [panelError, setPanelError] = useState('');
  const [selectedHistoryId, setSelectedHistoryId] = useState('');
  const [stepIndex, setStepIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadCardRef = useRef<HTMLDivElement | null>(null);
  const autoQuickScanRef = useRef<string | null>(null);

  useEffect(() => {
    void usageSnapshotStorage.syncMonth();
  }, []);

  useEffect(() => {
    if (pendingAction.type === 'focus-upload' && uploadCardRef.current) {
      uploadCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      void pendingActionStorage.set({ type: 'none' });
    }
  }, [pendingAction.type]);

  useEffect(() => {
    if (!currentAnalysis || currentAnalysis.status !== 'ready' || currentAnalysis.quickScan || !settings.apiKey.trim()) {
      return;
    }

    if (autoQuickScanRef.current === currentAnalysis.id) {
      return;
    }

    autoQuickScanRef.current = currentAnalysis.id;
    void startQuickScan(currentAnalysis);
  }, [currentAnalysis, settings.apiKey]);

  useEffect(() => {
    if (currentAnalysis?.status !== 'deep-running') {
      return;
    }

    const timer = window.setInterval(() => {
      setStepIndex(current => (current + 1) % LOADING_STEPS.length);
    }, 1400);

    return () => window.clearInterval(timer);
  }, [currentAnalysis?.status]);

  const openOptions = () => chrome.runtime.openOptionsPage();

  const setCurrent = async (analysis: CurrentAnalysis | null) => {
    autoQuickScanRef.current = analysis && analysis.status === 'ready' && !analysis.quickScan ? null : (analysis?.id ?? null);
    await currentAnalysisStorage.set(analysis);
  };

  const preparePageAnalysis = async () => {
    setPanelError('');
    const tab = await getCurrentActiveTab();
    const readability = await getTabReadability(tab);
    if (!tab?.id || !readability.supported) {
      throw new Error(readability.reason || 'This page cannot be analyzed directly. Try a standard website tab or upload a local `.txt` file.');
    }

    const extracted = await extractCurrentPageDocument(tab.id);
    if (!extracted.ok) {
      throw new Error(extracted.error);
    }

    const analysis = createCurrentAnalysis(extracted.document);
    setSelectedHistoryId('');
    await setCurrent(analysis);
    await pendingActionStorage.set({ type: 'none' });
  };

  const handleAnalyzeCurrentPage = async () => {
    try {
      await preparePageAnalysis();
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : 'Unable to analyze this page.');
    }
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setPanelError('');

    try {
      const document = await buildDocumentFromFile(file);
      const analysis = createCurrentAnalysis(document);
      setSelectedHistoryId('');
      await setCurrent(analysis);
      await pendingActionStorage.set({ type: 'none' });
    } catch (error) {
      setPanelError(error instanceof Error ? error.message : 'Unable to read this file.');
    } finally {
      event.target.value = '';
    }
  };

  const handleLoadDemo = async () => {
    setPanelError('');
    const analysis = createCurrentAnalysis(buildDemoDocument());
    analysis.quickScan = sampleQuickScan;
    analysis.deepAnalysis = sampleDeepAnalysis;
    analysis.selectedRole = 'Contractor';
    analysis.priorities = ['Liability', 'Payment', 'IP'];
    analysis.status = 'complete';
    setSelectedHistoryId('');
    await setCurrent(analysis);
  };

  const startQuickScan = async (analysis: CurrentAnalysis) => {
    setPanelError('');
    setStepIndex(0);

    await currentAnalysisStorage.set({
      ...analysis,
      status: 'quick-running',
      error: null,
    });

    const result = await runQuickScan(
      {
        ...analysis,
        status: 'quick-running',
        error: null,
      },
      settings,
    );

    await currentAnalysisStorage.set(result);

    if (result.status === 'error' && result.error) {
      setPanelError(result.error.message);
    }
  };

  const startDeepAnalysis = async () => {
    if (!currentAnalysis) {
      return;
    }

    setPanelError('');
    setStepIndex(0);

    await currentAnalysisStorage.set({
      ...currentAnalysis,
      status: 'deep-running',
      error: null,
    });

    const result = await runDeepAnalysis(
      {
        ...currentAnalysis,
        status: 'deep-running',
        error: null,
      },
      settings,
    );

    await currentAnalysisStorage.set(result);

    if (result.status === 'complete' && result.quickScan && result.deepAnalysis) {
      await usageSnapshotStorage.incrementFullAnalyses();
      await analysisHistoryStorage.push(createHistoryRecord(result));
    }

    if (result.status === 'error' && result.error) {
      setPanelError(result.error.message);
    }
  };

  const patchCurrentAnalysis = async (patch: Partial<CurrentAnalysis>) => {
    await currentAnalysisStorage.set(current => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const roleOptions = buildRoleOptions(currentAnalysis?.quickScan ?? null);
  const selectedRole = currentAnalysis?.customRole?.trim() || currentAnalysis?.selectedRole || 'Signer';
  const selectedHistory = history.find(record => record.id === selectedHistoryId) ?? null;
  const activeRecord = selectedHistory ?? null;

  return (
    <div className="sidepanel-shell">
      <div className="mx-auto max-w-5xl px-5 py-6 md:px-8 md:py-8">
        <input ref={fileInputRef} type="file" accept=".txt,text/plain" className="hidden" onChange={handleFileChosen} />

        <header className="sidepanel-header">
          <div className="space-y-2">
            <p className="sidepanel-eyebrow">{APP_NAME}</p>
            <h1 className="sidepanel-title">Read the contract like it was written against you.</h1>
            <p className="max-w-3xl text-sm leading-7 text-stone-600">
              Quick scan first. Role-aware analysis second. Direct explanations throughout. Informational only, not legal advice.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-stone-200 bg-white/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-600">
              {usage.fullAnalysesUsed} / {settings.monthlySoftLimit} detailed reviews this month
            </div>
            <button className="sidepanel-secondary-button" onClick={openOptions}>
              Options
            </button>
          </div>
        </header>

        {panelError ? (
          <section className="mt-5 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">{panelError}</section>
        ) : null}

        {!settings.apiKey.trim() ? (
          <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
            <p className="font-semibold">OpenRouter key required</p>
            <p className="mt-1 leading-6">
              Save your API key in Options before quick scan or deep analysis can run. The key stays local to this extension in the MVP.
            </p>
            <button className="mt-3 sidepanel-link-button" onClick={openOptions}>
              Open Options
            </button>
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="sidepanel-card">
            <SectionHeader title="Start a review" subtitle="Analyze the current webpage, upload a clean local `.txt` file, or load the sample contract." />

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <button className="sidepanel-primary-button" onClick={handleAnalyzeCurrentPage}>
                Analyze current page
              </button>
              <button className="sidepanel-secondary-button" onClick={handleUploadClick}>
                Upload `.txt`
              </button>
              <button className="sidepanel-secondary-button" onClick={handleLoadDemo}>
                Load sample result
              </button>
            </div>

            <div ref={uploadCardRef} className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 px-4 py-4 text-sm text-stone-600">
              <p className="font-semibold text-stone-900">Upload notes</p>
              <p className="mt-2 leading-6">
                Local `.txt` only. If the source is a PDF, convert PDF {'->'} Markdown first, then Markdown {'->'} TXT, and upload the final plain text file.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {CONVERTER_LINKS.map(link => (
                  <a
                    key={link.label}
                    className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3 no-underline transition hover:-translate-y-[1px] hover:border-amber-300"
                    href={link.url}
                    rel="noreferrer"
                    target="_blank">
                    <p className="font-semibold text-stone-950">{link.label}</p>
                    <p className="mt-1 text-xs leading-5 text-stone-600">{link.description}</p>
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="sidepanel-card">
            <SectionHeader title="Recent history" subtitle="Stored locally in your browser so you can reopen the output." />

            {history.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50/80 px-4 py-5 text-sm text-stone-600">
                No saved analyses yet.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {history.map(record => {
                  const tone = riskToneToLabel(record);
                  return (
                    <button
                      key={record.id}
                      className={cn(
                        'w-full rounded-2xl border px-4 py-4 text-left transition hover:-translate-y-[1px]',
                        selectedHistoryId === record.id ? 'border-stone-900 bg-stone-950 text-stone-50' : 'border-stone-200 bg-white/80',
                      )}
                      onClick={() => setSelectedHistoryId(current => (current === record.id ? '' : record.id))}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-1 font-semibold">{record.source.name}</p>
                          <p className={cn('mt-1 text-xs', selectedHistoryId === record.id ? 'text-stone-300' : 'text-stone-500')}>
                            {formatTimestamp(record.createdAt)} · {record.selectedRole}
                          </p>
                        </div>
                        <RiskBadge label={tone} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {activeRecord ? (
          <section className="mt-8 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <SectionHeader title="Saved analysis" subtitle={activeRecord.source.name} />
              <button className="sidepanel-secondary-button" onClick={() => setSelectedHistoryId('')}>
                Back to live workspace
              </button>
            </div>
            <ResultsView record={activeRecord} />
          </section>
        ) : null}

        {!activeRecord && currentAnalysis ? (
          <section className="mt-8 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <SectionHeader title="Current workspace" subtitle={currentAnalysis.source.name} />
              <div className="flex flex-wrap gap-2">
                <button className="sidepanel-secondary-button" onClick={() => void setCurrent(null)}>
                  Start fresh
                </button>
                {currentAnalysis.quickScan ? (
                  <button className="sidepanel-secondary-button" onClick={() => void startQuickScan({ ...currentAnalysis, quickScan: null })}>
                    Re-run quick scan
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
              <div className="sidepanel-card space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-50">
                    {currentAnalysis.source.kind}
                  </span>
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-700">
                    {currentAnalysis.source.quality}
                  </span>
                </div>

                <div className="grid gap-3 text-sm text-stone-600 md:grid-cols-2">
                  <div className="rounded-2xl bg-stone-100/80 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Characters</p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">{currentAnalysis.source.charCount.toLocaleString()}</p>
                  </div>
                  <div className="rounded-2xl bg-stone-100/80 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Estimated tokens</p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">{currentAnalysis.source.estimatedTokens.toLocaleString()}</p>
                  </div>
                  {currentAnalysis.source.fileSize ? (
                    <div className="rounded-2xl bg-stone-100/80 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">File size</p>
                      <p className="mt-2 text-lg font-semibold text-stone-950">{formatBytes(currentAnalysis.source.fileSize)}</p>
                    </div>
                  ) : null}
                  <div className="rounded-2xl bg-stone-100/80 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Captured</p>
                    <p className="mt-2 text-lg font-semibold text-stone-950">{formatTimestamp(currentAnalysis.source.capturedAt)}</p>
                  </div>
                </div>

                {currentAnalysis.source.warnings.length > 0 ? (
                  <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                    <p className="font-semibold">Extraction warnings</p>
                    <ul className="list-disc space-y-1 pl-5">
                      {currentAnalysis.source.warnings.map(warning => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <details className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                  <summary className="cursor-pointer list-none font-semibold text-stone-950">Preview extracted text</summary>
                  <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap font-mono text-xs leading-6 text-stone-700">
                    {currentAnalysis.source.preview}
                  </pre>
                </details>
              </div>

              <div className="space-y-4">
                {currentAnalysis.status === 'quick-running' ? (
                  <div className="sidepanel-card space-y-4">
                    <SectionHeader title="Running quick scan" subtitle="Document type, parties, rough risk, and likely role options." />
                    <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-4">
                      <p className="text-sm text-stone-600">Quick scan is using the fast model to classify the document and spot obvious risk.</p>
                      <div className="mt-4 flex items-center gap-3">
                        <div className="sidepanel-spinner" />
                        <p className="text-sm font-semibold text-stone-900">{LOADING_STEPS[stepIndex]}</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {currentAnalysis.quickScan ? (
                  <div className="sidepanel-card space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <SectionHeader title="Quick scan" subtitle={currentAnalysis.quickScan.documentType} />
                      <RiskBadge label={toVerdictTone(currentAnalysis.quickScan.roughRiskLevel)} />
                    </div>

                    <div className="rounded-2xl border border-stone-200 bg-white/85 px-4 py-4">
                      <p className="text-sm leading-7 text-stone-700">{currentAnalysis.quickScan.summary}</p>
                      <p className="mt-3 font-semibold text-stone-950">{currentAnalysis.quickScan.cautionLine}</p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Detected parties</p>
                        <div className="mt-3 space-y-2">
                          {currentAnalysis.quickScan.parties.map(party => (
                            <div key={`${party.name}-${party.role}`} className="rounded-xl bg-stone-100/80 px-3 py-3 text-sm text-stone-700">
                              <p className="font-semibold text-stone-950">{party.name}</p>
                              <p className="mt-1">
                                {party.role} · {party.confidence} confidence
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Quick flags</p>
                        <div className="mt-3 space-y-2">
                          {currentAnalysis.quickScan.redFlags.length > 0 ? (
                            currentAnalysis.quickScan.redFlags.map(flag => (
                              <div key={flag.title} className="rounded-xl bg-stone-100/80 px-3 py-3 text-sm text-stone-700">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="font-semibold text-stone-950">{flag.title}</p>
                                  <SeverityBadge severity={flag.severity} />
                                </div>
                                <p className="mt-2 leading-6">{flag.reason}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-stone-600">No major red flag was obvious on the first pass.</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Review as</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {roleOptions.map(role => (
                          <button
                            key={role}
                            className={cn(
                              'rounded-full px-3 py-2 text-sm font-semibold transition',
                              selectedRole === role
                                ? 'bg-stone-950 text-stone-50'
                                : 'bg-stone-100 text-stone-700 hover:bg-stone-200',
                            )}
                            onClick={() => void patchCurrentAnalysis({ selectedRole: role, customRole: '' })}>
                            {role}
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 grid gap-2">
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Someone else / custom role</label>
                        <input
                          className="sidepanel-input"
                          value={currentAnalysis.customRole}
                          onChange={event => void patchCurrentAnalysis({ customRole: event.target.value })}
                          placeholder="Example: Parent reviewing for renter"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Priority topics</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {PRIORITY_OPTIONS.map(priority => {
                          const selected = currentAnalysis.priorities.includes(priority);
                          return (
                            <button
                              key={priority}
                              className={cn(
                                'rounded-full px-3 py-2 text-sm font-semibold transition',
                                selected ? 'bg-amber-500 text-stone-950' : 'bg-stone-100 text-stone-700 hover:bg-stone-200',
                              )}
                              onClick={() =>
                                void patchCurrentAnalysis({
                                  priorities: selected
                                    ? currentAnalysis.priorities.filter(item => item !== priority)
                                    : [...currentAnalysis.priorities, priority],
                                })
                              }>
                              {priority}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        className="mt-3 sidepanel-link-button"
                        onClick={() => void patchCurrentAnalysis({ priorities: buildSuggestedPriorities(currentAnalysis.quickScan) })}>
                        Reset to suggested priorities
                      </button>
                    </div>

                    {currentAnalysis.status !== 'deep-running' && !currentAnalysis.deepAnalysis ? (
                      <button className="sidepanel-primary-button w-full" onClick={() => void startDeepAnalysis()}>
                        Run detailed analysis
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {currentAnalysis.status === 'deep-running' ? (
                  <div className="sidepanel-card space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <SectionHeader title="Running detailed analysis" subtitle={`Reviewing as ${selectedRole}`} />
                      <RiskBadge label={toVerdictTone(currentAnalysis.quickScan?.roughRiskLevel ?? 'Medium')} />
                    </div>
                    <div className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-4">
                      <p className="text-sm text-stone-600">The deep pass is checking obligations, asymmetry, traps, missing protections, and possible negotiation angles.</p>
                      <div className="mt-4 flex items-center gap-3">
                        <div className="sidepanel-spinner" />
                        <p className="text-sm font-semibold text-stone-900">{LOADING_STEPS[stepIndex]}</p>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {currentAnalysis.deepAnalysis ? <ResultsView record={currentAnalysis} /> : null}
          </section>
        ) : null}

        {!activeRecord && !currentAnalysis ? (
          <section className="mt-8 rounded-3xl border border-stone-200 bg-white/70 px-6 py-8">
            <p className="max-w-3xl text-sm leading-7 text-stone-600">
              Verdict first, depth on demand. Load a page, upload a clean text file, or open the sample analysis to see the structured output.
            </p>
            <p className="mt-4 text-sm text-stone-500">{DISCLAIMER_LINE}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
};

const ResultsView = ({ record }: { record: Pick<CurrentAnalysis, 'quickScan' | 'deepAnalysis' | 'selectedRole' | 'customRole'> | HistoryRecord }) => {
  const deep = record.deepAnalysis;
  const quick = record.quickScan;

  if (!deep) {
    return null;
  }

  const tone = toVerdictTone(deep.overallRiskLevel);
  const reviewedAs = 'customRole' in record && record.customRole.trim() ? record.customRole : record.selectedRole;

  return (
    <div className="space-y-5">
      <section className="sidepanel-card sticky top-3 z-10 border-stone-950 bg-stone-950 text-stone-50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-3">
            <RiskBadge label={tone} />
            <h2 className="text-2xl font-semibold tracking-[-0.04em]">{deep.bottomLine}</h2>
            <p className="text-sm leading-7 text-stone-300">{deep.plainEnglishSummary}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm text-stone-200">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Reviewed as</p>
            <p className="mt-2 font-semibold text-stone-50">{reviewedAs}</p>
            {quick?.documentType ? <p className="mt-1 text-xs text-stone-400">{quick.documentType}</p> : null}
          </div>
        </div>
      </section>

      {deep.overallRiskLevel === 'Very High' ? (
        <section className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-900">
          <p className="font-semibold">High-stakes warning</p>
          <p className="mt-1 leading-6">
            This agreement has significant risk areas. For anything material, consider a contracts or commercial lawyer before signing.
          </p>
        </section>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="sidepanel-card space-y-4">
          <SectionHeader title="What should immediately worry you" />
          {deep.immediateWorries.length > 0 ? deep.immediateWorries.map(item => <FindingDetails key={item.title} item={item} />) : <p className="text-sm text-stone-600">No immediate red alert stood out beyond the general concerns below.</p>}
        </div>

        <div className="sidepanel-card space-y-4">
          <SectionHeader title="One-sided or unfavorable clauses" />
          {deep.oneSidedClauses.length > 0 ? deep.oneSidedClauses.map(item => <FindingDetails key={item.title} item={item} />) : <p className="text-sm text-stone-600">The model did not flag strongly one-sided clauses here.</p>}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="sidepanel-card space-y-4">
          <SectionHeader title="Missing protections" subtitle="These are the guardrails that should probably exist but do not." />
          {deep.missingProtections.length > 0 ? deep.missingProtections.map(item => <MissingProtectionCard key={item.title} item={item} />) : <p className="text-sm text-stone-600">No obvious missing protections were identified.</p>}
        </div>

        <div className="sidepanel-card space-y-4">
          <SectionHeader title="Deadlines, renewals, lock-ins, and termination" />
          {deep.timingAndLockIn.length > 0 ? deep.timingAndLockIn.map(item => <FindingDetails key={item.title} item={item} />) : <p className="text-sm text-stone-600">No material lock-in or timing trap stood out.</p>}
        </div>
      </section>

      <section className="sidepanel-card space-y-4">
        <SectionHeader title="Payment, liability, IP, confidentiality, dispute, and other core concerns" />
        {deep.topicConcerns.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {deep.topicConcerns.map(item => (
              <TopicConcernCard key={`${item.category}-${item.title}`} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-600">No extra category-level concerns were returned.</p>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="sidepanel-card space-y-4">
          <SectionHeader title="What you can try to negotiate" />
          {deep.negotiationIdeas.length > 0 ? (
            deep.negotiationIdeas.map(item => (
              <div key={item.ask} className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                <p className="font-semibold text-stone-950">{item.ask}</p>
                <p className="mt-2 text-sm leading-6 text-stone-700">{item.why}</p>
                {item.fallback ? (
                  <p className="mt-3 text-sm text-stone-600">
                    <span className="font-semibold text-stone-900">Fallback:</span> {item.fallback}
                  </p>
                ) : null}
                {item.targetClause ? <p className="mt-3 text-xs text-stone-500">Target clause: {item.targetClause}</p> : null}
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-600">No negotiation ideas were returned.</p>
          )}
        </div>

        <div className="sidepanel-card space-y-4">
          <SectionHeader title="Suggested edits or asks in plain English" />
          {deep.suggestedEdits.length > 0 ? (
            deep.suggestedEdits.map(item => (
              <div key={item.title} className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                <p className="font-semibold text-stone-950">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-stone-700">{item.plainEnglishEdit}</p>
                <p className="mt-3 text-sm text-stone-600">{item.why}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-600">No specific edit suggestions were returned.</p>
          )}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="sidepanel-card space-y-4">
          <SectionHeader title="Questions to ask before signing" />
          {deep.questionsToAsk.length > 0 ? (
            <ul className="space-y-3 text-sm leading-6 text-stone-700">
              {deep.questionsToAsk.map(question => (
                <li key={question} className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
                  {question}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-stone-600">No extra diligence questions were returned.</p>
          )}
        </div>

        <div className="sidepanel-card space-y-4">
          <SectionHeader title="Could shaft you later" subtitle="Small now, expensive later." />
          {deep.couldShaftYouLater.length > 0 ? deep.couldShaftYouLater.map(item => <FindingDetails key={item.title} item={item} />) : <p className="text-sm text-stone-600">No delayed-action traps stood out beyond the main risks.</p>}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="sidepanel-card space-y-4">
          <SectionHeader title="Potential advantage for you" />
          {deep.potentialAdvantages.length > 0 ? deep.potentialAdvantages.map(item => <AdvantageCard key={item.title} item={item} />) : <p className="text-sm text-stone-600">No real upside clause stood out. That does happen.</p>}
        </div>

        <div className="sidepanel-card space-y-4">
          <SectionHeader title="Protection checklist" />
          {deep.protectionChecklist.length > 0 ? (
            deep.protectionChecklist.map(group => (
              <div key={group.label} className="rounded-2xl border border-stone-200 bg-white/80 p-4">
                <p className="font-semibold text-stone-950">{group.label}</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-stone-700">
                  {group.items.map(item => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-1 inline-block h-2.5 w-2.5 rounded-full bg-stone-950" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-600">No checklist items were returned.</p>
          )}
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="sidepanel-card space-y-4">
          <SectionHeader title="Clause references and caveats" />
          <div className="space-y-3 text-sm leading-6 text-stone-700">
            {deep.clauseReferenceNotes.map(note => (
              <div key={note} className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-3">
                {note}
              </div>
            ))}
            {deep.assumptionsAndUnknowns.map(note => (
              <div key={note} className="rounded-2xl border border-stone-200 bg-stone-100/80 px-4 py-3 text-stone-600">
                {note}
              </div>
            ))}
          </div>
        </div>

        <div className="sidepanel-card space-y-4">
          <SectionHeader title="Next layers" subtitle="Not in the MVP yet, but the UI leaves room for them." />
          <div className="space-y-3">
            <LockedTeaser title="Regional context" copy="Later, this will flag when local consumer or employment rules might soften a harsh clause." />
            <LockedTeaser title="Follow-up Q&A" copy="Later, you will be able to ask clause-specific questions against the saved agreement." />
            <LockedTeaser title="Clause-by-clause redline suggestions" copy="Later, this can generate more granular fallback wording and negotiating positions." />
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white/70 px-5 py-4 text-sm text-stone-600">
        {deep.disclaimer || DISCLAIMER_LINE}
      </section>
    </div>
  );
};

export default withErrorBoundary(withSuspense(SidePanel, <LoadingSpinner />), ErrorDisplay);

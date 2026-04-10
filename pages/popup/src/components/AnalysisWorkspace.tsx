import {
  LOADING_STEPS,
  PRIORITY_OPTIONS,
  buildRoleOptions,
  buildSuggestedPriorities,
  formatBytes,
  toVerdictTone,
} from '@extension/unshafted-core';
import type { CurrentAnalysis } from '@extension/unshafted-core';
import { runDeepAnalysis, runQuickScan, useStorage } from '@extension/shared';
import {
  analysisHistoryStorage,
  currentAnalysisStorage,
  unshaftedSettingsStorage,
  usageSnapshotStorage,
} from '@extension/storage';
import { cn } from '@extension/ui';
import { useEffect, useRef, useState } from 'react';
import { RiskBadge, SectionHeader, SeverityBadge, ResultsView } from './ResultCards';

const formatTimestamp = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

import { createHistoryRecord } from '@extension/unshafted-core';

export const AnalysisWorkspace = () => {
  const settings = useStorage(unshaftedSettingsStorage);
  const currentAnalysis = useStorage(currentAnalysisStorage);

  const [panelError, setPanelError] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const autoQuickScanRef = useRef<string | null>(null);

  // Auto-trigger quick scan when a new analysis is ready
  useEffect(() => {
    const activeKey = settings.provider === 'openai' ? settings.openaiApiKey : settings.apiKey;
    if (!currentAnalysis || currentAnalysis.status !== 'ready' || currentAnalysis.quickScan || !activeKey.trim()) {
      return;
    }

    if (autoQuickScanRef.current === currentAnalysis.id) {
      return;
    }

    autoQuickScanRef.current = currentAnalysis.id;
    void startQuickScan(currentAnalysis);
  }, [currentAnalysis, settings.apiKey, settings.openaiApiKey, settings.provider]);

  // Animate loading steps
  useEffect(() => {
    if (currentAnalysis?.status !== 'deep-running' && currentAnalysis?.status !== 'quick-running') {
      return;
    }

    const timer = window.setInterval(() => {
      setStepIndex(current => (current + 1) % LOADING_STEPS.length);
    }, 1400);

    return () => window.clearInterval(timer);
  }, [currentAnalysis?.status]);

  const setCurrent = async (analysis: CurrentAnalysis | null) => {
    autoQuickScanRef.current = analysis && analysis.status === 'ready' && !analysis.quickScan ? null : (analysis?.id ?? null);
    await currentAnalysisStorage.set(analysis);
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
      { ...analysis, status: 'quick-running', error: null },
      settings,
    );

    await currentAnalysisStorage.set(result);

    if (result.status === 'error' && result.error) {
      setPanelError(result.error.message);
    }
  };

  const startDeepAnalysis = async () => {
    if (!currentAnalysis) return;

    setPanelError('');
    setStepIndex(0);

    await currentAnalysisStorage.set({
      ...currentAnalysis,
      status: 'deep-running',
      error: null,
    });

    const result = await runDeepAnalysis(
      { ...currentAnalysis, status: 'deep-running', error: null },
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
      if (!current) return current;
      return { ...current, ...patch, updatedAt: new Date().toISOString() };
    });
  };

  if (!currentAnalysis) {
    return null;
  }

  const roleOptions = buildRoleOptions(currentAnalysis.quickScan ?? null);
  const selectedRole = currentAnalysis.customRole?.trim() || currentAnalysis.selectedRole || 'Signer';

  return (
    <div className="space-y-3">
      {/* Top bar */}
      <div className="flex items-center justify-end">
        <button className="popup-link-button" onClick={() => void setCurrent(null)}>Start fresh</button>
      </div>

      {panelError || currentAnalysis?.error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-900 space-y-2">
          <p className="font-semibold">Something went wrong</p>
          <p>{panelError || currentAnalysis?.error?.message}</p>
          {currentAnalysis?.error?.suggestion ? (
            <p className="text-rose-800">{currentAnalysis.error.suggestion}</p>
          ) : null}
          {currentAnalysis?.status === 'error' ? (
            <button
              className="popup-secondary-button !text-xs !py-2 mt-1"
              onClick={() => void startQuickScan({ ...currentAnalysis, quickScan: null, error: null, status: 'ready' })}>
              Retry quick scan
            </button>
          ) : null}
        </section>
      ) : null}

      {/* Document info */}
      <section className="popup-card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-50">
            {currentAnalysis.source.kind}
          </span>
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-700">
            {currentAnalysis.source.quality}
          </span>
        </div>

        <p className="text-sm font-semibold text-stone-900 line-clamp-2">{currentAnalysis.source.name}</p>

        <div className="grid grid-cols-2 gap-2 text-xs text-stone-600">
          <div className="rounded-xl bg-stone-100/80 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Characters</p>
            <p className="mt-1 text-sm font-semibold text-stone-950">{currentAnalysis.source.charCount.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-stone-100/80 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Tokens (est.)</p>
            <p className="mt-1 text-sm font-semibold text-stone-950">{currentAnalysis.source.estimatedTokens.toLocaleString()}</p>
          </div>
          {currentAnalysis.source.fileSize ? (
            <div className="rounded-xl bg-stone-100/80 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">File size</p>
              <p className="mt-1 text-sm font-semibold text-stone-950">{formatBytes(currentAnalysis.source.fileSize)}</p>
            </div>
          ) : null}
          <div className="rounded-xl bg-stone-100/80 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Captured</p>
            <p className="mt-1 text-sm font-semibold text-stone-950">{formatTimestamp(currentAnalysis.source.capturedAt)}</p>
          </div>
        </div>

        {currentAnalysis.source.warnings.length > 0 ? (
          <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
            <p className="font-semibold">Extraction warnings</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {currentAnalysis.source.warnings.map(warning => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <details className="rounded-xl border border-stone-200 bg-white/80 p-3">
          <summary className="cursor-pointer list-none text-xs font-semibold text-stone-950">Preview extracted text</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-stone-700">
            {currentAnalysis.source.preview}
          </pre>
        </details>
      </section>

      {/* Quick scan running */}
      {currentAnalysis.status === 'quick-running' ? (
        <section className="popup-card space-y-3">
          <SectionHeader title="Running quick scan" subtitle="Type, parties, rough risk, role options." />
          <div className="rounded-xl border border-stone-200 bg-white/80 px-3 py-3">
            <p className="text-xs text-stone-600">Classifying document and spotting obvious risk...</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="popup-spinner" />
              <p className="text-xs font-semibold text-stone-900">{LOADING_STEPS[stepIndex]}</p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Quick scan results */}
      {currentAnalysis.quickScan ? (
        <section className="popup-card space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <SectionHeader title="Quick scan" subtitle={currentAnalysis.quickScan.documentType} />
            <RiskBadge label={toVerdictTone(currentAnalysis.quickScan.roughRiskLevel)} />
          </div>

          <div className="rounded-xl border border-stone-200 bg-white/85 px-3 py-3">
            <p className="text-xs leading-5 text-stone-700">{currentAnalysis.quickScan.summary}</p>
            <p className="mt-2 text-xs font-semibold text-stone-950">{currentAnalysis.quickScan.cautionLine}</p>
          </div>

          {/* Parties */}
          <div className="rounded-xl border border-stone-200 bg-white/80 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Detected parties</p>
            <div className="mt-2 space-y-1.5">
              {currentAnalysis.quickScan.parties.map(party => (
                <div key={`${party.name}-${party.role}`} className="rounded-lg bg-stone-100/80 px-2.5 py-2 text-xs text-stone-700">
                  <p className="font-semibold text-stone-950">{party.name}</p>
                  <p className="mt-0.5">{party.role} · {party.confidence} confidence</p>
                </div>
              ))}
            </div>
          </div>

          {/* Red flags */}
          <div className="rounded-xl border border-stone-200 bg-white/80 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Quick flags</p>
            <div className="mt-2 space-y-1.5">
              {currentAnalysis.quickScan.redFlags.length > 0 ? (
                currentAnalysis.quickScan.redFlags.map(flag => (
                  <div key={flag.title} className="rounded-lg bg-stone-100/80 px-2.5 py-2 text-xs text-stone-700">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-stone-950">{flag.title}</p>
                      <SeverityBadge severity={flag.severity} />
                    </div>
                    <p className="mt-1 leading-5">{flag.reason}</p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-stone-600">No major red flag was obvious on the first pass.</p>
              )}
            </div>
          </div>

          {/* Role selection */}
          <div className="rounded-xl border border-stone-200 bg-white/80 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Review as</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {roleOptions.map(role => (
                <button
                  key={role}
                  className={cn(
                    'rounded-full px-2.5 py-1.5 text-xs font-semibold transition',
                    selectedRole === role
                      ? 'bg-stone-950 text-stone-50'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200',
                  )}
                  onClick={() => void patchCurrentAnalysis({ selectedRole: role, customRole: '' })}>
                  {role}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <label className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Custom role</label>
              <input
                className="popup-input mt-1"
                value={currentAnalysis.customRole}
                onChange={event => void patchCurrentAnalysis({ customRole: event.target.value })}
                placeholder="e.g. Parent reviewing for renter"
              />
            </div>
          </div>

          {/* Priority topics */}
          <div className="rounded-xl border border-stone-200 bg-white/80 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Priority topics</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PRIORITY_OPTIONS.map(priority => {
                const selected = currentAnalysis.priorities.includes(priority);
                return (
                  <button
                    key={priority}
                    className={cn(
                      'rounded-full px-2.5 py-1.5 text-xs font-semibold transition',
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
              className="mt-2 popup-link-button"
              onClick={() => void patchCurrentAnalysis({ priorities: buildSuggestedPriorities(currentAnalysis.quickScan) })}>
              Reset to suggested
            </button>
          </div>

          {/* Re-run quick scan */}
          {currentAnalysis.quickScan ? (
            <button
              className="popup-secondary-button"
              onClick={() => void startQuickScan({ ...currentAnalysis, quickScan: null })}>
              Re-run quick scan
            </button>
          ) : null}

          {/* Deep analysis trigger */}
          {currentAnalysis.status !== 'deep-running' && !currentAnalysis.deepAnalysis ? (
            <button className="popup-primary-button" onClick={() => void startDeepAnalysis()}>
              Run detailed analysis
            </button>
          ) : null}
        </section>
      ) : null}

      {/* Deep analysis running */}
      {currentAnalysis.status === 'deep-running' ? (
        <section className="popup-card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionHeader title="Running detailed analysis" subtitle={`Reviewing as ${selectedRole}`} />
            <RiskBadge label={toVerdictTone(currentAnalysis.quickScan?.roughRiskLevel ?? 'Medium')} />
          </div>
          <div className="rounded-xl border border-stone-200 bg-white/80 px-3 py-3">
            <p className="text-xs text-stone-600">Checking obligations, asymmetry, traps, missing protections, and negotiation angles.</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="popup-spinner" />
              <p className="text-xs font-semibold text-stone-900">{LOADING_STEPS[stepIndex]}</p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Deep analysis results */}
      {currentAnalysis.deepAnalysis ? <ResultsView record={currentAnalysis} /> : null}
    </div>
  );
};

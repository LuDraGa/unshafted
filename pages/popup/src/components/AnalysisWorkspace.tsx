import { RiskBadge, SectionHeader, SeverityBadge, ResultsView } from './ResultCards';
import { useStorage } from '@extension/shared';
import { currentAnalysisStorage, unshaftedSettingsStorage } from '@extension/storage';
import { cn } from '@extension/ui';
import {
  LOADING_STEPS,
  PRIORITY_OPTIONS,
  buildRoleOptions,
  buildSuggestedPriorities,
  formatBytes,
  QUICK_SCAN_CHAR_LIMIT,
  DEEP_ANALYSIS_CHAR_LIMIT,
  toVerdictTone,
  RUN_QUICK_SCAN_MESSAGE,
  RUN_DEEP_ANALYSIS_MESSAGE,
} from '@extension/unshafted-core';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '@extension/supabase';
import type { CurrentAnalysis, AnalysisMessageResponse } from '@extension/unshafted-core';

const formatTimestamp = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

/** Reusable accordion section */
const AccordionSection = ({
  title,
  count,
  severity,
  defaultOpen = false,
  forceOpen = false,
  onboardingTarget,
  children,
}: {
  title: string;
  count?: number;
  severity?: 'low' | 'medium' | 'high';
  defaultOpen?: boolean;
  forceOpen?: boolean;
  onboardingTarget?: string;
  children: React.ReactNode;
}) => (
  <details
    className="popup-accordion"
    open={defaultOpen || forceOpen || undefined}
    data-onboarding-target={onboardingTarget}>
    <summary>
      <span>{title}</span>
      {count !== undefined ? (
        <span
          className={cn(
            'popup-accordion-count',
            severity === 'high' && 'severity-high',
            severity === 'medium' && 'severity-medium',
          )}>
          {count}
        </span>
      ) : null}
    </summary>
    <div className="popup-accordion-body">{children}</div>
  </details>
);

export const AnalysisWorkspace = ({
  focusedOnboardingTarget,
  session,
  onSignIn,
}: {
  focusedOnboardingTarget?: 'summary' | 'flags' | 'customize' | 'cta' | null;
  session: Session | null;
  onSignIn: () => void;
}) => {
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

  const startQuickScan = async (analysis: CurrentAnalysis) => {
    setPanelError('');
    setStepIndex(0);

    await currentAnalysisStorage.set({
      ...analysis,
      quickScan: null,
      deepAnalysis: null,
      status: 'ready',
      error: null,
      updatedAt: new Date().toISOString(),
    });

    let response: AnalysisMessageResponse;
    try {
      response = await chrome.runtime.sendMessage({
        type: RUN_QUICK_SCAN_MESSAGE,
        isSignedIn: !!session,
      });
    } catch (error) {
      response = {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to start quick scan.',
      };
    }

    if (!response.ok) {
      setPanelError(response.error);
    }
  };

  const startDeepAnalysis = async () => {
    if (!currentAnalysis) return;
    if (!session) {
      setPanelError('Sign in with Google to unlock detailed analysis.');
      return;
    }
    setPanelError('');
    setStepIndex(0);

    let response: AnalysisMessageResponse;
    try {
      response = await chrome.runtime.sendMessage({
        type: RUN_DEEP_ANALYSIS_MESSAGE,
      });
    } catch (error) {
      response = {
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to start detailed analysis.',
      };
    }

    if (!response.ok) {
      setPanelError(response.error);
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
  const quickScan = currentAnalysis.quickScan;
  const activeModel =
    settings.provider === 'openai'
      ? currentAnalysis.deepAnalysis
        ? settings.openaiDeepModel
        : settings.openaiQuickModel
      : currentAnalysis.deepAnalysis
        ? settings.deepModel
        : settings.quickModel;
  const quickUsesExcerpt = currentAnalysis.source.text.length > QUICK_SCAN_CHAR_LIMIT;
  const deepUsesExcerpt = currentAnalysis.source.text.length > DEEP_ANALYSIS_CHAR_LIMIT;
  const maxFlagSeverity = quickScan?.redFlags.reduce<'low' | 'medium' | 'high'>((max, f) => {
    const order = { low: 0, medium: 1, high: 2 } as const;
    return order[f.severity] > order[max] ? f.severity : max;
  }, 'low');

  return (
    <div className="space-y-3">
      {/* Error display */}
      {panelError || currentAnalysis?.error ? (
        <section className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-900">
          <p className="font-semibold">Something went wrong</p>
          <p>{panelError || currentAnalysis?.error?.message}</p>
          {currentAnalysis?.error?.suggestion ? (
            <p className="text-rose-800">{currentAnalysis.error.suggestion}</p>
          ) : null}
          {currentAnalysis?.status === 'error' ? (
            <button
              className="popup-secondary-button mt-1 !py-2 !text-xs"
              onClick={() =>
                void startQuickScan({ ...currentAnalysis, quickScan: null, error: null, status: 'ready' })
              }>
              Retry quick scan
            </button>
          ) : null}
        </section>
      ) : null}

      {/* Document info — always visible once uploaded */}
      <AccordionSection title="Document info">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-50">
              {currentAnalysis.source.kind}
            </span>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-700">
              {currentAnalysis.source.quality}
            </span>
          </div>

          <p className="line-clamp-2 text-sm font-semibold text-stone-900">{currentAnalysis.source.name}</p>

          <div className="grid grid-cols-2 gap-2 text-xs text-stone-600">
            <div className="rounded-xl bg-stone-100/80 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Characters</p>
              <p className="mt-1 text-sm font-semibold text-stone-950">
                {currentAnalysis.source.charCount.toLocaleString()}
              </p>
            </div>
            <div className="rounded-xl bg-stone-100/80 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Tokens (est.)</p>
              <p className="mt-1 text-sm font-semibold text-stone-950">
                {currentAnalysis.source.estimatedTokens.toLocaleString()}
              </p>
            </div>
            {currentAnalysis.source.fileSize ? (
              <div className="rounded-xl bg-stone-100/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">File size</p>
                <p className="mt-1 text-sm font-semibold text-stone-950">
                  {formatBytes(currentAnalysis.source.fileSize)}
                </p>
              </div>
            ) : null}
            <div className="rounded-xl bg-stone-100/80 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500">Captured</p>
              <p className="mt-1 text-sm font-semibold text-stone-950">
                {formatTimestamp(currentAnalysis.source.capturedAt)}
              </p>
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
            <summary className="cursor-pointer list-none text-xs font-semibold text-stone-950">
              Preview extracted text
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-stone-700">
              {currentAnalysis.source.preview}
            </pre>
          </details>
        </div>
      </AccordionSection>

      {/* Quick scan running */}
      {currentAnalysis.status === 'quick-running' ? (
        <section className="popup-card space-y-3">
          <SectionHeader title="Running quick scan" subtitle="Type, parties, rough risk, role options." />
          <div className="rounded-xl border border-stone-200 bg-white/80 px-3 py-3">
            <p className="text-xs text-stone-600">Classifying document and spotting obvious risk...</p>
            <p className="mt-1 text-[11px] text-stone-500">
              Runs in the background service worker; closing the popup should not cancel the request.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="popup-spinner" />
              <p className="text-xs font-semibold text-stone-900">{LOADING_STEPS[stepIndex]}</p>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Verdict strip ── */}
      {quickScan ? (
        <div className="popup-verdict-strip">
          <RiskBadge label={toVerdictTone(quickScan.roughRiskLevel)} />
          <p>{quickScan.cautionLine}</p>
          <button
            className="popup-rerun-link"
            onClick={() => void startQuickScan({ ...currentAnalysis, quickScan: null })}>
            Re-scan
          </button>
        </div>
      ) : null}

      {quickScan ? (
        <section className="rounded-2xl border border-stone-200 bg-white/70 px-3 py-2 text-[11px] leading-5 text-stone-600">
          <p>
            Coverage:{' '}
            {quickUsesExcerpt ? 'quick scan used a balanced excerpt' : 'quick scan used the full extracted text'} ·
            Model: {activeModel || 'default model'}
          </p>
          {quickScan.extractionConcerns.length > 0 || currentAnalysis.source.warnings.length > 0 ? (
            <p className="mt-1 text-amber-800">
              Check extraction warnings before relying on this result. Scanned PDFs, tables, and missing text can reduce
              accuracy.
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── Quick scan accordion sections ── */}
      {quickScan ? (
        <div>
          {/* Summary — open by default */}
          <AccordionSection
            title="Summary"
            defaultOpen
            onboardingTarget="summary"
            forceOpen={focusedOnboardingTarget === 'summary'}>
            <div className="space-y-2">
              <span className="inline-block rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-700">
                {quickScan.documentType}
              </span>
              <p className="text-xs leading-5 text-stone-700">{quickScan.summary}</p>
            </div>
          </AccordionSection>

          {/* Parties — closed, with count */}
          {quickScan.parties.length > 0 ? (
            <AccordionSection title="Parties" count={quickScan.parties.length}>
              <div className="flex flex-wrap gap-1.5">
                {quickScan.parties.map(party => (
                  <span
                    key={`${party.name}-${party.role}`}
                    className="rounded-full bg-stone-100/80 px-2.5 py-1.5 text-xs text-stone-700">
                    <span className="font-semibold text-stone-950">{party.name}</span>
                    <span className="text-stone-500"> · {party.role}</span>
                  </span>
                ))}
              </div>
            </AccordionSection>
          ) : null}

          {/* Quick flags — closed, with count + severity */}
          {quickScan.redFlags.length > 0 ? (
            <AccordionSection
              title="Flags"
              count={quickScan.redFlags.length}
              severity={maxFlagSeverity}
              onboardingTarget="flags"
              forceOpen={focusedOnboardingTarget === 'flags'}>
              <div className="space-y-1.5">
                {quickScan.redFlags.map(flag => (
                  <div key={flag.title} className="rounded-lg bg-stone-100/80 px-2.5 py-2 text-xs text-stone-700">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-stone-950">{flag.title}</p>
                      <SeverityBadge severity={flag.severity} />
                    </div>
                    <p className="mt-1 leading-5">{flag.reason}</p>
                  </div>
                ))}
              </div>
            </AccordionSection>
          ) : (
            <section className="mt-1 rounded-2xl border border-emerald-200 bg-emerald-50/85 px-3 py-2 text-xs leading-5 text-emerald-900">
              <p className="font-semibold">No major quick-scan flags found</p>
              <p>
                Still review the summary, extraction coverage, and detailed analysis before relying on this for a
                high-stakes contract.
              </p>
            </section>
          )}

          {/* Customize analysis — closed, shows current role inline */}
          <AccordionSection
            title={`Customize analysis · ${selectedRole}`}
            onboardingTarget="customize"
            forceOpen={focusedOnboardingTarget === 'customize'}>
            <div className="space-y-3">
              <p className="rounded-xl border border-stone-200 bg-white/75 px-3 py-2 text-xs leading-5 text-stone-600">
                Suggested role and priorities are preselected from the quick scan. Change them only if they do not match
                your position.
              </p>
              {/* Role selection */}
              <div>
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
                  <label
                    className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-500"
                    htmlFor="custom-role">
                    Custom role
                  </label>
                  <input
                    id="custom-role"
                    className="popup-input mt-1"
                    value={currentAnalysis.customRole}
                    onChange={event => void patchCurrentAnalysis({ customRole: event.target.value })}
                    placeholder="e.g. Parent reviewing for renter"
                  />
                </div>
              </div>

              {/* Priority topics */}
              <div>
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
                  className="popup-link-button mt-2"
                  onClick={() =>
                    void patchCurrentAnalysis({ priorities: buildSuggestedPriorities(currentAnalysis.quickScan) })
                  }>
                  Reset to suggested
                </button>
              </div>
            </div>
          </AccordionSection>

          {/* Single CTA: Run detailed analysis */}
          {currentAnalysis.status !== 'deep-running' && !currentAnalysis.deepAnalysis ? (
            session ? (
              <button
                className="popup-primary-button mt-3"
                onClick={() => void startDeepAnalysis()}
                data-onboarding-target="cta"
                type="button">
                Run detailed analysis
              </button>
            ) : (
              <button
                className="popup-primary-button mt-3"
                onClick={onSignIn}
                data-onboarding-target="cta"
                type="button">
                Sign in to run detailed analysis
              </button>
            )
          ) : null}
        </div>
      ) : null}

      {/* Deep analysis running */}
      {currentAnalysis.status === 'deep-running' ? (
        <section className="popup-card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionHeader title="Running detailed analysis" subtitle={`Reviewing as ${selectedRole}`} />
            <RiskBadge label={toVerdictTone(currentAnalysis.quickScan?.roughRiskLevel ?? 'Medium')} />
          </div>
          <div className="rounded-xl border border-stone-200 bg-white/80 px-3 py-3">
            <p className="text-xs text-stone-600">
              Checking obligations, asymmetry, traps, missing protections, and negotiation angles.
            </p>
            <p className="mt-1 text-[11px] text-stone-500">
              {deepUsesExcerpt
                ? 'This document is long, so detailed analysis uses a balanced excerpt.'
                : 'Detailed analysis is using the extracted text available for this document.'}
            </p>
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

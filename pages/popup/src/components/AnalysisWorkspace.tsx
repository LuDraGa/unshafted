import {
  CompactVerdict,
  DocStrip,
  ResultsView,
  RiskBadge,
  VerdictSkeleton,
  buildVerdictPreview,
  getDecisionAction,
} from './ResultCards';
import { useStorage } from '@extension/shared';
import { currentAnalysisStorage, unshaftedSettingsStorage } from '@extension/storage';
import {
  LOADING_STEPS,
  PRIORITY_OPTIONS,
  buildRoleOptions,
  buildSuggestedPriorities,
  toVerdictTone,
  RUN_QUICK_SCAN_MESSAGE,
  RUN_DEEP_ANALYSIS_MESSAGE,
} from '@extension/unshafted-core';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@extension/supabase';
import type { CurrentAnalysis, AnalysisMessageResponse } from '@extension/unshafted-core';

const ScopeSheet = ({
  selectedRole,
  customRole,
  priorities,
  roleOptions,
  onSelectRole,
  onCustomRoleChange,
  onTogglePriority,
  onResetPriorities,
  onClose,
}: {
  selectedRole: string;
  customRole: string;
  priorities: string[];
  roleOptions: string[];
  onSelectRole: (role: string) => void;
  onCustomRoleChange: (value: string) => void;
  onTogglePriority: (priority: string) => void;
  onResetPriorities: () => void;
  onClose: () => void;
}) => (
  <div className="popup-scope-sheet" role="dialog" aria-label="Customize analysis scope">
    <div className="popup-scope-sheet-row">
      <p className="popup-scope-sheet-label">Review as</p>
      <div className="popup-scope-chip-row">
        {roleOptions.map(role => (
          <button
            key={role}
            type="button"
            className="popup-scope-chip"
            data-active={selectedRole === role && !customRole.trim()}
            onClick={() => onSelectRole(role)}>
            {role}
          </button>
        ))}
      </div>
      <input
        className="popup-scope-sheet-input"
        value={customRole}
        onChange={e => onCustomRoleChange(e.target.value)}
        placeholder="Custom role (e.g. Parent reviewing for renter)"
        aria-label="Custom role"
      />
    </div>
    <div className="popup-scope-sheet-row">
      <p className="popup-scope-sheet-label">Priorities</p>
      <div className="popup-scope-chip-row">
        {PRIORITY_OPTIONS.map(priority => {
          const selected = priorities.includes(priority);
          return (
            <button
              key={priority}
              type="button"
              className="popup-scope-chip popup-scope-chip-priority"
              data-active={selected}
              onClick={() => onTogglePriority(priority)}>
              {priority}
            </button>
          );
        })}
      </div>
      <button type="button" className="popup-link-button mt-2" onClick={onResetPriorities}>
        Reset to suggested
      </button>
    </div>
    <button type="button" className="popup-scope-done" onClick={onClose}>
      Done
    </button>
  </div>
);

export const AnalysisWorkspace = ({
  focusedOnboardingTarget: _focusedOnboardingTarget,
  session,
  onSignIn,
}: {
  // Accepted for API compatibility with the spotlight tour caller; v0.10 drives focus through aria-selected on the lens strip rather than forced-open accordions.
  focusedOnboardingTarget?: 'summary' | 'flags' | 'customize' | 'cta' | null;
  session: Session | null;
  onSignIn: () => void;
}) => {
  const settings = useStorage(unshaftedSettingsStorage);
  const currentAnalysis = useStorage(currentAnalysisStorage);

  const [panelError, setPanelError] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [scopeOpen, setScopeOpen] = useState(false);
  const autoQuickScanRef = useRef<string | null>(null);
  const ctaBarRef = useRef<HTMLDivElement>(null);

  const startQuickScan = useCallback(
    async (analysis: CurrentAnalysis) => {
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
    },
    [session],
  );

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
  }, [currentAnalysis, settings.apiKey, settings.openaiApiKey, settings.provider, startQuickScan]);

  // Close scope sheet when deep analysis completes
  useEffect(() => {
    if (currentAnalysis?.deepAnalysis && scopeOpen) {
      setScopeOpen(false);
    }
  }, [currentAnalysis?.deepAnalysis, scopeOpen]);

  // Click outside the CTA bar closes the ScopeSheet
  useEffect(() => {
    if (!scopeOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (ctaBarRef.current && !ctaBarRef.current.contains(event.target as Node)) {
        setScopeOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [scopeOpen]);

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

  const startDeepAnalysis = async () => {
    if (!currentAnalysis) return;
    if (!session) {
      setPanelError('Sign in with Google to unlock detailed analysis.');
      return;
    }
    setPanelError('');
    setStepIndex(0);
    setScopeOpen(false);

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
  const deepAnalysis = currentAnalysis.deepAnalysis;
  const isQuickRunning = currentAnalysis.status === 'quick-running';
  const isDeepRunning = currentAnalysis.status === 'deep-running';
  const showCtaBar = !!quickScan && !deepAnalysis && !isDeepRunning && !isQuickRunning;

  const verdictTone = deepAnalysis
    ? toVerdictTone(deepAnalysis.overallRiskLevel)
    : quickScan
      ? toVerdictTone(quickScan.roughRiskLevel)
      : 'CAUTION';
  const verdictAction = deepAnalysis
    ? getDecisionAction(deepAnalysis.overallRiskLevel)
    : quickScan
      ? getDecisionAction(quickScan.roughRiskLevel)
      : '';
  const verdictPreview = quickScan ? buildVerdictPreview(quickScan, deepAnalysis) : '';

  const priorityCount = currentAnalysis.priorities.length;
  const scopeSummary =
    priorityCount > 0
      ? `Reviewed as ${selectedRole} · ${priorityCount} ${priorityCount === 1 ? 'priority' : 'priorities'}`
      : `Reviewed as ${selectedRole}`;

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

      {/* Doc strip — always visible once an analysis exists */}
      <DocStrip
        name={currentAnalysis.source.name}
        type={quickScan?.documentType}
        partyCount={quickScan ? quickScan.parties.length : null}
      />

      {/* Verdict — skeleton while quick scan runs, compact card once available */}
      {!quickScan && isQuickRunning ? (
        <VerdictSkeleton ariaLabel="Running quick scan" />
      ) : quickScan ? (
        <CompactVerdict tone={verdictTone} action={verdictAction} preview={verdictPreview} />
      ) : null}

      {/* Quick scan running indicator (small status line below skeleton) */}
      {isQuickRunning && !quickScan ? (
        <div className="flex items-center gap-2 px-1 text-xs text-stone-600">
          <div className="popup-spinner" />
          <p>{LOADING_STEPS[stepIndex]}</p>
        </div>
      ) : null}

      {/* Lens strip + lens panel */}
      {quickScan ? <ResultsView record={currentAnalysis} /> : null}

      {/* Deep analysis running indicator (replaces CTA while running) */}
      {isDeepRunning ? (
        <section className="rounded-xl border border-stone-200 bg-white/80 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="popup-spinner" />
            <p className="text-xs font-semibold text-stone-900">{LOADING_STEPS[stepIndex]}</p>
            <RiskBadge label={toVerdictTone(currentAnalysis.quickScan?.roughRiskLevel ?? 'Medium')} />
          </div>
          <p className="mt-1 text-[11px] text-stone-500">
            Reviewing as {selectedRole}. Closing the popup is fine — this runs in the background.
          </p>
        </section>
      ) : null}

      {/* Sticky CTA bar — only when quick is done and deep hasn't been run */}
      {showCtaBar ? (
        <div ref={ctaBarRef} className="popup-cta-bar" data-onboarding-target="cta">
          {scopeOpen ? (
            <ScopeSheet
              selectedRole={currentAnalysis.selectedRole}
              customRole={currentAnalysis.customRole}
              priorities={currentAnalysis.priorities}
              roleOptions={roleOptions}
              onSelectRole={role => void patchCurrentAnalysis({ selectedRole: role, customRole: '' })}
              onCustomRoleChange={value => void patchCurrentAnalysis({ customRole: value })}
              onTogglePriority={priority =>
                void patchCurrentAnalysis({
                  priorities: currentAnalysis.priorities.includes(priority)
                    ? currentAnalysis.priorities.filter(p => p !== priority)
                    : [...currentAnalysis.priorities, priority],
                })
              }
              onResetPriorities={() =>
                void patchCurrentAnalysis({ priorities: buildSuggestedPriorities(currentAnalysis.quickScan) })
              }
              onClose={() => setScopeOpen(false)}
            />
          ) : null}
          <p className="popup-cta-scope" title={scopeSummary}>
            <span className="popup-cta-scope-strong">{selectedRole}</span>
            {priorityCount > 0
              ? ` · ${priorityCount} ${priorityCount === 1 ? 'priority' : 'priorities'}`
              : null}
          </p>
          <button
            type="button"
            className="popup-cta-cog"
            aria-label="Customize analysis scope"
            aria-expanded={scopeOpen}
            data-onboarding-target="customize"
            onClick={() => setScopeOpen(open => !open)}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {session ? (
            <button
              type="button"
              className="popup-cta-action"
              onClick={() => void startDeepAnalysis()}>
              Run analysis
            </button>
          ) : (
            <button type="button" className="popup-cta-action" onClick={onSignIn}>
              Sign in to run
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
};

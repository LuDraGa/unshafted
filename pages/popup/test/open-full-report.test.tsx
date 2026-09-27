/**
 * The popup's way into the report page (plan §7, "Opening it"): a detailed analysis offers
 * *Open full report* under the verdict and a quieter link where the lens preview ends; a quick scan
 * offers neither, because it has no page. The onboarding tour's `summary` and `flags` targets are
 * asserted too, because they sit exactly where the button went in.
 */
import { AppSettingsSchema, sampleDeepAnalysis, sampleQuickScan } from '@extension/unshafted-core';
import { AnalysisWorkspace } from '@src/components/AnalysisWorkspace';
import { openReportTab } from '@src/open-report';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentAnalysis } from '@extension/unshafted-core';

const stores = vi.hoisted(() => ({
  currentAnalysis: { value: null as unknown },
  settings: { value: null as unknown },
}));

vi.mock('@extension/shared', () => ({ useStorage: (s: { value: unknown }) => s.value }));

vi.mock('@extension/storage', () => ({
  currentAnalysisStorage: stores.currentAnalysis,
  unshaftedSettingsStorage: stores.settings,
}));

vi.mock('@src/open-report', () => ({ openReportTab: vi.fn(async () => {}) }));

const analysis = (deep: boolean): CurrentAnalysis =>
  ({
    id: 'analysis-1',
    createdAt: '2026-09-24T10:00:00.000Z',
    updatedAt: '2026-09-24T10:00:00.000Z',
    source: {
      kind: 'file',
      name: 'service-agreement.pdf',
      slug: 'service-agreement',
      contentHash: 'hash',
      charCount: 1200,
      estimatedTokens: 300,
      preview: 'A service agreement.',
      text: 'The agreement.',
      quality: 'good',
      warnings: [],
      capturedAt: '2026-09-24T10:00:00.000Z',
    },
    quickScan: sampleQuickScan,
    deepAnalysis: deep ? sampleDeepAnalysis : null,
    selectedRole: 'Contractor',
    customRole: '',
    priorities: [],
    status: deep ? 'complete' : 'quick-ready',
    error: null,
  }) as CurrentAnalysis;

const mount = (deep: boolean) => {
  stores.currentAnalysis.value = analysis(deep);
  return render(<AnalysisWorkspace session={null} onSignIn={() => {}} />);
};

beforeEach(() => {
  stores.settings.value = AppSettingsSchema.parse({});
  vi.mocked(openReportTab).mockClear();
});

describe('opening the full report from the popup', () => {
  it('offers it under the verdict for a detailed analysis, opening this analysis’s report', () => {
    mount(true);
    const button = screen.getByRole('button', { name: /Open full report/ });

    // Directly under the verdict: the next element after it.
    const verdict = document.querySelector('[data-onboarding-target="summary"]')!;
    expect(verdict.nextElementSibling).toBe(button);

    fireEvent.click(button);
    expect(openReportTab).toHaveBeenCalledWith('analysis-1');
  });

  it('says where the lens preview ends that the whole report is a click away', () => {
    mount(true);
    fireEvent.click(screen.getByRole('button', { name: /See all of it in the full report/ }));
    expect(openReportTab).toHaveBeenCalledWith('analysis-1');
  });

  it('offers neither for a quick scan, which has no report page', () => {
    mount(false);
    expect(screen.queryByRole('button', { name: /Open full report/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /full report/ })).toBeNull();
  });

  it('keeps the onboarding tour’s summary and flags targets', () => {
    mount(true);
    expect(document.querySelector('[data-onboarding-target="summary"]')).toBeTruthy();
    expect(document.querySelector('[data-onboarding-target="flags"]')).toBeTruthy();
  });
});

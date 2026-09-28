/**
 * With a deep result, Evidence must not repeat Blockers.
 *
 * Both lenses were built from the same four finding arrays, so every deep finding rendered twice,
 * one tab apart, with identical bodies — and Evidence's count badge was the larger of the two while
 * adding the least. The duplication never shows in a screenshot of either lens alone, which is why
 * it is asserted here rather than left to a visual walk.
 */
import { sampleDeepAnalysis, sampleQuickScan } from '@extension/unshafted-core';
import { ResultsView } from '@src/components/ResultCards';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CurrentAnalysis, DeepAnalysisResult } from '@extension/unshafted-core';

type Record_ = Pick<CurrentAnalysis, 'quickScan' | 'deepAnalysis' | 'selectedRole' | 'customRole' | 'source'>;

const recordWith = (deepAnalysis: DeepAnalysisResult): Record_ => ({
  quickScan: sampleQuickScan,
  deepAnalysis,
  selectedRole: 'Contractor',
  customRole: '',
  source: {
    kind: 'file',
    name: 'service-agreement.pdf',
    slug: 'service-agreement',
    contentHash: 'hash',
    charCount: 1200,
    estimatedTokens: 300,
    preview: 'A client-friendly service agreement.',
    quality: 'good',
    warnings: [],
  },
});

const findingTitles = [
  ...sampleDeepAnalysis.immediateWorries,
  ...sampleDeepAnalysis.oneSidedClauses,
  ...sampleDeepAnalysis.timingAndLockIn,
  ...sampleDeepAnalysis.couldShaftYouLater,
].map(item => item.title);

const openLens = (name: RegExp) => {
  fireEvent.click(screen.getByRole('tab', { name }));
  return screen.getByRole('tabpanel');
};

describe('evidence lens with a deep result', () => {
  it('holds the topic concerns and none of the findings Blockers already shows', () => {
    render(<ResultsView record={recordWith(sampleDeepAnalysis)} />);

    const blockers = openLens(/^Blockers/);
    for (const title of findingTitles) {
      expect(within(blockers).getByText(title)).toBeTruthy();
    }

    const evidence = openLens(/^Evidence/);
    for (const title of findingTitles) {
      expect(within(evidence).queryByText(title)).toBeNull();
    }
    expect(within(evidence).getAllByRole('group')).toHaveLength(sampleDeepAnalysis.topicConcerns.length);
  });

  it('counts only what it holds', () => {
    render(<ResultsView record={recordWith(sampleDeepAnalysis)} />);

    const tab = screen.getByRole('tab', { name: /^Evidence/ });
    expect(tab.textContent).toBe(`Evidence${sampleDeepAnalysis.topicConcerns.length}`);
  });

  it('is absent when there are no topic concerns, rather than empty', () => {
    render(<ResultsView record={recordWith({ ...sampleDeepAnalysis, topicConcerns: [] })} />);

    expect(screen.queryByRole('tab', { name: /^Evidence/ })).toBeNull();
    expect(screen.getByRole('tab', { name: /^Blockers/ })).toBeTruthy();
  });
});

/**
 * With a deep result, the Asks badge counts what the lens renders (#89).
 *
 * The checklist renders one row per *group*, but the badge used to add up every *item* inside the
 * groups, so it overstated by the difference and the gap grew with the checklist. Every other lens
 * counts its rows; this one has to as well, or its number reads as rows that are not there.
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

const openAsks = () => {
  const tab = screen.getByRole('tab', { name: /^Asks/ });
  fireEvent.click(tab);
  return { tab, panel: screen.getByRole('tabpanel') };
};

describe('asks lens with a deep result', () => {
  it('counts one per rendered row, a checklist group being one row', () => {
    render(<ResultsView record={recordWith(sampleDeepAnalysis)} />);

    const { tab, panel } = openAsks();
    const rows = within(panel).getAllByRole('group').length;

    expect(tab.textContent).toBe(`Asks${rows}`);
    expect(rows).toBe(
      sampleDeepAnalysis.negotiationIdeas.length +
        sampleDeepAnalysis.suggestedEdits.length +
        sampleDeepAnalysis.missingProtections.length +
        sampleDeepAnalysis.questionsToAsk.length +
        sampleDeepAnalysis.protectionChecklist.length,
    );
  });

  it('does not grow when a checklist group gains items', () => {
    const [first, ...rest] = sampleDeepAnalysis.protectionChecklist;
    const longer = { ...first, items: [...first.items, 'One more thing to confirm', 'And another'] };

    render(<ResultsView record={recordWith(sampleDeepAnalysis)} />);
    const before = openAsks().tab.textContent;

    render(<ResultsView record={recordWith({ ...sampleDeepAnalysis, protectionChecklist: [longer, ...rest] })} />, {
      container: document.body.appendChild(document.createElement('div')),
    });
    const tabs = screen.getAllByRole('tab', { name: /^Asks/ });

    expect(tabs[1].textContent).toBe(before);
  });
});

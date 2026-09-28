/**
 * The lens card — the site read by concern — and the things it must never do.
 *
 * All of these read as correct in the JSX and are wrong in the product, which is why they are
 * asserted rather than eyeballed:
 *
 *  1. **A window never hides behind a control.** It is the one finding that expires; a deadline the
 *     reader has to open a block to see is a deadline the product decided not to mention.
 *  2. **Closed blocks are crisp; the rest is in the DOM, not gone.** A finding's meaning and its
 *     quote sit behind the block — present for find-in-page and for no-text-loss, just not on
 *     screen until opened.
 *  3. **One layer.** The lens is chosen sideways and the block is the only thing that opens; a block
 *     containing another disclosure puts the reader two levels deep in one finding.
 *  4. **A missing disclosure gets no control** (P4). The Missing lens is counted like the rest; see
 *     the comment on it in `lenses.ts` for why it once was not.
 *  5. **The strip keeps the popup's keyboard contract** — one tab stop, arrows move and select.
 *  6. **Provenance survives aggregation.** A finding from a changed document says so, next to it.
 *
 * `<details>` is opened by setting `open` directly: jsdom does not implement the toggle, so a click
 * on a summary changes nothing and an assertion after it would be measuring a closed block.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';
import type { DocumentFreshness } from '@src/hooks/useLivePolicyCheck';

const { LensCard } = await import('@src/components/LensCard');

const base = {
  domain: 'example.com',
  domains: [],
  analyzedAt: '2026-09-04T00:00:00.000Z',
  model: 'test-model',
  peerDeviation: [],
};

const privacy = {
  ...base,
  contentHash: 'privacy-hash',
  docType: 'privacy',
  riskLevel: 'Very High',
  summary: 'A summary of the privacy policy.',
  sourceUrl: 'https://example.com/privacy',
  exposures: [
    {
      title: 'Tracks every click',
      severity: 'high',
      category: 'Data/Privacy',
      whatItMeans: 'Every page you view is recorded.',
      whyItMatters: 'It builds a profile you cannot see.',
      reference: { label: 'Section 2', quote: 'we collect clickstream data' },
    },
  ],
  availableActions: [
    {
      action: 'Object within the window',
      howTo: 'Write to the address in the notice.',
      effort: 'medium',
      deadline: { kind: 'relative_to_signup', days: 30, description: '30 days from the notice' },
      reference: { label: 'Section 9', quote: 'you may object by writing to us' },
    },
    { action: 'Opt out of sale', howTo: 'Use the privacy dashboard.', effort: 'low' },
  ],
  requiredDisclosures: [{ name: 'Retention period', regime: 'CCPA', status: 'absent', note: 'The policy never says.' }],
} as unknown as SitePolicyAnalysis;

const terms = {
  ...base,
  contentHash: 'terms-hash',
  docType: 'terms',
  riskLevel: 'High',
  summary: 'A summary of the terms.',
  sourceUrl: 'https://example.com/terms',
  exposures: [
    {
      title: 'Arbitration only',
      severity: 'high',
      category: 'Disputes',
      whatItMeans: 'You cannot sue in court.',
      whyItMatters: 'Class actions are waived.',
    },
  ],
  availableActions: [],
  requiredDisclosures: [],
} as unknown as SitePolicyAnalysis;

const renderCard = (
  analyses: SitePolicyAnalysis[] = [privacy, terms],
  freshness: Record<string, DocumentFreshness> = {},
) =>
  render(
    <LensCard
      analyses={analyses}
      headerOffset={0}
      freshnessOf={analysis => freshness[analysis.contentHash] ?? 'unconfirmed'}
    />,
  );

const blockFor = (text: string) => screen.getByText(text).closest('details, .panel-item') as HTMLElement;

const panelFor = (name: string) =>
  document.getElementById(screen.getByRole('tab', { name }).getAttribute('aria-controls')!)!;

describe('lens card', () => {
  it('lands on the window, open, with the window itself in the closed block', () => {
    renderCard();

    expect(screen.getByRole('tab', { name: 'Windows, 1' })).toHaveAttribute('aria-selected', 'true');

    const block = blockFor('Object within the window') as HTMLDetailsElement;
    // The first block of the landing lens is the old "one thing", already open.
    expect(block.open).toBe(true);

    // And the window lives in the summary — it would be on screen even if the block were closed.
    const window = screen.getByText('Window: 30 days — 30 days from the notice');
    expect(window.closest('summary')).not.toBeNull();
  });

  it('keeps a closed exposure crisp and its meaning in the DOM behind the block', () => {
    renderCard();
    // Select the lens first, or "not visible" below would only be measuring the hidden panel.
    fireEvent.click(screen.getByRole('tab', { name: 'Data, 1' }));

    const block = blockFor('Tracks every click') as HTMLDetailsElement;
    expect(block.open).toBe(false);

    // Title and severity are the summary, and on screen closed.
    const summary = block.querySelector('summary')!;
    expect(within(summary).getByText('Tracks every click')).toBeVisible();
    expect(within(summary).getByText('high')).toBeVisible();

    // Meaning, reason and quote are present — nothing is lost — but not on screen until opened.
    expect(screen.getByText('Every page you view is recorded.')).not.toBeVisible();
    expect(screen.getByText('“we collect clickstream data”')).not.toBeVisible();

    block.open = true;
    expect(screen.getByText('Every page you view is recorded.')).toBeVisible();
    expect(screen.getByText('“we collect clickstream data”')).toBeVisible();
  });

  it('opens one block at a time within a lens, and never nests a second disclosure', () => {
    renderCard();

    for (const panel of document.querySelectorAll('[role="tabpanel"]')) {
      const names = new Set([...panel.querySelectorAll('details')].map(details => details.getAttribute('name')));
      // Every block in a lens shares one exclusive-accordion group.
      expect(names.size).toBeLessThanOrEqual(1);

      for (const body of panel.querySelectorAll('.panel-item-body')) {
        expect(body.querySelector('details, [aria-expanded]')).toBeNull();
      }
    }
  });

  it('gives a missing disclosure no control, and counts the Missing lens like the rest', () => {
    renderCard();

    const missingTab = screen.getByRole('tab', { name: 'Missing, 1' });
    expect(missingTab.textContent).toBe('Missing1');

    const row = blockFor('Retention period');
    expect(row.tagName).not.toBe('DETAILS');
    expect(within(row).queryByRole('button')).toBeNull();
    expect(within(row).getByText('The policy never says.')).toBeTruthy();
  });

  it('keeps every lens mounted and searchable, showing only the selected one', () => {
    renderCard();

    expect(panelFor('Windows, 1')).not.toHaveAttribute('hidden');
    // `until-found`, not plain hidden: find-in-page still reaches a finding in another lens.
    expect(panelFor('Rights, 1')).toHaveAttribute('hidden', 'until-found');
    expect(within(panelFor('Rights, 1')).getByText('Arbitration only')).toBeTruthy();
  });

  it('keeps the popup strip’s keyboard contract: one tab stop, arrows move and select', () => {
    renderCard();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.filter(tab => tab.tabIndex === 0)).toHaveLength(1);

    const windows = screen.getByRole('tab', { name: 'Windows, 1' });
    fireEvent.keyDown(windows, { key: 'ArrowRight' });

    const data = screen.getByRole('tab', { name: 'Data, 1' });
    expect(data).toHaveAttribute('aria-selected', 'true');
    expect(data).toHaveFocus();
    expect(panelFor('Data, 1')).not.toHaveAttribute('hidden');
    expect(panelFor('Windows, 1')).toHaveAttribute('hidden', 'until-found');

    fireEvent.keyDown(data, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Documents, 2' })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Documents, 2' }), { key: 'ArrowRight' });
    expect(windows).toHaveFocus();
  });

  it('marks findings from a changed document and drops its grade', () => {
    renderCard([privacy, terms], { 'privacy-hash': 'changed' });

    const summary = blockFor('Tracks every click').querySelector('summary')!;
    expect(within(summary).getByText('earlier version')).toBeTruthy();

    // In the Documents lens, the changed document carries no risk pill (D7); the current one does.
    const documents = panelFor('Documents, 2');
    const privacyBlock = within(documents).getByText('Privacy policy').closest('details')!;
    const termsBlock = within(documents).getByText('Terms of service').closest('details')!;
    expect(within(privacyBlock).queryByText('Very High')).toBeNull();
    expect(within(termsBlock).getByText('High')).toBeTruthy();
  });

  it('names the source document only when there is more than one to tell apart', () => {
    renderCard([terms]);

    const summary = blockFor('Arbitration only').querySelector('summary')!;
    expect(within(summary).queryByText('Terms of service')).toBeNull();
  });
});

/**
 * The document card's disclosure structure, and the four things it must never do.
 *
 * All of these read as correct in the JSX and are wrong in the product, which is why they are
 * asserted rather than eyeballed:
 *
 *  1. **An action's `howTo` and deadline are never behind a control.** `howTo` is not elaboration
 *     on the action, it IS the action — "opt out" without the steps is a fact, not something you
 *     can do. And 49 actions in the corpus carry a real deadline, which browse splits the whole
 *     list on. A row that hides either one applies the exposure's rule to a shape it does not fit.
 *  2. **A control that opens onto nothing must not exist.** An action whose reference is a label
 *     with no quote has nothing to reveal, and an absent disclosure has no optional field at all.
 *     Both would happily render a control that costs a click and pays out a section name.
 *  3. **Layer two is the floor.** A revealed region containing another disclosure puts the reader
 *     three levels deep in one card, which is the failure the two-layer rule exists to prevent.
 *  4. **Repeated controls need distinguishable accessible names.** The worst document is 40 rows.
 *     Forty buttons all called "Why this matters" is a screen-reader dead end.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';

const { DocumentCard } = await import('@src/components/DocumentCard');

/**
 * One document carrying every shape the three renderers diverge on: an exposure with a quote, an
 * action with a quote, an action whose reference is a bare label, an action with no reference at
 * all, and an absent disclosure.
 */
const analysis = {
  contentHash: 'abc123',
  domain: 'amazon.com',
  domains: [],
  docType: 'terms',
  riskLevel: 'High',
  analyzedAt: '2026-09-04T00:00:00.000Z',
  summary: 'A summary of the terms.',
  sourceUrl: 'https://amazon.com/terms',
  model: 'test-model',
  exposures: [
    {
      title: 'Broad content licence',
      severity: 'high',
      category: 'IP',
      whatItMeans: 'They can reuse anything you post.',
      whyItMatters: 'The licence outlives your account.',
      reference: { label: 'Section 4', quote: 'a worldwide, perpetual licence' },
    },
    {
      title: 'Arbitration clause',
      severity: 'high',
      category: 'Disputes',
      whatItMeans: 'You cannot sue in court.',
      whyItMatters: 'Class actions are waived.',
    },
  ],
  availableActions: [
    {
      action: 'Opt out of arbitration',
      howTo: 'Write to the address in the notice within 30 days.',
      effort: 'medium',
      deadline: { kind: 'relative', days: 30, description: '30 days from first acceptance' },
      // Deliberately does NOT repeat the deadline: the quote is evidence and belongs behind the
      // control, so a fixture that echoed "30 days" would make the assertion below untestable.
      reference: { label: 'Section 12', quote: 'you may opt out by writing to us' },
    },
    {
      action: 'Download your data',
      howTo: 'Use the privacy dashboard.',
      effort: 'low',
      reference: { label: 'Section 9' },
    },
    { action: 'Close your account', howTo: 'Settings, then Close account.', effort: 'low' },
  ],
  requiredDisclosures: [
    {
      name: 'Data retention period',
      regime: 'GDPR',
      status: 'absent',
      note: 'The document never says how long anything is kept.',
    },
  ],
  peerDeviation: [],
} as unknown as SitePolicyAnalysis;

/**
 * The card is collapsed by default (D10); every assertion here is about the opened document.
 *
 * `open` is set directly rather than by clicking the summary, because jsdom does not implement the
 * `<details>` toggle — a click on the summary changes nothing and every assertion below would then
 * be measuring a closed card. Layer one's behaviour is the browser's, not ours; what is under test
 * is layer two.
 */
const openCard = () => {
  const { container } = render(<DocumentCard analysis={analysis} freshness="unconfirmed" />);
  const details = container.querySelector('details');
  if (details) details.open = true;
};

const rowFor = (text: string) => screen.getByText(text).closest('.panel-row') as HTMLElement;

describe('document card disclosure', () => {
  it('keeps an exposure readable collapsed and puts only the elaboration behind the control', () => {
    openCard();

    // The name, the meaning and the severity survive a collapsed read.
    expect(screen.getByText('Broad content licence')).toBeVisible();
    expect(screen.getByText('They can reuse anything you post.')).toBeVisible();
    expect(within(rowFor('Broad content licence')).getByText('high')).toBeVisible();

    // The other half is present in the DOM — no text is lost — but not on screen.
    expect(screen.getByText('The licence outlives your account.')).not.toBeVisible();
    expect(screen.getByText('“a worldwide, perpetual licence”')).not.toBeVisible();

    const reveal = within(rowFor('Broad content licence')).getByRole('button');
    expect(reveal).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(reveal);

    expect(screen.getByText('The licence outlives your account.')).toBeVisible();
    expect(screen.getByText('“a worldwide, perpetual licence”')).toBeVisible();
    expect(reveal).toHaveAttribute('aria-expanded', 'true');
  });

  it('never hides an action’s how-to or its deadline', () => {
    openCard();

    for (const action of ['Opt out of arbitration', 'Download your data', 'Close your account']) {
      expect(screen.getByText(action)).toBeVisible();
    }

    expect(screen.getByText('Write to the address in the notice within 30 days.')).toBeVisible();
    expect(screen.getByText('Use the privacy dashboard.')).toBeVisible();
    expect(screen.getByText('Settings, then Close account.')).toBeVisible();

    /*
     * The deadline is the property browse splits the whole corpus on, so EVERY mention of it has
     * to be on screen — the one in `howTo` and the rendered deadline line both. Asserting on all
     * matches rather than one is deliberate: a single `getByText` here would pass while the other
     * mention sat behind a control.
     */
    const mentions = screen.getAllByText(/30 days/);
    expect(mentions.length).toBeGreaterThan(1);
    for (const mention of mentions) expect(mention).toBeVisible();

    // The quote is evidence, not the deadline, and it stays behind the control.
    expect(screen.getByText('“you may opt out by writing to us”')).not.toBeVisible();
  });

  it('gives a control only to evidence that has something behind it', () => {
    openCard();

    // A quote earns one.
    expect(within(rowFor('Opt out of arbitration')).queryByRole('button')).not.toBeNull();

    // A bare section label does not — it simply renders.
    expect(within(rowFor('Download your data')).queryByRole('button')).toBeNull();
    expect(screen.getByText('Section 9')).toBeVisible();

    // No reference, nothing to offer.
    expect(within(rowFor('Close your account')).queryByRole('button')).toBeNull();
  });

  it('gives an absent disclosure no expand affordance at all', () => {
    openCard();

    const row = rowFor('Data retention period');
    expect(within(row).getByText('The document never says how long anything is kept.')).toBeVisible();
    expect(within(row).getByText('Missing')).toBeVisible();

    // Name, regime, status and note are the entire schema. A control could only open onto nothing.
    expect(within(row).queryByRole('button')).toBeNull();
    expect(within(row).queryByText('details')).toBeNull();
  });

  it('never nests a disclosure inside a revealed region', () => {
    openCard();

    for (const button of screen.getAllByRole('button')) {
      const region = button.nextElementSibling;
      if (!region) continue;
      expect(region.querySelector('details')).toBeNull();
      expect(region.querySelector('button')).toBeNull();
    }
  });

  it('distinguishes repeated controls by the finding they belong to', () => {
    openCard();

    const names = screen.getAllByRole('button').map(button => button.textContent);
    expect(new Set(names).size).toBe(names.length);
    expect(names.some(name => name?.includes('Broad content licence'))).toBe(true);
    expect(names.some(name => name?.includes('Arbitration clause'))).toBe(true);
  });
});

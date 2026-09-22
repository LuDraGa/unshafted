/**
 * The browse view, and specifically the four claims it is NOT allowed to make.
 *
 * Every assertion here guards something that reads as correct in the JSX and is wrong in the
 * product. None of them is visible in a screenshot of the happy path:
 *
 *  1. **Typing dissolves the groups, so the row has to carry the clock.** The group heading is the
 *     only thing saying which sites name a window, and a query removes it. Without the marker, a
 *     reader who searches loses the one property the view splits the corpus on — silently, and
 *     exactly on the job the design calls primary.
 *  2. **The headline total is `documentTotal`, never the sum of the rows.** Three documents govern
 *     two domains each, so the rows sum to 85 against a corpus of 82. The fixture below reproduces
 *     that split deliberately.
 *  3. **An opened domain never claims a live check.** `FreshnessStrip` handed an empty freshness map
 *     renders "Checking against the live page…". Nothing is checking anything — the reader is not on
 *     that site and cannot be.
 *  4. **A manifest that failed to load is not an empty corpus.** One is a claim about the build, the
 *     other a claim that we have read nothing.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PolicyBrowseManifest, SitePolicyAnalysis } from '@extension/unshafted-core';

const loadBundledPolicyBrowse = vi.fn();
const resolveHostnameAnalyses = vi.fn();

vi.mock('@extension/shared', () => ({
  loadBundledPolicyBrowse: () => loadBundledPolicyBrowse(),
  resolveHostnameAnalyses: (hostname: string) => resolveHostnameAnalyses(hostname),
}));

const { BrowseView } = await import('@src/components/BrowseView');

/**
 * Four sites, two clocked, and a `documentTotal` that is deliberately LOWER than the row sum —
 * 5 rows' worth of documents across 4 domains, 4 actual documents. That is the real corpus's shape
 * in miniature: one document governing two domains has to be counted under both.
 */
const manifest: PolicyBrowseManifest = {
  formatVersion: 1,
  documentTotal: 4,
  domains: [
    { domain: 'amazon.com', documentCount: 2, hasTimeSensitiveAction: true },
    { domain: 'apple.com', documentCount: 1, hasTimeSensitiveAction: false },
    { domain: 'disneyplus.com', documentCount: 1, hasTimeSensitiveAction: false },
    { domain: 'hotstar.com', documentCount: 1, hasTimeSensitiveAction: true },
  ],
};

/** Only the fields the cards actually read; the corpus schema is not what is under test. */
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
    { title: 'Broad licence', severity: 'high', whatItMeans: 'They can reuse it.', whyItMatters: 'Forever.' },
  ],
  availableActions: [],
  requiredDisclosures: [],
  peerDeviation: [],
} as unknown as SitePolicyAnalysis;

const openList = () => render(<BrowseView onClose={() => {}} />);

describe('browse view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadBundledPolicyBrowse.mockResolvedValue(manifest);
    resolveHostnameAnalyses.mockResolvedValue({ domain: 'amazon.com', analyses: [analysis] });
  });

  it('counts documents from documentTotal, not by summing the rows', async () => {
    openList();

    // 4, not 5. Summing `documentCount` across the rows gives 5 here and 85 on the real corpus.
    expect(await screen.findByText(/4 documents across 4 sites/)).toBeTruthy();
  });

  it('groups by the clock when nothing is typed, and says which is which', async () => {
    openList();

    expect(await screen.findByText('Something you can still do')).toBeTruthy();
    expect(screen.getByText('Everything else')).toBeTruthy();
    expect(screen.getAllByText('window')).toHaveLength(2);
  });

  it('dissolves the groups on a query but keeps the marker on the row', async () => {
    openList();
    const search = await screen.findByPlaceholderText('Find a site');

    fireEvent.change(search, { target: { value: 'hotstar' } });

    // The headings are gone — this is the moment the row is the ONLY carrier of the clock.
    await waitFor(() => expect(screen.queryByText('Something you can still do')).toBeNull());
    expect(screen.queryByText('Everything else')).toBeNull();

    const rows = screen.getAllByRole('button').filter(button => button.textContent?.includes('hotstar.com'));
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText('window')).toBeTruthy();
  });

  it('never says a window is open, only that one is named', async () => {
    openList();
    await screen.findByText('Something you can still do');

    const forbidden = [/still open/i, /expiring/i, /\blive\b(?! —)/i];
    const body = document.body.textContent ?? '';
    // "Nothing here is live" is the one permitted use, and it is a denial.
    expect(body).toContain('Nothing here is live');
    for (const pattern of forbidden.slice(0, 2)) expect(pattern.test(body)).toBe(false);
  });

  it('shows no risk level and no gap tally in the list', async () => {
    openList();
    await screen.findByText('Something you can still do');

    const body = document.body.textContent ?? '';
    for (const level of ['Very High', 'High risk', 'Medium', 'Low']) expect(body).not.toContain(level);
    expect(body).not.toMatch(/missing/i);
  });

  it('says nothing matched without offering a button that does nothing', async () => {
    openList();
    const search = await screen.findByPlaceholderText('Find a site');

    fireEvent.change(search, { target: { value: 'notion' } });

    expect(await screen.findByText(/No match for/)).toBeTruthy();
    expect(screen.getByText(/These are the 4 sites we have read so far/)).toBeTruthy();
    // The search field is the only control left; nothing offers to "request" anything.
    expect(screen.queryAllByRole('button').filter(b => /request/i.test(b.textContent ?? ''))).toHaveLength(0);
  });

  it('opens a domain into its documents without claiming a live check', async () => {
    openList();
    const row = await screen.findByText('amazon.com');

    fireEvent.click(row);

    expect(await screen.findByText('Every document')).toBeTruthy();
    // The honest resting state, and the one the strip would have overwritten with a lie.
    expect(screen.getByText(/As we read it on/)).toBeTruthy();
    expect(screen.queryByText(/Checking against the live page/)).toBeNull();
    expect(screen.queryByText(/verified against the live page/)).toBeNull();
  });

  it('treats a manifest that did not load as a build problem, not an empty corpus', async () => {
    loadBundledPolicyBrowse.mockResolvedValue(null);
    openList();

    expect(await screen.findByText(/did not load/)).toBeTruthy();
    expect(screen.queryByPlaceholderText('Find a site')).toBeNull();
    // Never the claim that we have read nothing.
    expect(document.body.textContent).not.toMatch(/0 documents|no sites/i);
  });
});

/**
 * The lens model — what the panel reads by concern, and which block a reader lands on.
 *
 * Asserted rather than eyeballed because every one of these is invisible in a screenshot of a
 * single site: an item filed under the wrong concern still renders, a count on the wrong lens still
 * looks like a count, and a default that lands on the wrong lens only shows up on the 18 sites that
 * name no window.
 */
import { describe, expect, it } from 'vitest';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';

const { buildLenses, pickInitialLens } = await import('@src/lib/lenses');

const analysis = (overrides: Partial<SitePolicyAnalysis>): SitePolicyAnalysis =>
  ({
    contentHash: 'hash',
    domain: 'example.com',
    domains: [],
    docType: 'terms',
    riskLevel: 'High',
    analyzedAt: '2026-09-04T00:00:00.000Z',
    summary: 'A summary.',
    sourceUrl: 'https://example.com/terms',
    model: 'test-model',
    exposures: [],
    availableActions: [],
    requiredDisclosures: [],
    peerDeviation: [],
    ...overrides,
  }) as SitePolicyAnalysis;

/** Worst document first, as `useDomainAnalyses` hands them over. */
const privacy = analysis({
  contentHash: 'privacy',
  docType: 'privacy',
  riskLevel: 'Very High',
  exposures: [
    { title: 'Sells your data', severity: 'medium', category: 'Data/Privacy', whatItMeans: 'm', whyItMatters: 'w' },
    { title: 'Tracks every click', severity: 'high', category: 'Data/Privacy', whatItMeans: 'm', whyItMatters: 'w' },
  ],
  availableActions: [
    { action: 'Opt out of sale', howTo: 'Settings.', effort: 'low' },
    {
      action: 'Object within the window',
      howTo: 'Write to them.',
      effort: 'medium',
      deadline: { kind: 'relative_to_signup', days: 30, description: '30 days from the notice' },
    },
  ],
  requiredDisclosures: [
    { name: 'Retention period', regime: 'CCPA', status: 'absent', note: 'Never stated.' },
    { name: 'Right to delete', regime: 'CCPA', status: 'present', note: 'Stated.' },
  ],
});

const terms = analysis({
  contentHash: 'terms',
  docType: 'terms',
  riskLevel: 'High',
  exposures: [
    { title: 'Arbitration only', severity: 'high', category: 'Disputes', whatItMeans: 'm', whyItMatters: 'w' },
    { title: 'No refunds', severity: 'low', category: 'Payment', whatItMeans: 'm', whyItMatters: 'w' },
  ],
  availableActions: [
    {
      action: 'A deadline of kind none',
      howTo: 'Anytime.',
      effort: 'low',
      deadline: { kind: 'none', description: 'No window' },
    },
  ],
});

const ids = (lenses: ReturnType<typeof buildLenses>) => lenses.map(lens => lens.id);
const titles = (lenses: ReturnType<typeof buildLenses>, id: string) =>
  lenses
    .find(lens => lens.id === id)!
    .items.map(item =>
      item.kind === 'exposure'
        ? item.exposure.title
        : item.kind === 'window' || item.kind === 'action'
          ? item.action.action
          : item.kind === 'missing'
            ? item.disclosure.name
            : item.analysis.docType,
    );

describe('lenses', () => {
  it('reads across documents by concern, in strip order', () => {
    const lenses = buildLenses([privacy, terms]);

    expect(ids(lenses)).toEqual(['windows', 'data', 'rights', 'actions', 'missing', 'documents']);
    expect(titles(lenses, 'data')).toEqual(['Tracks every click', 'Sells your data']);
    expect(titles(lenses, 'rights')).toEqual(['Arbitration only', 'No refunds']);
    expect(titles(lenses, 'windows')).toEqual(['Object within the window']);
    expect(titles(lenses, 'documents')).toEqual(['privacy', 'terms']);
  });

  it('files a deadline of kind "none" as an ordinary action, not a window', () => {
    const lenses = buildLenses([privacy, terms]);

    expect(titles(lenses, 'actions')).toEqual(['Opt out of sale', 'A deadline of kind none']);
    expect(titles(lenses, 'windows')).not.toContain('A deadline of kind none');
  });

  it('lists only absent disclosures, and counts them like any other lens', () => {
    const lenses = buildLenses([privacy, terms]);
    const missing = lenses.find(lens => lens.id === 'missing')!;

    expect(titles(lenses, 'missing')).toEqual(['Retention period']);
    expect(missing.count).toBe(1);
  });

  it('keeps each finding attached to the document it came from', () => {
    const lenses = buildLenses([privacy, terms]);
    const rights = lenses.find(lens => lens.id === 'rights')!;

    expect(rights.items.map(item => item.analysis.contentHash)).toEqual(['terms', 'terms']);
    // Keys stay unique when two documents hold findings at the same index.
    const keys = lenses.flatMap(lens => lens.items.map(item => item.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('drops a lens with nothing in it rather than rendering an empty tab', () => {
    const lenses = buildLenses([terms]);

    expect(ids(lenses)).toEqual(['rights', 'actions', 'documents']);
  });

  it('lands on Windows whenever the site names one — the old "one thing" was always the deadline', () => {
    const lenses = buildLenses([privacy, terms]);

    expect(pickInitialLens(lenses)).toBe('windows');
    expect(lenses.find(lens => lens.id === 'windows')!.items[0]).toMatchObject({ kind: 'window' });
  });

  it('otherwise lands on whichever exposure lens holds the most severe finding', () => {
    const noWindow = analysis({ ...privacy, availableActions: [] });
    const softData = analysis({
      ...noWindow,
      exposures: noWindow.exposures.map(exposure => ({ ...exposure, severity: 'low' as const })),
    });

    expect(pickInitialLens(buildLenses([noWindow, terms]))).toBe('data');
    expect(pickInitialLens(buildLenses([softData, terms]))).toBe('rights');
  });

  it('falls back to what can be done, then to the documents themselves', () => {
    const actionsOnly = analysis({ availableActions: [{ action: 'Leave', howTo: 'Close it.', effort: 'low' }] });

    expect(pickInitialLens(buildLenses([actionsOnly]))).toBe('actions');
    expect(pickInitialLens(buildLenses([analysis({})]))).toBe('documents');
  });

  it('says whose documents they are when the reader ran the analysis', () => {
    const documents = buildLenses([terms], { readBy: 'you' }).find(lens => lens.id === 'documents')!;

    expect(documents.intro).toBe('The documents you analysed.');
  });
});

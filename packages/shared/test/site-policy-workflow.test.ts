/**
 * B2: a run on the user's own key scopes a multi-product company's document to the catalogue.
 * Core proves the prompt offers the closed list and `scopeToCatalogue` enforces it; this proves the
 * run wires both — without it, a model's invented or foreign product id would reach storage and the
 * panel with every core test still green.
 */
import { runSitePolicyAnalysis } from '../lib/utils/site-policy-workflow';
import { AppSettingsSchema } from '@extension/unshafted-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SitePolicyAnalysisTarget } from '@extension/unshafted-core';

const settings = AppSettingsSchema.parse({ provider: 'openai', openaiApiKey: 'test-key' });

const target = (domain: string): SitePolicyAnalysisTarget => ({
  domain,
  sourceUrl: `https://${domain}/privacy`,
  docType: 'privacy',
  text: 'We collect what you search for and what you watch.',
  contentHash: 'a'.repeat(64),
  readMode: 'raw',
});

const modelReply = {
  summary: 'It collects a great deal.',
  riskLevel: 'High',
  confidence: 'high',
  productScopes: [
    { product: 'youtube', riskLevel: 'High', summary: 'Watch history is kept.' },
    { product: 'xbox', riskLevel: 'Low', summary: 'Not a Google product.' },
  ],
  exposures: [
    {
      title: 'Watch history is kept',
      severity: 'medium',
      category: 'Data/Privacy',
      whatItMeans: 'Everything watched is recorded.',
      whyItMatters: 'It builds a profile.',
      products: ['youtube', 'made-up'],
    },
  ],
  availableActions: [{ action: 'Pause watch history', howTo: 'In settings.', effort: 'low', products: ['xbox'] }],
  requiredDisclosures: [],
};

/** Answers the one model call with `reply`, and hands back the prompt the run sent. */
const stubModel = (reply: unknown) => {
  const sent: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as { messages: { content: string }[] };
      sent.push(body.messages.map(message => message.content).join('\n'));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'gpt-test',
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(reply) } }],
        }),
      };
    }),
  );
  return sent;
};

describe('runSitePolicyAnalysis', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("offers a catalogue company's own products and keeps only those", async () => {
    const sent = stubModel(modelReply);

    const { analysis } = await runSitePolicyAnalysis(target('youtube.com'), settings);

    expect(sent[0]).toContain("This is Google's policy for many products at once");
    expect(sent[0]).toContain('- youtube — YouTube');
    expect(analysis.productScopes).toEqual([
      { product: 'youtube', riskLevel: 'High', summary: 'Watch history is kept.' },
    ]);
    expect(analysis.exposures[0]?.products).toEqual(['youtube']);
    // Its only id was another company's, so it is company-wide now: shown everywhere, hidden nowhere.
    expect(analysis.availableActions[0]?.products).toEqual([]);
  });

  it('keeps no products at all on a site outside the catalogue', async () => {
    const sent = stubModel(modelReply);

    const { analysis } = await runSitePolicyAnalysis(target('example.com'), settings);

    expect(sent[0]).toContain('This document is not scoped by product');
    expect(analysis.productScopes).toEqual([]);
    expect(analysis.exposures[0]?.products).toEqual([]);
  });
});

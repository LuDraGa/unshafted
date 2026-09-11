/**
 * The live page check, and what it reports across a tab or origin change.
 *
 * The hook used to clear `discovery`, `freshness` and `reads` at the top of its effect. An effect
 * runs after the render that scheduled it, so switching tabs left a committed render in which the
 * PREVIOUS page's discovery and fetched documents were still on offer under the new tab — the
 * panel claiming to have read a page it had not looked at. Those four pieces of state are now one
 * record tagged with the run it belongs to, and anything that answers for a different run is
 * ignored rather than corrected afterwards.
 */
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';

const discoverActiveTabPolicies = vi.fn();
const capturePolicyDocument = vi.fn();
vi.mock('@extension/shared', () => ({
  discoverActiveTabPolicies: () => discoverActiveTabPolicies(),
  capturePolicyDocument: (tabId: number, url: string) => capturePolicyDocument(tabId, url),
}));

const { useLivePolicyCheck } = await import('@src/hooks/useLivePolicyCheck');

const analysis = (contentHash: string, docType = 'privacy') =>
  ({ contentHash, docType }) as unknown as SitePolicyAnalysis;

/** Referentially stable, as `useDomainAnalyses` guarantees for a given domain. */
const ANALYSES = [analysis('aaa')];

const deferred = <T,>() => {
  let settle!: (value: T) => void;
  const promise = new Promise<T>(resolve => {
    settle = resolve;
  });
  return { promise, settle };
};

const Probe = ({ initialUrl = 'https://first.example/page' }: { initialUrl?: string }) => {
  const [{ tabId, url }, setTab] = useState({ tabId: 1 as number | null, url: initialUrl as string | null });
  const { discovery, discovering, freshness, reads } = useLivePolicyCheck(tabId, url, ANALYSES);

  return (
    <div>
      <output data-testid="discovering">{String(discovering)}</output>
      <output data-testid="discovery">{discovery ? discovery.status : '—'}</output>
      <output data-testid="freshness">{Object.values(freshness).join(',') || '—'}</output>
      <output data-testid="reads">{Object.keys(reads).length}</output>
      <button type="button" onClick={() => setTab({ tabId: 2, url: 'https://second.example/page' })}>
        switch
      </button>
    </div>
  );
};

const read = () => ({
  discovering: screen.getByTestId('discovering').textContent,
  discovery: screen.getByTestId('discovery').textContent,
  freshness: screen.getByTestId('freshness').textContent,
  reads: screen.getByTestId('reads').textContent,
});

/** One discovered, same-origin, typed document — enough to drive one confirmation fetch. */
const discovered = (tabId: number, url: string) => ({
  status: 'discovered' as const,
  tabId,
  documents: [{ url, sameOrigin: true, docType: 'privacy' }],
});

describe('useLivePolicyCheck', () => {
  beforeEach(() => {
    discoverActiveTabPolicies.mockReset();
    capturePolicyDocument.mockReset();
    vi.useRealTimers();
  });

  it('starts pending and looking when there is a readable page', () => {
    discoverActiveTabPolicies.mockReturnValue(deferred().promise);

    render(<Probe />);

    expect(read()).toEqual({ discovering: 'true', discovery: '—', freshness: 'pending', reads: '0' });
  });

  it('does not look at a page it may not read', () => {
    render(<Probe initialUrl="chrome://extensions/" />);

    // `originOf` rejects non-http schemes, so there is nothing to look at and we are not "looking".
    expect(read()).toEqual({ discovering: 'false', discovery: '—', freshness: 'pending', reads: '0' });
    expect(discoverActiveTabPolicies).not.toHaveBeenCalled();
  });

  it('confirms a document whose live hash still matches', async () => {
    discoverActiveTabPolicies.mockResolvedValue(discovered(1, 'https://first.example/privacy'));
    capturePolicyDocument.mockResolvedValue({ status: 'captured', hash: 'aaa' });

    render(<Probe />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    expect(read()).toEqual({ discovering: 'false', discovery: 'discovered', freshness: 'current', reads: '1' });
  });

  it('abandons the previous page’s results the moment the tab changes', async () => {
    /*
     * Asserted over EVERY render, not just the settled one. The old reset lived at the top of the
     * effect, and an effect runs after the render that scheduled it — so the stale frame existed
     * for exactly one commit and `act()` collapses it. Reading only the final DOM cannot see the
     * bug; a render log can.
     */
    const rendered: { tab: number | null; discovery: string; freshness: string; reads: number }[] = [];

    const Logger = () => {
      const [{ tabId, url }, setTab] = useState({
        tabId: 1 as number | null,
        url: 'https://first.example/page' as string | null,
      });
      const { discovery, freshness, reads } = useLivePolicyCheck(tabId, url, ANALYSES);

      rendered.push({
        tab: tabId,
        discovery: discovery ? discovery.status : '—',
        freshness: Object.values(freshness).join(',') || '—',
        reads: Object.keys(reads).length,
      });

      return (
        <button type="button" onClick={() => setTab({ tabId: 2, url: 'https://second.example/page' })}>
          switch
        </button>
      );
    };

    discoverActiveTabPolicies.mockResolvedValueOnce(discovered(1, 'https://first.example/privacy'));
    capturePolicyDocument.mockResolvedValue({ status: 'captured', hash: 'aaa' });

    render(<Logger />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
    });
    expect(rendered.at(-1)).toEqual({ tab: 1, discovery: 'discovered', freshness: 'current', reads: 1 });

    // Second tab: hold discovery open so nothing can resolve and mask the frame under test.
    discoverActiveTabPolicies.mockReturnValueOnce(deferred().promise);
    rendered.length = 0;
    await act(async () => {
      screen.getByRole('button', { name: 'switch' }).click();
    });

    expect(rendered.length).toBeGreaterThan(0);
    // Not one frame of the second tab may carry the first page's discovery, hashes or fetches.
    for (const frame of rendered) {
      expect(frame).toEqual({ tab: 2, discovery: '—', freshness: 'pending', reads: 0 });
    }
  });

  it('leaves every document unconfirmed when the page cannot be read', async () => {
    discoverActiveTabPolicies.mockResolvedValue({ status: 'refused' });

    render(<Probe />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
    });

    // Not an error state: "as we read it on <date>" is the honest default.
    expect(read()).toEqual({ discovering: 'false', discovery: 'refused', freshness: 'unconfirmed', reads: '0' });
    expect(capturePolicyDocument).not.toHaveBeenCalled();
  });
});

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
import type { RankedPolicyCandidate, SitePolicyAnalysis } from '@extension/unshafted-core';

const discoverActiveTabPolicies = vi.fn();
const capturePolicyDocument = vi.fn();
/** The two ways the panel may open a page (A5), as markers a test can recognise in a call. */
const fromTab = vi.fn();
const renderFromTab = vi.fn(() => fromTab);
const renderInBackgroundTab = vi.fn();
vi.mock('@extension/shared', () => ({
  discoverActiveTabPolicies: () => discoverActiveTabPolicies(),
  capturePolicyDocument: (url: string, render?: unknown) => capturePolicyDocument(url, render),
  renderFromTab: (tabId: number) => renderFromTab(tabId),
  renderInBackgroundTab,
}));

const { useLivePolicyCheck } = await import('@src/hooks/useLivePolicyCheck');

const analysis = (
  contentHash: string,
  docType = 'privacy',
  sourceUrl = `https://first.example/${contentHash}`,
  readMode: 'raw' | 'rendered' = 'raw',
) => ({ contentHash, docType, sourceUrl, readMode }) as unknown as SitePolicyAnalysis;

/** Referentially stable, as `useDomainAnalyses` guarantees for a given domain. */
const ANALYSES = [analysis('aaa')];
const NONE: SitePolicyAnalysis[] = [];

const deferred = <T,>() => {
  let settle!: (value: T) => void;
  const promise = new Promise<T>(resolve => {
    settle = resolve;
  });
  return { promise, settle };
};

const Probe = ({
  initialUrl = 'https://first.example/page',
  analyses = ANALYSES,
  toOpen,
}: {
  initialUrl?: string;
  analyses?: SitePolicyAnalysis[];
  /** The document the "open" button asks the panel to read by opening (A5). */
  toOpen?: RankedPolicyCandidate;
}) => {
  const [{ tabId, url }, setTab] = useState({ tabId: 1 as number | null, url: initialUrl as string | null });
  const { discovery, discovering, offers, freshness, reads, openDocument } = useLivePolicyCheck(tabId, url, analyses);
  const opened = toOpen ? reads[toOpen.url] : undefined;

  return (
    <div>
      <output data-testid="discovering">{String(discovering)}</output>
      <output data-testid="discovery">{discovery ? discovery.status : '—'}</output>
      <output data-testid="freshness">{Object.values(freshness).join(',') || '—'}</output>
      <output data-testid="reads">{Object.keys(reads).length}</output>
      <output data-testid="offers">{offers ? offers.map(offer => offer.url).join(',') || 'none' : '—'}</output>
      <output data-testid="opened">
        {opened ? (opened.state === 'done' ? opened.capture.status : opened.state) : '—'}
      </output>
      <button type="button" onClick={() => setTab({ tabId: 2, url: 'https://second.example/page' })}>
        switch
      </button>
      {toOpen ? (
        <button type="button" onClick={() => openDocument(toOpen)}>
          open
        </button>
      ) : null}
    </div>
  );
};

const read = () => ({
  discovering: screen.getByTestId('discovering').textContent,
  discovery: screen.getByTestId('discovery').textContent,
  freshness: screen.getByTestId('freshness').textContent,
  reads: screen.getByTestId('reads').textContent,
});

/** One discovered, typed document on the page's own site. */
const discovered = (tabId: number, url: string, docType = 'privacy') => ({
  status: 'discovered' as const,
  tabId,
  documents: [{ url, ownSite: true, docType }],
});

const captured = (hash: string, readMode: 'raw' | 'rendered' = 'raw') => ({
  status: 'captured',
  hash,
  text: 'policy',
  sourceUrl: '',
  usedMainContainer: true,
  readMode,
});

const unreadable = (reason = 'too-short') => ({ status: 'unreadable', reason, readMode: 'raw' });

/** Let discovery's display floor and every read settle. */
const settle = () =>
  act(async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
  });

describe('useLivePolicyCheck', () => {
  beforeEach(() => {
    discoverActiveTabPolicies.mockReset();
    capturePolicyDocument.mockReset();
    renderFromTab.mockClear();
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
    capturePolicyDocument.mockResolvedValue(captured('aaa'));

    render(<Probe />);
    await settle();

    expect(read()).toEqual({ discovering: 'false', discovery: 'discovered', freshness: 'current', reads: '1' });
  });

  /*
   * D6, "the exact right thing". The check used to take the first same-origin link of each type
   * from the page, which could be a different document from the one we analysed.
   */
  it('confirms each analysed document at its own address, never at a link the page offered', async () => {
    discoverActiveTabPolicies.mockResolvedValue(discovered(1, 'https://first.example/some-other-privacy'));
    capturePolicyDocument.mockImplementation(async (url: string) =>
      url === 'https://first.example/aaa' ? captured('aaa') : captured('zzz'),
    );

    render(<Probe />);
    await settle();

    expect(capturePolicyDocument.mock.calls.map(([url]) => url)).toEqual(['https://first.example/aaa']);
    expect(read().freshness).toBe('current');
  });

  /*
   * Two analyses of one type used to be ambiguous — a changed hash could not say WHICH document had
   * changed, so both stayed unconfirmed. Read at its own address, each document answers for itself.
   */
  it('says exactly which of two same-type documents changed', async () => {
    const twoTerms = [analysis('aaa', 'terms'), analysis('bbb', 'terms')];
    discoverActiveTabPolicies.mockResolvedValue(discovered(1, 'https://first.example/terms', 'terms'));
    capturePolicyDocument.mockImplementation(async (url: string) =>
      url === 'https://first.example/aaa' ? captured('aaa') : captured('zzz'),
    );

    render(<Probe analyses={twoTerms} />);
    await settle();

    expect(read().freshness).toBe('current,changed');
  });

  it('confirms the analysed documents even when the page itself will not let us in', async () => {
    discoverActiveTabPolicies.mockResolvedValue({ status: 'error', message: 'Cannot access this page' });
    capturePolicyDocument.mockResolvedValue(captured('aaa'));

    render(<Probe />);
    await settle();

    expect(read()).toEqual({ discovering: 'false', discovery: 'error', freshness: 'current', reads: '1' });
  });

  it('leaves a document unconfirmed when its own address cannot be read', async () => {
    discoverActiveTabPolicies.mockResolvedValue(discovered(1, 'https://first.example/privacy'));
    capturePolicyDocument.mockResolvedValue(unreadable('fetch-failed'));

    render(<Probe />);
    await settle();

    // Not an error state: "last read on <date>" is the honest default.
    expect(read().freshness).toBe('unconfirmed');
  });

  it('offers nothing on a covered site', async () => {
    discoverActiveTabPolicies.mockResolvedValue(discovered(1, 'https://first.example/privacy'));
    capturePolicyDocument.mockResolvedValue(captured('aaa'));

    render(<Probe />);
    await settle();

    expect(screen.getByTestId('offers').textContent).toBe('—');
  });

  /* D8: on a site we do not cover, what is offered is what was read. */
  it('offers a site we do not cover only the documents that read as policies', async () => {
    discoverActiveTabPolicies.mockResolvedValue({
      status: 'discovered',
      tabId: 1,
      documents: [
        { url: 'https://first.example/privacy', ownSite: true, docType: 'privacy' },
        { url: 'https://first.example/terms', ownSite: true, docType: 'terms' },
        { url: 'https://first.example/legal', ownSite: true, docType: null },
      ],
    });
    capturePolicyDocument.mockImplementation(async (url: string) =>
      url.endsWith('/privacy') ? captured('p') : unreadable(),
    );

    render(<Probe analyses={NONE} />);
    await settle();

    expect(screen.getByTestId('offers').textContent).toBe('https://first.example/privacy');
    // All three were read and kept for the reader. The untyped one was read only as a possible hub
    // (A3), and it is not offered: "Legal" names no document type.
    expect(read().reads).toBe('3');
  });

  it('offers nothing, rather than waiting forever, when a site we do not cover cannot be read', async () => {
    discoverActiveTabPolicies.mockResolvedValue({ status: 'error', message: 'Cannot access this page' });

    render(<Probe analyses={NONE} />);
    await settle();

    expect(screen.getByTestId('offers').textContent).toBe('none');
    expect(capturePolicyDocument).not.toHaveBeenCalled();
  });

  // ── A5: pages whose text only exists once they have run ──

  it('reads the page the reader is on from their own tab, and every other document without opening it', async () => {
    discoverActiveTabPolicies.mockResolvedValue({
      status: 'discovered',
      tabId: 1,
      documents: [
        { url: 'https://first.example/privacy', ownSite: true, docType: 'privacy' },
        { url: 'https://first.example/terms', ownSite: true, docType: 'terms' },
      ],
    });
    capturePolicyDocument.mockResolvedValue(captured('p'));

    render(<Probe initialUrl="https://first.example/privacy#cookies" analyses={NONE} />);
    await settle();

    const calls = Object.fromEntries(capturePolicyDocument.mock.calls.map(([url, how]) => [url, how]));
    expect(calls['https://first.example/privacy']).toBe(fromTab);
    expect(calls['https://first.example/terms']).toBeUndefined();
    expect(renderFromTab).toHaveBeenCalledWith(1);
    // Nothing is ever opened in the background without a click.
    expect(Object.values(calls)).not.toContain(renderInBackgroundTab);
  });

  it('confirms an analysed document from the reader’s tab when that is where they are', async () => {
    discoverActiveTabPolicies.mockResolvedValue(discovered(1, 'https://first.example/aaa'));
    capturePolicyDocument.mockResolvedValue(captured('aaa', 'rendered'));

    render(<Probe initialUrl="https://first.example/aaa" />);
    await settle();

    expect(capturePolicyDocument).toHaveBeenCalledWith('https://first.example/aaa', fromTab);
    // A rendered read that hashes to the analysis is current, however it was read.
    expect(read().freshness).toBe('current');
  });

  it('never calls a document changed on a hash read another way than the analysis was', async () => {
    discoverActiveTabPolicies.mockResolvedValue(discovered(1, 'https://first.example/privacy'));
    capturePolicyDocument.mockResolvedValue(captured('zzz', 'rendered'));

    render(<Probe />);
    await settle();

    expect(read().freshness).toBe('unconfirmed');
  });

  it('never calls a document changed on a raw read of one analysed rendered', async () => {
    discoverActiveTabPolicies.mockResolvedValue(discovered(1, 'https://first.example/privacy'));
    capturePolicyDocument.mockResolvedValue(captured('zzz', 'raw'));

    render(<Probe analyses={[analysis('aaa', 'privacy', 'https://first.example/aaa', 'rendered')]} />);
    await settle();

    expect(read().freshness).toBe('unconfirmed');
  });

  /*
   * S3 measured it: opened three times each, 2 of 29 rendered documents did not hash alike (a
   * chat widget, a policy held twice on a cold load). Rendered against rendered is still noise.
   */
  it('never calls a document changed on a rendered read, even of one analysed rendered', async () => {
    discoverActiveTabPolicies.mockResolvedValue(discovered(1, 'https://first.example/privacy'));
    capturePolicyDocument.mockResolvedValue(captured('zzz', 'rendered'));

    render(<Probe analyses={[analysis('aaa', 'privacy', 'https://first.example/aaa', 'rendered')]} />);
    await settle();

    expect(read().freshness).toBe('unconfirmed');
  });

  it('opens a document in the background only on a click, and offers what it reads', async () => {
    const privacy = { url: 'https://first.example/privacy', label: '', ownSite: true, docType: 'privacy' as const };
    discoverActiveTabPolicies.mockResolvedValue({ status: 'discovered', tabId: 1, documents: [privacy] });
    capturePolicyDocument.mockResolvedValue(unreadable());

    render(<Probe analyses={NONE} toOpen={privacy} />);
    await settle();
    expect(screen.getByTestId('offers').textContent).toBe('none');
    expect(capturePolicyDocument.mock.calls.every(([, how]) => how !== renderInBackgroundTab)).toBe(true);

    const opening = deferred<unknown>();
    capturePolicyDocument.mockReturnValueOnce(opening.promise);
    await act(async () => {
      screen.getByRole('button', { name: 'open' }).click();
    });
    expect(capturePolicyDocument).toHaveBeenLastCalledWith(privacy.url, renderInBackgroundTab);
    expect(screen.getByTestId('opened').textContent).toBe('opening');

    await act(async () => {
      opening.settle(captured('p', 'rendered'));
    });
    expect(screen.getByTestId('opened').textContent).toBe('captured');
    expect(screen.getByTestId('offers').textContent).toBe(privacy.url);
  });

  it('offers an opened document in place of whatever of its type was offered', async () => {
    const first = { url: 'https://first.example/privacy', label: '', ownSite: true, docType: 'privacy' as const };
    const second = { url: 'https://first.example/privacy-2', label: '', ownSite: true, docType: 'privacy' as const };
    const terms = { url: 'https://first.example/terms', label: '', ownSite: true, docType: 'terms' as const };
    discoverActiveTabPolicies.mockResolvedValue({ status: 'discovered', tabId: 1, documents: [first, second, terms] });
    capturePolicyDocument.mockImplementation(async (url: string) => (url === first.url ? unreadable() : captured(url)));

    render(<Probe analyses={NONE} toOpen={first} />);
    await settle();
    expect(screen.getByTestId('offers').textContent).toBe(`${second.url},${terms.url}`);

    capturePolicyDocument.mockResolvedValueOnce(captured('p', 'rendered'));
    await act(async () => {
      screen.getByRole('button', { name: 'open' }).click();
    });
    await settle();
    expect(screen.getByTestId('offers').textContent).toBe(`${first.url},${terms.url}`);
  });

  it('confirms a covered site’s document the reader opened at its own address', async () => {
    const source = { url: 'https://first.example/aaa', label: '', ownSite: true, docType: 'privacy' as const };
    discoverActiveTabPolicies.mockResolvedValue(discovered(1, source.url));
    capturePolicyDocument.mockResolvedValue(unreadable());

    render(<Probe toOpen={source} />);
    await settle();
    expect(read().freshness).toBe('unconfirmed');

    capturePolicyDocument.mockResolvedValueOnce(captured('aaa', 'rendered'));
    await act(async () => {
      screen.getByRole('button', { name: 'open' }).click();
    });
    await settle();
    expect(read().freshness).toBe('current');
    // A covered site offers nothing, opened or not.
    expect(screen.getByTestId('offers').textContent).toBe('—');
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
    capturePolicyDocument.mockResolvedValue(captured('aaa'));

    render(<Logger />);
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
    });
    expect(rendered.at(-1)).toEqual({ tab: 1, discovery: 'discovered', freshness: 'current', reads: 1 });

    // Second tab: hold discovery AND its own confirmation read open, so nothing of the second tab
    // can resolve and mask the frame under test. (Confirmation no longer waits for discovery.)
    discoverActiveTabPolicies.mockReturnValueOnce(deferred().promise);
    capturePolicyDocument.mockReturnValueOnce(deferred().promise);
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
});

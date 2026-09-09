/**
 * The bundled-analysis hook, and specifically what it reports *while* a hostname is changing.
 *
 * The regression this guards is not a crash — it is that for the whole time a new hostname was
 * resolving, the hook handed back the PREVIOUS hostname's `domain` and `analyses`, so the panel
 * painted the last site's documents under the new site's name. Asserting it needs a render between
 * the hostname change and the resolve, which is why the fake resolver hands back a promise this
 * test decides when to settle.
 */
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';

const resolveHostnameAnalyses = vi.fn();
vi.mock('@extension/shared', () => ({ resolveHostnameAnalyses: (h: string) => resolveHostnameAnalyses(h) }));

const { useDomainAnalyses } = await import('@src/hooks/useDomainAnalyses');

/** Only the fields the hook passes through; the corpus shape is not what is under test. */
const analysis = (contentHash: string) => ({ contentHash }) as SitePolicyAnalysis;

/** A promise the test settles by hand, so a render can be forced mid-flight. */
const deferred = () => {
  let settle!: (value: { domain: string; analyses: SitePolicyAnalysis[] } | null) => void;
  const promise = new Promise<{ domain: string; analyses: SitePolicyAnalysis[] } | null>(resolve => {
    settle = resolve;
  });
  return { promise, settle };
};

const Probe = ({ initial }: { initial: string | null }) => {
  const [hostname, setHostname] = useState(initial);
  const { status, domain, analyses } = useDomainAnalyses(hostname);

  return (
    <div>
      <output data-testid="status">{status}</output>
      <output data-testid="domain">{domain ?? '—'}</output>
      <output data-testid="hashes">{analyses.map(a => a.contentHash).join(',') || '—'}</output>
      <button type="button" onClick={() => setHostname('second.example')}>
        go
      </button>
    </div>
  );
};

const read = () => ({
  status: screen.getByTestId('status').textContent,
  domain: screen.getByTestId('domain').textContent,
  hashes: screen.getByTestId('hashes').textContent,
});

describe('useDomainAnalyses', () => {
  beforeEach(() => {
    resolveHostnameAnalyses.mockReset();
  });

  it('reports ready with nothing when there is no hostname', () => {
    render(<Probe initial={null} />);

    expect(read()).toEqual({ status: 'ready', domain: '—', hashes: '—' });
    expect(resolveHostnameAnalyses).not.toHaveBeenCalled();
  });

  it('resolves a hostname to its analyses', async () => {
    const first = deferred();
    resolveHostnameAnalyses.mockReturnValueOnce(first.promise);

    render(<Probe initial="first.example" />);
    expect(read().status).toBe('loading');

    await act(async () => {
      first.settle({ domain: 'first.example', analyses: [analysis('aaa')] });
    });

    expect(read()).toEqual({ status: 'ready', domain: 'first.example', hashes: 'aaa' });
  });

  it('stops reporting the previous hostname’s analyses the moment the hostname changes', async () => {
    const first = deferred();
    const second = deferred();
    resolveHostnameAnalyses.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    render(<Probe initial="first.example" />);
    await act(async () => {
      first.settle({ domain: 'first.example', analyses: [analysis('aaa')] });
    });
    expect(read()).toEqual({ status: 'ready', domain: 'first.example', hashes: 'aaa' });

    // The hostname changes. This is the render that used to be wrong.
    await act(async () => {
      screen.getByRole('button', { name: 'go' }).click();
    });

    expect(read()).toEqual({ status: 'loading', domain: '—', hashes: '—' });

    await act(async () => {
      second.settle({ domain: 'second.example', analyses: [analysis('bbb')] });
    });

    expect(read()).toEqual({ status: 'ready', domain: 'second.example', hashes: 'bbb' });
  });

  it('treats a resolver failure as ready-and-uncovered, not as an error', async () => {
    resolveHostnameAnalyses.mockRejectedValueOnce(new Error('corpus unreadable'));

    render(<Probe initial="first.example" />);
    await act(async () => {});

    expect(read()).toEqual({ status: 'ready', domain: '—', hashes: '—' });
  });

  it('keeps the analyses array referentially stable across re-renders', async () => {
    const corpusArray = [analysis('aaa')];
    resolveHostnameAnalyses.mockResolvedValue({ domain: 'first.example', analyses: corpusArray });

    const seen: SitePolicyAnalysis[][] = [];
    const Collect = () => {
      const { analyses } = useDomainAnalyses('first.example');
      seen.push(analyses);
      return null;
    };

    const { rerender } = render(<Collect />);
    await act(async () => {});
    rerender(<Collect />);

    // Downstream effects key off this array; a new one per render would re-run the live page check.
    const settled = seen.filter(a => a.length > 0);
    expect(settled.length).toBeGreaterThan(1);
    expect(new Set(settled).size).toBe(1);
  });
});

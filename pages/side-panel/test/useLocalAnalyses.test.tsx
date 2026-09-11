/**
 * The user's own analyses for a domain, and the two different reasons this hook re-reads.
 *
 * The distinction under test is deliberate and easy to lose in a refactor: a DOMAIN change must
 * drop the list, because another site's analyses are wrong rather than stale; a REFRESH of the same
 * domain must keep it, because it is still true and blanking it would flicker the list for the
 * length of a storage read. Before the restructure the effect reset only `status`, so a domain
 * change kept the previous domain's analyses on screen.
 */
import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalPolicyAnalysis, SitePolicyRunState } from '@extension/unshafted-core';

const getForDomain = vi.fn();
const runStateValue = { current: null as SitePolicyRunState | null };

vi.mock('@extension/storage', () => ({
  localSitePolicyStorage: { getForDomain: (domain: string) => getForDomain(domain) },
  sitePolicyRunStorage: {},
}));
vi.mock('@extension/unshafted-core', () => ({
  IDLE_SITE_POLICY_RUN: { status: 'idle', domain: null, startedAt: null },
}));
vi.mock('@src/hooks/useStorageValue', () => ({ useStorageValue: () => runStateValue.current }));

const { useLocalAnalyses } = await import('@src/hooks/useLocalAnalyses');

/** Only the field the probe prints; the stored shape is not what is under test. */
const stored = (contentHash: string) => ({ contentHash }) as LocalPolicyAnalysis;

const deferred = () => {
  let settle!: (value: LocalPolicyAnalysis[]) => void;
  const promise = new Promise<LocalPolicyAnalysis[]>(resolve => {
    settle = resolve;
  });
  return { promise, settle };
};

const Probe = () => {
  const [domain, setDomain] = useState<string | null>('first.example');
  const { status, analyses, reload } = useLocalAnalyses(domain);

  return (
    <div>
      <output data-testid="status">{status}</output>
      <output data-testid="hashes">{analyses.map(a => a.contentHash).join(',') || '—'}</output>
      <button type="button" onClick={() => setDomain('second.example')}>
        switch
      </button>
      <button type="button" onClick={reload}>
        reload
      </button>
    </div>
  );
};

const read = () => ({
  status: screen.getByTestId('status').textContent,
  hashes: screen.getByTestId('hashes').textContent,
});

const click = async (name: string) => {
  await act(async () => {
    screen.getByRole('button', { name }).click();
  });
};

describe('useLocalAnalyses', () => {
  beforeEach(() => {
    getForDomain.mockReset();
    runStateValue.current = null;
  });

  it('reads the domain and reports what it found', async () => {
    getForDomain.mockResolvedValue([stored('aaa')]);

    render(<Probe />);
    expect(read().status).toBe('loading');

    await act(async () => {});
    expect(read()).toEqual({ status: 'ready', hashes: 'aaa' });
  });

  it('drops the list when the domain changes', async () => {
    const second = deferred();
    getForDomain.mockResolvedValueOnce([stored('aaa')]).mockReturnValueOnce(second.promise);

    render(<Probe />);
    await act(async () => {});
    expect(read()).toEqual({ status: 'ready', hashes: 'aaa' });

    await click('switch');
    // Another site's analyses are wrong here, not merely stale.
    expect(read()).toEqual({ status: 'loading', hashes: '—' });

    await act(async () => {
      second.settle([stored('bbb')]);
    });
    expect(read()).toEqual({ status: 'ready', hashes: 'bbb' });
  });

  it('keeps the list on screen while re-reading the same domain', async () => {
    const refresh = deferred();
    getForDomain.mockResolvedValueOnce([stored('aaa')]).mockReturnValueOnce(refresh.promise);

    render(<Probe />);
    await act(async () => {});
    expect(read()).toEqual({ status: 'ready', hashes: 'aaa' });

    await click('reload');
    // Still the same domain, so what is on screen is still true. Loading, but not blank.
    expect(read()).toEqual({ status: 'loading', hashes: 'aaa' });

    await act(async () => {
      refresh.settle([stored('aaa'), stored('bbb')]);
    });
    expect(read()).toEqual({ status: 'ready', hashes: 'aaa,bbb' });
  });

  it('re-reads when a run completes for this domain', async () => {
    getForDomain.mockResolvedValue([stored('aaa')]);

    const { rerender } = render(<Probe />);
    await act(async () => {});
    expect(getForDomain).toHaveBeenCalledTimes(1);

    runStateValue.current = {
      status: 'complete',
      domain: 'first.example',
      startedAt: '2026-09-09T00:00:00.000Z',
    } as SitePolicyRunState;
    await act(async () => {
      rerender(<Probe />);
    });

    expect(getForDomain).toHaveBeenCalledTimes(2);
  });

  it('does not re-read when the completed run was for a different domain', async () => {
    getForDomain.mockResolvedValue([stored('aaa')]);

    const { rerender } = render(<Probe />);
    await act(async () => {});
    expect(getForDomain).toHaveBeenCalledTimes(1);

    runStateValue.current = {
      status: 'complete',
      domain: 'elsewhere.example',
      startedAt: '2026-09-09T00:00:00.000Z',
    } as SitePolicyRunState;
    await act(async () => {
      rerender(<Probe />);
    });

    expect(getForDomain).toHaveBeenCalledTimes(1);
  });

  it('treats an unreadable store as "none", not as a failure', async () => {
    getForDomain.mockRejectedValue(new Error('store unreadable'));

    render(<Probe />);
    await act(async () => {});

    expect(read()).toEqual({ status: 'ready', hashes: '—' });
  });
});

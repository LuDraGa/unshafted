/**
 * A1 left one link pattern: the injected collector takes it as an argument, from whoever injects
 * it. The core tests prove the collector matches with what it is given. This proves the extension
 * gives it the exported pattern — a literal at this call site would pass every core test and
 * reopen exactly the drift A1 closed.
 */
import { discoverActiveTabPolicies } from '../lib/utils/policy-capture';
import { collectPolicyCandidatesInPage, POLICY_LINK_PATTERN } from '@extension/unshafted-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('discoverActiveTabPolicies', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('injects the shipped collector with the exported link pattern', async () => {
    const executeScript = vi.fn(async () => [{ result: [] }]);
    vi.stubGlobal('chrome', {
      tabs: { query: vi.fn(async () => [{ id: 7, url: 'https://example.com/' }]) },
      scripting: { executeScript },
    });

    const result = await discoverActiveTabPolicies();

    expect(result.status).toBe('discovered');
    expect(executeScript).toHaveBeenCalledTimes(1);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      func: collectPolicyCandidatesInPage,
      args: [POLICY_LINK_PATTERN.source],
    });
  });
});

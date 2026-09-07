import { createStorage, StorageEnum } from '../base/index.js';
import { IDLE_SITE_POLICY_RUN } from '@extension/unshafted-core';
import type { SitePolicyRunState } from '@extension/unshafted-core';

/**
 * Progress for the site-policy run currently happening in the service worker (Part 6, S5).
 *
 * The run deliberately outlives the panel — closing a side panel must not kill a fetch the user
 * is paying for — so its state cannot live in the panel's React tree. It lives here, the worker
 * writes it, and `liveUpdate` pushes each change to whichever panel is open, or to none.
 *
 * `session` rather than `local`: a run in flight is worth nothing after a browser restart, and
 * persisting it would leave a permanently "running" panel behind any worker that died mid-call.
 * The ANALYSES are durable (`localSitePolicyStorage`); this is only the progress bar.
 */
const runStateStorage = createStorage<SitePolicyRunState>('unshafted-site-policy-run', IDLE_SITE_POLICY_RUN, {
  storageEnum: StorageEnum.Session,
  liveUpdate: true,
});

export const sitePolicyRunStorage = {
  ...runStateStorage,

  /** Claim the run. One at a time: a second concurrent run would race on the same budget. */
  start: async (domain: string, total: number): Promise<void> => {
    await runStateStorage.set({
      ...IDLE_SITE_POLICY_RUN,
      status: 'running',
      domain,
      startedAt: new Date().toISOString(),
      total,
    });
  },

  /** Called before each document, so the panel can name what is in flight. */
  beginDocument: async (sourceUrl: string): Promise<void> => {
    const current = await runStateStorage.get();
    await runStateStorage.set({ ...current, currentUrl: sourceUrl });
  },

  /** A document finished, one way or another. `message` present means it did not produce one. */
  finishDocument: async (sourceUrl: string, message?: string): Promise<void> => {
    const current = await runStateStorage.get();
    await runStateStorage.set({
      ...current,
      completed: current.completed + 1,
      currentUrl: null,
      failures: message ? [...current.failures, { sourceUrl, message }] : current.failures,
    });
  },

  /**
   * A result we produced and could not keep (S8). Recorded separately from `failures` because it
   * is a different conversation: the analysis exists, the user paid for it, and the fix is theirs
   * to make — free space or lose it.
   */
  recordOverBudget: async (sourceUrl: string, bytes: number, budgetBytes: number): Promise<void> => {
    const current = await runStateStorage.get();
    await runStateStorage.set({ ...current, overBudget: { sourceUrl, bytes, budgetBytes } });
  },

  finish: async (): Promise<void> => {
    const current = await runStateStorage.get();
    await runStateStorage.set({ ...current, status: 'complete', currentUrl: null });
  },

  reset: async (): Promise<void> => {
    await runStateStorage.set(IDLE_SITE_POLICY_RUN);
  },
};

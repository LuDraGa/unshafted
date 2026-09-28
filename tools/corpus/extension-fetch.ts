/**
 * Reading documents from inside a real Chrome extension page — the request the side panel makes.
 *
 * Since S2 the extension reads every policy document itself (D5): `fetchPolicyPage` in core, run
 * from an extension page with `<all_urls>`, cookies omitted. Measuring that with Node's `fetch`, or
 * Playwright's request API, measures something else: a different network stack and TLS
 * fingerprint, which bot walls answer differently. On 2026-09-28 Node was refused 8 packaged
 * documents a real extension page read without trouble. So tooling loads a minimal extension with
 * the same host access, opens its page, and evaluates `fetchPolicyPage`'s own SOURCE there — the
 * function is self-contained for exactly this — so what is measured is the shipped request.
 *
 * Two traps, both learned the hard way on the day it was built:
 *
 *  - Playwright launches Chrome with `--disable-extensions`. Left in, the extension page loads
 *    Chrome's ERR_BLOCKED_BY_CLIENT page and every fetch "fails".
 *  - Headless Chrome announces itself in its user agent (`HeadlessChrome`), and bot walls refuse it:
 *    about 20 of the 157 documents measured that day. A person's Chrome does not, so the browser is
 *    launched with an ordinary user agent — per-site contexts set their own, but the extension page
 *    lives in the default context, which only the launch flag reaches.
 *
 * Branded Chrome no longer honours `--load-extension`, so the extension is loaded over the
 * debugging protocol (`Extensions.loadUnpacked`, which needs `--enable-unsafe-extension-debugging`).
 * Its page lives in the browser's default context, which Playwright does not expose, so it is driven
 * through the browser-level session.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FetchedPolicyPage } from '../../packages/unshafted-core/lib/site-policy/read.js';
import type { Browser, CDPSession, LaunchOptions } from 'playwright-core';

/** Launch options a browser needs before `openExtensionFetcher` can load into it. */
const extensionLaunchOptions = (userAgent: string): Pick<LaunchOptions, 'ignoreDefaultArgs' | 'args'> => ({
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--enable-unsafe-extension-debugging', `--user-agent=${userAgent}`],
});

type ExtensionFetcher = {
  /** A fetch that runs `fetchSource` — `String(fetchPolicyPage)` from the core being measured. */
  fetchWith: (fetchSource: string) => (url: string) => Promise<FetchedPolicyPage>;
  extensionId: string;
};

type TargetMessage = { id?: number; result?: { result?: { value?: unknown }; exceptionDetails?: unknown } };

/**
 * Load the probe extension into `browser`, and return fetches that run inside its page. Each takes
 * the source of the `fetchPolicyPage` to run, so two versions of core are measured by their own
 * request on the same browser.
 */
const openExtensionFetcher = async (browser: Browser, dir: string): Promise<ExtensionFetcher> => {
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'manifest.json'),
    JSON.stringify({
      manifest_version: 3,
      name: 'unshafted-bench-probe',
      version: '0.0.1',
      // The extension's own grant, and nothing else: no scripts, no permissions beyond host access.
      host_permissions: ['<all_urls>'],
    }),
  );
  await writeFile(path.join(dir, 'probe.html'), '<!doctype html><title>probe</title>');

  const cdp: CDPSession = await browser.newBrowserCDPSession();
  const send = cdp.send.bind(cdp) as (method: string, params?: object) => Promise<Record<string, unknown>>;

  const { id: extensionId } = (await send('Extensions.loadUnpacked', { path: dir })) as { id: string };
  const { targetId } = (await send('Target.createTarget', {
    url: `chrome-extension://${extensionId}/probe.html`,
  })) as { targetId: string };
  const { sessionId } = (await send('Target.attachToTarget', { targetId, flatten: false })) as { sessionId: string };

  const pending = new Map<number, (message: TargetMessage) => void>();
  let nextId = 0;
  (cdp as unknown as { on: (event: string, listener: (event: { message: string }) => void) => void }).on(
    'Target.receivedMessageFromTarget',
    event => {
      const message = JSON.parse(event.message) as TargetMessage;
      if (message.id !== undefined) pending.get(message.id)?.(message);
    },
  );

  const call = (method: string, params: object): Promise<TargetMessage> =>
    new Promise(resolve => {
      nextId += 1;
      pending.set(nextId, resolve);
      void send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: nextId, method, params }) });
    });

  // Wait for the page to be the extension's, not Chrome's error page, before trusting any read.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const probe = await call('Runtime.evaluate', { expression: 'location.protocol', returnByValue: true });
    if (probe.result?.result?.value === 'chrome-extension:') break;
    if (attempt === 49) throw new Error('The probe extension page never loaded; is --disable-extensions still set?');
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const fetchWith =
    (fetchSource: string) =>
    async (url: string): Promise<FetchedPolicyPage> => {
      const response = await call('Runtime.evaluate', {
        expression: `(${fetchSource})(${JSON.stringify(url)})`,
        awaitPromise: true,
        returnByValue: true,
      });
      const value = response.result?.result?.value as FetchedPolicyPage | undefined;
      return (
        value ?? {
          ok: false,
          status: 0,
          finalUrl: url,
          contentType: '',
          html: '',
          error: 'The probe page returned nothing.',
        }
      );
    };

  return { fetchWith, extensionId };
};

export { extensionLaunchOptions, openExtensionFetcher };
export type { ExtensionFetcher };

import env, { IS_DEV, IS_PROD } from '@extension/env';
import { watchRebuildPlugin } from '@extension/hmr';
import react from '@vitejs/plugin-react-swc';
import deepmerge from 'deepmerge';
import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import type { UserConfig } from 'vite';

const PUBLIC_ENV_KEYS = [
  'CEB_DEV_LOCALE',
  'CEB_SUPABASE_URL',
  'CEB_SUPABASE_ANON_KEY',
  'CEB_GOOGLE_CLIENT_ID',
  'CEB_POLICY_CDN_URL',
  'CEB_POLICY_SUBMIT_URL',
  'CEB_NODE_ENV',
  'CLI_CEB_DEV',
  'CLI_CEB_FIREFOX',
] as const;

export const publicExtensionEnv = PUBLIC_ENV_KEYS.reduce<Record<string, string>>((publicEnv, key) => {
  publicEnv[key] = env[key] ?? '';
  return publicEnv;
}, {});

/**
 * Don't rebuild on a half-written file.
 *
 * This used to be `chokidar: { awaitWriteFinish: true }`. Vite 8 bundles rolldown, which does its
 * own file watching, and the `chokidar` key is gone — but the reason for it is not. A save that
 * lands in more than one write, or a generator emitting several files in sequence, would otherwise
 * trigger a rebuild against a file that is still being written, and the dev build that comes out
 * is broken in a way that has nothing to do with the source.
 *
 * `buildDelay` is the same guarantee stated at the build coordinator instead of the watcher: it
 * waits for a quiet window before rebuilding, and each further change restarts the wait, so a file
 * arriving in pieces is only built once it has stopped moving. Rolldown's own documentation
 * describes exactly this failure — "a broken intermediate build before generating a successful
 * final build".
 *
 * 100ms rather than chokidar's 2000ms default. That default was a stability threshold for a
 * polling watcher, and paying two seconds on every save to guard against a partial write is the
 * wrong trade for a dev loop; 100ms is chokidar's own polling granularity for the same check and
 * is below the threshold where a save feels delayed.
 *
 * `IS_DEV`-gated as before, which is the trap in this file: a production build passes `undefined`
 * and never exercises any of it, so `pnpm build` says nothing about whether this works. `pnpm dev`
 * hot-reloading is the only thing that does.
 */
export const watchOption = IS_DEV ? { buildDelay: 100 } : undefined;

export const withPageConfig = (config: UserConfig) =>
  defineConfig(
    deepmerge(
      {
        define: {
          'process.env': publicExtensionEnv,
        },
        base: '',
        plugins: [react(), IS_DEV && watchRebuildPlugin({ refresh: true }), nodePolyfills()],
        build: {
          sourcemap: IS_DEV,
          minify: IS_PROD,
          reportCompressedSize: IS_PROD,
          emptyOutDir: IS_PROD,
          watch: watchOption,
          rollupOptions: {
            external: ['chrome'],
          },
        },
      },
      config,
    ),
  );

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
  'CEB_NODE_ENV',
  'CLI_CEB_DEV',
  'CLI_CEB_FIREFOX',
] as const;

export const publicExtensionEnv = PUBLIC_ENV_KEYS.reduce<Record<string, string>>((publicEnv, key) => {
  publicEnv[key] = env[key] ?? '';
  return publicEnv;
}, {});

export const watchOption = IS_DEV
  ? {
      chokidar: {
        awaitWriteFinish: true,
      },
    }
  : undefined;

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

import type { dynamicEnvValues } from './index.js';

interface ICebEnv {
  readonly CEB_EXAMPLE: string;
  readonly CEB_DEV_LOCALE: string;
  readonly CEB_SUPABASE_URL: string;
  readonly CEB_SUPABASE_ANON_KEY: string;
  readonly CEB_GOOGLE_CLIENT_ID: string;
  /** Base URL for the static policy-analysis CDN. Empty disables all corpus lookups. */
  readonly CEB_POLICY_CDN_URL: string;
  /** Endpoint for user-initiated analysis requests. Empty hides the request affordance. */
  readonly CEB_POLICY_SUBMIT_URL: string;
}

interface ICebCliEnv {
  readonly CLI_CEB_DEV: string;
  readonly CLI_CEB_FIREFOX: string;
}

export type EnvType = ICebEnv & ICebCliEnv & typeof dynamicEnvValues;

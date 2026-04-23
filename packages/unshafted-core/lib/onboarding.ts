import {
  DEFAULT_OPENAI_QUICK_MODEL,
  DEFAULT_QUICK_MODEL,
} from './constants.js';
import type { AppSettings } from './types.js';

export const getActiveProviderConfig = (settings: AppSettings) => {
  const provider = settings.provider;

  if (provider === 'openai') {
    return {
      provider,
      apiKey: settings.openaiApiKey.trim(),
      model: settings.openaiQuickModel.trim() || DEFAULT_OPENAI_QUICK_MODEL,
    };
  }

  return {
    provider,
    apiKey: settings.apiKey.trim(),
    model: settings.quickModel.trim() || DEFAULT_QUICK_MODEL,
  };
};

export const getOnboardingKeyHash = async ({
  apiKey,
  model,
  provider,
}: {
  apiKey: string;
  model: string;
  provider: AppSettings['provider'];
}): Promise<string> => {
  const data = new TextEncoder().encode(`${provider}:${model}:${apiKey}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

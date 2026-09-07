import { AnalysisErrorSchema, AppSettingsSchema } from '@extension/unshafted-core';
import type { AppSettings } from '@extension/unshafted-core';

/**
 * Which key and which models a run actually uses.
 *
 * Lifted out of `analysis-workflow.ts` when the site-policy runner (Part 6, S1) became the second
 * caller. A second copy would have been the drift the moment a third provider, a per-provider
 * temperature or a key-format check landed in one file and not the other — and the failure mode is
 * silent: a request that goes to the right endpoint with the wrong key, or the wrong model string
 * billed to the user's own account.
 *
 * It throws rather than returning a result type because there is nothing useful a caller can do
 * without a key, and every caller shows the same sentence when there isn't one.
 */
export const resolveProvider = (settings: AppSettings) => {
  const parsed = AppSettingsSchema.parse(settings);
  const isOpenAI = parsed.provider === 'openai';

  const apiKey = isOpenAI ? parsed.openaiApiKey : parsed.apiKey;
  if (!apiKey.trim()) {
    throw AnalysisErrorSchema.parse({
      code: 'missing_api_key',
      message: `Add your ${isOpenAI ? 'OpenAI' : 'OpenRouter'} API key in Options before running analysis.`,
      suggestion: 'Open the Options page, paste your key, save it, and try again.',
      retryable: false,
    });
  }

  return {
    provider: parsed.provider,
    apiKey,
    quickModel: isOpenAI ? parsed.openaiQuickModel : parsed.quickModel,
    deepModel: isOpenAI ? parsed.openaiDeepModel : parsed.deepModel,
    temperature: parsed.temperature,
  };
};

export type ResolvedProvider = ReturnType<typeof resolveProvider>;

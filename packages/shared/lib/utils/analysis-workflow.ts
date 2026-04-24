import {
  AnalysisErrorSchema,
  AppSettingsSchema,
  DeepAnalysisResultSchema,
  CurrentAnalysisSchema,
  QuickScanResultSchema,
  buildDeepAnalysisSystemPrompt,
  buildDeepAnalysisUserPrompt,
  buildQuickScanSystemPrompt,
  buildQuickScanUserPrompt,
  buildRoleOptions,
  buildSuggestedPriorities,
  callOpenRouterStructured,
  prepareDeepAnalysisText,
  prepareQuickScanText,
  touchCurrentAnalysis,
} from '@extension/unshafted-core';
import type { AnalysisError, AppSettings, CurrentAnalysis } from '@extension/unshafted-core';

const makeError = (error: unknown, fallback: AnalysisError): AnalysisError => {
  if (error instanceof Error) {
    return AnalysisErrorSchema.parse({
      ...fallback,
      message: error.message || fallback.message,
      raw: error.message || fallback.raw,
    });
  }

  return AnalysisErrorSchema.parse(fallback);
};

const resolveProvider = (settings: AppSettings) => {
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

export const runQuickScan = async (analysis: CurrentAnalysis, settings: AppSettings): Promise<CurrentAnalysis> => {
  const resolved = resolveProvider(settings);
  const prepared = prepareQuickScanText(analysis.source.text);
  const promptSource = prepared.truncated
    ? {
        ...analysis.source,
        warnings: [...analysis.source.warnings, 'Quick scan used an excerpt because the document is long.'],
      }
    : analysis.source;

  try {
    const response = await callOpenRouterStructured({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.quickModel,
      temperature: resolved.temperature,
      reasoningEffort: 'low',
      schema: QuickScanResultSchema,
      schemaName: 'quick_scan',
      title: 'Unshafted Quick Scan',
      messages: [
        {
          role: 'system',
          content: buildQuickScanSystemPrompt(),
        },
        {
          role: 'user',
          content: buildQuickScanUserPrompt(promptSource, prepared.text),
        },
      ],
    });

    const quickResult = QuickScanResultSchema.parse(response.data);
    const suggestedRole = buildRoleOptions(quickResult)[0] ?? 'Signer';

    return CurrentAnalysisSchema.parse(
      touchCurrentAnalysis({
        ...analysis,
        quickScan: quickResult,
        selectedRole: analysis.selectedRole === 'Signer' ? suggestedRole : analysis.selectedRole,
        priorities: analysis.priorities.length > 0 ? analysis.priorities : buildSuggestedPriorities(quickResult),
        status: 'quick-ready',
        error: null,
      }),
    );
  } catch (error) {
    const parsedError =
      error && typeof error === 'object' && 'code' in error
        ? AnalysisErrorSchema.parse(error)
        : makeError(error, {
            code: 'llm_request_failed',
            message: 'Quick scan failed.',
            suggestion: 'Try again, or switch to a different quick model in Options.',
            retryable: true,
          });

    return CurrentAnalysisSchema.parse(
      touchCurrentAnalysis({
        ...analysis,
        status: 'error',
        error: parsedError,
      }),
    );
  }
};

export const runDeepAnalysis = async (analysis: CurrentAnalysis, settings: AppSettings): Promise<CurrentAnalysis> => {
  const resolved = resolveProvider(settings);
  const prepared = prepareDeepAnalysisText(analysis.source.text);
  const selectedRole = analysis.customRole.trim() || analysis.selectedRole;

  try {
    const response = await callOpenRouterStructured({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.deepModel,
      temperature: resolved.temperature,
      reasoningEffort: 'high',
      schema: DeepAnalysisResultSchema,
      schemaName: 'deep_analysis',
      title: 'Unshafted Deep Analysis',
      messages: [
        {
          role: 'system',
          content: buildDeepAnalysisSystemPrompt(),
        },
        {
          role: 'user',
          content: buildDeepAnalysisUserPrompt({
            document: prepared.truncated
              ? {
                  ...analysis.source,
                  warnings: [
                    ...analysis.source.warnings,
                    'Deep analysis used an excerpt because the document is long.',
                  ],
                }
              : analysis.source,
            selectedRole,
            priorities: analysis.priorities,
            quickSummary: analysis.quickScan?.summary,
            preparedText: prepared.text,
          }),
        },
      ],
    });
    const deepResult = DeepAnalysisResultSchema.parse(response.data);

    return CurrentAnalysisSchema.parse(
      touchCurrentAnalysis({
        ...analysis,
        selectedRole,
        deepAnalysis: deepResult,
        status: 'complete',
        error: null,
      }),
    );
  } catch (error) {
    const parsedError =
      error && typeof error === 'object' && 'code' in error
        ? AnalysisErrorSchema.parse(error)
        : makeError(error, {
            code: 'llm_request_failed',
            message: 'Detailed analysis failed.',
            suggestion: 'Try again, or switch the deep model in Options.',
            retryable: true,
          });

    return CurrentAnalysisSchema.parse(
      touchCurrentAnalysis({
        ...analysis,
        status: 'error',
        error: parsedError,
      }),
    );
  }
};

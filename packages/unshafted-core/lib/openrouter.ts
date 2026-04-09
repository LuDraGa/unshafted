import type { ZodSchema } from 'zod';
import { parseStructuredJson } from './json.js';
import type { OpenRouterMessage, OpenRouterStructuredResponse } from './types.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

type OpenRouterRequestParams<T> = {
  apiKey: string;
  model: string;
  temperature?: number;
  messages: OpenRouterMessage[];
  schema: ZodSchema<T>;
  title?: string;
};

type OpenRouterResponse = {
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

const getMessageContent = (response: OpenRouterResponse): string => {
  const content = response.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') {
          return part;
        }

        return part.text ?? '';
      })
      .join('');
  }

  return '';
};

const requestOpenRouter = async (params: {
  apiKey: string;
  model: string;
  temperature?: number;
  messages: OpenRouterMessage[];
  jsonMode: boolean;
  title?: string;
}): Promise<OpenRouterResponse> => {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
      ...(params.title ? { 'X-Title': params.title } : {}),
    },
    body: JSON.stringify({
      model: params.model,
      temperature: params.temperature ?? 0.2,
      messages: params.messages,
      ...(params.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as OpenRouterResponse;

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        payload.error?.message ??
          'OpenRouter rate limit hit for this model. Free models spike and throttle often. Wait a bit, retry, or switch models in Options.',
      );
    }

    throw new Error(payload.error?.message ?? `OpenRouter request failed with ${response.status}`);
  }

  return payload;
};

export const callOpenRouterStructured = async <T>(params: OpenRouterRequestParams<T>): Promise<OpenRouterStructuredResponse<T>> => {
  const attempt = async (jsonMode: boolean) => {
    const payload = await requestOpenRouter({
      apiKey: params.apiKey,
      model: params.model,
      temperature: params.temperature,
      messages: params.messages,
      jsonMode,
      title: params.title,
    });
    const raw = getMessageContent(payload);
    const data = parseStructuredJson(params.schema, raw);

    return {
      data,
      raw,
      model: payload.model ?? params.model,
      usage: payload.usage
        ? {
            promptTokens: payload.usage.prompt_tokens,
            completionTokens: payload.usage.completion_tokens,
            totalTokens: payload.usage.total_tokens,
          }
        : undefined,
    };
  };

  try {
    return await attempt(true);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof Error) {
      return attempt(false);
    }

    throw error;
  }
};

export const testOpenRouterConnection = async (params: {
  apiKey: string;
  model: string;
  temperature?: number;
  title?: string;
}): Promise<string> => {
  const payload = await requestOpenRouter({
    apiKey: params.apiKey,
    model: params.model,
    temperature: params.temperature,
    jsonMode: false,
    title: params.title,
    messages: [
      {
        role: 'system',
        content: 'Reply with exactly: connection-ok',
      },
      {
        role: 'user',
        content: 'connection check',
      },
    ],
  });

  const raw = getMessageContent(payload).trim();
  if (!raw.toLowerCase().includes('connection-ok')) {
    throw new Error('Connection succeeded but the model did not respond as expected.');
  }

  return payload.model ?? params.model;
};

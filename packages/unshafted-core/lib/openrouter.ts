import { parseStructuredJson } from './json.js';
import { ZodError } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { OpenRouterMessage, OpenRouterStructuredResponse } from './types.js';
import type { ZodSchema } from 'zod';

type Provider = 'openrouter' | 'openai';

const PROVIDER_CONFIG: Record<Provider, { url: string; label: string }> = {
  openrouter: {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    label: 'OpenRouter',
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    label: 'OpenAI',
  },
};

type StructuredRequestParams<T> = {
  provider?: Provider;
  apiKey: string;
  model: string;
  temperature?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  messages: OpenRouterMessage[];
  schema: ZodSchema<T>;
  schemaName?: string;
  title?: string;
};

type ChatCompletionResponse = {
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      refusal?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

const getMessageContent = (response: ChatCompletionResponse): string => {
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

const checkResponseHealth = (payload: ChatCompletionResponse, label: string) => {
  const choice = payload.choices?.[0];

  // Model refused on safety grounds — content is null/empty
  if (choice?.message?.refusal) {
    throw new Error(
      `${label}: The model declined this request. Reason: ${choice.message.refusal}. Try rephrasing or use a different document.`,
    );
  }

  // Response truncated — hit max output tokens, JSON will be incomplete
  if (choice?.finish_reason === 'length') {
    throw new Error(
      `${label}: The response was cut off because the output was too long. Try a shorter document or switch to a model with a larger output limit.`,
    );
  }
};

/**
 * Rewrites draft-4 exclusive bounds into the draft-2020-12 form OpenAI's validator demands.
 *
 * `zodToJsonSchema`'s `openAi` target is derived from the OpenAPI 3 dialect, where an exclusive
 * bound is spelled as the BOOLEAN `exclusiveMinimum: true` alongside `minimum: 0`. OpenAI
 * validates `response_format` schemas as draft 2020-12, where the same keyword is the NUMBER
 * itself — so any `z.number().positive()` in a response schema comes back as a 400:
 * "Invalid schema ... True is not of type 'number'".
 *
 * The alternative — banning exclusive bounds from every response schema — makes a domain schema
 * write `min(1)` where it means `positive()` to appease a transport detail, and only holds until
 * the next one forgets. This is the seam the two dialects actually meet at, so it is fixed here
 * once for every caller.
 */
const toDraft2020ExclusiveBounds = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(toDraft2020ExclusiveBounds);
  if (!node || typeof node !== 'object') return node;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    result[key] = toDraft2020ExclusiveBounds(value);
  }

  for (const [flag, bound] of [
    ['exclusiveMinimum', 'minimum'],
    ['exclusiveMaximum', 'maximum'],
  ] as const) {
    if (typeof result[flag] !== 'boolean') continue;

    // `false` is the dialect's way of saying "the bound is inclusive after all" — the number
    // stays where it is and only the flag has to go.
    if (result[flag] === true && typeof result[bound] === 'number') {
      result[flag] = result[bound];
      delete result[bound];
    } else {
      delete result[flag];
    }
  }

  return result;
};

const buildResponseFormat = <T>(
  provider: Provider,
  schema: ZodSchema<T> | undefined,
  schemaName: string,
  jsonMode: boolean,
) => {
  if (!jsonMode) return undefined;

  // OpenAI: use json_schema with strict: true for constrained decoding
  if (provider === 'openai' && schema) {
    const converted = toDraft2020ExclusiveBounds(zodToJsonSchema(schema, { target: 'openAi', $refStrategy: 'none' }));
    return {
      type: 'json_schema' as const,
      json_schema: {
        name: schemaName,
        strict: true,
        schema: converted,
      },
    };
  }

  // OpenRouter: plain json_object mode
  return { type: 'json_object' as const };
};

const requestChatCompletion = async <T>(params: {
  provider: Provider;
  apiKey: string;
  model: string;
  temperature?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
  messages: OpenRouterMessage[];
  jsonMode: boolean;
  schema?: ZodSchema<T>;
  schemaName?: string;
  title?: string;
}): Promise<ChatCompletionResponse> => {
  const config = PROVIDER_CONFIG[params.provider];
  const isOpenAI = params.provider === 'openai';

  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
  };

  if (isOpenAI) {
    body.reasoning_effort = params.reasoningEffort ?? 'medium';
  } else {
    body.temperature = params.temperature ?? 0.2;
  }

  const responseFormat = buildResponseFormat(
    params.provider,
    params.schema,
    params.schemaName ?? 'response',
    params.jsonMode,
  );
  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
      ...(params.title && !isOpenAI ? { 'X-Title': params.title } : {}),
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as ChatCompletionResponse;

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        payload.error?.message ?? `${config.label} rate limit hit. Wait a bit, retry, or switch models in Options.`,
      );
    }

    throw new Error(payload.error?.message ?? `${config.label} request failed with ${response.status}`);
  }

  // Check for refusal and truncation before returning
  checkResponseHealth(payload, config.label);

  return payload;
};

export const callOpenRouterStructured = async <T>(
  params: StructuredRequestParams<T>,
): Promise<OpenRouterStructuredResponse<T>> => {
  const provider = params.provider ?? 'openrouter';

  const attempt = async (jsonMode: boolean) => {
    const payload = await requestChatCompletion({
      provider,
      apiKey: params.apiKey,
      model: params.model,
      temperature: params.temperature,
      reasoningEffort: params.reasoningEffort,
      messages: params.messages,
      jsonMode,
      schema: params.schema,
      schemaName: params.schemaName,
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
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return attempt(false);
    }

    throw error;
  }
};

export const testOpenRouterConnection = async (params: {
  provider?: Provider;
  apiKey: string;
  model: string;
  temperature?: number;
  title?: string;
}): Promise<string> => {
  const provider = params.provider ?? 'openrouter';

  const payload = await requestChatCompletion({
    provider,
    apiKey: params.apiKey,
    model: params.model,
    temperature: params.temperature,
    reasoningEffort: 'low',
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

import type { ZodSchema } from 'zod';

export const extractJsonFromText = (input: string): string => {
  const fencedMatch = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? input.trim();

  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;

  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return candidate.slice(start, index + 1);
      }
    }
  }

  return candidate;
};

export const parseStructuredJson = <T>(schema: ZodSchema<T>, raw: string): T => {
  const extracted = extractJsonFromText(raw);
  const parsed = JSON.parse(extracted);
  return schema.parse(parsed);
};

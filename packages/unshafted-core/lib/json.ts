import type { ZodSchema } from 'zod';

/*
 * No `\s*` between the fence and the capture. `\s` is a subset of `[\s\S]`, so with both present
 * the whitespace after an opening fence can be split between them in as many ways as there are
 * whitespace characters, and every split re-scans the remainder for a closing fence — quadratic,
 * and it never terminates early when the closing fence is absent. This is model output, and a page
 * under analysis reaches the prompt, so the input is not ours to trust: an unterminated fence
 * followed by 160k spaces took 2.1s before this changed, doubling for each doubling of the input.
 *
 * The `\s*` was never doing any work. The capture is `.trim()`ed on the next line, so leading
 * whitespace is discarded either way and the extracted text is unchanged.
 */
const FENCED_BLOCK_PATTERN = /```(?:json)?([\s\S]*?)```/i;

export const extractJsonFromText = (input: string): string => {
  const fencedMatch = input.match(FENCED_BLOCK_PATTERN);
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

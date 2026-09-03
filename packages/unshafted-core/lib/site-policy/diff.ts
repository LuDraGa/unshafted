import type { Exposure } from './types.js';

/**
 * Local, LLM-free diffing between the version a user is looking at and the version that was
 * analyzed.
 *
 * This runs entirely on the client after one text fetch, costs nothing, and answers a question
 * that is useful on its own: *which sections moved since anyone last read this properly*.
 *
 * It deliberately does NOT answer what the new text MEANS. That needs re-analysis, which is
 * Part 2's problem. Saying "the arbitration section changed" is honest and actionable; inferring
 * what it changed TO, from a diff alone, would not be.
 *
 * Block boundaries come from the normalizer's paragraph structure, which is stable by
 * construction — see `normalize.ts`. Blocks are compared by their exact text, so no hashing is
 * needed here.
 */

export type PolicyBlock = {
  /** Nearest preceding heading, so a changed block can be named rather than just counted. */
  heading: string | null;
  text: string;
};

export type PolicyTextDiff = {
  added: PolicyBlock[];
  removed: PolicyBlock[];
  unchangedCount: number;
  /** Distinct section headings touched by any add or removal, in document order. */
  changedHeadings: string[];
  hasChanges: boolean;
};

const HEADING_PATTERN = /^#{1,6}\s+(.*)$/;

export const splitPolicyBlocks = (text: string): PolicyBlock[] => {
  const blocks: PolicyBlock[] = [];
  let heading: string | null = null;

  for (const chunk of text.split('\n\n')) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    const headingMatch = HEADING_PATTERN.exec(trimmed.split('\n')[0] ?? '');
    if (headingMatch) {
      heading = headingMatch[1]!.trim();
      // A heading is itself content: if it is reworded, that is a change worth reporting.
      blocks.push({ heading, text: trimmed });
      continue;
    }

    blocks.push({ heading, text: trimmed });
  }

  return blocks;
};

export const diffPolicyText = (previousText: string, currentText: string): PolicyTextDiff => {
  const previous = splitPolicyBlocks(previousText);
  const current = splitPolicyBlocks(currentText);

  const previousTexts = new Set(previous.map(block => block.text));
  const currentTexts = new Set(current.map(block => block.text));

  const added = current.filter(block => !previousTexts.has(block.text));
  const removed = previous.filter(block => !currentTexts.has(block.text));
  const unchangedCount = current.length - added.length;

  const changedHeadings: string[] = [];
  for (const block of [...added, ...removed]) {
    const label = block.heading;
    if (label && !changedHeadings.includes(label)) changedHeadings.push(label);
  }

  return {
    added,
    removed,
    unchangedCount,
    changedHeadings,
    hasChanges: added.length > 0 || removed.length > 0,
  };
};

const normalizeForMatch = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Which previously-flagged concerns sit in text that moved.
 *
 * Matching is by the exposure's quoted clause first — the strongest signal — then by its
 * section label. A `false` result means "we could not tie this exposure to a changed block",
 * not "this exposure is definitely unaffected"; the UI should not claim more than that.
 */
export const findAffectedExposures = (diff: PolicyTextDiff, exposures: Exposure[]): Exposure[] => {
  if (!diff.hasChanges) return [];

  const changedBlocks = [...diff.added, ...diff.removed];
  const changedText = changedBlocks.map(block => normalizeForMatch(block.text));
  const changedHeadings = new Set(diff.changedHeadings.map(normalizeForMatch));

  return exposures.filter(exposure => {
    const quote = exposure.reference?.quote;
    if (quote) {
      const needle = normalizeForMatch(quote);
      if (needle && changedText.some(block => block.includes(needle))) return true;
    }

    const label = exposure.reference?.label;
    if (label) {
      const needle = normalizeForMatch(label);
      if (needle && (changedHeadings.has(needle) || changedText.some(block => block.includes(needle)))) {
        return true;
      }
    }

    return false;
  });
};

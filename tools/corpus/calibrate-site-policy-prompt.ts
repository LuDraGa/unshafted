/**
 * Run `site-policy-prompt-v1` against documents the corpus already has a hand-written analysis
 * for, and print what differs.
 *
 * WHY THIS EXISTS. Part 6 §W1 shipped a prompt calibrated by reading — comparing what it asks for
 * against what an Opus analyst actually wrote. That is a design review, and W1's own weakness list
 * says so plainly: it argues the prompt asks for the right things, and does not show that it gets
 * them. This is the gate that shows it. Until it has been run, no claim in Part 6 about output
 * quality has been tested.
 *
 * WHAT IT IS NOT. There is no pass mark here and there deliberately is none. The corpus analyses
 * are the work of a model with the whole document and a human checking it; a divergence can mean
 * the prompt is worse, or that the analyst saw something a fresh read would not, or simply that
 * two competent readers picked different exposures out of the same clause. The output is a
 * comparison for a person to read, not a score to gate a build on. Anything that turns this into
 * a CI assertion will be measuring agreement with one earlier run, which is not the same thing as
 * being right.
 *
 * COST. Every run spends real credits on the configured key, on documents up to 35k characters.
 * It analyses four documents by default and asks before spending unless `--yes` is passed.
 *
 * Run:
 *   OPENROUTER_API_KEY=sk-... node --import tsx tools/corpus/calibrate-site-policy-prompt.ts
 *   OPENAI_API_KEY=sk-... PROVIDER=openai MODEL=gpt-5 node --import tsx tools/corpus/calibrate-site-policy-prompt.ts
 *   ... calibrate-site-policy-prompt.ts --hashes 887b98bf,f44a02e5 --yes
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

import { callOpenRouterStructured } from '../../packages/unshafted-core/lib/openrouter.js';
import {
  buildSitePolicyAnalysisSystemPrompt,
  buildSitePolicyAnalysisUserPrompt,
} from '../../packages/unshafted-core/lib/site-policy/prompt.js';
import { SitePolicyAnalysisSchema } from '../../packages/unshafted-core/lib/site-policy/schemas.js';
import type { SitePolicyAnalysis } from '../../packages/unshafted-core/lib/site-policy/types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The four W1 was calibrated against, spanning the risk scale and four document types. Comparing
 * against these first is the point: a prompt tuned by reading them should do best here, so a poor
 * showing on its home ground is the strongest signal the script can give.
 */
const DEFAULT_HASH_PREFIXES = ['887b98bf', 'f44a02e5', '83d53ffe', '7db58935'];

/** The six keys the model supplies. Everything else on the object is provenance the caller fills. */
const ModelResponseSchema = SitePolicyAnalysisSchema.pick({
  summary: true,
  riskLevel: true,
  confidence: true,
  exposures: true,
  availableActions: true,
  requiredDisclosures: true,
});

const RISK_ORDER = ['Low', 'Medium', 'High', 'Very High'] as const;

type Args = { hashPrefixes: string[]; yes: boolean };

const parseArgs = (argv: string[]): Args => {
  const hashesAt = argv.indexOf('--hashes');
  return {
    hashPrefixes: hashesAt === -1 ? DEFAULT_HASH_PREFIXES : (argv[hashesAt + 1]?.split(',') ?? DEFAULT_HASH_PREFIXES),
    yes: argv.includes('--yes'),
  };
};

const resolveHash = async (prefix: string): Promise<string> => {
  const files = await readdir(path.join(ROOT, 'corpus/analysis'));
  const matches = files.filter(file => file.startsWith(prefix)).map(file => file.replace(/\.json$/, ''));
  if (matches.length === 0) throw new Error(`No corpus analysis starts with "${prefix}".`);
  if (matches.length > 1) throw new Error(`"${prefix}" is ambiguous: ${matches.length} analyses match.`);
  return matches[0]!;
};

const loadPair = async (hash: string) => {
  const [analysisRaw, text] = await Promise.all([
    readFile(path.join(ROOT, 'corpus/analysis', `${hash}.json`), 'utf8'),
    readFile(path.join(ROOT, 'corpus/text', `${hash}.txt`), 'utf8'),
  ]);
  return { hash, corpus: SitePolicyAnalysisSchema.parse(JSON.parse(analysisRaw)), text };
};

/**
 * The corpus text is used WHOLE, deliberately, even where it exceeds what the extension would
 * send. The extension excerpts and then suppresses absence findings (S6); excerpting here would
 * confound "the prompt reads worse than the analyst" with "the prompt saw less than the analyst",
 * and it is the first question this script exists to answer.
 */
const runPrompt = async (
  pair: Awaited<ReturnType<typeof loadPair>>,
  config: { provider: 'openrouter' | 'openai'; apiKey: string; model: string },
) => {
  const response = await callOpenRouterStructured({
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    reasoningEffort: 'high',
    schema: ModelResponseSchema,
    schemaName: 'site_policy_analysis',
    title: 'Unshafted Site Policy Calibration',
    messages: [
      { role: 'system', content: buildSitePolicyAnalysisSystemPrompt() },
      {
        role: 'user',
        content: buildSitePolicyAnalysisUserPrompt({
          domain: pair.corpus.domain,
          sourceUrl: pair.corpus.sourceUrl,
          docType: pair.corpus.docType,
          verticals: pair.corpus.verticals,
          preparedText: pair.text,
          excerpted: false,
        }),
      },
    ],
  });

  return ModelResponseSchema.parse(response.data);
};

const severitySpread = (analysis: { exposures: SitePolicyAnalysis['exposures'] }) => {
  const counts = new Map<string, number>();
  for (const exposure of analysis.exposures) counts.set(exposure.severity, (counts.get(exposure.severity) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([severity, count]) => `${severity}×${count}`)
    .join(' ');
};

const disclosureNames = (entries: SitePolicyAnalysis['requiredDisclosures']) =>
  new Set(entries.map(entry => entry.name.toLowerCase().trim()));

const overlap = (left: Set<string>, right: Set<string>) => [...left].filter(name => right.has(name)).length;

const report = (pair: Awaited<ReturnType<typeof loadPair>>, fresh: SitePolicyAnalysis) => {
  const { corpus } = pair;
  const corpusNames = disclosureNames(corpus.requiredDisclosures);
  const freshNames = disclosureNames(fresh.requiredDisclosures);
  const shared = overlap(corpusNames, freshNames);

  const riskGap = RISK_ORDER.indexOf(fresh.riskLevel) - RISK_ORDER.indexOf(corpus.riskLevel);

  const lines = [
    ``,
    `── ${corpus.domain} · ${corpus.docType} · ${pair.hash.slice(0, 8)} ─────────────────────────`,
    `  risk        corpus ${corpus.riskLevel.padEnd(9)} → prompt ${fresh.riskLevel.padEnd(9)} ${
      riskGap === 0 ? '(match)' : `(${riskGap > 0 ? '+' : ''}${riskGap} step${Math.abs(riskGap) === 1 ? '' : 's'})`
    }`,
    `  confidence  corpus ${corpus.confidence.padEnd(9)} → prompt ${fresh.confidence}`,
    `  exposures   corpus ${String(corpus.exposures.length).padEnd(9)} → prompt ${fresh.exposures.length}`,
    `              corpus severities: ${severitySpread(corpus) || '—'}`,
    `              prompt severities: ${severitySpread(fresh) || '—'}`,
    `  actions     corpus ${String(corpus.availableActions.length).padEnd(9)} → prompt ${fresh.availableActions.length}`,
    `  disclosures corpus ${String(corpus.requiredDisclosures.length).padEnd(9)} → prompt ${
      fresh.requiredDisclosures.length
    }  ·  ${shared} name${shared === 1 ? '' : 's'} in common`,
    ``,
    `  Corpus exposures:`,
    ...corpus.exposures.map(exposure => `    · [${exposure.severity}] ${exposure.title}`),
    ``,
    `  Prompt exposures:`,
    ...fresh.exposures.map(exposure => `    · [${exposure.severity}] ${exposure.title}`),
  ];

  /*
   * Disclosures the analyst recorded and this run did not are the finding worth reading first.
   * Part 4 §3.3 argues absence is the hardest fact in the schema and the one a clause-reader
   * structurally cannot produce, so a shortfall here is the failure mode that matters most —
   * and it is invisible in any count-based comparison.
   */
  const missed = [...corpusNames].filter(name => !freshNames.has(name));
  if (missed.length > 0) {
    lines.push(``, `  Disclosures the corpus checked and this run did not:`);
    lines.push(...missed.map(name => `    · ${name}`));
  }

  return lines.join('\n');
};

const confirmSpend = async (count: number, model: string) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    `About to analyse ${count} document${count === 1 ? '' : 's'} with ${model}, on your own key. Continue? [y/N] `,
  );
  rl.close();
  return answer.trim().toLowerCase() === 'y';
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));

  const provider = process.env['PROVIDER'] === 'openai' ? 'openai' : 'openrouter';
  const apiKey = (provider === 'openai' ? process.env['OPENAI_API_KEY'] : process.env['OPENROUTER_API_KEY'])?.trim();
  const model = process.env['MODEL']?.trim() ?? (provider === 'openai' ? 'gpt-5' : 'anthropic/claude-opus-4.1');

  if (!apiKey) {
    console.error(
      `Set ${provider === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY'}. This spends your own credits.`,
    );
    process.exitCode = 1;
    return;
  }

  const hashes = await Promise.all(args.hashPrefixes.map(resolveHash));
  const pairs = await Promise.all(hashes.map(loadPair));

  if (!args.yes && !(await confirmSpend(pairs.length, model))) {
    console.log('Nothing was run.');
    return;
  }

  console.log(`\nsite-policy-prompt-v1 · ${provider} · ${model}`);

  for (const pair of pairs) {
    // Sequential, so a failure halfway leaves the earlier reports on screen rather than losing
    // the whole run — the same reason the extension's own run loop is sequential (S5).
    try {
      const fresh = await runPrompt(pair, { provider, apiKey, model });
      console.log(report(pair, fresh as SitePolicyAnalysis));
    } catch (error) {
      console.log(`\n── ${pair.corpus.domain} · ${pair.hash.slice(0, 8)} ── FAILED`);
      console.log(`  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(
    [
      ``,
      `Read this, do not score it. A divergence can mean the prompt is worse, or that the analyst`,
      `saw something a fresh read would not, or that two competent readers picked different`,
      `exposures out of the same clause. The question to ask of each block above is whether the`,
      `prompt's findings are the kind a reader needed — not whether they match.`,
      ``,
    ].join('\n'),
  );
};

void main();

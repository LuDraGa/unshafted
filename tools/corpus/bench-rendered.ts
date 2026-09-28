/**
 * Rendered-read bench — may a document read by OPENING it ever be called "changed"? (A5)
 *
 * Run:  node --import tsx tools/corpus/bench-rendered.ts --label=<name> [--loads=N] [--group=<g>]
 *         [--only=<substring>] [--control] [--concurrency=N] [--force]
 *
 * A5 reads a document whose raw HTML is not a document by opening the page and reading the DOM
 * JavaScript builds (`readPolicyPage` in core). The content hash is the version (AD-1), so a
 * rendered read is only worth comparing if the same page, loaded again, hashes the same. If it does
 * not, the panel would report a changed policy every time a clock ticked or a banner rotated —
 * the phantom-change failure the normalizer exists to prevent. This measures it before any
 * rendered read is allowed to claim anything.
 *
 * EVERY READ IS THE SHIPPED ONE. The raw read is core's `fetchPolicyPage`, run inside a real
 * extension page; the rendered read is shared's `readInBackgroundTab` with core's
 * `readRenderedPageInPage`, run by that same extension — a background tab, opened, read and closed,
 * exactly as the panel does it on a reader's click (see `extension-fetch.ts`). Loads of one URL are
 * sequential, in the extension's one profile, so the first load is cold and later ones carry
 * whatever cookies and consent state the first left behind — as a person's second visit would.
 *
 * TARGETS, by group:
 *   bench     the discovery bench's hand-picked documents (`bench-sites.ts`)
 *   packaged  the analysed corpus documents, each at its own `sourceUrl`
 *   f5        the Part 3 capture's thin documents: myntra, swiggy, icicibank, adobe, whatsapp
 * A target is opened only when its raw read is not a document — which is exactly when the panel
 * would open it. `--control` also opens up to 12 raw documents once, to see whether a
 * server-rendered page read rendered hashes like its raw read (it is not expected to; the two
 * readings are never compared in the product).
 *
 * Runs are written to `corpus/bench/rendered-<label>.json` (gitignored, like the discovery runs).
 */
import { BENCH_SITES } from './bench-sites.js';
import { extensionLaunchOptions, openExtensionFetcher } from './extension-fetch.js';
import { readInBackgroundTab } from '../../packages/shared/lib/utils/policy-capture.js';
import { judgePolicyPage } from '../../packages/unshafted-core/lib/site-policy/likeness.js';
import { computePolicyHash } from '../../packages/unshafted-core/lib/site-policy/normalize.js';
import {
  fetchPolicyPage,
  readPolicyPage,
  readRenderedPageInPage,
} from '../../packages/unshafted-core/lib/site-policy/read.js';
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PolicyPageKind } from '../../packages/unshafted-core/lib/site-policy/likeness.js';
import type { PolicyPageRead } from '../../packages/unshafted-core/lib/site-policy/read.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BENCH_DIR = path.join(ROOT, 'corpus', 'bench');
const ANALYSIS_DIR = path.join(ROOT, 'corpus', 'analysis');
const SITES_DIR = path.join(ROOT, 'corpus', 'sites');

/** Same posture as the capture and the discovery bench: see `REAL_USER_AGENT` in capture.ts. */
const REAL_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

const F5_DOMAINS = ['myntra.com', 'swiggy.com', 'icicibank.com', 'adobe.com', 'whatsapp.com'];
const CONTROL_LIMIT = 12;
/** Lines kept per side of a differing pair: enough to see what varies, not a copy of the page. */
const DIFF_LINES = 8;
const DIFF_LINE_CHARS = 160;

type Group = 'bench' | 'packaged' | 'f5';
type Target = { url: string; group: Group; label: string };

type Load = {
  ms: number;
  opened: boolean;
  kind: PolicyPageKind | null;
  proseChars: number | null;
  hash: string | null;
  length: number | null;
  finalUrl: string | null;
};

type TargetResult = Target & {
  raw: PolicyPageRead['status'] | 'not-html';
  rawReason?: string;
  rawHash?: string;
  /** Why it was opened: the raw read was not a document (or `--control`). */
  opened: 'not-a-document' | 'control' | null;
  loads: Load[];
  /** Over the loads that read as a document: do they all hash alike? Null with fewer than two. */
  stable: boolean | null;
  /** Control only: does the rendered read hash like the raw one? */
  matchesRaw?: boolean;
  diff?: { onlyFirst: string[]; onlyLater: string[]; load: number };
};

const arg = (name: string): string | null => {
  const hit = process.argv.find(value => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);
const git = (...args: string[]): string => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

const collectTargets = async (): Promise<Target[]> => {
  const targets: Target[] = [];

  for (const site of BENCH_SITES) {
    for (const expectation of site.expected) {
      const url = expectation.urls[0];
      if (url) targets.push({ url, group: 'bench', label: `${site.domain} ${expectation.docType}` });
    }
  }

  for (const file of (await readdir(ANALYSIS_DIR)).filter(name => name.endsWith('.json')).sort()) {
    const analysis = JSON.parse(await readFile(path.join(ANALYSIS_DIR, file), 'utf8')) as {
      sourceUrl: string;
      domain: string;
      docType: string;
    };
    targets.push({ url: analysis.sourceUrl, group: 'packaged', label: `${analysis.domain} ${analysis.docType}` });
  }

  for (const domain of F5_DOMAINS) {
    const file = path.join(SITES_DIR, `${domain}.json`);
    if (!existsSync(file)) continue;
    const capture = JSON.parse(await readFile(file, 'utf8')) as {
      documents: { chosenUrl: string; docType: string | null; status: string }[];
    };
    for (const document of capture.documents) {
      if (document.docType !== 'privacy' && document.docType !== 'terms') continue;
      if (document.status === 'captured') continue;
      targets.push({ url: document.chosenUrl, group: 'f5', label: `${domain} ${document.docType}` });
    }
  }

  // One URL is one target, whichever group names it first.
  const seen = new Set<string>();
  return targets.filter(target => (seen.has(target.url) ? false : (seen.add(target.url), true)));
};

const difference = (first: string, later: string) => {
  const firstLines = new Set(first.split('\n'));
  const laterLines = new Set(later.split('\n'));
  const clip = (lines: string[]) => lines.slice(0, DIFF_LINES).map(line => line.slice(0, DIFF_LINE_CHARS));
  return {
    onlyFirst: clip([...firstLines].filter(line => !laterLines.has(line))),
    onlyLater: clip([...laterLines].filter(line => !firstLines.has(line))),
  };
};

const main = async () => {
  const label = arg('label');
  if (!label || !/^[\w.-]+$/.test(label)) throw new Error('Pass --label=<name> (letters, digits, . _ -).');
  const outputPath = path.join(BENCH_DIR, `rendered-${label}.json`);
  if (existsSync(outputPath) && !flag('force')) throw new Error(`${outputPath} exists; pass --force to overwrite.`);

  const loads = Number(arg('loads') ?? '2');
  const concurrency = Number(arg('concurrency') ?? '4');
  const group = arg('group');
  const only = arg('only');
  const control = flag('control');

  let targets = await collectTargets();
  if (group) targets = targets.filter(target => target.group === group);
  if (only) targets = targets.filter(target => target.url.includes(only) || target.label.includes(only));
  console.log(`[rendered] ${targets.length} target(s), ${loads} load(s) each when opened, concurrency ${concurrency}`);

  await mkdir(BENCH_DIR, { recursive: true });
  const launch = extensionLaunchOptions(REAL_USER_AGENT);
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    ignoreDefaultArgs: launch.ignoreDefaultArgs,
    args: ['--disable-blink-features=AutomationControlled', ...(launch.args ?? [])],
  });
  const fetcher = await openExtensionFetcher(browser, path.join(BENCH_DIR, '.probe-extension'));
  const fetchPage = fetcher.fetchWith(String(fetchPolicyPage));
  const render = fetcher.renderWith(String(readInBackgroundTab), String(readRenderedPageInPage));

  const results: TargetResult[] = [];
  let controls = 0;
  const cursor = { index: 0 };

  const worker = async () => {
    for (;;) {
      const target = targets[cursor.index];
      cursor.index += 1;
      if (!target) break;

      const raw = await readPolicyPage(target.url, fetchPage);
      const result: TargetResult = { ...target, raw: raw.status, opened: null, loads: [], stable: null };
      if (raw.status === 'unreadable') result.rawReason = raw.reason;
      if (raw.status === 'document') result.rawHash = (await computePolicyHash(raw.html)).hash;

      const notHtml = raw.status === 'unreadable' && raw.reason === 'not-html';
      if (raw.status !== 'document' && !notHtml) result.opened = 'not-a-document';
      else if (raw.status === 'document' && control && controls < CONTROL_LIMIT) {
        controls += 1;
        result.opened = 'control';
      }

      const texts: (string | null)[] = [];
      const times = result.opened === 'control' ? 1 : result.opened ? loads : 0;
      for (let load = 0; load < times; load += 1) {
        const started = Date.now();
        const page = await render(target.url);
        const entry: Load = {
          ms: Date.now() - started,
          opened: Boolean(page?.html),
          kind: null,
          proseChars: null,
          hash: null,
          length: null,
          finalUrl: page?.url ?? null,
        };
        let text: string | null = null;
        if (page?.html) {
          const judgement = judgePolicyPage(page.html);
          const { hash, normalized } = await computePolicyHash(page.html);
          Object.assign(entry, {
            kind: judgement.kind,
            proseChars: judgement.proseChars,
            hash,
            length: normalized.length,
          });
          text = normalized.text;
        }
        result.loads.push(entry);
        texts.push(text);
      }

      const documents = result.loads.filter(entry => entry.kind === 'document');
      if (result.opened === 'not-a-document' && documents.length >= 2) {
        result.stable = documents.every(entry => entry.hash === documents[0]!.hash);
        if (!result.stable) {
          const firstIndex = result.loads.findIndex(entry => entry.kind === 'document');
          const laterIndex = result.loads.findIndex(
            (entry, index) => index > firstIndex && entry.kind === 'document' && entry.hash !== documents[0]!.hash,
          );
          result.diff = { ...difference(texts[firstIndex] ?? '', texts[laterIndex] ?? ''), load: laterIndex };
        }
      }
      if (result.opened === 'control') result.matchesRaw = result.loads[0]?.hash === result.rawHash;

      results.push(result);
      const summary = result.loads
        .map(entry => `${entry.kind ?? 'failed'}:${entry.hash?.slice(0, 8) ?? '-'}`)
        .join(' ');
      console.log(
        `[rendered] ${target.group.padEnd(8)} ${target.label.padEnd(34)} raw ${raw.status}${
          result.rawReason ? ` (${result.rawReason})` : ''
        }${result.opened ? ` → ${summary}` : ''}${result.stable === false ? '  UNSTABLE' : ''}`,
      );
    }
  };

  try {
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally {
    await browser.close();
  }

  const order = new Map(targets.map((target, index) => [target.url, index]));
  results.sort((left, right) => (order.get(left.url) ?? 0) - (order.get(right.url) ?? 0));
  await writeFile(
    outputPath,
    `${JSON.stringify({ label, ranAt: new Date().toISOString(), gitSha: git('rev-parse', 'HEAD'), gitDirty: git('status', '--porcelain').length > 0, loads, results }, null, 2)}\n`,
    'utf8',
  );

  console.log('');
  for (const name of ['bench', 'packaged', 'f5'] as const) {
    const inGroup = results.filter(result => result.group === name);
    if (inGroup.length === 0) continue;
    const opened = inGroup.filter(result => result.opened === 'not-a-document');
    const becameDocument = opened.filter(result => result.loads.some(entry => entry.kind === 'document'));
    const compared = opened.filter(result => result.stable !== null);
    const stable = compared.filter(result => result.stable);
    console.log(
      `[rendered] ${name.padEnd(8)} ${inGroup.length} targets · raw document ${
        inGroup.filter(result => result.raw === 'document').length
      } · opened ${opened.length} · read as a document ${becameDocument.length} · stable ${stable.length}/${compared.length}`,
    );
  }
  const controlled = results.filter(result => result.opened === 'control');
  if (controlled.length > 0) {
    console.log(
      `[rendered] control  rendered hash equals raw hash on ${controlled.filter(result => result.matchesRaw).length}/${controlled.length}`,
    );
  }
  for (const result of results.filter(item => item.stable === false)) {
    console.log(`\n[rendered] UNSTABLE ${result.label} — ${result.url}`);
    for (const line of result.diff?.onlyFirst ?? []) console.log(`   - ${line}`);
    for (const line of result.diff?.onlyLater ?? []) console.log(`   + ${line}`);
  }
  console.log(`\n[rendered] written to ${path.relative(ROOT, outputPath)}`);
};

await main();

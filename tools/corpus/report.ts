/**
 * Manifest → findings.
 *
 * Run: node --import tsx tools/corpus/report.ts
 *
 * Everything here is counted from `corpus/manifest.json`. Nothing is judged: this reports what
 * the shipped discovery did and what the transports returned, and stops there. No severity, no
 * risk, no claim about any company.
 *
 * The v2 capture in two weeks runs the same script against the same set, so the numbers are
 * comparable by construction.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CorpusManifest, CapturedDocument } from './types.js';
import type { SiteTag } from './sites.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const pct = (part: number, whole: number) => (whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`);

const countBy = <T>(items: T[], key: (item: T) => string): [string, number][] => {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
};

const main = async () => {
  const manifest = JSON.parse(
    await readFile(path.join(ROOT, 'corpus/manifest.json'), 'utf8'),
  ) as CorpusManifest;

  const sites = manifest.sites;
  const docs = sites.flatMap(site => site.documents);
  const captured = docs.filter(doc => doc.status === 'captured');

  const out: string[] = [];
  const line = (text = '') => out.push(text);

  line(`Capture ${manifest.captureId} — ${manifest.normalizerVersion} — egress ${manifest.egress.country} (${manifest.egress.city})`);
  line(`Chrome ${manifest.tooling.chrome ?? '?'} · Node ${manifest.tooling.node} · playwright-core ${manifest.tooling.playwrightCore}`);
  line();

  // ── Coverage ──
  const deadSites = sites.filter(site => site.homepage.finalUrl === null);
  const emptySites = sites.filter(site => site.homepage.candidateCount === 0 && site.homepage.finalUrl !== null);
  const sitesWithDocs = sites.filter(site => site.documents.some(doc => doc.status === 'captured'));

  line('## Coverage');
  line();
  line(`- Sites attempted: **${sites.length}**`);
  line(`- Sites with at least one captured document: **${sitesWithDocs.length}** (${pct(sitesWithDocs.length, sites.length)})`);
  line(`- Homepage unreachable: **${deadSites.length}**${deadSites.length ? ` — ${deadSites.map(s => s.domain).join(', ')}` : ''}`);
  line(`- Homepage reached but zero policy links found: **${emptySites.length}**${emptySites.length ? ` — ${emptySites.map(s => s.domain).join(', ')}` : ''}`);
  line(`- Documents attempted: **${docs.length}**, captured: **${captured.length}** (${pct(captured.length, docs.length)})`);
  line();
  line('| Outcome | Documents |');
  line('|---|---|');
  for (const [status, count] of countBy(docs, doc => doc.status)) line(`| \`${status}\` | ${count} |`);
  line();

  // ── Tag coverage ──
  const tagSites = new Map<SiteTag, number>();
  const tagCovered = new Map<SiteTag, number>();
  for (const site of sites) {
    const hasDoc = site.documents.some(doc => doc.status === 'captured');
    for (const tag of site.tags) {
      tagSites.set(tag, (tagSites.get(tag) ?? 0) + 1);
      if (hasDoc) tagCovered.set(tag, (tagCovered.get(tag) ?? 0) + 1);
    }
  }
  line('## Tag members, after capture');
  line();
  line('Minimum-N for publishing a `peerShare` is 10. This is the column that decides which tags');
  line('can carry a peer baseline at all.');
  line();
  line('| Tag | Sites | With ≥1 document | Clears N=10 |');
  line('|---|---|---|---|');
  for (const [tag, total] of [...tagSites.entries()].sort((a, b) => b[1] - a[1])) {
    const covered = tagCovered.get(tag) ?? 0;
    line(`| \`${tag}\` | ${total} | ${covered} | ${covered >= 10 ? 'yes' : '**no**'} |`);
  }
  line();

  // ── Discovery: the bug report ──
  line('## What the shipped discovery did');
  line();

  const crossOrigin = docs.filter(doc => !doc.reachableByClient);
  const crossOriginHosts = countBy(crossOrigin, doc => doc.host ?? 'unknown');
  line(`### Cross-origin documents — unreachable by the client (AD-4)`);
  line();
  line(`**${crossOrigin.length} of ${docs.length}** discovered documents (${pct(crossOrigin.length, docs.length)}) live on a different origin than the site.`);
  line('The extension fetches from inside the page, so it cannot reach any of these.');
  line();
  if (crossOriginHosts.length > 0) {
    line('| Host | Documents |');
    line('|---|---|');
    for (const [host, count] of crossOriginHosts.slice(0, 15)) line(`| \`${host}\` | ${count} |`);
    line();
  }

  const untyped = docs.filter(doc => doc.docType === null);
  line('### Documents the classifier cannot type');
  line();
  line(`\`guessDocType\` returned \`null\` for **${untyped.length}** documents (${pct(untyped.length, docs.length)}) that`);
  line('`POLICY_LINK_PATTERN` had already accepted — collected, fetched, and then unclassifiable.');
  line();
  if (untyped.length > 0) {
    line('| Anchor text | URL |');
    line('|---|---|');
    for (const doc of untyped.slice(0, 20)) {
      line(`| ${doc.anchorText.replace(/\|/g, '\\|') || '—'} | \`${doc.chosenUrl.slice(0, 70)}\` |`);
    }
    line();
  }

  const pathGuesses = sites.flatMap(site => site.clientPicks.filter(pick => pick.source === 'path-guess'));
  const guessDocs = docs.filter(doc => doc.discoveredBy === 'path_guess');
  const guessOk = guessDocs.filter(doc => doc.status === 'captured');
  line('### Path-guess fallback');
  line();
  line(`\`choosePolicyUrl\` found no link and fabricated a URL **${pathGuesses.length}** times.`);
  line(`Of the fabricated URLs actually fetched, **${guessOk.length} of ${guessDocs.length}** (${pct(guessOk.length, guessDocs.length)}) returned a real document.`);
  line();

  const missed = sites.flatMap(site => site.missedCandidates.map(candidate => ({ ...candidate, domain: site.domain })));
  line('### Documents `POLICY_LINK_PATTERN` never collects');
  line();
  line(`**${missed.length}** footer links across **${new Set(missed.map(m => m.domain)).size}** sites name a policy document`);
  line('that the shipped regex does not match, so they are never collected, never typed, never captured.');
  line();
  if (missed.length > 0) {
    line('| Term | Occurrences | Example anchor |');
    line('|---|---|---|');
    const byTerm = countBy(missed, item => item.matchedTerm);
    for (const [term, count] of byTerm.slice(0, 20)) {
      const example = missed.find(item => item.matchedTerm === term);
      line(`| \`${term}\` | ${count} | ${(example?.text ?? '').replace(/\|/g, '\\|').slice(0, 50)} (${example?.domain}) |`);
    }
    line();
  }

  // ── Hash agreement ──
  line('## Hash agreement — browser transport vs plain Node fetch');
  line();
  const comparable = captured.filter(doc => doc.nodeFetch.agreesWithCanonical !== null);
  const agreed = comparable.filter(doc => doc.nodeFetch.agreesWithCanonical === true);
  const nodeBlocked = captured.filter(doc => doc.nodeFetch.status === 'http_error' || doc.nodeFetch.status === 'fetch_error');

  line(`Of **${captured.length}** documents captured canonically:`);
  line();
  line(`- **${nodeBlocked.length}** (${pct(nodeBlocked.length, captured.length)}) could not be fetched by plain Node at all — blocked, or transport failure.`);
  line(`- **${comparable.length}** produced a comparable Node hash.`);
  line(`- Of those, **${agreed.length}** agreed (${pct(agreed.length, comparable.length)}).`);
  line();
  line('This is the Part 2 Q4 problem, measured. A server that re-fetches a submission with a');
  line('plain `fetch()` and rejects on hash mismatch would reject honest submissions at this rate,');
  line('and could not verify the blocked set at all.');
  line();
  const disagreed = comparable.filter(doc => doc.nodeFetch.agreesWithCanonical === false);
  if (disagreed.length > 0) {
    line('| Document | Canonical chars | Node chars |');
    line('|---|---|---|');
    for (const doc of disagreed.slice(0, 20)) {
      line(`| \`${doc.chosenUrl.slice(0, 60)}\` | ${doc.normalizedLength} | ${doc.nodeFetch.normalizedLength} |`);
    }
    line();
  }

  // ── Thin documents ──
  const thin = docs.filter(doc => doc.status === 'thin');
  const thinRenderedBigger = thin.filter(
    doc => doc.rendered?.normalizedLength != null && doc.normalizedLength != null && doc.rendered.normalizedLength > doc.normalizedLength * 2,
  );
  line('## Thin documents — JS-rendered, or wrong URL?');
  line();
  line(`**${thin.length}** documents normalized to under 2,000 characters.`);
  line(`Of those, **${thinRenderedBigger.length}** got substantially larger once JavaScript ran —`);
  line('meaning the policy exists but is rendered client-side, and **the extension can never see it**,');
  line('because the client hashes raw HTML.');
  line();

  // ── Shared documents ──
  const byHash = new Map<string, Set<string>>();
  for (const site of sites) {
    for (const doc of site.documents) {
      // Only real documents. An empty page hashes to e3b0c442… like every other empty page, so
      // counting those as "shared" reports a coincidence of emptiness as a shared policy.
      if (!doc.contentHash || doc.status !== 'captured' || (doc.normalizedLength ?? 0) === 0) continue;
      if (!byHash.has(doc.contentHash)) byHash.set(doc.contentHash, new Set());
      byHash.get(doc.contentHash)!.add(site.domain);
    }
  }
  const shared = [...byHash.entries()].filter(([, domains]) => domains.size > 1);
  line('## One document, many sites');
  line();
  line(`**${shared.length}** documents are byte-identical across more than one site after normalization.`);
  line('Content-addressing handles this for free — one hash, one object, several index entries — but');
  line('`SitePolicyAnalysisSchema.domain` is a single string, so a standalone page rendered from one');
  line('of these objects names only one of the sites it actually governs.');
  line();
  if (shared.length > 0) {
    line('| Sites sharing a document | Hash |');
    line('|---|---|');
    for (const [hash, domains] of shared.slice(0, 15)) {
      line(`| ${[...domains].join(', ')} | \`${hash.slice(0, 12)}…\` |`);
    }
    line();
  }

  // ── What the chooser actually selected ──
  line('## What `choosePolicyUrl` actually selected');
  line();
  line('These are the URLs the SHIPPED chooser returned — what a user\'s extension would fetch and');
  line('present as that site\'s policy. Listed in full because the failures here are not statistical,');
  line('they are individually wrong in ways a count would hide.');
  line();
  line('| Site | Doc type | Selected URL | Normalized chars |');
  line('|---|---|---|---|');
  for (const site of sites) {
    for (const pick of site.clientPicks) {
      const doc = site.documents.find(candidate => candidate.chosenUrl === pick.url);
      if (!doc || doc.status !== 'captured') continue;
      line(`| ${site.domain} | \`${pick.docType}\` | \`${pick.url.slice(0, 72)}\` | ${doc.normalizedLength} |`);
    }
  }
  line();

  // ── Per-site table ──
  line('## Per site');
  line();
  line('| Domain | Links found | Docs captured | Cross-origin | Missed by regex |');
  line('|---|---|---|---|---|');
  for (const site of sites) {
    const siteCaptured = site.documents.filter((doc: CapturedDocument) => doc.status === 'captured').length;
    const siteCross = site.documents.filter((doc: CapturedDocument) => !doc.reachableByClient).length;
    line(`| ${site.domain} | ${site.homepage.candidateCount} | ${siteCaptured}/${site.documents.length} | ${siteCross} | ${site.missedCandidates.length} |`);
  }
  line();

  console.log(out.join('\n'));
};

void main();

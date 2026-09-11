import {
  candidateDomains,
  decodePolicyIndex,
  domainHashPrefix,
  encodePolicyIndex,
  lookupDomain,
  lookupHostname,
  POLICY_INDEX_HEADER_BYTES,
  POLICY_INDEX_MAX_BYTES,
  POLICY_INDEX_RECORD_BYTES,
} from '../index.mts';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PolicyIndexRecord } from '../index.mts';

const RECORDS: PolicyIndexRecord[] = [
  { domain: 'example.com', riskLevel: 'High', hasTimeSensitiveAction: true },
  { domain: 'example.org', riskLevel: 'Medium', hasTimeSensitiveAction: false },
  { domain: 'example.net', riskLevel: 'Low', hasTimeSensitiveAction: false },
  { domain: 'shop.example.com', riskLevel: 'Very High', hasTimeSensitiveAction: true },
  { domain: 'example.co.uk', riskLevel: 'Medium', hasTimeSensitiveAction: true },
];

const buildIndex = async () => decodePolicyIndex(await encodePolicyIndex(RECORDS));

test('index round-trips every record with its payload intact', async () => {
  const index = await buildIndex();
  assert.equal(index.recordCount, RECORDS.length);

  for (const record of RECORDS) {
    const entry = await lookupDomain(index, record.domain);
    assert.ok(entry, `${record.domain} missing from index`);
    assert.equal(entry.riskLevel, record.riskLevel);
    assert.equal(entry.hasTimeSensitiveAction, record.hasTimeSensitiveAction);
  }
});

test('index reports misses rather than guessing', async () => {
  const index = await buildIndex();
  assert.equal(await lookupDomain(index, 'not-in-the-corpus.test'), null);
  assert.equal(await lookupDomain(index, 'example.io'), null);
});

test('records are sorted so binary search is valid', async () => {
  const index = await buildIndex();
  for (let i = 1; i < index.recordCount; i += 1) {
    assert.ok(index.prefixes[i - 1]! < index.prefixes[i]!, `records unsorted at ${i}`);
  }
});

test('encoded size matches the documented 16-byte header + 9-byte records', async () => {
  const bytes = await encodePolicyIndex(RECORDS);
  assert.equal(bytes.byteLength, POLICY_INDEX_HEADER_BYTES + RECORDS.length * POLICY_INDEX_RECORD_BYTES);
});

test('a 5k-domain index stays inside the size budget', async () => {
  const many: PolicyIndexRecord[] = Array.from({ length: 5_000 }, (_, i) => ({
    domain: `site-${i}.example`,
    riskLevel: 'Medium',
    hasTimeSensitiveAction: false,
  }));

  const bytes = await encodePolicyIndex(many);
  assert.equal(bytes.byteLength, POLICY_INDEX_HEADER_BYTES + 5_000 * POLICY_INDEX_RECORD_BYTES);
  assert.ok(bytes.byteLength < 50 * 1024, `expected ~45 KB, got ${bytes.byteLength}`);
  assert.ok(bytes.byteLength < POLICY_INDEX_MAX_BYTES);

  // Every record still resolves after a full sort + binary search at scale.
  const index = decodePolicyIndex(bytes);
  assert.ok(await lookupDomain(index, 'site-0.example'));
  assert.ok(await lookupDomain(index, 'site-4999.example'));
  assert.equal(await lookupDomain(index, 'site-5000.example'), null);
});

test('decode rejects corrupt input instead of returning garbage', async () => {
  const bytes = await encodePolicyIndex(RECORDS);

  assert.throws(() => decodePolicyIndex(new Uint8Array(4)), /truncated/i);

  const badMagic = bytes.slice();
  badMagic[0] = 0x00;
  assert.throws(() => decodePolicyIndex(badMagic), /magic/i);

  const badVersion = bytes.slice();
  badVersion[4] = 99;
  assert.throws(() => decodePolicyIndex(badVersion), /format version/i);

  assert.throws(() => decodePolicyIndex(bytes.slice(0, bytes.byteLength - 1)), /length mismatch/i);
});

test('candidate walk goes most-specific-first and never reaches a bare TLD', () => {
  assert.deepEqual(candidateDomains('www.foo.co.uk'), ['www.foo.co.uk', 'foo.co.uk', 'co.uk']);
  assert.deepEqual(candidateDomains('example.com'), ['example.com']);
  assert.deepEqual(candidateDomains('localhost'), []);
  assert.deepEqual(candidateDomains('192.168.1.10'), []);
  assert.deepEqual(candidateDomains(''), []);

  // Trailing-dot FQDNs and casing are normalized.
  assert.deepEqual(candidateDomains('WWW.Example.COM.'), ['www.example.com', 'example.com']);

  // Deep subdomains stay bounded rather than costing one digest per label.
  const deep = candidateDomains('a.b.c.d.e.f.g.h.example.com');
  assert.ok(deep.length <= 6, `expected a bounded walk, got ${deep.length}`);
  assert.equal(deep.at(-1), 'example.com');
});

test('hostname lookup prefers the most specific covered domain', async () => {
  const index = await buildIndex();

  // shop.example.com is indexed in its own right and must win over example.com.
  const shop = await lookupHostname(index, 'shop.example.com');
  assert.equal(shop?.domain, 'shop.example.com');
  assert.equal(shop?.entry.riskLevel, 'Very High');

  // An uncovered subdomain falls back to its parent.
  const blog = await lookupHostname(index, 'blog.example.com');
  assert.equal(blog?.domain, 'example.com');
  assert.equal(blog?.entry.riskLevel, 'High');

  // Multi-label suffixes resolve without any Public Suffix List at runtime.
  const uk = await lookupHostname(index, 'www.example.co.uk');
  assert.equal(uk?.domain, 'example.co.uk');

  assert.equal(await lookupHostname(index, 'unrelated.test'), null);
  assert.equal(await lookupHostname(index, 'localhost'), null);
});

test('domain hash prefix is stable and domain-specific', async () => {
  const a = await domainHashPrefix('example.com');
  const b = await domainHashPrefix('example.com');
  const c = await domainHashPrefix('example.org');

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(typeof a, 'bigint');
});

test('encoding refuses a hash prefix collision rather than shipping ambiguity', async () => {
  await assert.rejects(
    encodePolicyIndex([
      { domain: 'example.com', riskLevel: 'Low', hasTimeSensitiveAction: false },
      { domain: 'example.com', riskLevel: 'High', hasTimeSensitiveAction: true },
    ]),
    /collision/i,
  );
});

// ── Seed validation ──

test('seed parsing normalizes domains and defaults the time-sensitive flag', async () => {
  const { parsePolicySeed } = await import('../index.mts');
  const { records, warnings } = parsePolicySeed({
    domains: [
      { domain: 'Example.COM.', riskLevel: 'High', hasTimeSensitiveAction: true },
      { domain: 'example.org', riskLevel: 'Low' },
    ],
  });

  assert.equal(records[0]?.domain, 'example.com');
  assert.equal(records[1]?.hasTimeSensitiveAction, false);
  assert.equal(warnings.length, 1);
});

test('seed parsing rejects a multi-tenant public suffix', async () => {
  const { parsePolicySeed } = await import('../index.mts');
  assert.throws(
    () => parsePolicySeed({ domains: [{ domain: 'herokuapp.com', riskLevel: 'High' }] }),
    /multi-tenant public suffix/i,
  );
  assert.throws(
    () => parsePolicySeed({ domains: [{ domain: 'co.uk', riskLevel: 'High' }] }),
    /multi-tenant public suffix/i,
  );
});

test('seed parsing rejects malformed entries', async () => {
  const { parsePolicySeed } = await import('../index.mts');
  assert.throws(() => parsePolicySeed({ domains: [{ riskLevel: 'High' }] }), /no domain/i);
  assert.throws(() => parsePolicySeed({ domains: [{ domain: 'localhost', riskLevel: 'High' }] }), /registrable/i);
  assert.throws(
    () => parsePolicySeed({ domains: [{ domain: 'example.com', riskLevel: 'Catastrophic' }] }),
    /invalid risk level/i,
  );
  assert.throws(
    () =>
      parsePolicySeed({
        domains: [
          { domain: 'example.com', riskLevel: 'Low' },
          { domain: 'EXAMPLE.com', riskLevel: 'High' },
        ],
      }),
    /more than once/i,
  );
});

test('the shipped seed builds into a working index', async () => {
  const { parsePolicySeed } = await import('../index.mts');
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');

  const seedPath = fileURLToPath(new URL('../../../chrome-extension/policy-seed.json', import.meta.url));
  const { records } = parsePolicySeed(JSON.parse(readFileSync(seedPath, 'utf8')));

  assert.ok(records.length > 0, 'shipped seed is empty');

  const index = decodePolicyIndex(await encodePolicyIndex(records));
  assert.equal(index.recordCount, records.length);

  for (const record of records) {
    assert.ok(await lookupDomain(index, record.domain), `${record.domain} missing after build`);
  }
});

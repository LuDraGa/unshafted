import type { RiskLevel } from '../types.js';

/**
 * Bundled domain-coverage index — the local, zero-network answer to "is this site covered?"
 * (AD-2's domain check). It never answers "what does the policy say"; that is the hash check,
 * and it only runs on popup open.
 *
 * Layout — 16-byte header, then fixed 9-byte records sorted ascending by prefix:
 *
 *   header  [0..3]   magic 'UNSF'
 *           [4]      format version
 *           [5]      flags (reserved, must be 0)
 *           [6..7]   reserved
 *           [8..11]  uint32 record count, big-endian
 *           [12..15] reserved
 *
 *   record  [0..7]   first 8 bytes of sha256(domain), big-endian
 *           [8]      payload — bits 0-1 risk level, bit 2 time-sensitive action, 3-7 reserved
 *
 * Sorted array + binary search, NOT a bloom filter (AD-5): at 5k domains this is ~45 KB, exact,
 * and has no false positives. Bloom only pays above ~100k entries.
 *
 * Collision safety: 64-bit prefix, n = 5,000 → birthday probability ≈ n²/2^65 ≈ 7e-13.
 */

const POLICY_INDEX_MAGIC = 0x554e5346; // 'UNSF'
const POLICY_INDEX_FORMAT_VERSION = 1;
const POLICY_INDEX_HEADER_BYTES = 16;
const POLICY_INDEX_RECORD_BYTES = 9;

/** Build fails above this — a slow cold start is worse than incomplete coverage. */
const POLICY_INDEX_MAX_BYTES = 256 * 1024;

const RISK_LEVELS = ['Low', 'Medium', 'High', 'Very High'] as const satisfies readonly RiskLevel[];

/**
 * Hostnames are walked most-specific-first, so a deep subdomain does not cost an unbounded
 * number of digests. Registrable domains are 2–3 labels in practice; 7 is generous headroom
 * for deliberate subdomain entries.
 */
const MAX_CANDIDATE_LABELS = 7;

type PolicyIndexEntry = {
  riskLevel: RiskLevel;
  hasTimeSensitiveAction: boolean;
};

type PolicyIndexRecord = PolicyIndexEntry & { domain: string };

type PolicyIndex = {
  formatVersion: number;
  recordCount: number;
  /** Sorted ascending. Exposed for tests; use `lookupDomain` / `lookupHostname` instead. */
  prefixes: BigUint64Array;
  payloads: Uint8Array;
};

const encodePayload = (entry: PolicyIndexEntry): number => {
  const level = RISK_LEVELS.indexOf(entry.riskLevel as (typeof RISK_LEVELS)[number]);
  if (level < 0) throw new Error(`Unknown risk level: ${entry.riskLevel}`);
  return (level & 0b11) | (entry.hasTimeSensitiveAction ? 0b100 : 0);
};

const decodePayload = (byte: number): PolicyIndexEntry => ({
  riskLevel: RISK_LEVELS[byte & 0b11]!,
  hasTimeSensitiveAction: (byte & 0b100) !== 0,
});

/**
 * First 8 bytes of sha256(domain) as a big-endian u64.
 *
 * Shared by the build step and the runtime deliberately — one implementation means build-time
 * and runtime hashes cannot drift apart and silently lose coverage.
 */
const domainHashPrefix = async (domain: string): Promise<bigint> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(domain));
  return new DataView(digest).getBigUint64(0, false);
};

const encodePolicyIndex = async (records: PolicyIndexRecord[]): Promise<Uint8Array> => {
  const rows = await Promise.all(
    records.map(async record => ({ prefix: await domainHashPrefix(record.domain), payload: encodePayload(record) })),
  );
  rows.sort((left, right) => (left.prefix < right.prefix ? -1 : left.prefix > right.prefix ? 1 : 0));

  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i]!.prefix === rows[i - 1]!.prefix) {
      throw new Error('Hash prefix collision between two domains — widen the prefix before shipping.');
    }
  }

  const buffer = new ArrayBuffer(POLICY_INDEX_HEADER_BYTES + rows.length * POLICY_INDEX_RECORD_BYTES);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  view.setUint32(0, POLICY_INDEX_MAGIC, false);
  view.setUint8(4, POLICY_INDEX_FORMAT_VERSION);
  view.setUint32(8, rows.length, false);

  rows.forEach((row, i) => {
    const offset = POLICY_INDEX_HEADER_BYTES + i * POLICY_INDEX_RECORD_BYTES;
    view.setBigUint64(offset, row.prefix, false);
    bytes[offset + 8] = row.payload;
  });

  return bytes;
};

const decodePolicyIndex = (input: ArrayBuffer | Uint8Array): PolicyIndex => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < POLICY_INDEX_HEADER_BYTES) {
    throw new Error('Policy index is truncated: shorter than its header.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== POLICY_INDEX_MAGIC) {
    throw new Error('Policy index magic mismatch — not an Unshafted index.');
  }

  const formatVersion = view.getUint8(4);
  if (formatVersion !== POLICY_INDEX_FORMAT_VERSION) {
    throw new Error(`Unsupported policy index format version ${formatVersion}.`);
  }

  const recordCount = view.getUint32(8, false);
  const expected = POLICY_INDEX_HEADER_BYTES + recordCount * POLICY_INDEX_RECORD_BYTES;
  if (bytes.byteLength !== expected) {
    throw new Error(`Policy index length mismatch: expected ${expected} bytes, got ${bytes.byteLength}.`);
  }

  const prefixes = new BigUint64Array(recordCount);
  const payloads = new Uint8Array(recordCount);
  for (let i = 0; i < recordCount; i += 1) {
    const offset = POLICY_INDEX_HEADER_BYTES + i * POLICY_INDEX_RECORD_BYTES;
    prefixes[i] = view.getBigUint64(offset, false);
    payloads[i] = view.getUint8(offset + 8);
  }

  return { formatVersion, recordCount, prefixes, payloads };
};

const findPrefix = (index: PolicyIndex, prefix: bigint): PolicyIndexEntry | null => {
  let low = 0;
  let high = index.recordCount - 1;

  while (low <= high) {
    const mid = (low + high) >>> 1;
    const value = index.prefixes[mid]!;
    if (value === prefix) return decodePayload(index.payloads[mid]!);
    if (value < prefix) low = mid + 1;
    else high = mid - 1;
  }

  return null;
};

const lookupDomain = async (index: PolicyIndex, domain: string): Promise<PolicyIndexEntry | null> =>
  findPrefix(index, await domainHashPrefix(domain));

/**
 * Suffix candidates for a hostname, most specific first.
 *
 * DELIBERATELY NOT eTLD+1, and therefore deliberately free of any Public Suffix List
 * dependency at runtime. We are doing membership testing against a known finite set, which is
 * a weaker requirement than computing a registrable domain in general — so `www.foo.co.uk`
 * simply tries `www.foo.co.uk`, then `foo.co.uk`, then `co.uk`, and takes the first hit.
 *
 * That buys three things: no ~230 KB PSL in the bundle, no new dependency, and no
 * build-vs-runtime PSL snapshot drift — a bug class that would have silently erased coverage.
 *
 * The one case a PSL would catch is a multi-tenant public suffix (e.g. `herokuapp.com`) being
 * present in the index, which would wrongly attribute the host's policy to every tenant app.
 * That is prevented at BUILD time, where rejecting such entries is cheap, rather than at
 * runtime where it would cost every user the bundle size. See `make-policy-index-plugin.ts`.
 */
const candidateDomains = (hostname: string): string[] => {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host || host.includes(':') || host.includes('/')) return [];
  // Bare IPv4 literals have no registrable domain.
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return [];

  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return [];

  const candidates: string[] = [];
  for (let take = Math.min(labels.length, MAX_CANDIDATE_LABELS); take >= 2; take -= 1) {
    candidates.push(labels.slice(labels.length - take).join('.'));
  }

  return candidates;
};

/** Resolve a hostname against the index, most specific match wins. */
const lookupHostname = async (
  index: PolicyIndex,
  hostname: string,
): Promise<{ domain: string; entry: PolicyIndexEntry } | null> => {
  const candidates = candidateDomains(hostname);
  const prefixes = await Promise.all(candidates.map(domainHashPrefix));

  for (let i = 0; i < candidates.length; i += 1) {
    const entry = findPrefix(index, prefixes[i]!);
    if (entry) return { domain: candidates[i]!, entry };
  }

  return null;
};

export {
  POLICY_INDEX_MAGIC,
  POLICY_INDEX_FORMAT_VERSION,
  POLICY_INDEX_HEADER_BYTES,
  POLICY_INDEX_RECORD_BYTES,
  POLICY_INDEX_MAX_BYTES,
  domainHashPrefix,
  encodePolicyIndex,
  decodePolicyIndex,
  lookupDomain,
  candidateDomains,
  lookupHostname,
};
export type { PolicyIndexEntry, PolicyIndexRecord, PolicyIndex };

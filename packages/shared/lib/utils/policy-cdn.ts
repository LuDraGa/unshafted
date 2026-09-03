import { PolicyDomainIndexSchema, SitePolicyAnalysisSchema } from '@extension/unshafted-core';
import type { PolicyDocType, PolicyDomainIndex, SitePolicyAnalysis } from '@extension/unshafted-core';

/**
 * Read client for the static policy-analysis CDN.
 *
 * Analyses are content-addressed and therefore immutable (AD-1), so `/{hash}.json` is served
 * with `Cache-Control: immutable` and never needs revalidating. Freshness — the conditional GET
 * against `/d/{sha256(domain)}.json` — is M1d and deliberately not here.
 *
 * Never trust the wire: everything is Zod-validated before it reaches a caller.
 *
 * Privacy (AD-2): this is only ever called on popup open, for one hash the user asked about.
 * The per-page "is this covered?" question is answered from the bundled index with zero network.
 */

export type PolicyFetchResult =
  | { status: 'ok'; analysis: SitePolicyAnalysis }
  | { status: 'not-found' }
  | { status: 'unconfigured' }
  | { status: 'error'; message: string };

/** Empty base URL means the corpus is not wired up yet — a normal state, not an error. */
export const getPolicyCdnBaseUrl = (): string | null => {
  const raw = process.env['CEB_POLICY_CDN_URL']?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
};

export const fetchPolicyAnalysis = async (hash: string): Promise<PolicyFetchResult> => {
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    return { status: 'error', message: 'Invalid content hash.' };
  }

  const base = getPolicyCdnBaseUrl();
  if (!base) return { status: 'unconfigured' };

  try {
    const response = await fetch(`${base}/${hash}.json`, { credentials: 'omit' });
    if (response.status === 404) return { status: 'not-found' };
    if (!response.ok) return { status: 'error', message: `Corpus returned ${response.status}.` };

    const parsed = SitePolicyAnalysisSchema.safeParse(await response.json());
    if (!parsed.success) {
      return { status: 'error', message: 'Corpus returned an analysis this version cannot read.' };
    }

    if (parsed.data.contentHash !== hash) {
      return { status: 'error', message: 'Corpus returned an analysis for a different document.' };
    }

    return { status: 'ok', analysis: parsed.data };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Corpus request failed.' };
  }
};

// ── Freshness (M1d) ──

export type DomainIndexResult =
  | { status: 'ok'; index: PolicyDomainIndex; etag: string | null }
  | { status: 'not-modified' }
  | { status: 'not-found' }
  | { status: 'unconfigured' }
  | { status: 'error'; message: string };

/**
 * Per-domain freshness probe.
 *
 * A conditional GET, and deliberately nothing more: HTTP already solves incremental sync, so
 * there is no patch/delta protocol here and no scheduled pull anywhere. A `304` costs almost
 * nothing and is CDN-cached.
 *
 * The path is keyed by `sha256(domain)` rather than the domain itself so that the request does
 * not spell out where the user is browsing (AD-2). It fires only on popup open.
 */
export const fetchPolicyDomainIndex = async (
  domainHashHex: string,
  etag?: string | null,
): Promise<DomainIndexResult> => {
  const base = getPolicyCdnBaseUrl();
  if (!base) return { status: 'unconfigured' };

  try {
    const response = await fetch(`${base}/d/${domainHashHex}.json`, {
      credentials: 'omit',
      headers: etag ? { 'If-None-Match': etag } : undefined,
    });

    if (response.status === 304) return { status: 'not-modified' };
    if (response.status === 404) return { status: 'not-found' };
    if (!response.ok) return { status: 'error', message: `Corpus returned ${response.status}.` };

    const parsed = PolicyDomainIndexSchema.safeParse(await response.json());
    if (!parsed.success) return { status: 'error', message: 'Corpus returned an unreadable domain index.' };

    return { status: 'ok', index: parsed.data, etag: response.headers.get('ETag') };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Corpus request failed.' };
  }
};

/**
 * Normalized source text of an analyzed version, for local diffing.
 *
 * Not cached: these run 50–500 KB, and the only use is a one-shot comparison. Fetch, diff,
 * discard.
 */
export const fetchPolicySourceText = async (hash: string): Promise<string | null> => {
  const base = getPolicyCdnBaseUrl();
  if (!base || !/^[0-9a-f]{64}$/.test(hash)) return null;

  try {
    const response = await fetch(`${base}/${hash}.txt`, { credentials: 'omit' });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
};

// ── Analysis requests (M1d client half; server half is Part 2) ──

export type PolicySubmissionPayload = {
  domain: string;
  docType: PolicyDocType;
  sourceUrl: string;
  contentHash: string;
  normalizedText: string;
  normalizerVersion: string;
};

export type PolicySubmissionResult =
  | { status: 'queued' }
  | { status: 'unconfigured' }
  | { status: 'error'; message: string };

export const getPolicySubmitUrl = (): string | null => {
  const raw = process.env['CEB_POLICY_SUBMIT_URL']?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
};

/**
 * Send one user-initiated analysis request.
 *
 * This is the ONLY egress in the whole feature tied to a specific domain, and it happens only
 * because the user clicked a button that says so. That is what keeps this a consent-gated
 * signal rather than telemetry — the distinction the entire design rests on (Part 2 §Q2).
 *
 * `normalizerVersion` travels with the payload because the server must re-derive the hash with
 * the identical normalizer before publishing; without it, it cannot tell whether a mismatch
 * means a poisoned submission or just an older client.
 */
export const submitPolicyAnalysisRequest = async (
  payload: PolicySubmissionPayload,
): Promise<PolicySubmissionResult> => {
  const endpoint = getPolicySubmitUrl();
  if (!endpoint) return { status: 'unconfigured' };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) return { status: 'error', message: `Request failed (${response.status}).` };
    return { status: 'queued' };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'Request failed.' };
  }
};

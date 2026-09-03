import type { PolicyIndexRecord } from './index-format.js';
import type { RiskLevel } from '../types.js';

/**
 * Validation for the bundled index's build input.
 *
 * Lives here rather than in the Vite plugin so it is testable and so the rules travel with the
 * format they protect. The plugin is thin I/O around this.
 */

const RISK_LEVELS = new Set<RiskLevel>(['Low', 'Medium', 'High', 'Very High']);

/**
 * Multi-tenant hosts whose subdomains belong to unrelated parties.
 *
 * Runtime lookup walks hostname suffixes instead of computing eTLD+1, which keeps the Public
 * Suffix List out of the extension bundle entirely (see `index-format.ts`). The single failure
 * that choice exposes is a public suffix appearing IN the index: indexing `herokuapp.com` would
 * attribute Heroku's policy to every unrelated app hosted beneath it. Rejecting those at build
 * time closes that hole without shipping a PSL to every user.
 *
 * Not exhaustive by design — it only has to cover what the corpus actually indexes. The full
 * PSL check belongs in the Part 2 authoring pipeline, where a heavyweight dependency never
 * ships to anyone.
 */
export const MULTI_TENANT_SUFFIXES = new Set([
  'herokuapp.com', 'github.io', 'gitlab.io', 'netlify.app', 'vercel.app', 'pages.dev',
  'workers.dev', 'web.app', 'firebaseapp.com', 'azurewebsites.net', 'cloudfront.net',
  'amazonaws.com', 's3.amazonaws.com', 'appspot.com', 'blogspot.com', 'wordpress.com',
  'wixsite.com', 'squarespace.com', 'myshopify.com', 'notion.site', 'substack.com',
  'co.uk', 'org.uk', 'co.jp', 'com.au', 'com.br', 'co.in', 'co.nz', 'com.mx', 'co.za',
]);

export type PolicySeedEntry = {
  domain?: unknown;
  riskLevel?: unknown;
  hasTimeSensitiveAction?: unknown;
};

export type PolicySeed = {
  domains?: PolicySeedEntry[];
};

export type ParsedPolicySeed = {
  records: PolicyIndexRecord[];
  /** Non-fatal notes for the build log — e.g. a domain that needed normalizing. */
  warnings: string[];
};

export const parsePolicySeed = (seed: PolicySeed): ParsedPolicySeed => {
  const entries = seed.domains ?? [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const records = entries.map((entry, position): PolicyIndexRecord => {
    if (typeof entry.domain !== 'string' || !entry.domain.trim()) {
      throw new Error(`Policy seed entry ${position} has no domain.`);
    }

    const domain = entry.domain.trim().toLowerCase().replace(/\.$/, '');
    if (domain !== entry.domain) {
      warnings.push(`normalized "${entry.domain}" to "${domain}"`);
    }

    if (domain.split('.').filter(Boolean).length < 2) {
      throw new Error(`Policy seed domain "${domain}" is not a registrable domain.`);
    }

    if (MULTI_TENANT_SUFFIXES.has(domain)) {
      throw new Error(
        `Policy seed domain "${domain}" is a multi-tenant public suffix. Indexing it would ` +
          `attribute its policy to every unrelated site hosted beneath it.`,
      );
    }

    if (seen.has(domain)) {
      throw new Error(`Policy seed lists "${domain}" more than once.`);
    }

    if (typeof entry.riskLevel !== 'string' || !RISK_LEVELS.has(entry.riskLevel as RiskLevel)) {
      throw new Error(`Policy seed domain "${domain}" has an invalid risk level "${String(entry.riskLevel)}".`);
    }

    seen.add(domain);
    return {
      domain,
      riskLevel: entry.riskLevel as RiskLevel,
      hasTimeSensitiveAction: entry.hasTimeSensitiveAction === true,
    };
  });

  return { records, warnings };
};

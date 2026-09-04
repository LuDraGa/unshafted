import type { Market, SiteTag } from './sites.js';
import type { PolicyDocType } from '../../packages/unshafted-core/lib/site-policy/types.js';

/**
 * The manifest — the MAP, and the actual deliverable of this session.
 *
 * This is a capture-side artifact, not a published one. It records facts ABOUT documents
 * (where they live, what they hash to, how they were reached, what failed) and deliberately
 * carries no analysis: no severity, no risk level, no disclosure status. Those are the next
 * session's, and inventing one here would be a false claim about a real company.
 *
 * `corpus/manifest.json` is COMMITTED. The document text it points at is not — see
 * `corpus/README.md`.
 */

/** Where a document was presented. Only `footer` is machine-observable in this pass. */
export type DocumentSurface = 'footer' | 'signup' | 'checkout' | 'in_app';

export type CaptureStatus =
  /** Fetched, normalized and hashed. */
  | 'captured'
  /** Reached, but the normalized text is too short to be a real policy — SPA shell, wall, stub. */
  | 'thin'
  /** Non-2xx response. */
  | 'http_error'
  /** Transport failed entirely — DNS, TLS, timeout, connection reset. */
  | 'fetch_error'
  /** Served as a PDF. Recorded, deliberately not hashed: `computePolicyHash` takes HTML, and a
   *  second hashing path would fork the one thing that must never fork. */
  | 'pdf_not_captured'
  /** Not HTML and not PDF — an image, a zip, a redirect to an app store. */
  | 'unsupported_type';

/** A second fetch of the same URL by a different transport, for hash-agreement measurement. */
export type ComparisonFetch = {
  status: CaptureStatus;
  httpStatus: number | null;
  contentHash: string | null;
  normalizedLength: number | null;
  /** Whether this transport's hash equals the canonical one. Null when it could not be computed. */
  agreesWithCanonical: boolean | null;
  error?: string;
};

export type CapturedDocument = {
  /** URL as discovered, absolutised against the site homepage. */
  chosenUrl: string;
  /** After redirects. Differs from `chosenUrl` more often than you would expect. */
  finalUrl: string | null;
  /** Host of `finalUrl`. May differ from the site — `policies.google.com` serves three sites. */
  host: string | null;
  /**
   * False means the extension CANNOT fetch this document: AD-4 fetches from inside the page,
   * which is same-origin by construction. Counting these is one of this pass's outputs.
   */
  reachableByClient: boolean;

  /** `guessDocType` output. Null means the shipped classifier has no pattern for this document. */
  docType: PolicyDocType | null;
  anchorText: string;
  inFooterRegion: boolean;
  surfaces: DocumentSurface[];

  /** How this URL entered the capture set. */
  discoveredBy: 'footer_link' | 'client_pick' | 'path_guess';
  /** True when `choosePolicyUrl` would have selected this URL for its docType. */
  isClientPick: boolean;

  status: CaptureStatus;
  httpStatus: number | null;
  contentType: string | null;
  error?: string;

  /** SHA-256 over NORMALIZED text (AD-1). Null unless `status === 'captured'`. */
  contentHash: string | null;
  normalizedLength: number | null;
  /** False correlates with noisier text — the normalizer fell back to the whole document. */
  usedMainContainer: boolean | null;

  /** What a plain Node `fetch()` computes — i.e. what a Part 2 server would get. */
  nodeFetch: ComparisonFetch;
  /** Rendered DOM, captured ONLY when canonical text was thin, to separate SPA from bad URL. */
  rendered?: ComparisonFetch;

  capturedAt: string;
};

/**
 * A link the wide collector saw that the SHIPPED `POLICY_LINK_PATTERN` would never collect.
 * This is the "documents currently invisible to the corpus" measurement, and it is a bug report
 * against shipped code written from real data.
 */
export type MissedCandidate = {
  href: string;
  text: string;
  /** Which wide-pattern term matched, so the gap can be turned into a patch. */
  matchedTerm: string;
};

export type SiteCapture = {
  domain: string;
  tags: SiteTag[];
  market: Market;

  homepage: {
    requestedUrl: string;
    finalUrl: string | null;
    httpStatus: number | null;
    /** Candidates the SHIPPED in-page collector returned. */
    candidateCount: number;
    error?: string;
  };

  /** What `choosePolicyUrl` would pick per docType — the client's own answer, recorded verbatim. */
  clientPicks: { docType: PolicyDocType; url: string; source: 'link' | 'path-guess' }[];

  documents: CapturedDocument[];
  missedCandidates: MissedCandidate[];

  /** Machine-derivable observations about how the shipped discovery behaved here. */
  discoveryNotes: string[];
};

export type CorpusManifest = {
  /** Tag for the two-week normalizer-stability re-capture. v2 diffs hashes against this. */
  captureId: string;
  capturedAt: string;
  /** Every hash here is only meaningful under this normalizer. Bumping it invalidates all of them. */
  normalizerVersion: string;
  /** Jurisdiction provenance: the same URL serves different text to different countries. */
  egress: { country: string; region: string; city: string };
  tooling: { node: string; playwrightCore: string; chrome: string | null };
  sites: SiteCapture[];
};

import type { Market, SiteTag } from './sites.js';
import type { PolicyDocType, PolicyReadMode } from '../../packages/unshafted-core/lib/site-policy/types.js';

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
  /**
   * Reached, but not a document or a hub by A3's measure even after opening the page — a shell, a
   * wall. (Before S3 of the site coverage work: normalized text under 2,000 characters.)
   */
  | 'thin'
  /** A page that lists policy documents rather than being one (A3), even after opening it. */
  | 'hub'
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
   * Whether the extension can read this document at all. Always true since S2: the extension reads
   * every linked document itself, wherever it is hosted. It was false for a cross-origin document
   * while AD-4 (fetch from inside the page, same-origin by construction) stood, and older captures
   * still say so.
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
  /**
   * Which reading `contentHash` is over (A5): the raw HTML, or the page as JavaScript built it once
   * opened. On a document that could not be captured, whether opening it was tried. Absent on
   * captures made before S3, which were all raw.
   */
  readMode?: PolicyReadMode | null;

  /** What a plain Node `fetch()` computes — i.e. what a Part 2 server would get. */
  nodeFetch: ComparisonFetch;
  /**
   * Before S3 only: the rendered DOM of a document whose raw text was thin, recorded to tell an SPA
   * shell from a bad URL. Since S3 a rendered read is the canonical one when the raw HTML is not a
   * document (`readMode`), so nothing records this any more.
   */
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

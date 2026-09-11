import { capturePolicyDocument, discoverActiveTabPolicies } from '@extension/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PolicyDiscoveryResult, PolicyDocumentCapture } from '@extension/shared';
import type { PolicyDocType, RankedPolicyCandidate, SitePolicyAnalysis } from '@extension/unshafted-core';

/**
 * The live page check (D6) and the document reader's fetch cache (D9), in one hook because they
 * are one page read.
 *
 * D6 inverts what the popup did. The analysis is already on screen from the bundle before this
 * runs; the only question here is whether the live document still hashes to what we read. So:
 *
 *  - This NEVER blocks a render. Every state it produces is additive.
 *  - Failure is not an error state. Chrome refuses injection on its own pages, and 7 of 36
 *    domains host their policies cross-origin where an in-page fetch cannot reach them. Both
 *    land on `unconfirmed`, whose label is "as we read it on <date>" — the honest default, not
 *    a warning.
 *  - It runs once per tab and origin. The reason used to be permission: under `activeTab` the
 *    second attempt was the one without the gesture, so re-running downgraded a good `current`
 *    to `unconfirmed`. Standing host access removed that failure mode, and the rule survives it
 *    on cost alone — an in-site navigation is the same site's same documents, and re-reading
 *    them on every route change turns the panel into a crawler for no new information.
 *
 * The reader shares this hook's cache so that a document the check already fetched opens
 * instantly, and so that reading it costs no second request.
 */

/**
 * At most one fetch per document type we have an analysis for. A domain with three analyses
 * costs three same-origin requests from the page's own session; the cap stops a page with a
 * hundred footer links from turning the panel into a crawler.
 */
const MAX_CONFIRMATION_FETCHES = 4;

/**
 * How long the "looking at this page" state stays up, at minimum.
 *
 * A refused injection rejects in a couple of milliseconds — faster than a frame — so the whole
 * attempt was over before anything painted. That is the entire reason the retry button read as
 * dead: it *was* running, and finishing, before the eye could catch it. The floor is not a fake
 * delay to look busy; it is the difference between "nothing happened" and "we tried and could
 * not", which are two very different messages to a person.
 */
const MIN_VISIBLE_DISCOVERY_MS = 450;

/** Stable identity for "nothing fetched yet", so a render cannot churn a consumer's dependencies. */
const NO_READS: Record<string, ReaderEntry> = {};

/** Per bundled document, and deliberately per DOCUMENT rather than per site (D3). */
type DocumentFreshness =
  /** The live check has not finished — or has not been able to start. */
  | 'pending'
  /** The live page hashes to exactly what we read. */
  | 'current'
  /** We read the live page and it is a different document now. Renders under D7. */
  | 'changed'
  /** We could not read the live page. Says nothing about the document either way. */
  | 'unconfirmed';

type ReaderEntry = { state: 'loading' } | { state: 'done'; capture: PolicyDocumentCapture };

/** What a run answers for. Two runs are the same run when all four match. */
type RunIdentity = {
  tabId: number | null;
  origin: string | null;
  attemptCount: number;
  analyses: readonly SitePolicyAnalysis[];
};

/** One run's accumulated output, tagged with the identity it answers for. */
type Run = RunIdentity & {
  discovery: PolicyDiscoveryResult | null;
  discovering: boolean;
  freshness: Record<string, DocumentFreshness>;
  reads: Record<string, ReaderEntry>;
};

/**
 * `analyses` compares by reference deliberately. `useDomainAnalyses` returns the array straight out
 * of the corpus's `byDomain` map, so it is stable for a given domain and a re-resolve after an
 * in-site navigation is correctly NOT a new run.
 */
const isSameRun = (run: Run | null, identity: RunIdentity): run is Run =>
  run !== null &&
  run.tabId === identity.tabId &&
  run.origin === identity.origin &&
  run.attemptCount === identity.attemptCount &&
  run.analyses === identity.analyses;

type LivePolicyCheck = {
  /** Null until discovery has run. `documents` inside it is what the reader lists. */
  discovery: PolicyDiscoveryResult | null;
  /** True while the page is being looked at. The reader owes the user this; see the floor above. */
  discovering: boolean;
  /** True once the user has asked us to look again and it still did not work. */
  retried: boolean;
  freshness: Record<string, DocumentFreshness>;
  /** Keyed by absolute URL. Populated by the check itself and by the reader. */
  reads: Record<string, ReaderEntry>;
  readDocument: (url: string) => void;
  /**
   * Look at the page again, on a user's click.
   *
   * This button used to be a lie. Under `activeTab` the common failure was a revoked grant, and
   * no click inside this document could restore it — the retry re-issued the identical refused
   * injection and landed on the identical error, so the panel had to escalate to "click the
   * Unshafted icon in your toolbar", naming a gesture the user had to go and perform elsewhere.
   *
   * With standing host access that failure mode is gone, and every failure the button now faces
   * is one a second look can genuinely fix: a page that had not finished loading, an SPA that
   * renders its footer late, a tab that was mid-swap. It does what it says.
   */
  rediscover: () => void;
};

/**
 * The web origin, or null where there is no page we may read.
 *
 * The scheme check is load-bearing, not defensive. `new URL('chrome://extensions/').origin` is the
 * *string* `"null"`, which is truthy, so a bare origin read lets Chrome's own pages through the
 * guard below — harmless only for as long as something else stops the run. Until D16 that
 * something was the empty-analysis bail, and removing it moved the responsibility here.
 */
const originOf = (url: string | null): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
};

/** The best same-origin candidate for each document type we hold an analysis for. */
const confirmationTargets = (
  documents: readonly RankedPolicyCandidate[],
  wanted: ReadonlySet<PolicyDocType>,
): RankedPolicyCandidate[] => {
  const picked = new Map<PolicyDocType, RankedPolicyCandidate>();

  for (const document of documents) {
    // AD-4: a cross-origin policy host is not reachable from the page context, so trying it
    // would spend a request to learn nothing.
    if (!document.sameOrigin || !document.docType) continue;
    if (!wanted.has(document.docType) || picked.has(document.docType)) continue;
    picked.set(document.docType, document);
    if (picked.size >= MAX_CONFIRMATION_FETCHES) break;
  }

  return [...picked.values()];
};

const useLivePolicyCheck = (
  tabId: number | null,
  pageUrl: string | null,
  analyses: readonly SitePolicyAnalysis[],
): LivePolicyCheck => {
  /**
   * Everything one run produces, or null before the first result lands.
   *
   * One record rather than four `useState`s because all four reset together, and resetting them
   * used to be the first thing the effect below did. An effect runs after the render that
   * scheduled it, so that left one committed render showing the PREVIOUS page's discovery,
   * freshness and reads against the new tab — the panel briefly claiming to have read a page it
   * had not looked at yet. The record carries the identity of the run it belongs to and the
   * derivation at the bottom ignores it once that identity no longer matches, which removes the
   * frame instead of shortening it.
   */
  const [run, setRun] = useState<Run | null>(null);
  /**
   * Bumped by `rediscover`, so a user's click re-enters the effect below.
   *
   * Keyed by tab+origin as well as counted, because "you already tried this" is only true of the
   * page it was tried on. Without the key, one retry anywhere would carry its "still nothing"
   * copy onto every site the user browsed to afterwards.
   */
  const [attempt, setAttempt] = useState({ key: '', count: 0 });

  // The reader fetches against the tab discovery ran on, never a re-query of "the active tab".
  const readTabId = useRef<number | null>(null);
  /** URLs already fetched or in flight. A ref, so a re-render cannot re-request one. */
  const requested = useRef(new Set<string>());
  const origin = originOf(pageUrl);
  const attemptKey = `${tabId}:${origin}`;

  /** What the run in flight, or the next one, answers for. */
  const identity: RunIdentity = { tabId, origin, attemptCount: attempt.count, analyses };

  /** Every document pending, which is where a run starts and where a run that cannot start stays. */
  const pendingFreshness = useMemo(
    () => Object.fromEntries(analyses.map(analysis => [analysis.contentHash, 'pending' as const])),
    [analyses],
  );

  useEffect(() => {
    requested.current = new Set();

    /*
     * Coverage is NOT a precondition (D15). This used to bail on an empty analysis set, which is
     * every site outside the corpus — so discovery never ran there, `discovery` stayed null, and
     * the reader D15 added for exactly those sites sat on "Looking at the page…" forever. The
     * reader needs page access, not an analysis. With no analyses the run still costs one
     * discovery and no fetches: `confirmationTargets` is asked for no doc types.
     */
    if (tabId === null || !origin) return;

    let disposed = false;
    readTabId.current = tabId;

    /** What this run's record looks like before it has learned anything. */
    const started: Run = {
      tabId,
      origin,
      attemptCount: attempt.count,
      analyses,
      discovery: null,
      discovering: true,
      freshness: pendingFreshness,
      reads: {},
    };

    /*
     * Every write goes through here so a result can only ever land on its own run's record. The
     * `disposed` flag below already stops a superseded closure, and this is the belt to its
     * braces: if a record for some other run is in state, this run starts a fresh one rather than
     * merging into it.
     */
    const update = (change: (current: Run) => Partial<Run>) =>
      setRun(previous => {
        const current = isSameRun(previous, started) ? previous : started;
        return { ...current, ...change(current) };
      });

    const execute = async () => {
      const startedAt = Date.now();
      const found = await discoverActiveTabPolicies();

      // Hold the "looking" state to the floor, so an instant refusal is still something a person
      // can see happen. Only the DISPLAY waits; the confirmation fetches below are unaffected.
      const remaining = MIN_VISIBLE_DISCOVERY_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));

      if (disposed) return;
      update(() => ({ discovery: found, discovering: false }));

      // Nothing readable here. Every document keeps its "as we read it" label and no error shows.
      if (found.status !== 'discovered') {
        update(() => ({
          freshness: Object.fromEntries(analyses.map(analysis => [analysis.contentHash, 'unconfirmed' as const])),
        }));
        return;
      }

      readTabId.current = found.tabId;

      const byHash = new Map(analyses.map(analysis => [analysis.contentHash, analysis]));
      const byDocType = new Map<PolicyDocType, SitePolicyAnalysis[]>();
      for (const analysis of analyses) {
        byDocType.set(analysis.docType, [...(byDocType.get(analysis.docType) ?? []), analysis]);
      }

      for (const target of confirmationTargets(found.documents, new Set(byDocType.keys()))) {
        requested.current.add(target.url);
        const capture = await capturePolicyDocument(found.tabId, target.url);
        if (disposed) return;

        update(current => ({ reads: { ...current.reads, [target.url]: { state: 'done', capture } } }));
        if (capture.status !== 'captured') continue;

        const matched = byHash.get(capture.hash);
        if (matched) {
          update(current => ({ freshness: { ...current.freshness, [matched.contentHash]: 'current' } }));
          continue;
        }

        /*
         * The hash missed. We can only call a specific document "changed" when exactly one of
         * our analyses is of this type — with two terms documents on one domain we do not know
         * which one we just fetched, and guessing would attach a "this changed" claim to a
         * document we never looked at. Ambiguity stays `unconfirmed`.
         */
        const sameType = target.docType ? (byDocType.get(target.docType) ?? []) : [];
        if (sameType.length === 1) {
          update(current => ({ freshness: { ...current.freshness, [sameType[0]!.contentHash]: 'changed' } }));
        }
      }

      if (disposed) return;
      // Anything the run never reached is unconfirmed, which is the resting state, not a failure.
      update(current => ({
        freshness: Object.fromEntries(
          Object.entries(current.freshness).map(([hash, state]): [string, DocumentFreshness] => [
            hash,
            state === 'pending' ? 'unconfirmed' : state,
          ]),
        ),
      }));
    };

    void execute();

    return () => {
      disposed = true;
    };
  }, [tabId, origin, analyses, attempt.count, pendingFreshness]);

  const rediscover = useCallback(
    () => setAttempt(current => ({ key: attemptKey, count: current.count + 1 })),
    [attemptKey],
  );

  const readDocument = useCallback((url: string) => {
    const tab = readTabId.current;
    if (tab === null || requested.current.has(url)) return;

    requested.current.add(url);
    /*
     * Merges into whichever run record is in state, and does nothing if there is none. The reader
     * lists documents out of `discovery`, so a record always exists by the time this is reachable —
     * and if one somehow is not there, there is no discovery to read against either.
     */
    const merge = (entry: ReaderEntry) =>
      setRun(previous => (previous ? { ...previous, reads: { ...previous.reads, [url]: entry } } : previous));

    merge({ state: 'loading' });

    void capturePolicyDocument(tab, url).then(capture => {
      merge({ state: 'done', capture });
    });
  }, []);

  /*
   * Derived, not reset in the effect. A record that answers for a different tab, origin, attempt
   * or analysis set is not this run's, so it is ignored rather than overwritten later — which is
   * what removes the frame of another page's results described on `run` above.
   */
  const current = isSameRun(run, identity) ? run : null;

  return {
    discovery: current?.discovery ?? null,
    // A run that cannot start is not looking, and that distinction is the whole of the retry copy.
    discovering: current?.discovering ?? (tabId !== null && origin !== null),
    retried: attempt.key === attemptKey && attempt.count > 0,
    freshness: current?.freshness ?? pendingFreshness,
    reads: current?.reads ?? NO_READS,
    readDocument,
    rediscover,
  };
};

export { useLivePolicyCheck };
export type { DocumentFreshness, ReaderEntry, LivePolicyCheck };

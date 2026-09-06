import { capturePolicyDocument, discoverActiveTabPolicies } from '@extension/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
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
 *  - Failure is not an error state. `activeTab` is revoked on navigation, Chrome refuses
 *    injection on its own pages, and 7 of 36 domains host their policies cross-origin where an
 *    in-page fetch cannot reach them. All of those land on `unconfirmed`, whose label is "as we
 *    read it on <date>" — the honest default, not a warning.
 *  - It runs once per tab and origin. Re-running after an in-site navigation would replace a
 *    good `current` with an `unconfirmed`, because the second attempt is the one without the
 *    gesture, and a panel that degrades as you browse is worse than one that does not try.
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

/** Per bundled document, and deliberately per DOCUMENT rather than per site (D3). */
export type DocumentFreshness =
  /** The live check has not finished — or has not been able to start. */
  | 'pending'
  /** The live page hashes to exactly what we read. */
  | 'current'
  /** We read the live page and it is a different document now. Renders under D7. */
  | 'changed'
  /** We could not read the live page. Says nothing about the document either way. */
  | 'unconfirmed';

export type ReaderEntry = { state: 'loading' } | { state: 'done'; capture: PolicyDocumentCapture };

export type LivePolicyCheck = {
  /** Null until discovery has run. `documents` inside it is what the reader lists. */
  discovery: PolicyDiscoveryResult | null;
  freshness: Record<string, DocumentFreshness>;
  /** Keyed by absolute URL. Populated by the check itself and by the reader. */
  reads: Record<string, ReaderEntry>;
  readDocument: (url: string) => void;
};

const originOf = (url: string | null): string | null => {
  if (!url) return null;
  try {
    return new URL(url).origin;
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

export const useLivePolicyCheck = (
  tabId: number | null,
  pageUrl: string | null,
  analyses: readonly SitePolicyAnalysis[],
): LivePolicyCheck => {
  const [discovery, setDiscovery] = useState<PolicyDiscoveryResult | null>(null);
  const [freshness, setFreshness] = useState<Record<string, DocumentFreshness>>({});
  const [reads, setReads] = useState<Record<string, ReaderEntry>>({});

  // The reader fetches against the tab discovery ran on, never a re-query of "the active tab".
  const readTabId = useRef<number | null>(null);
  /** URLs already fetched or in flight. A ref, so a re-render cannot re-request one. */
  const requested = useRef(new Set<string>());
  const origin = originOf(pageUrl);

  useEffect(() => {
    setDiscovery(null);
    setReads({});
    setFreshness(Object.fromEntries(analyses.map(analysis => [analysis.contentHash, 'pending' as const])));

    requested.current = new Set();

    if (tabId === null || !origin || analyses.length === 0) return;

    let disposed = false;
    readTabId.current = tabId;

    const run = async () => {
      const found = await discoverActiveTabPolicies();
      if (disposed) return;
      setDiscovery(found);

      // Nothing readable here. Every document keeps its "as we read it" label and no error shows.
      if (found.status !== 'discovered') {
        setFreshness(Object.fromEntries(analyses.map(analysis => [analysis.contentHash, 'unconfirmed' as const])));
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

        setReads(previous => ({ ...previous, [target.url]: { state: 'done', capture } }));
        if (capture.status !== 'captured') continue;

        const matched = byHash.get(capture.hash);
        if (matched) {
          setFreshness(previous => ({ ...previous, [matched.contentHash]: 'current' }));
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
          setFreshness(previous => ({ ...previous, [sameType[0]!.contentHash]: 'changed' }));
        }
      }

      if (disposed) return;
      // Anything the run never reached is unconfirmed, which is the resting state, not a failure.
      setFreshness(previous =>
        Object.fromEntries(
          Object.entries(previous).map(([hash, state]): [string, DocumentFreshness] => [
            hash,
            state === 'pending' ? 'unconfirmed' : state,
          ]),
        ),
      );
    };

    void run();

    return () => {
      disposed = true;
    };
  }, [tabId, origin, analyses]);

  const readDocument = useCallback((url: string) => {
    const tab = readTabId.current;
    if (tab === null || requested.current.has(url)) return;

    requested.current.add(url);
    setReads(previous => ({ ...previous, [url]: { state: 'loading' } }));

    void capturePolicyDocument(tab, url).then(capture => {
      setReads(current => ({ ...current, [url]: { state: 'done', capture } }));
    });
  }, []);

  return { discovery, freshness, reads, readDocument };
};

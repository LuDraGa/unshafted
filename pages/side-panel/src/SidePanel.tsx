import '@src/SidePanel.css';
import { AnalyseBar } from '@src/components/AnalyseBar';
import { WorstRisk } from '@src/components/AnalysisView';
import { BrowseView } from '@src/components/BrowseView';
import { DocumentReader, LookAgainTool, discoveredCount } from '@src/components/DocumentReader';
import { LibraryIcon, PageDocumentsIcon } from '@src/components/Icons';
import { LensCard } from '@src/components/LensCard';
import { LocalAnalysisView, attributionMeta } from '@src/components/LocalAnalysisView';
import { Overlay } from '@src/components/Overlay';
import { PanelHeader, ToolButton } from '@src/components/PanelHeader';
import { RunOutcome } from '@src/components/RunStatus';
import { SiteMeta } from '@src/components/SiteMeta';
import { useActiveTabSite } from '@src/hooks/useActiveTabSite';
import { useDomainAnalyses } from '@src/hooks/useDomainAnalyses';
import { useElementHeight } from '@src/hooks/useElementHeight';
import { useLivePolicyCheck } from '@src/hooks/useLivePolicyCheck';
import { useLocalAnalyses } from '@src/hooks/useLocalAnalyses';
import { useCallback, useMemo, useState } from 'react';
import type { RankedPolicyCandidate, SitePolicyAnalysis } from '@extension/unshafted-core';
import type { DocumentFreshness, LivePolicyCheck } from '@src/hooks/useLivePolicyCheck';

/**
 * The side panel — the first place a real analysis reaches a real person.
 *
 * ORDER IS THE DESIGN (D10). Everything above the document cards renders from the bundle, with
 * zero network and no page access, and it renders before the live check has done anything:
 *
 *  1. `example.com — 3 documents read.` Instant, always true.
 *  2. The worst risk level, naming the document that earned it. Per D1 that is the point of the
 *     product — 36 of 37 domains land on High or Very High, and the finding IS that the products
 *     people use daily are predatory. It does not get buried under a neutral summary.
 *  3. The one thing: a window if the domain names one, otherwise the highest-severity exposure.
 *     Not the `summary` — that is prose about a document, and an exposure is a fact about the
 *     reader. It is now the first block of the lens the reader lands on, already open.
 *  4. The rest of the findings, by concern rather than by document — Windows, Data, Rights, Can
 *     do, Missing — with the documents themselves as the last lens.
 *
 * The live confirmation (D6) is an upgrade layered on top, never a precondition. If it cannot
 * run — and on 7 of 36 domains it structurally cannot — nothing above changes and no error
 * appears. "As we read it on 4 Sep 2026" is the honest resting state.
 */

/** Rollup of the per-document states. Per D3 the document is the real unit; this is a summary. */
const overallFreshness = (
  analyses: readonly SitePolicyAnalysis[],
  freshness: Record<string, DocumentFreshness>,
): DocumentFreshness => {
  const states = analyses.map(analysis => freshness[analysis.contentHash] ?? 'pending');
  if (states.includes('pending')) return 'pending';
  if (states.includes('changed')) return 'changed';
  if (states.every(state => state === 'current')) return 'current';
  return 'unconfirmed';
};

/**
 * The Library tool — every site we have read. On every view that has something else to show, so it
 * is always in the same place (the popup keeps History there for the same reason), and never in
 * the reading flow, where it would compete with the findings (P9's concern, kept by placement).
 */
const LibraryTool = ({ onBrowse }: { onBrowse: () => void }) => (
  <ToolButton label="Every site we have read" onClick={onBrowse}>
    <LibraryIcon />
  </ToolButton>
);

/**
 * The page reader, when something else on screen is the headline. The tool carries the count, so
 * the reader knows before opening it whether there is anything there — and no count when there is
 * nothing counted (see `discoveredCount`).
 */
const PageDocumentsTool = ({ check, onOpen }: { check: LivePolicyCheck; onOpen: () => void }) => {
  const count = discoveredCount(check);
  return (
    <ToolButton
      label={count ? `Documents on this page — ${count}` : 'Documents on this page'}
      badge={count}
      onClick={onOpen}>
      <PageDocumentsIcon />
    </ToolButton>
  );
};

const PageDocumentsOverlay = ({
  domain,
  analyses,
  check,
  onAnalyse,
  onClose,
}: {
  domain: string;
  analyses: readonly SitePolicyAnalysis[];
  check: LivePolicyCheck;
  onAnalyse?: (candidate: RankedPolicyCandidate) => void;
  onClose: () => void;
}) => (
  <Overlay
    title="On this page"
    meta="The policy documents this page links, read by your own browser."
    tools={<LookAgainTool check={check} />}
    onClose={onClose}>
    <div className="panel-zone">
      <DocumentReader domain={domain} analyses={analyses} check={check} onAnalyse={onAnalyse} />
    </div>
    {/* P17: the overlay offers "Analyse…" only where the view it opened from is the paid path. */}
    <p className="panel-footer">
      {onAnalyse
        ? 'When you analyse, document text goes to your chosen provider. Results can sync to your connected Drive.'
        : 'Nothing about the site you are on leaves this browser.'}
    </p>
  </Overlay>
);

const CoveredView = ({
  domain,
  analyses,
  check,
  onBrowse,
}: {
  domain: string;
  analyses: readonly SitePolicyAnalysis[];
  check: LivePolicyCheck;
  onBrowse: () => void;
}) => {
  const [headerRef, headerHeight] = useElementHeight<HTMLElement>();
  const [readerOpen, setReaderOpen] = useState(false);
  const freshnessOf = useCallback(
    (analysis: SitePolicyAnalysis) => check.freshness[analysis.contentHash] ?? 'pending',
    [check.freshness],
  );

  return (
    <>
      <PanelHeader
        ref={headerRef}
        title={domain}
        meta={<SiteMeta analyses={analyses} state={overallFreshness(analyses, check.freshness)} />}
        tools={
          <>
            <PageDocumentsTool check={check} onOpen={() => setReaderOpen(true)} />
            <LibraryTool onBrowse={onBrowse} />
          </>
        }
      />

      <WorstRisk analyses={analyses} freshness={check.freshness} />
      <LensCard key={domain} analyses={analyses} headerOffset={headerHeight} freshnessOf={freshnessOf} />

      {/* P17: covered never spends anything, so the strong claim holds unconditionally here. */}
      <p className="panel-footer">Nothing about the site you are on leaves this browser.</p>

      {readerOpen ? (
        <PageDocumentsOverlay domain={domain} analyses={analyses} check={check} onClose={() => setReaderOpen(false)} />
      ) : null}
    </>
  );
};

/**
 * The uncovered site (D15), and from Part 6 the only place in the panel that can spend money.
 *
 * This used to be a dead end — "we have not read this site's policies" and nothing else — because
 * D8 gated the panel to covered sites and this branch was only reachable by navigating away with
 * the panel open. That was backwards: the reader needs no corpus coverage at all, only page
 * access, so an uncovered site is exactly where finding the documents is the *only* thing we can
 * offer.
 *
 * The promise here is deliberately weaker than the covered view's, and the copy has to carry that:
 * we are saying "here is what this site makes you agree to", not "here is what is wrong with it".
 * Nothing is graded, so nothing is coloured.
 *
 * PART 6 ADDS THE THIRD STATE, between those two. A site the USER analysed on their own key gets
 * the full layout and a signature saying whose analysis it is (S3). It is not coverage — the
 * toolbar badge stays dark, nothing is submitted, and nothing here is reviewed by us — and the
 * ordering says so: the attribution renders above the verdict, never after it.
 *
 * Every path to a call goes through the confirm (S5). Nothing on this screen spends a credit.
 */
const UncoveredView = ({
  hostname,
  check,
  onBrowse,
}: {
  hostname: string;
  check: LivePolicyCheck;
  onBrowse: () => void;
}) => {
  const { analyses: localAnalyses, runState, reload } = useLocalAnalyses(hostname);
  /** Null when the sheet is closed; `preselected` is the row the user asked from, if any. */
  const [confirming, setConfirming] = useState<{ preselected: string | null } | null>(null);

  /*
   * S10: cross-origin documents are unreadable from the page, so they are not analysable either.
   *
   * An untyped candidate is excluded for a different and stronger reason. `docType` drives the
   * brief and the disclosure checklist the prompt reads the document AGAINST, and it is stored on
   * the analysis as a claim about what the document IS. Discovery leaves it null on a link that is
   * plainly legal but names no type we recognise ("Legal"), and defaulting those to `terms` would
   * read a privacy policy against the wrong checklist and then file the result — in the user's own
   * Drive — asserting it was the terms. The reader's filename fallback is cosmetic; this one would
   * be a false claim about a real company's document, which is the one thing this corpus never
   * does. They stay listed and readable; they are simply not offered.
   */
  const discovery = check.discovery;
  const analysable = useMemo(
    () =>
      discovery?.status === 'discovered'
        ? discovery.documents.filter(candidate => candidate.sameOrigin && candidate.docType !== null)
        : [],
    [discovery],
  );

  // A run belongs to a domain. One started on another tab's site is somebody else's progress bar.
  const run = runState.domain === hostname ? runState : null;
  const running = run?.status === 'running';

  const [headerRef, headerHeight] = useElementHeight<HTMLElement>();
  const [readerOpen, setReaderOpen] = useState(false);
  const hasResults = localAnalyses.length > 0;

  /*
   * A row's "Analyse…" opens the confirm in the bar. From the overlay, the overlay closes first:
   * it is modal, and a confirm opened behind a modal is a confirm nobody can reach.
   */
  const analyseOne = running
    ? undefined
    : (candidate: RankedPolicyCandidate) => {
        setReaderOpen(false);
        setConfirming({ preselected: candidate.url });
      };

  return (
    <>
      <PanelHeader
        ref={headerRef}
        title={hostname}
        meta={hasResults ? attributionMeta(localAnalyses) : 'Not analysed by Unshafted'}
        tools={
          <>
            {/*
              The reader is a tool only when something else is the headline. With nothing analysed
              it IS the screen's content, rendered in place below — one rule, two placements.
            */}
            {hasResults ? <PageDocumentsTool check={check} onOpen={() => setReaderOpen(true)} /> : null}
            <LibraryTool onBrowse={onBrowse} />
          </>
        }
      />

      {run?.status === 'complete' ? <RunOutcome runState={run} onStorageChanged={reload} /> : null}

      {hasResults ? (
        <LocalAnalysisView analyses={localAnalyses} headerOffset={headerHeight} />
      ) : (
        <>
          <section className="panel-zone">
            <p className="panel-lede">
              We have not analysed this site, so there is no risk level and no findings. You can still read what it
              makes you agree to.
            </p>
            {/*
              Entry point 2, kept in the copy even though the Library tool is in the header. The
              reader has just been told we have not read THIS site, and "here is what we have read"
              is the correct next sentence — the one place the offer answers a question the surface
              itself just raised. Tertiary: a link, and cheapest true thing first, since it reads
              82 analyses already on disk while analysing spends a credit on the user's own key.
            */}
            <p className="panel-lede-link">
              <button className="panel-link-button" type="button" onClick={onBrowse}>
                See what we’ve read →
              </button>
            </p>
          </section>

          <section className="panel-zone">
            <div className="panel-zone-head">
              <p className="panel-eyebrow">On this page</p>
              <LookAgainTool check={check} />
            </div>
            <DocumentReader domain={hostname} analyses={[]} check={check} onAnalyse={analyseOne} />
          </section>
        </>
      )}

      {/*
        P17: this is the paid path regardless of which branch above rendered — saved local results
        still sit next to a live "run again" offer, and the confirm/run states in the bar below are
        the same screen, not a different one. Nothing has been sent yet; the wording says what
        analysing does, not that it already happened.
      */}
      <p className="panel-footer">
        When you analyse, document text goes to your chosen provider. Results can sync to your connected Drive.
      </p>

      <AnalyseBar
        domain={hostname}
        check={check}
        candidates={analysable}
        run={run}
        hasResults={hasResults}
        confirming={confirming}
        onConfirm={preselected => setConfirming({ preselected })}
        onCancel={() => setConfirming(null)}
      />

      {readerOpen ? (
        <PageDocumentsOverlay
          domain={hostname}
          analyses={[]}
          check={check}
          onAnalyse={analyseOne}
          onClose={() => setReaderOpen(false)}
        />
      ) : null}
    </>
  );
};

/**
 * No page to speak of (D16) — `chrome://`, `file://`, the Web Store, a new tab.
 *
 * D13 makes availability sticky per tab precisely so that someone who opens the panel on a website
 * and then navigates that tab into `chrome://extensions` keeps the surface instead of having it
 * closed mid-sentence. That is the right call, and it means this state is not an edge case the
 * panel may ignore: it is one navigation away from every session.
 *
 * Until now it fell through to `UncoveredView`, which said we had not analysed *this site* and
 * offered to show what it *makes you agree to* — both claims about something that is not a site
 * and asks nothing of you. Weakening a promise (D15) is not the same as making one about nothing.
 *
 * So this branch grades nothing, discovers nothing and offers no reader. It says why the panel is
 * empty and what would fill it, which is the only true thing available here.
 *
 * AND IT IS THE BEST ENTRY POINT IN THE PRODUCT for browsing the corpus, which is the one thing
 * here that needs no site at all. This is the only surface that is deliberately empty, and D13's
 * stickiness puts it "one navigation away from every session" — so a reader lands here often, with
 * nothing to read, holding 82 analyses they cannot see. The corpus is also worth most exactly when
 * you are NOT on the site: the moment before you sign up.
 */
const NoSiteView = ({ onBrowse }: { onBrowse: () => void }) => (
  <>
    <PanelHeader title="No site here" />

    {/*
      P8: the explanation on the ground and the one offer beside it — no card around either. The
      library is the content of this screen, not a tool on it, so it is an outlined button here and
      not an icon in the header.
    */}
    <section className="panel-zone">
      <p className="panel-lede">
        This is a browser page, not a website. Open a site and the panel will show what it makes you agree to.
      </p>
      <div className="panel-actions">
        <button className="panel-button" type="button" onClick={onBrowse}>
          See what we’ve read
        </button>
      </div>
    </section>

    <p className="panel-footer">Nothing about the site you are on leaves this browser.</p>
  </>
);

/**
 * D3: loading is its own explicit state, not a fallback title borrowed by whichever view the
 * panel would otherwise be on. It used to be a string wedged into the shared header —
 * `domain ?? site.hostname ?? (loading ? 'Reading the current tab…' : 'No site here')` — which
 * meant "we do not know yet" and "we checked and there is nothing" rendered through the same
 * conditional, one character apart. `SidePanel` now checks `loading` before it decides which of
 * the other views applies, so this is the only place that string can come from.
 *
 * The title still prefers the real hostname when the tab itself has already resolved — only the
 * domain lookup that decides covered/uncovered is still in flight. That preserves what the old
 * fallback chain did when partially resolved; it did not need to change, only stop living inside
 * a title meant for something else.
 */
const LoadingView = ({ hostname }: { hostname: string | null }) => (
  <>
    <PanelHeader title={hostname ?? 'Reading the current tab…'} />

    <p className="panel-zone panel-quiet flex items-center">
      <span className="panel-busy-dot" aria-hidden="true" />
      Reading the current tab…
    </p>

    {/* Nothing has run yet on any path, so the strongest true claim is always the safe one here. */}
    <p className="panel-footer">Nothing about the site you are on leaves this browser.</p>
  </>
);

/**
 * BROWSE IS A MODE, NOT A FIFTH VIEW, and the difference is structural rather than stylistic.
 *
 * The four views below are all functions of the active tab: change the tab, and the right one
 * renders. Browse is not — it is somewhere the reader went on purpose, about sites they are not on.
 * If a background navigation could yank them out of it, the panel would be closing itself
 * mid-sentence, which is precisely the failure D13's sticky availability exists to prevent.
 *
 * So browse replaces the whole surface, header included. It cannot render under a header naming a
 * site it is not about.
 *
 * THE TAB HOOKS STAY MOUNTED while browse is open, deliberately. They are what makes "back" return
 * to the tab-driven view *as it is by then* rather than as it was when the reader left it — if the
 * tab navigated meanwhile, the panel they come back to is about the page actually in front of them.
 * Nothing extra is spent for this: those hooks run on every panel open regardless, and browse adds
 * no network call of its own.
 */
const SidePanel = () => {
  const site = useActiveTabSite();
  const { status, domain, analyses } = useDomainAnalyses(site.hostname);
  const check = useLivePolicyCheck(site.tabId, site.url, analyses);
  const [browsing, setBrowsing] = useState(false);

  const covered = domain !== null && analyses.length > 0;
  const loading = status === 'loading' || site.status === 'loading';

  if (browsing) {
    return (
      <main className="panel-shell panel-sticky-scope">
        <BrowseView onClose={() => setBrowsing(false)} />
        <div className="panel-bottom-fade" aria-hidden="true" />
      </main>
    );
  }

  /*
   * D1/P7: `SidePanel` no longer owns a header or a footer of its own — it only decides which
   * view is showing, and every view below carries both. `loading` is checked first, ahead of
   * `covered`, so a still-resolving site can never be misread as either "covered" or "no site
   * here"; those two are now reachable only once the resolve that would distinguish them is done.
   *
   * THE FOOTER USED TO BE ONE SENTENCE COMPUTED HERE, because it was not true on every screen it
   * rendered on: right on covered and no-site, false on uncovered the moment the reader takes the
   * offer sitting directly above it. Each view now carries the sentence that is true for it, which
   * is the same fix P17 already made, just no longer centralised. Browse still never reaches here
   * — it replaces the whole surface, footer included, per its own comment below.
   */
  return (
    <main className="panel-shell panel-sticky-scope">
      {loading ? (
        <LoadingView hostname={site.hostname} />
      ) : covered ? (
        <CoveredView domain={domain} analyses={analyses} check={check} onBrowse={() => setBrowsing(true)} />
      ) : site.hostname === null ? (
        <NoSiteView onBrowse={() => setBrowsing(true)} />
      ) : (
        <UncoveredView hostname={site.hostname} check={check} onBrowse={() => setBrowsing(true)} />
      )}
      <div className="panel-bottom-fade" aria-hidden="true" />
    </main>
  );
};

export default SidePanel;

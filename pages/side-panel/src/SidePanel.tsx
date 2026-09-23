import '@src/SidePanel.css';
import { AnalyseConfirm } from '@src/components/AnalyseConfirm';
import { OneThing, WorstRisk } from '@src/components/AnalysisView';
import { BackToTop } from '@src/components/BackToTop';
import { BrowseView } from '@src/components/BrowseView';
import { DocumentCard } from '@src/components/DocumentCard';
import { DocumentReader } from '@src/components/DocumentReader';
import { LocalAnalysisView } from '@src/components/LocalAnalysisView';
import { RunOutcome, RunProgress } from '@src/components/RunStatus';
import { useActiveTabSite } from '@src/hooks/useActiveTabSite';
import { useDomainAnalyses } from '@src/hooks/useDomainAnalyses';
import { useElementHeight } from '@src/hooks/useElementHeight';
import { useLivePolicyCheck } from '@src/hooks/useLivePolicyCheck';
import { useLocalAnalyses } from '@src/hooks/useLocalAnalyses';
import { formatAnalysedDate } from '@src/lib/presentation';
import { useMemo, useState } from 'react';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';
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
 *  3. The one thing: a deadline if the domain has one, otherwise the highest-severity exposure.
 *     Not the `summary` — that is prose about a document, and an exposure is a fact about the
 *     reader.
 *  4. Per-document cards, collapsed, worst first.
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

const latestAnalysedAt = (analyses: readonly SitePolicyAnalysis[]): string =>
  analyses.reduce((latest, analysis) => (analysis.analyzedAt > latest ? analysis.analyzedAt : latest), '');

const FreshnessStrip = ({
  analyses,
  freshness,
}: {
  analyses: readonly SitePolicyAnalysis[];
  freshness: Record<string, DocumentFreshness>;
}) => {
  const state = overallFreshness(analyses, freshness);
  const label = {
    pending: 'Checking against the live page…',
    current: 'Current — verified against the live page',
    changed: 'Changed since we read it',
    unconfirmed: `As we read it on ${formatAnalysedDate(latestAnalysedAt(analyses))}`,
  }[state];

  return (
    <p className="panel-freshness" data-state={state}>
      {label}
    </p>
  );
};

const CoveredView = ({
  domain,
  analyses,
  check,
}: {
  domain: string;
  analyses: readonly SitePolicyAnalysis[];
  check: LivePolicyCheck;
}) => {
  const [headerRef, headerHeight] = useElementHeight<HTMLElement>();

  return (
    <>
      <header ref={headerRef} className="panel-floating top-0 flex flex-col gap-1 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="m-0 min-w-0 text-lg leading-tight font-semibold tracking-tight text-[var(--unshafted-text)]">
            {domain}
          </h1>
          <BackToTop />
        </div>
        <p className="m-0 text-xs text-[var(--unshafted-text-muted)]">
          {analyses.length === 1 ? '1 document read.' : `${analyses.length} documents read.`}
        </p>
      </header>

      <FreshnessStrip analyses={analyses} freshness={check.freshness} />
      <WorstRisk analyses={analyses} freshness={check.freshness} />
      <OneThing analyses={analyses} />

      <section className="panel-group">
        <p className="panel-eyebrow">Every document</p>
        {analyses.map(analysis => (
          <DocumentCard
            key={analysis.contentHash}
            analysis={analysis}
            freshness={check.freshness[analysis.contentHash] ?? 'pending'}
            headerOffset={headerHeight}
          />
        ))}
      </section>

      <DocumentReader domain={domain} analyses={analyses} check={check} />

      {/* P17: covered never spends anything, so the strong claim holds unconditionally here. */}
      <p className="m-0 mt-auto pt-2 text-[10px] leading-relaxed text-[var(--unshafted-text-faint)]">
        Nothing about the site you are on leaves this browser.
      </p>
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

  return (
    <>
      <header ref={headerRef} className="panel-floating top-0 flex flex-col gap-1 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="m-0 min-w-0 text-lg leading-tight font-semibold tracking-tight text-[var(--unshafted-text)]">
            {hostname}
          </h1>
          <BackToTop />
        </div>
      </header>

      {localAnalyses.length > 0 ? (
        <LocalAnalysisView analyses={localAnalyses} headerOffset={headerHeight} />
      ) : (
        <section className="panel-one-thing">
          <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
            We have not analysed this site, so there is no risk level and no findings. You can still read what it makes
            you agree to.
          </p>
          {/*
            Entry point 2. The reader has just been told we have not read THIS site, and "here is
            what we have read" is the correct next sentence — it is the one place the offer answers
            a question the surface itself just raised.

            Below the copy and above the analyse path on purpose: this is free and reads 82
            analyses already on disk, whereas "Analyse this site" spends a credit on the user's own
            key. Cheapest true thing first.
          */}
          <div className="mt-2">
            <button className="panel-button" type="button" onClick={onBrowse}>
              See what we’ve read
            </button>
          </div>
        </section>
      )}

      {running ? <RunProgress runState={run} /> : null}
      {run?.status === 'complete' ? <RunOutcome runState={run} onStorageChanged={reload} /> : null}

      {confirming ? (
        <AnalyseConfirm
          domain={hostname}
          candidates={analysable}
          preselected={confirming.preselected}
          check={check}
          onCancel={() => setConfirming(null)}
          onStarted={() => setConfirming(null)}
        />
      ) : !running && analysable.length > 0 ? (
        <section className="panel-one-thing">
          <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
            {localAnalyses.length > 0
              ? 'You can run these documents again on your own key.'
              : 'You can have these documents analysed on your own API key. We do not review the result.'}
          </p>
          <div className="mt-2">
            <button className="panel-button" type="button" onClick={() => setConfirming({ preselected: null })}>
              Analyse this site
            </button>
          </div>
        </section>
      ) : null}

      <DocumentReader
        domain={hostname}
        analyses={[]}
        check={check}
        onAnalyse={running ? undefined : candidate => setConfirming({ preselected: candidate.url })}
      />

      {/*
        P17: this is the paid path regardless of which branch above rendered — saved local results
        still sit next to a live "run again" offer, and the confirm/run states below it are the
        same screen, not a different one. Nothing has been sent yet; the wording says what
        analysing does, not that it already happened.
      */}
      <p className="m-0 mt-auto pt-2 text-[10px] leading-relaxed text-[var(--unshafted-text-faint)]">
        When you analyse, document text goes to your chosen provider. Results can sync to your connected Drive.
      </p>
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
    <header className="panel-floating top-0 flex items-center justify-between gap-2 pb-2">
      <h1 className="m-0 min-w-0 text-lg leading-tight font-semibold tracking-tight text-[var(--unshafted-text)]">
        No site here
      </h1>
      <BackToTop />
    </header>

    <section className="panel-one-thing">
      <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
        This is a browser page, not a website. Open a site and the panel will show what it makes you agree to.
      </p>
      <div className="mt-2">
        <button className="panel-button" type="button" onClick={onBrowse}>
          See what we’ve read
        </button>
      </div>
    </section>

    <p className="m-0 mt-auto pt-2 text-[10px] leading-relaxed text-[var(--unshafted-text-faint)]">
      Nothing about the site you are on leaves this browser.
    </p>
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
    <header className="panel-floating top-0 flex items-center justify-between gap-2 pb-2">
      <h1 className="m-0 min-w-0 text-lg leading-tight font-semibold tracking-tight text-[var(--unshafted-text)]">
        {hostname ?? 'Reading the current tab…'}
      </h1>
      <BackToTop />
    </header>

    <section className="panel-one-thing">
      <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">Reading the current tab…</p>
    </section>

    {/* Nothing has run yet on any path, so the strongest true claim is always the safe one here. */}
    <p className="m-0 mt-auto pt-2 text-[10px] leading-relaxed text-[var(--unshafted-text-faint)]">
      Nothing about the site you are on leaves this browser.
    </p>
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
        <CoveredView domain={domain} analyses={analyses} check={check} />
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

import { OneThing, WorstRisk } from '@src/components/AnalysisView';
import { BackToTop } from '@src/components/BackToTop';
import { DocumentCard } from '@src/components/DocumentCard';
import { useBrowseManifest } from '@src/hooks/useBrowseManifest';
import { useDomainAnalyses } from '@src/hooks/useDomainAnalyses';
import { useElementHeight } from '@src/hooks/useElementHeight';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PolicyBrowseRow } from '@extension/unshafted-core';
import type { DocumentFreshness } from '@src/hooks/useLivePolicyCheck';

/**
 * "What we've read" — the corpus, browsable, for a site the reader is NOT on.
 *
 * The panel's other three views are all functions of the active tab. This one is not: it is a mode
 * the reader entered on purpose, so it owns the whole surface, header included, and a background
 * navigation does not yank them out of it. That follows from D13 rather than from taste — sticky
 * availability exists so the panel does not close itself mid-sentence, and a browse list that
 * evaporated when a tab finished loading would do exactly that.
 *
 * THREE CONSTRAINTS FROM THE DESIGN PASS, all of which this file exists to honour and none of
 * which are obvious from the markup:
 *
 * 1. **Absent disclosures are not a section and not a number.** 35 of 37 domains have at least one,
 *    so a section for them is not a finding, it is the default. And `requiredDisclosures` records
 *    what each analysis found worth recording, not a systematic checklist — silence is not absence
 *    — so a count is a lower bound on findings, never a measurement of the document. Rendering one
 *    beside another domain's invites a comparison the data cannot support, about real companies.
 *    Where an absent disclosure renders is where it already renders: inside the opened document,
 *    named, with its regime. Named findings are honest; a tally is not.
 *
 * 2. **Nothing here says a window is still open.** A `relative_to_signup` window needs the date the
 *    reader accepted and we do not have it (D14). The group heading and the row marker both say the
 *    document NAMES a window. Neither says anything about yours.
 *
 * 3. **No risk colour in the list.** High 27, Very High 9, Medium 1, Low 0 — colouring 37 rows along
 *    a ramp where 36 land on two adjacent steps is noise with a legend. Risk colour stays on the
 *    document cards, attached to the document that earned it.
 *
 * Ordering is alphabetical inside each group and nowhere else. Not by document count, which is a
 * fact about how much a company publishes rather than how it treats you; not by absent count, per
 * (1); not by risk, per (3). Alphabetical makes scanning work and claims nothing.
 */

/**
 * The caveat that travels with the marker.
 *
 * It exists as a string rather than as prose in the group heading because **typing dissolves the
 * groups** — a query produces one flat list, and at that moment the heading that would have
 * explained the word is not on screen. Without this the search path silently drops the one property
 * the view splits the corpus on.
 *
 * IT USED TO SAY "depends on when you signed up", which was a second invented fact standing in for
 * the one D14 already forbids. Not every named window runs from signup: a refund window runs from
 * the purchase, an objection deadline from the notice, an opt-out from first use. Naming signup as
 * the anchor told 37 sites' worth of readers to count from a date that, for most of those windows,
 * is not the date at all. The window's start is a property of the document and we do have it; the
 * reader's position against it is a property of their life and we do not. The caveat now says
 * exactly that much and no more.
 */
const WINDOW_CAVEAT =
  'This site’s documents name a window — an opt-out, a refund, a deadline to object. ' +
  'Each one runs from an event the document names, and whether yours is open depends on ' +
  'your own circumstances, which we do not know.';

const documentsLabel = (count: number): string => (count === 1 ? '1 document' : `${count} documents`);

/**
 * One site. Plain text, a count, and — on the 19 that have one — a neutral `window` marker.
 *
 * The marker is `--unshafted-selection-soft` weight, which is the "count badge with no severity"
 * token. That is the point: it has to read as information, not as a warning, because a warning is
 * a claim about the site and this is a claim about the document's contents.
 */
const BrowseRow = ({ row, onOpen }: { row: PolicyBrowseRow; onOpen: (domain: string) => void }) => (
  <button className="panel-row panel-browse-row" type="button" onClick={() => onOpen(row.domain)}>
    <span className="panel-browse-domain">{row.domain}</span>
    {row.hasTimeSensitiveAction ? (
      <span className="panel-marker" title={WINDOW_CAVEAT}>
        window
        <span className="sr-only">. {WINDOW_CAVEAT}</span>
      </span>
    ) : null}
    <span className="panel-browse-count">{documentsLabel(row.documentCount)}</span>
  </button>
);

const BrowseGroup = ({
  heading,
  explanation,
  rows,
  onOpen,
}: {
  heading: string;
  explanation?: string;
  rows: readonly PolicyBrowseRow[];
  onOpen: (domain: string) => void;
}) => {
  if (rows.length === 0) return null;

  return (
    <section className="panel-group">
      <div className="flex items-center justify-between gap-2">
        <p className="panel-eyebrow">{heading}</p>
        <span className="panel-count">{rows.length}</span>
      </div>
      {explanation ? (
        <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">{explanation}</p>
      ) : null}
      {rows.map(row => (
        <BrowseRow key={row.domain} row={row} onOpen={onOpen} />
      ))}
    </section>
  );
};

/**
 * The list.
 *
 * Search is the primary job — "I'm about to sign up for X" — and at 37 rows it resolves in one
 * keystroke. The grouping exists for the reader who has not typed anything yet, and dissolves the
 * moment they do: grouping is an answer to "show me something interesting", and someone who typed
 * `zer` has already said what is interesting.
 *
 * The second group deliberately gets a heading and no explanation. The absence of a named window is
 * not a finding about the site, and dressing it up as one would be the same error as making a
 * section out of absent disclosures.
 *
 * `query` is owned by `BrowseView`, not here (P11) — this component unmounts every time a domain
 * opens, and a query held in its own state would reset on the way back.
 */
/** Stable empty list, so "not loaded yet" is not a new array identity on every render. */
const NO_ROWS: readonly PolicyBrowseRow[] = [];

const BrowseList = ({
  query,
  onQueryChange,
  onOpen,
  onClose,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onOpen: (domain: string) => void;
  onClose: () => void;
}) => {
  const state = useBrowseManifest();
  const searchId = useId();
  const [titleRef, titleHeight] = useElementHeight<HTMLElement>();

  const trimmed = query.trim().toLowerCase();

  /*
   * Derived from `state` inside the memo rather than from a `rows` binding above, so the empty case
   * is the stable `NO_ROWS` and not a fresh `[]` on every render. The literal would have made this
   * a memo of nothing — new dependency, recompute, on every keystroke and every parent render.
   *
   * Plain substring match, deliberately. 37 rows resolve in one keystroke, and fuzzy matching on a
   * list this size buys a reader nothing while handing them "why is that in my results?".
   */
  const matches = useMemo(() => {
    const all = state.status === 'ready' ? state.manifest.domains : NO_ROWS;
    return trimmed ? all.filter(row => row.domain.includes(trimmed)) : all;
  }, [state, trimmed]);

  /** Counts and copy only — never a hook dependency, so the conditional costs nothing here. */
  const total = state.status === 'ready' ? state.manifest.domains.length : 0;

  const clocked = matches.filter(row => row.hasTimeSensitiveAction);
  const rest = matches.filter(row => !row.hasTimeSensitiveAction);

  return (
    <>
      <header ref={titleRef} className="panel-floating top-0 flex flex-col gap-1 pb-2">
        <div className="flex items-start gap-2">
          <h1 className="m-0 min-w-0 flex-1 text-lg leading-tight font-semibold tracking-tight text-[var(--unshafted-text)]">
            What we’ve read
          </h1>
          <BackToTop />
          <button className="panel-icon-button" type="button" onClick={onClose} aria-label="Close the list">
            ✕
          </button>
        </div>
        {/*
          `documentTotal`, never the sum of the rows. Three documents govern two domains each, so
          summing gives 85 against a corpus of 82 — a number that overstates how much we have read,
          on the one surface whose entire job is to say how much we have read.
        */}
        {state.status === 'ready' ? (
          <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
            {state.manifest.documentTotal} documents across {total} sites. Nothing here is live — these are the versions
            we read, on the dates shown.
          </p>
        ) : null}
      </header>

      {state.status === 'loading' ? (
        <p className="m-0 text-xs text-[var(--unshafted-text-muted)]">Loading the list…</p>
      ) : null}

      {/*
        An unavailable manifest is a claim about the build, not about the corpus, so it does not
        render as an empty list. "We have read nothing" would be false and is the easier mistake.
      */}
      {state.status === 'unavailable' ? (
        <section className="panel-one-thing">
          <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
            The list of sites did not load, so we cannot show you what we have read. Nothing else in the panel is
            affected.
          </p>
        </section>
      ) : null}

      {state.status === 'ready' ? (
        <>
          {/*
            P11/P13: search lives in its own sticky header, separate from the title above, so it
            stays reachable while scrolling past up to 37 rows — this is browse's own Level 2,
            sitting below the title (Level 1) at that header's actual measured height rather than
            an assumed one, the same rule P13 applies to a document's sticky summary.
          */}
          <header className="panel-floating flex flex-col gap-1 py-2" style={{ top: titleHeight }}>
            <label className="sr-only" htmlFor={searchId}>
              Find a site
            </label>
            <input
              id={searchId}
              className="panel-search"
              type="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Find a site"
              value={query}
              onChange={event => onQueryChange(event.target.value)}
            />
          </header>

          {trimmed && matches.length === 0 ? (
            /*
              Honest, and no button. AD-6's "request an analysis" is where this leads and it does not
              exist yet; a control that does nothing is worse than no control.

              Guarded on `trimmed`, not just on the count: with no query and no rows this branch
              would render `No match for “”` — a sentence about a search nobody ran.
            */
            <section className="panel-one-thing">
              <p className="m-0 text-sm leading-snug font-semibold text-[var(--unshafted-text)]">
                No match for “{query.trim()}”.
              </p>
              <p className="m-0 mt-1 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
                These are the {total} sites we have read so far.
              </p>
            </section>
          ) : trimmed ? (
            /* Typing dissolves the groups — one flat result list, markers intact, one bordered surface. */
            <section className="panel-one-thing">
              <div className="panel-group">
                {matches.map(row => (
                  <BrowseRow key={row.domain} row={row} onOpen={onOpen} />
                ))}
              </div>
            </section>
          ) : (
            /* P11: all 37 real destinations remain as button rows in one bordered surface. */
            <section className="panel-one-thing gap-3">
              {/*
                The heading says what the DOCUMENT contains, not what the reader can do. "Something
                you can still do" asserted the window is open — the precise claim D14 says we cannot
                make, made in a heading standing over 19 sites at once.
              */}
              <BrowseGroup
                heading="Window named in document"
                explanation="These name a window — an opt-out, a refund, a deadline to object. Each runs from an event the document names, and whether yours is open depends on your own circumstances."
                rows={clocked}
                onOpen={onOpen}
              />
              <BrowseGroup heading="Everything else" rows={rest} onOpen={onOpen} />
            </section>
          )}
        </>
      ) : null}
    </>
  );
};

/**
 * Stable empty map. `WorstRisk` reads one key out of it, and a fresh `{}` every render would make
 * it a new prop on every parent render for no reason.
 */
const NO_FRESHNESS: Record<string, DocumentFreshness> = {};

/**
 * One site, opened from the list — the covered view's own D10 ordering, minus every live claim.
 *
 * TWO THINGS FROM `CoveredView` ARE MISSING ON PURPOSE, and both for the same reason: **the reader
 * is not on this site.**
 *
 * - `FreshnessStrip`. Handed an empty freshness map it resolves to `pending` and renders "Checking
 *   against the live page…". Nothing is checking anything. That is a false claim about our own
 *   behaviour, which is the cheapest kind to avoid and the easiest to ship by accident.
 * - `DocumentReader`. It reads the ACTIVE TAB, which here is some other page entirely.
 *
 * The cards render at `unconfirmed`, which is exactly true and already has the right words for it:
 * "As we read it on 4 Sep 2026." No live check runs, and none could — confirming a document needs
 * the page open in front of you.
 */
const BrowseDomain = ({ domain, onBack }: { domain: string; onBack: () => void }) => {
  const { status, analyses } = useDomainAnalyses(domain);
  const [headerRef, headerHeight] = useElementHeight<HTMLElement>();

  return (
    <>
      <header ref={headerRef} className="panel-floating top-0 flex flex-col gap-1 pb-2">
        <div className="flex items-start gap-2">
          <h1 className="m-0 min-w-0 flex-1 text-lg leading-tight font-semibold tracking-tight text-[var(--unshafted-text)]">
            {domain}
          </h1>
          <BackToTop />
          <button className="panel-icon-button" type="button" onClick={onBack} aria-label="Back to the list">
            ←
          </button>
        </div>
        {analyses.length > 0 ? (
          <p className="m-0 text-xs text-[var(--unshafted-text-muted)]">{documentsLabel(analyses.length)} read.</p>
        ) : null}
      </header>

      {status === 'loading' ? (
        <p className="m-0 text-xs text-[var(--unshafted-text-muted)]">Opening what we read…</p>
      ) : analyses.length === 0 ? (
        /*
          Unreachable unless the manifest and the corpus have drifted — the build cross-checks them.
          It renders anyway rather than showing an empty stack, because the one thing worse than a
          drifted list is a drifted list that looks like a site with no documents.
        */
        <section className="panel-one-thing">
          <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
            We have {domain} on the list but cannot open it. Nothing else in the panel is affected.
          </p>
        </section>
      ) : (
        <>
          <WorstRisk analyses={analyses} freshness={NO_FRESHNESS} />
          <OneThing analyses={analyses} />

          <section className="panel-group">
            <p className="panel-eyebrow">Every document</p>
            {analyses.map(analysis => (
              <DocumentCard
                key={analysis.contentHash}
                analysis={analysis}
                freshness="unconfirmed"
                headerOffset={headerHeight}
              />
            ))}
          </section>
        </>
      )}
    </>
  );
};

/**
 * The browse surface: a list, or one site opened from it.
 *
 * Depth lives here rather than in `SidePanel` so that leaving browse discards it — reopening lands
 * on the list, never on whichever site was last looked at. Browse does not persist across the panel
 * closing either: D13's stickiness is about not being yanked out mid-session, and is not an
 * argument for reopening into a list of 37 sites instead of the one the reader is looking at.
 */
const BrowseView = ({ onClose }: { onClose: () => void }) => {
  const [opened, setOpened] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  /*
   * P11: back preserves the list's search and scroll within this session; leaving browse discards
   * both for free, since `onClose` unmounts this whole component and there is then nothing left to
   * carry over. `query` is state (it drives what `BrowseList` renders); the scroll position is a
   * ref because restoring it is an imperative act on a DOM node, not something React renders.
   *
   * `.panel-shell` is the actual scroll container, and it lives one level up in `SidePanel.tsx` —
   * reached here via the footer's own parent rather than a prop, since the footer below renders on
   * every path through this component and is therefore always mounted to read it from.
   */
  const listScrollTop = useRef(0);
  const footerRef = useRef<HTMLParagraphElement>(null);

  const openDomain = (domain: string) => {
    listScrollTop.current = footerRef.current?.parentElement?.scrollTop ?? 0;
    setOpened(domain);
  };

  useLayoutEffect(() => {
    const shell = footerRef.current?.parentElement;
    if (!shell) return;
    // Restore the list's own position on the way back; a freshly opened domain starts at its top.
    shell.scrollTop = opened === null ? listScrollTop.current : 0;
  }, [opened]);

  return (
    <>
      {opened === null ? (
        <BrowseList query={query} onQueryChange={setQuery} onOpen={openDomain} onClose={onClose} />
      ) : (
        <BrowseDomain domain={opened} onBack={() => setOpened(null)} />
      )}

      <p ref={footerRef} className="m-0 mt-auto pt-2 text-[10px] leading-relaxed text-[var(--unshafted-text-faint)]">
        This list ships with the extension. Nothing here is a network call.
      </p>
    </>
  );
};

export { BrowseView };

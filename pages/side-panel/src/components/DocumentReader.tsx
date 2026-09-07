import { DOC_TYPE_LABELS, downloadFilename, shortenUrl } from '@src/lib/presentation';
import { useState } from 'react';
import type { RankedPolicyCandidate, SitePolicyAnalysis } from '@extension/unshafted-core';
import type { LivePolicyCheck } from '@src/hooks/useLivePolicyCheck';
import type { ReactNode } from 'react';

/**
 * The document reader (D9) — the policies this page links, readable here and saveable to disk.
 *
 * Two things about it are deliberate and easy to get wrong:
 *
 * 1. It renders the NORMALIZED text, not the page. That is the exact string the content hash is
 *    taken over, so what a reader sees here is what the analysis graded. Rendering the site's own
 *    HTML would look nicer and would quietly break that correspondence.
 *
 * 2. Download is a blob URL plus `<a download>`, with no `downloads` permission. Per D5 the bytes
 *    came from the user's own browser, in their own session, from a site they are already on —
 *    we never hold them and never serve them. That is the same line that keeps `corpus/text/`
 *    out of the bundle, and it is why this feature does not cross it.
 *
 * FOUR STATES, AND ONLY ONE OF THEM IS A DISCLOSURE. Looking / could-not-look / found-nothing /
 * found-some. The first three render flat, because a chevron promises something behind it and
 * there is nothing behind any of them; the count badge is likewise reserved for the state that
 * actually counted something. Rendering `0` beside "we could not read this page" claimed we had
 * looked and found none, about a page Chrome never let us open.
 *
 * Discovery finding nothing is a normal outcome, not an error: some sites link their policies
 * only from a signed-in surface, and 7 of 36 corpus domains host them cross-origin where an
 * in-page fetch cannot reach. That state says so and points at the source URLs the document
 * cards already carry, which are where we read them from.
 */

const READ_TEXT_LIMIT = 400_000;

/** A blob the page hands to the browser's own download machinery, and then forgets. */
const downloadText = (filename: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoking synchronously can cancel the download in flight; a short delay is the usual price.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

const documentLabel = (candidate: RankedPolicyCandidate): string =>
  candidate.label || (candidate.docType ? DOC_TYPE_LABELS[candidate.docType] : shortenUrl(candidate.url));

const DocumentRow = ({
  candidate,
  domain,
  check,
  onAnalyse,
}: {
  candidate: RankedPolicyCandidate;
  domain: string;
  check: LivePolicyCheck;
  onAnalyse?: (candidate: RankedPolicyCandidate) => void;
}) => {
  const [open, setOpen] = useState(false);
  const entry = check.reads[candidate.url];

  const toggle = () => {
    if (!open) check.readDocument(candidate.url);
    setOpen(!open);
  };

  const capture = entry?.state === 'done' ? entry.capture : null;

  return (
    <div className="panel-row">
      <p className="m-0 text-[13px] font-semibold leading-snug text-[var(--unshafted-text)]">
        {documentLabel(candidate)}
      </p>
      <p className="m-0 mt-0.5 truncate text-[10px] text-[var(--unshafted-text-faint)]">{shortenUrl(candidate.url)}</p>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/*
          Only same-origin documents can be fetched from the page's context (AD-4). A
          cross-origin one is still listed, because opening it in a tab is a real answer.
        */}
        {candidate.sameOrigin ? (
          <button className="panel-button" onClick={toggle} type="button">
            {open ? 'Hide' : 'Read here'}
          </button>
        ) : null}

        <a className="panel-button" href={candidate.url} target="_blank" rel="noreferrer">
          Open page
        </a>

        {/*
          S10: a cross-origin document gets no "Analyse" for the same reason it gets no "Read
          here" — we cannot fetch its text from the page (AD-4), and analysing a document we
          could not read would be a finding about a company drawn from nothing.
        */}
        {/*
          No `docType`, no analyse button — see the `analysable` filter in `SidePanel.tsx`. The row
          keeps "Read here": reading a document we cannot name is fine, grading one is not.
        */}
        {candidate.sameOrigin && candidate.docType && onAnalyse ? (
          <button className="panel-button" onClick={() => onAnalyse(candidate)} type="button">
            Analyse
          </button>
        ) : null}

        {capture?.status === 'captured' ? (
          <button
            className="panel-button"
            onClick={() =>
              downloadText(downloadFilename(domain, candidate.docType ?? 'terms', capture.hash), capture.text)
            }
            type="button">
            Download text
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2">
          {!entry || entry.state === 'loading' ? (
            <p className="m-0 text-[11px] text-[var(--unshafted-text-faint)]">Reading…</p>
          ) : capture?.status === 'captured' ? (
            <>
              <pre className="panel-reader-text">{capture.text.slice(0, READ_TEXT_LIMIT)}</pre>
              <p className="m-0 mt-1 text-[10px] text-[var(--unshafted-text-faint)]">
                Normalized text · {capture.text.length.toLocaleString()} characters · {capture.hash.slice(0, 12)}
              </p>
            </>
          ) : (
            <p className="m-0 text-[11px] text-[var(--unshafted-text-faint)]">
              {capture?.status === 'unreadable'
                ? 'This link did not return a readable document. Opening it in a tab will still work.'
                : 'This page cannot be read from here right now. Opening it in a tab will still work.'}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};

/** The addresses the bundled analyses were read from — the only thing left to point at. */
const SourceLinks = ({ analyses }: { analyses: readonly SitePolicyAnalysis[] }) => (
  <>
    <p className="m-0 mt-2 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
      These are the addresses we read:
    </p>
    {analyses.map(analysis => (
      <a
        key={analysis.contentHash}
        className="panel-row mt-1.5 block no-underline"
        href={analysis.sourceUrl}
        target="_blank"
        rel="noreferrer">
        <span className="text-[13px] font-semibold text-[var(--unshafted-text)]">
          {DOC_TYPE_LABELS[analysis.docType]}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-[var(--unshafted-text-faint)]">
          {shortenUrl(analysis.sourceUrl)}
        </span>
      </a>
    ))}
  </>
);

/**
 * A flat card for the three states with nothing to expand.
 *
 * Deliberately NOT a `<details>`. A collapsed disclosure whose whole payload is "there is nothing
 * here" charges a click to deliver a non-answer, and the count badge beside it made that worse:
 * an unreadable page rendered as `0`, which reads as "we looked and found none" about a page we
 * were never allowed to open. Only the state that actually has documents gets a chevron.
 */
const ReaderNote = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="panel-one-thing">
    <p className="m-0 mb-1.5 text-[13px] font-bold leading-snug text-[var(--unshafted-text)]">{title}</p>
    {children}
  </section>
);

export const DocumentReader = ({
  domain,
  analyses,
  check,
  onAnalyse,
}: {
  domain: string;
  analyses: readonly SitePolicyAnalysis[];
  check: LivePolicyCheck;
  /** Omitted on covered sites, where the corpus already answers the question (Part 6 scope). */
  onAnalyse?: (candidate: RankedPolicyCandidate) => void;
}) => {
  const { discovery, discovering, retried } = check;

  // 1. LOOKING. Held to a floor in the hook, so this is visible even when the answer is instant.
  if (discovering) {
    return (
      <ReaderNote title="Looking at this page…">
        <p className="m-0 flex items-center text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
          <span className="panel-busy-dot" aria-hidden="true" />
          Reading the links on this page. They all arrive at once — this is one look, not a crawl.
        </p>
      </ReaderNote>
    );
  }

  /*
   * 2. COULD NOT LOOK. Not the same as finding nothing, and the difference is the whole point.
   *
   * A null `discovery` with nothing in flight means the check never started, which happens on
   * `chrome://` pages and new tabs. It used to sit on "Looking at the page…" forever.
   */
  if (!discovery || discovery.status !== 'discovered') {
    const unsupported = !discovery || discovery.status === 'unsupported-page';

    if (unsupported) {
      return (
        <ReaderNote title="Not a page we can read">
          <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
            Browser pages and the Web Store are off limits to every extension, including this one.
          </p>
        </ReaderNote>
      );
    }

    /*
     * Every failure that reaches here is now a transient one, so the retry is offered in BOTH
     * states rather than escalating away from it.
     *
     * The old escalated copy sent the user to the toolbar, because under `activeTab` the common
     * failure was a grant this document could not restore. Standing host access removed that
     * failure, and keeping the instruction would send someone away to perform a gesture that no
     * longer does anything — the worst kind of stale advice, since it appears to work by
     * coincidence whenever the page finishes loading in the meantime. What is left is a page that
     * was not ready, so the second message only says the wait was not long enough.
     */
    return (
      <ReaderNote title="We could not read this page">
        <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
          {retried
            ? 'Still nothing. Some pages build their footer well after they finish loading — give it a moment and look again.'
            : 'The page may not have finished loading yet.'}
        </p>
        <div className="mt-2">
          <button className="panel-button" type="button" onClick={check.rediscover}>
            Look again
          </button>
        </div>
        {analyses.length > 0 ? <SourceLinks analyses={analyses} /> : null}
      </ReaderNote>
    );
  }

  const documents = discovery.documents;

  // 3. LOOKED, FOUND NOTHING. A real answer, so it says so in one line and offers the one retry
  //    that can help: a site whose footer renders late will list its documents on a second look.
  if (documents.length === 0) {
    return (
      <ReaderNote title="No policy documents on this page">
        <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
          Nothing here links to one. That is common on signed-in pages and on sites that keep their legal text on
          another domain
          {analyses.length > 0
            ? ' — it says nothing about the analysis above, which came from the bundle and needed no page access.'
            : '. We have not analysed this site either, so there is nothing else to show you yet.'}
        </p>
        <div className="mt-2">
          <button className="panel-button" type="button" onClick={check.rediscover}>
            Look again
          </button>
        </div>
        {analyses.length > 0 ? <SourceLinks analyses={analyses} /> : null}
      </ReaderNote>
    );
  }

  /*
   * 4. FOUND SOME. The only state that earns a disclosure — there is something behind it.
   *
   * Open by default on an uncovered site, where these documents are the entire contents of the
   * panel and collapsing them hides the one thing we came to offer. On a covered site the graded
   * analysis is the headline and this stays folded beneath it (D10).
   */
  return (
    <details className="panel-doc" open={analyses.length === 0}>
      <summary>
        <span className="panel-doc-title">Documents on this page</span>
        <span className="panel-count">{documents.length}</span>
        <span className="panel-doc-chevron" aria-hidden="true" />
      </summary>

      <div className="panel-doc-body">
        <div className="panel-group">
          {documents.map(candidate => (
            <DocumentRow
              key={candidate.url}
              candidate={candidate}
              domain={domain}
              check={check}
              onAnalyse={onAnalyse}
            />
          ))}
        </div>
      </div>
    </details>
  );
};

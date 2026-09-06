import { DOC_TYPE_LABELS, downloadFilename, shortenUrl } from '@src/lib/presentation';
import { useState } from 'react';
import type { RankedPolicyCandidate, SitePolicyAnalysis } from '@extension/unshafted-core';
import type { LivePolicyCheck } from '@src/hooks/useLivePolicyCheck';

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
 * Discovery finding nothing is a normal outcome, not an error: some sites link their policies
 * only from a signed-in surface, and 7 of 36 corpus domains host them cross-origin where an
 * in-page fetch cannot reach. The empty state says so and points at the source URLs the document
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
}: {
  candidate: RankedPolicyCandidate;
  domain: string;
  check: LivePolicyCheck;
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

export const DocumentReader = ({
  domain,
  analyses,
  check,
}: {
  domain: string;
  analyses: readonly SitePolicyAnalysis[];
  check: LivePolicyCheck;
}) => {
  const documents = check.discovery?.status === 'discovered' ? check.discovery.documents : [];

  return (
    <details className="panel-doc">
      <summary>
        <span className="panel-doc-title">Documents on this page</span>
        {check.discovery ? <span className="panel-count">{documents.length}</span> : null}
        <span className="panel-doc-chevron" aria-hidden="true" />
      </summary>

      <div className="panel-doc-body">
        {!check.discovery ? (
          <p className="m-0 text-xs text-[var(--unshafted-text-faint)]">Looking at the page…</p>
        ) : documents.length > 0 ? (
          <div className="panel-group">
            {documents.map(candidate => (
              <DocumentRow key={candidate.url} candidate={candidate} domain={domain} check={check} />
            ))}
          </div>
        ) : (
          <div className="panel-group">
            <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
              Nothing on this page links to a policy document. That is common on signed-in pages and on sites that host
              their legal text on another domain — it says nothing about the analysis above, which came from the bundle
              and needed no page access.
            </p>
            <p className="m-0 text-xs leading-relaxed text-[var(--unshafted-text-muted)]">
              These are the addresses we read:
            </p>
            {analyses.map(analysis => (
              <a
                key={analysis.contentHash}
                className="panel-row block no-underline"
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
          </div>
        )}
      </div>
    </details>
  );
};

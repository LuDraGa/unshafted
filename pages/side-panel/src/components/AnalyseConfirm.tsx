import { unshaftedOnboardingStorage, unshaftedSettingsStorage } from '@extension/storage';
import {
  RUN_SITE_POLICY_ANALYSIS_MESSAGE,
  SITE_POLICY_ANALYSIS_CHAR_LIMIT,
  getActiveProviderConfig,
} from '@extension/unshafted-core';
import { useStorageValue } from '@src/hooks/useStorageValue';
import { DOC_TYPE_LABELS, shortenUrl } from '@src/lib/presentation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RankedPolicyCandidate, RunSitePolicyAnalysisRequest } from '@extension/unshafted-core';
import type { LivePolicyCheck } from '@src/hooks/useLivePolicyCheck';

/**
 * The confirm (S5). Nothing in Part 6 spends a user's credits without passing through here.
 *
 * The rule it enforces is "nobody discovers the price after paying it", and the price of a run is
 * not one number — it is the documents, their sizes, which of them will be cut down to an excerpt,
 * and which model is going to read them. All four are on screen before the button is live.
 *
 * WHY THIS MEASURES BEFORE IT ASKS. Character counts need the actual text, and the text only
 * exists once the document has been captured from the page. Asking someone to approve a spend
 * against unknown sizes would be the same failure in a politer form, so the sheet fetches the
 * candidates through the reader's own cache — the same one "Read here" fills, so a document
 * already opened costs nothing — and shows "measuring…" until they land.
 *
 * Cross-origin documents never reach this sheet. AD-4 means we cannot read them from the page, and
 * S10 is that a document we cannot read is one we must not analyse.
 */

/**
 * HEURISTIC, and deliberately a warning rather than a gate.
 *
 * There is no capability registry to consult: the model is a free-text field, the user may point
 * it at anything their provider serves, and a name is the only signal available before the call.
 * These substrings are how the small tiers are conventionally named — they will miss models that
 * are weak under another name, and they will occasionally flag one that is fine. That asymmetry
 * is why it never disables anything: a false positive that blocked a run would be us overruling
 * the user about their own key, which is exactly the posture S1 rejects.
 */
const SMALL_MODEL_PATTERN = /mini|nano|flash|haiku|8b|7b|instruct/i;

type Measurement =
  | { state: 'measuring' }
  | { state: 'ready'; chars: number; text: string; hash: string }
  /** Captured nothing usable. Listed, excluded, and not counted against the spend. */
  | { state: 'unreadable' };

const candidateLabel = (candidate: RankedPolicyCandidate): string =>
  candidate.label || (candidate.docType ? DOC_TYPE_LABELS[candidate.docType] : shortenUrl(candidate.url));

const measure = (check: LivePolicyCheck, url: string): Measurement => {
  const entry = check.reads[url];
  if (!entry || entry.state === 'loading') return { state: 'measuring' };
  if (entry.capture.status !== 'captured') return { state: 'unreadable' };
  return { state: 'ready', chars: entry.capture.text.length, text: entry.capture.text, hash: entry.capture.hash };
};

/** The user has a key but has not pointed it anywhere we can name. Handled as "no key" (S7). */
const openOptionsAtKeyField = async (provider: 'openrouter' | 'openai') => {
  /*
   * `Options.tsx` focuses the key input only in onboarding mode and only on the `api-key` step,
   * so the deep link is the param AND the step — the URL alone lands on the provider picker.
   */
  await unshaftedOnboardingStorage.set(current => ({ ...current, currentStep: 'api-key', dismissedAt: null }));

  const url = chrome.runtime.getURL(`options/index.html?onboarding=true&provider=${provider}`);
  try {
    await chrome.tabs.create({ url });
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

export const AnalyseConfirm = ({
  domain,
  candidates,
  preselected,
  check,
  onCancel,
  onStarted,
}: {
  domain: string;
  /**
   * Same-origin and typed only. The caller filters; S10 and the untyped exclusion are not this
   * component's judgement to make.
   */
  candidates: readonly RankedPolicyCandidate[];
  /** A single URL when the user asked from a document row, null when they asked for the site. */
  preselected: string | null;
  check: LivePolicyCheck;
  onCancel: () => void;
  onStarted: () => void;
}) => {
  const settings = useStorageValue(unshaftedSettingsStorage);
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    // Default is all (S5): a terms document without its privacy policy is half an answer. The
    // per-row entry point is the exception, and it arrives pre-narrowed rather than pre-cleared.
    () => new Set(preselected ? [preselected] : candidates.map(candidate => candidate.url)),
  );
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  /*
   * The sheet can open from a document row halfway down the page, so focus follows it to the
   * decision — otherwise a keyboard or screen-reader user presses "Analyse…" and hears nothing.
   */
  const headingRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const { readDocument } = check;
  useEffect(() => {
    for (const candidate of candidates) readDocument(candidate.url);
  }, [candidates, readDocument]);

  const rows = useMemo(
    () => candidates.map(candidate => ({ candidate, measurement: measure(check, candidate.url) })),
    [candidates, check],
  );

  const measuring = rows.some(row => row.measurement.state === 'measuring');
  const chosen = rows.filter(row => selected.has(row.candidate.url) && row.measurement.state === 'ready');
  const unreadable = rows.filter(row => row.measurement.state === 'unreadable');
  const totalChars = chosen.reduce(
    (sum, row) => sum + (row.measurement.state === 'ready' ? row.measurement.chars : 0),
    0,
  );
  const excerpted = chosen.filter(
    row => row.measurement.state === 'ready' && row.measurement.chars > SITE_POLICY_ANALYSIS_CHAR_LIMIT,
  );

  const provider = settings ? getActiveProviderConfig(settings) : null;
  const hasKey = Boolean(provider?.apiKey);
  const smallModel = Boolean(provider && SMALL_MODEL_PATTERN.test(provider.model));

  const toggle = (url: string) =>
    setSelected(current => {
      const next = new Set(current);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });

  const start = async () => {
    if (chosen.length === 0) return;
    setSending(true);
    setSendError('');

    const request: RunSitePolicyAnalysisRequest = {
      type: RUN_SITE_POLICY_ANALYSIS_MESSAGE,
      targets: chosen.map(({ candidate, measurement }) => ({
        domain,
        sourceUrl: candidate.url,
        // Non-null by construction: the caller excludes untyped candidates, because `docType`
        // decides which checklist the document is read against and is then stored as a claim
        // about what it is. See the `analysable` filter in `SidePanel.tsx`.
        docType: candidate.docType!,
        text: measurement.state === 'ready' ? measurement.text : '',
        contentHash: measurement.state === 'ready' ? measurement.hash : '',
      })),
    };

    try {
      await chrome.runtime.sendMessage(request);
      onStarted();
    } catch {
      // The worker is the only thing that can run this; if the message did not land, nothing
      // started and nothing was spent. Say that rather than leaving a dead progress line.
      setSendError('The analysis did not start. Close the panel and open it again, then try once more.');
      setSending(false);
    }
  };

  return (
    /*
     * No surface of its own: this renders inside the analyse bar, which is the surface. A sheet
     * rising out of the bar that opened it is the popup's scope sheet, placed the same way — the
     * decision to spend sits where the offer to spend was, not somewhere in the reading flow.
     */
    <div className="panel-confirm">
      <p ref={headingRef} className="panel-eyebrow" tabIndex={-1}>
        Before it runs
      </p>

      <p className="panel-quiet">
        This runs on your own API key and spends your own credits. Nothing is sent until you press Analyse.
      </p>

      <div className="panel-confirm-rows">
        {rows.map(({ candidate, measurement }) => (
          <label key={candidate.url} className="panel-row panel-confirm-row">
            <input
              type="checkbox"
              aria-label={candidateLabel(candidate)}
              checked={selected.has(candidate.url)}
              disabled={measurement.state !== 'ready'}
              onChange={() => toggle(candidate.url)}
            />
            <span className="min-w-0 flex-1">
              <span className="panel-item-title block">{candidateLabel(candidate)}</span>
              <span className="panel-url">{shortenUrl(candidate.url)}</span>
              <span className="panel-confirm-size">
                {measurement.state === 'measuring'
                  ? 'Measuring…'
                  : measurement.state === 'unreadable'
                    ? 'This page could not be read from here, so it cannot be analysed.'
                    : `${measurement.chars.toLocaleString()} characters${
                        measurement.chars > SITE_POLICY_ANALYSIS_CHAR_LIMIT ? ' — an excerpt will be read' : ''
                      }`}
              </span>
            </span>
          </label>
        ))}
      </div>

      {/*
        P16: every pre-spend fact is on screen, unconditionally, and none of it is behind a control.
        The two that are always true of a run — what goes and where — are laid out as a list so the
        eye can find them; the conditional ones stay sentences, because each is a warning in words.
      */}
      <dl className="panel-facts">
        <dt>Sends</dt>
        <dd>
          {measuring
            ? 'Measuring the documents. The totals appear once every one has been read.'
            : chosen.length === 0
              ? 'Nothing selected, so nothing will run.'
              : `${chosen.length === 1 ? '1 document' : `${chosen.length} documents`}, ${totalChars.toLocaleString()} characters in total.`}
        </dd>
        {provider ? (
          <>
            <dt>{hasKey ? 'To' : 'Would go to'}</dt>
            <dd>
              {provider.provider === 'openai' ? 'OpenAI' : 'OpenRouter'} · {provider.model}
            </dd>
          </>
        ) : null}
      </dl>

      {/* S6: excerpting is disclosed per document, before anything is spent, not after. */}
      {excerpted.length > 0 ? (
        <p className="panel-quiet">
          {excerpted.length === 1 ? 'One document is' : `${excerpted.length} documents are`} longer than{' '}
          {SITE_POLICY_ANALYSIS_CHAR_LIMIT.toLocaleString()} characters, so the model reads an excerpt of{' '}
          {excerpted.length === 1 ? 'it' : 'them'} and not the whole thing:{' '}
          {excerpted.map(row => candidateLabel(row.candidate)).join(', ')}.
        </p>
      ) : null}

      {unreadable.length > 0 ? (
        <p className="panel-quiet">
          {unreadable.length === 1 ? 'One document' : `${unreadable.length} documents`} could not be read from this page
          and will not be analysed. Opening {unreadable.length === 1 ? 'it' : 'them'} in a tab will still work.
        </p>
      ) : null}

      {smallModel ? (
        <p className="panel-quiet">That model is a small one, so the result may be unreliable on long documents.</p>
      ) : null}

      {/*
        S7: no key is a route, not a refusal. The button was always there; this is where the panel
        says what it needs and hands the user the field that fills it.
      */}
      {settings && !hasKey ? (
        <p className="panel-quiet">
          There is no API key set yet. The analysis runs on your own key against your own provider account, so it needs
          one before it can call anything.
        </p>
      ) : null}

      {sendError ? <p className="panel-quiet">{sendError}</p> : null}

      {/*
        The one filled button on the screen, because it is the one that commits. Cancel is text: it
        undoes nothing and costs nothing, and dressing it as an equal choice is what made the two
        indistinguishable before.
      */}
      <div className="panel-actions">
        {provider && !hasKey ? (
          <button
            className="panel-button-primary"
            type="button"
            onClick={() => void openOptionsAtKeyField(provider.provider)}>
            Add a key in settings
          </button>
        ) : (
          <button
            className="panel-button-primary"
            type="button"
            disabled={measuring || chosen.length === 0 || sending || !settings}
            onClick={() => void start()}>
            {sending ? 'Starting…' : chosen.length === 1 ? 'Analyse 1 document' : `Analyse ${chosen.length} documents`}
          </button>
        )}

        <button className="panel-text-button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
};

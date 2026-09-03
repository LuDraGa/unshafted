import {
  captureActiveTabPolicy,
  fetchPolicyAnalysis,
  fetchPolicyDomainIndex,
  fetchPolicySourceText,
  getPolicySubmitUrl,
  resolveCoveredHostname,
  submitPolicyAnalysisRequest,
} from '@extension/shared';
import { sitePolicyCacheStorage, sitePolicyDomainCacheStorage } from '@extension/storage';
import { diffPolicyText, findAffectedExposures, POLICY_NORMALIZER_VERSION, sha256Hex } from '@extension/unshafted-core';
import { useCallback, useState } from 'react';
import type { PolicyCaptureResult } from '@extension/shared';
import type { Exposure, PolicyDocType, SitePolicyAnalysis } from '@extension/unshafted-core';

/**
 * "This site" panel — the standing half of site policy awareness.
 *
 * The badge already said this site is covered, using only the bundled index and zero network
 * (AD-2). This panel is the other lookup: on an explicit user gesture it captures the policy
 * under `activeTab`, hashes it, and resolves that hash against the local cache, then the CDN.
 *
 * Freshness is a conditional GET with stale-while-revalidate — cached content renders first and
 * the network never blocks the view.
 */

const DOC_TYPE_LABELS: Record<PolicyDocType, string> = {
  privacy: 'Privacy policy',
  terms: 'Terms of service',
  cookie: 'Cookie policy',
  eula: 'End user licence',
  acceptable_use: 'Acceptable use policy',
  data_processing: 'Data processing terms',
};

const RISK_TONE: Record<SitePolicyAnalysis['riskLevel'], string> = {
  Low: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  Medium: 'border-amber-200 bg-amber-50 text-amber-900',
  High: 'border-orange-200 bg-orange-50 text-orange-900',
  'Very High': 'border-rose-200 bg-rose-50 text-rose-900',
};

const SEVERITY_TONE: Record<Exposure['severity'], string> = {
  low: 'bg-stone-100 text-stone-700',
  medium: 'bg-amber-100 text-amber-900',
  high: 'bg-rose-100 text-rose-900',
};

type Captured = Extract<PolicyCaptureResult, { status: 'captured' }>;

type ChangeReport = {
  changedHeadings: string[];
  affected: Exposure[];
  addedCount: number;
  removedCount: number;
};

type PanelState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'unsupported' }
  | { kind: 'no-policy' }
  | { kind: 'error'; message: string }
  | { kind: 'uncovered'; capture: Captured; submitted: boolean }
  | { kind: 'ready'; analysis: SitePolicyAnalysis; capture: Captured; changed: ChangeReport | null };

/**
 * Deadlines render as the WINDOW a policy grants, never as a countdown.
 *
 * A countdown needs the date the user accepted, which the extension does not know and must not
 * guess — a confident "18 days left" that is actually 0 is worse than no number at all.
 */
const describeDeadline = (deadline: NonNullable<SitePolicyAnalysis['availableActions'][number]['deadline']>) =>
  deadline.kind === 'relative_to_signup' && deadline.days
    ? `Window: ${deadline.days} days from when you accepted`
    : `Window: ${deadline.description}`;

/** Resolve the domain's known hashes, preferring a `304` over refetching. */
const readDomainHashes = async (hostname: string): Promise<string[]> => {
  const covered = await resolveCoveredHostname(hostname);
  if (!covered) return [];

  const domainHash = await sha256Hex(covered.domain);
  const cached = await sitePolicyDomainCacheStorage.get(domainHash);
  const result = await fetchPolicyDomainIndex(domainHash, cached?.etag);

  if (result.status === 'not-modified') {
    await sitePolicyDomainCacheStorage.touch(domainHash);
    return cached?.hashes ?? [];
  }

  if (result.status === 'ok') {
    await sitePolicyDomainCacheStorage.put({
      domainHash,
      etag: result.etag,
      hashes: result.index.hashes,
      promptVersion: result.index.promptVersion,
      checkedAt: Date.now(),
    });
    return result.index.hashes;
  }

  return cached?.hashes ?? [];
};

const resolveAnalysis = async (hash: string): Promise<SitePolicyAnalysis | null> => {
  const cached = await sitePolicyCacheStorage.get(hash);
  if (cached) return cached;

  const fetched = await fetchPolicyAnalysis(hash);
  if (fetched.status !== 'ok') return null;

  await sitePolicyCacheStorage.put(fetched.analysis);
  return fetched.analysis;
};

export const SitePolicyPanel = () => {
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const canRequestAnalysis = getPolicySubmitUrl() !== null;

  const check = useCallback(async () => {
    setState({ kind: 'working' });

    const capture = await captureActiveTabPolicy();
    if (capture.status === 'unsupported-page') return setState({ kind: 'unsupported' });
    if (capture.status === 'no-policy-found') return setState({ kind: 'no-policy' });
    if (capture.status === 'error') return setState({ kind: 'error', message: capture.message });

    // Stale-while-revalidate: anything already cached for this exact version is shown at once.
    const cached = await sitePolicyCacheStorage.get(capture.hash);
    if (cached) setState({ kind: 'ready', analysis: cached, capture, changed: null });

    const knownHashes = await readDomainHashes(capture.hostname);

    if (!cached) {
      const analysis = await resolveAnalysis(capture.hash);
      if (analysis) return setState({ kind: 'ready', analysis, capture, changed: null });
    }

    // Our hash is not among the analyzed versions, but earlier ones exist: the document moved.
    if (!cached && knownHashes.length > 0 && !knownHashes.includes(capture.hash)) {
      const priorHash = knownHashes[0]!;
      const [priorAnalysis, priorText] = await Promise.all([
        resolveAnalysis(priorHash),
        fetchPolicySourceText(priorHash),
      ]);

      if (priorAnalysis && priorText) {
        const diff = diffPolicyText(priorText, capture.text);
        return setState({
          kind: 'ready',
          analysis: priorAnalysis,
          capture,
          changed: {
            changedHeadings: diff.changedHeadings,
            affected: findAffectedExposures(diff, priorAnalysis.exposures),
            addedCount: diff.added.length,
            removedCount: diff.removed.length,
          },
        });
      }
    }

    if (!cached) setState({ kind: 'uncovered', capture, submitted: false });
  }, []);

  const requestAnalysis = useCallback(async () => {
    if (state.kind !== 'uncovered') return;
    const { capture } = state;

    const result = await submitPolicyAnalysisRequest({
      domain: capture.hostname,
      docType: capture.docType,
      sourceUrl: capture.sourceUrl,
      contentHash: capture.hash,
      normalizedText: capture.text,
      normalizerVersion: POLICY_NORMALIZER_VERSION,
    });

    if (result.status === 'error') return setState({ kind: 'error', message: result.message });
    setState({ ...state, submitted: true });
  }, [state]);

  return (
    <section className="popup-card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="popup-eyebrow">This site</p>
          <p className="popup-subtitle">What you agreed to by using it.</p>
        </div>
        <button
          className="popup-secondary-button flex-shrink-0"
          onClick={check}
          type="button"
          disabled={state.kind === 'working'}>
          {state.kind === 'working' ? 'Reading…' : 'Check site'}
        </button>
      </div>

      {state.kind === 'unsupported' ? (
        <p className="text-xs text-stone-600">This page has no policies to read.</p>
      ) : null}

      {state.kind === 'no-policy' ? (
        <p className="text-xs text-stone-600">Couldn&apos;t find a policy document linked from this page.</p>
      ) : null}

      {state.kind === 'error' ? <p className="text-xs text-rose-700">{state.message}</p> : null}

      {state.kind === 'uncovered' ? (
        <UncoveredView
          capture={state.capture}
          submitted={state.submitted}
          canRequest={canRequestAnalysis}
          onRequest={requestAnalysis}
        />
      ) : null}

      {state.kind === 'ready' ? (
        <>
          {state.changed ? <ChangeNotice report={state.changed} /> : null}
          <AnalysisView analysis={state.analysis} stale={state.changed !== null} />
        </>
      ) : null}
    </section>
  );
};

const UncoveredView = ({
  capture,
  submitted,
  canRequest,
  onRequest,
}: {
  capture: Captured;
  submitted: boolean;
  canRequest: boolean;
  onRequest: () => void;
}) => (
  <div className="space-y-2">
    <p className="text-xs text-stone-600">
      Found this site&apos;s {DOC_TYPE_LABELS[capture.docType].toLowerCase()}, but this exact version
      hasn&apos;t been analyzed yet.
    </p>

    {submitted ? (
      <p className="text-xs text-emerald-800">Requested. It&apos;ll appear here once it&apos;s been analyzed.</p>
    ) : canRequest ? (
      <>
        {/*
          The only egress in this feature tied to a specific domain, and it happens because the
          user pressed a button that spells out what it sends. Consent-gated signal, not telemetry.
        */}
        <p className="text-[11px] text-stone-500">
          Sends the policy&apos;s address ({capture.hostname}), its public text, and a checksum. Nothing
          about you or your browsing.
        </p>
        <button className="popup-secondary-button" onClick={onRequest} type="button">
          Request an analysis
        </button>
      </>
    ) : null}
  </div>
);

const ChangeNotice = ({ report }: { report: ChangeReport }) => (
  <div className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2">
    <p className="text-xs font-semibold text-violet-900">
      This page changed since it was analyzed
      {report.changedHeadings.length > 0 ? ` — ${report.changedHeadings.length} section(s)` : ''}
    </p>

    {report.changedHeadings.length > 0 ? (
      <ul className="mt-1 list-inside list-disc text-xs text-violet-800">
        {report.changedHeadings.slice(0, 5).map(heading => (
          <li key={heading}>{heading}</li>
        ))}
      </ul>
    ) : null}

    {report.affected.length > 0 ? (
      <p className="mt-1 text-xs text-violet-900">
        Affects: {report.affected.map(exposure => exposure.title).join(', ')}
      </p>
    ) : null}

    {/* We can say what moved. We cannot say what it now means — that needs re-analysis. */}
    <p className="mt-1 text-[11px] text-violet-700">
      The findings below describe the earlier version.
    </p>
  </div>
);

const AnalysisView = ({ analysis, stale }: { analysis: SitePolicyAnalysis; stale: boolean }) => (
  <div className="space-y-3">
    <div className={`rounded-2xl border px-3 py-2 ${RISK_TONE[analysis.riskLevel]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">
        {DOC_TYPE_LABELS[analysis.docType]} · {analysis.riskLevel} risk{stale ? ' · earlier version' : ''}
      </p>
      <p className="mt-1 text-sm">{analysis.summary}</p>
    </div>

    {analysis.exposures.length > 0 ? (
      <div className="space-y-2">
        <p className="popup-eyebrow">What you gave up</p>
        {analysis.exposures.map(exposure => (
          <div key={exposure.title} className="rounded-2xl border border-stone-200 bg-white px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-stone-900">{exposure.title}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_TONE[exposure.severity]}`}>
                {exposure.severity}
              </span>
            </div>
            <p className="mt-1 text-xs text-stone-700">{exposure.whatItMeans}</p>
            <p className="mt-1 text-xs text-stone-500">{exposure.whyItMatters}</p>
          </div>
        ))}
      </div>
    ) : null}

    {analysis.availableActions.length > 0 ? (
      <div className="space-y-2">
        <p className="popup-eyebrow">What you can still do</p>
        {analysis.availableActions.map(action => (
          <div key={action.action} className="rounded-2xl border border-stone-200 bg-white px-3 py-2">
            <p className="text-sm font-semibold text-stone-900">{action.action}</p>
            <p className="mt-1 text-xs text-stone-700">{action.howTo}</p>
            {action.deadline ? (
              <p className="mt-1 text-xs font-semibold text-violet-700">{describeDeadline(action.deadline)}</p>
            ) : null}
          </div>
        ))}
      </div>
    ) : null}

    {analysis.requiredDisclosures.some(disclosure => disclosure.status === 'absent') ? (
      <div className="space-y-2">
        <p className="popup-eyebrow">Missing disclosures</p>
        {analysis.requiredDisclosures
          .filter(disclosure => disclosure.status === 'absent')
          .map(disclosure => (
            <div key={disclosure.name} className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2">
              <p className="text-sm font-semibold text-rose-900">
                {disclosure.name} <span className="font-normal">({disclosure.regime})</span>
              </p>
              <p className="mt-1 text-xs text-rose-800">{disclosure.note}</p>
            </div>
          ))}
      </div>
    ) : null}

    <p className="text-[11px] text-stone-500">
      Analyzed {new Date(analysis.analyzedAt).toLocaleDateString()} · {analysis.model}
    </p>
  </div>
);

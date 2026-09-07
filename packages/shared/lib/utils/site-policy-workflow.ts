import { resolveProvider } from './resolve-provider.js';
import {
  AnalysisErrorSchema,
  buildBalancedExcerpt,
  buildSitePolicyAnalysisSystemPrompt,
  buildSitePolicyAnalysisUserPrompt,
  callOpenRouterStructured,
  POLICY_NORMALIZER_VERSION,
  SITE_POLICY_ANALYSIS_CHAR_LIMIT,
  SITE_POLICY_PROMPT_VERSION,
  SITE_POLICY_SCHEMA_VERSION,
  SitePolicyAnalysisSchema,
} from '@extension/unshafted-core';
import type { AppSettings, LocalPolicyAnalysis, SitePolicyAnalysisTarget, Vertical } from '@extension/unshafted-core';

/**
 * The six keys the model is asked for, and nothing else (Part 6, S1).
 *
 * `prompt.ts` deliberately withholds contentHash, domain, docType, verticals, surfaces,
 * sourceUrl, promptVersion, normalizerVersion, model, schemaVersion, analyzedAt and
 * peerDeviation — every one of those is an observed fact the capture already holds, and a model
 * asked to restate one would rewrite it as a plausible guess. Accepting them back here would
 * quietly reopen that door, so the response schema cannot express them at all.
 *
 * Picked off the published schema rather than restated, so the six key names and their element
 * shapes cannot drift from what the prompt's output contract promises and what storage, Drive and
 * the panel already read. (It is also the only way to build this schema without `zod` itself,
 * which is not a dependency of this package.)
 */
const SitePolicyModelResponseSchema = SitePolicyAnalysisSchema.pick({
  summary: true,
  riskLevel: true,
  confidence: true,
  exposures: true,
  availableActions: true,
  requiredDisclosures: true,
});

/**
 * Nothing at runtime knows a site's vertical.
 *
 * The corpus hand-tags them in `curated.json`; `discover.ts` guesses only the document type; and
 * the prompt explicitly forbids the model from guessing one, because a vertical drives which
 * disclosure checklist a document is read against and an invented one produces findings about
 * obligations that never applied. `SitePolicyAnalysisSchema.verticals` is `min(1)`, so the object
 * cannot be assembled without something — and `'other'` is the schema's own member for exactly
 * this: `VERTICAL_CHECKLIST.other` is empty, so tagging it adds no expectations, and
 * `buildSitePolicyAnalysisUserPrompt` filters `'other'` out before it reaches the model. The tag
 * therefore says "unclassified" rather than making a claim about the site.
 */
const UNCLASSIFIED_VERTICALS: Vertical[] = ['other'];

/**
 * Runs one policy document through the user's own key and returns the local-only wrapper.
 *
 * Mirrors `runQuickScan` / `runDeepAnalysis` in shape, with one deliberate difference: those
 * fold a failure into the `CurrentAnalysis` they were handed, because a document is a
 * single-slot workspace. A site-policy run walks several documents, and the caller has to be
 * able to record one failure and keep going, so this throws an `AnalysisError` instead.
 */
export const runSitePolicyAnalysis = async (
  target: SitePolicyAnalysisTarget,
  settings: AppSettings,
): Promise<LocalPolicyAnalysis> => {
  const resolved = resolveProvider(settings);
  // The same balanced excerpter the upload flow uses, at the policy budget — a policy document is
  // one continuous instrument, so it gets more room than a contract the user is a party to.
  const prepared = buildBalancedExcerpt(target.text, SITE_POLICY_ANALYSIS_CHAR_LIMIT);
  const excerpted = prepared.truncated;

  try {
    const response = await callOpenRouterStructured({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      model: resolved.deepModel,
      temperature: resolved.temperature,
      reasoningEffort: 'high',
      schema: SitePolicyModelResponseSchema,
      schemaName: 'site_policy_analysis',
      title: 'Unshafted Site Policy Analysis',
      messages: [
        {
          role: 'system',
          content: buildSitePolicyAnalysisSystemPrompt(),
        },
        {
          role: 'user',
          content: buildSitePolicyAnalysisUserPrompt({
            domain: target.domain,
            sourceUrl: target.sourceUrl,
            docType: target.docType,
            preparedText: prepared.text,
            excerpted,
          }),
        },
      ],
    });

    const result = SitePolicyModelResponseSchema.parse(response.data);

    // S6, enforced here even though the prompt already asks for both: the prompt ASKS, the code
    // GUARANTEES. A model that ignores either instruction would otherwise publish, under the
    // user's own name, a claim we cannot support from a partial read.
    //
    // `confidence` is about our read, and a read of an excerpt is not a complete one.
    //
    // An `absent` disclosure is DROPPED rather than restated, because there is no honest status
    // to move it to: `DisclosureStatusSchema` is exactly present | absent | not_applicable, and
    // `not_applicable` is a different and equally false claim — it says the obligation does not
    // attach to this document, which we did not determine either. (The corpus's phrase "record it
    // as unverified" is a prose convention that lives inside `note` text; it is not an enum value
    // and must not be invented as one.) Dropping the entry claims nothing in either direction,
    // where keeping it would render a red "Missing disclosures" row asserting a company omitted
    // something we never actually read.
    const confidence = excerpted && result.confidence === 'high' ? 'medium' : result.confidence;
    const requiredDisclosures = excerpted
      ? result.requiredDisclosures.filter(disclosure => disclosure.status !== 'absent')
      : result.requiredDisclosures;

    // Assembled here and parsed through the published schema, so a bad assembly fails loudly
    // rather than reaching storage, Drive and the panel as a half-formed object.
    const analysis = SitePolicyAnalysisSchema.parse({
      schemaVersion: SITE_POLICY_SCHEMA_VERSION,
      contentHash: target.contentHash,
      domain: target.domain,
      domains: [target.domain],
      docType: target.docType,
      verticals: UNCLASSIFIED_VERTICALS,
      // Where the document was presented is an observation the capture does not make, and an
      // empty list says we did not observe it rather than guessing "footer".
      surfaces: [],
      sourceUrl: target.sourceUrl,
      promptVersion: SITE_POLICY_PROMPT_VERSION,
      normalizerVersion: POLICY_NORMALIZER_VERSION,
      model: resolved.deepModel,
      analyzedAt: new Date().toISOString(),
      summary: result.summary,
      riskLevel: result.riskLevel,
      confidence,
      exposures: result.exposures,
      availableActions: result.availableActions,
      requiredDisclosures,
      // A claim about how this clause compares to peers. One document has no peers.
      peerDeviation: [],
    });

    return {
      analysis,
      provenance: {
        ranAt: new Date().toISOString(),
        provider: resolved.provider,
        model: resolved.deepModel,
        promptVersion: SITE_POLICY_PROMPT_VERSION,
        excerpted,
        sourceChars: target.text.length,
      },
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      throw AnalysisErrorSchema.parse(error);
    }

    throw AnalysisErrorSchema.parse({
      code: 'llm_request_failed',
      message: error instanceof Error && error.message ? error.message : 'Site policy analysis failed.',
      suggestion: 'Try again, or switch the deep model in Options.',
      retryable: true,
      raw: error instanceof Error ? error.message : undefined,
    });
  }
};

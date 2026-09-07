import type { PolicyDocType, Vertical } from './types.js';

/**
 * The executable prompt behind `site-policy-prompt-v1` (Part 6, S4).
 *
 * `adhesion-rubric-v1` never had one — the 83 corpus analyses came out of an Opus session reading
 * complete documents from `corpus/text/` and emitting JSON through `tools/corpus/write-analysis.ts`.
 * This file is the attempt to write that session down, and it must never claim the corpus's version
 * string: that string asserts a complete read, hand-validated against the schema, and this runs a
 * possibly-excerpted document through whatever model the user configured.
 *
 * WHY THE MODEL IS ASKED FOR SIX KEYS AND NOT TWENTY.
 *
 * `write-analysis.ts` takes only the analytic content and copies contentHash, docType, verticals,
 * sourceUrl and the rest out of `curated.json` — because hand-transcribing a 64-character hash into
 * 85 files is a silent-corruption machine, and a wrong hash produces an object that validates
 * perfectly and that no client will ever find. A model asked to restate provenance is the same
 * machine with a worse operator: it would rewrite an observed fact as a plausible one. So the
 * contract below is `summary`, `riskLevel`, `confidence`, `exposures`, `availableActions`,
 * `requiredDisclosures`, and the caller fills everything else from the capture.
 *
 * The checklists are lifted from the disclosure names the corpus actually used, by document type
 * and vertical. That keeps a local analysis speaking the same vocabulary as a published one, which
 * is what makes the two comparable at all — Part 4 §"the clause vocabulary" is the reason the
 * names are worth holding steady rather than letting each run invent its own.
 */

const list = (items: string[]) => items.map(item => `- ${item}`).join('\n');

/** What a reader of this kind of document most needs someone to look for on their behalf. */
const DOC_TYPE_BRIEF: Record<PolicyDocType, string> = {
  terms:
    'the contract of use — liability caps and exclusions, the dispute route (arbitration, class waiver, venue, any opt-out window), the licence taken over what the user posts, unilateral amendment, termination and account loss, fees and refunds',
  privacy:
    'what is collected, who else receives it, how long it is kept, what the user can switch off and where, cross-border transfer, and whether the user’s content trains models',
  cookie:
    'whether consent is asked before non-essential cookies are set, what stops working if the user refuses, whether third parties are named or only categorised, and whether the controls offered act before or after collection has started',
  eula: 'licence scope and its limits, what the software may do on the device, telemetry, update and revocation rights, and bans on transfer or reverse engineering',
  acceptable_use:
    'what conduct costs the user their account, how vague the standard is, who decides, and whether any appeal exists',
  data_processing:
    'controller and processor roles, sub-processors, security commitments, breach notification timing, audit rights, and deletion on termination',
  regulatory_disclosure:
    'the routes and clocks it grants — named officers, escalation ladders, resolution deadlines, compensation, and precisely where the route stops',
  copyright:
    'how a takedown is filed, whether an agent is designated, whether a counter-notice route exists, what repeat infringement costs, and what happens to the user’s own content while a claim is open',
  program_terms:
    'what this program adds on top of the base terms — fees, auto-renewal, how benefits are earned and expire, and the right to change or end the program',
  esign_consent:
    'what the user agreed to receive electronically instead of on paper, the hardware and software required to read it, how consent is withdrawn, and what withdrawal costs',
};

/**
 * The disclosures a document of this type is read AGAINST. Absence is a harder fact than any
 * severity rating and a pure clause-reader cannot produce it — it depends on knowing what should
 * have been there ([schemas.ts](./schemas.ts), `RequiredDisclosureSchema`). This list is that
 * knowledge, and without it the model can only report what it happens to see.
 */
const DOC_TYPE_CHECKLIST: Record<PolicyDocType, string[]> = {
  terms: [
    'Notice of changes to terms — is there any notice period, or do amendments bind on posting?',
    'Governing law and jurisdiction',
    'Refund and cancellation rights',
    'Limitation on indemnity — is the user’s indemnity capped or open-ended?',
    'Consumer rights preservation — a savings clause for rights that cannot be excluded',
    'Company identification details — the legal entity, not the brand',
    'Minimum age',
    'Arbitration opt-out right and any pre-arbitration dispute procedure',
    'Automatic renewal disclosure',
  ],
  privacy: [
    'Retention period — a stated period, or only "as long as necessary"?',
    'Notice of changes to terms',
    'Categories of personal data collected',
    'Data received about the user from other sources — advertisers, data partners, the public web',
    'Named third-party recipients — named, or only described as categories?',
    'International transfer safeguards',
    'Lawful basis for processing',
    'Data subject rights and the route to exercise them',
    'Consent withdrawal mechanism',
    'Do Not Sell or Share My Personal Information',
    'AI training opt-out',
    'Data protection officer or privacy contact',
    'Children under 13',
    'Automated decision-making rights',
  ],
  cookie: [
    'Consent mechanism for non-essential cookies — asked before setting, or only browser blocking afterwards?',
    'Granular consent control, as distinct from all-or-nothing',
    'Categories of cookies and their purposes',
    'Named third-party recipients',
    'Lawful basis for cookie processing',
    'Retention period or cookie lifespan',
    'Do Not Sell or Share My Personal Information',
    'Notice of changes to terms, and whether the document carries a date at all',
  ],
  eula: [
    'Licence scope and termination of the licence',
    'Telemetry and what the software reports back',
    'Notice of changes to terms',
    'Refund rights',
    'Governing law and jurisdiction',
    'Company identification details',
  ],
  acceptable_use: [
    'Enforcement and appeal route — who decides, and can the user answer?',
    'Notice before suspension or removal',
    'Notice of changes to terms',
    'Reporting mechanism',
  ],
  data_processing: [
    'Sub-processor list and notice of changes to it',
    'Breach notification timing',
    'Audit rights',
    'Deletion or return of data on termination',
    'International transfer safeguards',
    'Security measures described specifically rather than as "appropriate"',
  ],
  regulatory_disclosure: [
    'Named Grievance Officer or nodal officer with direct contact details',
    'Consumer complaint route, level by level',
    'Error resolution procedure and timeframes',
    'Company identification details and registered address',
    'Compensation framework and its exclusions',
    'Notice of changes to terms',
    'Where the internal route ends and an external regulator begins',
  ],
  copyright: [
    'Designated agent for notices, with contact details',
    'Counter-notice route',
    'Repeat infringer policy',
    'Notice of changes to terms',
    'What happens to the user’s content while a claim is open',
  ],
  program_terms: [
    'Automatic renewal disclosure and the cancellation route',
    'Fee changes and notice of them',
    'Expiry or forfeiture of benefits',
    'The right to change or end the program',
    'Refund and cancellation rights',
  ],
  esign_consent: [
    'Hardware and software requirements to receive and retain disclosures',
    'Withdrawal of consent and what it costs',
    'How to request a paper copy, and any fee',
    'How to update the contact address electronic notices go to',
    'Which disclosures the consent covers',
  ],
};

/** Read on top of the document-type checklist. Verticals are tags, so several may apply at once. */
const VERTICAL_CHECKLIST: Record<Vertical, string[]> = {
  finance_banking: [
    'GLBA consumer privacy notice and its opt-out for sharing with non-affiliates',
    'Named Grievance Officer and the external ombudsman route',
    'Error resolution and dispute timeframes for transactions',
  ],
  payments_fintech: [
    'Chargeback, reversal and dispute procedure',
    'Named Grievance Officer',
    'Account freeze or hold rights and the route to release',
  ],
  ecommerce: [
    'Refund, return and cancellation rights',
    'Who the seller of record is when the platform is not the seller',
    'Pricing and cancellation of an accepted order',
  ],
  subscription_autorenewal: [
    'Automatic renewal disclosure — price, interval, and the cancellation route',
    'Notice before a renewal charge',
    'Whether cancellation is effective immediately or at period end',
  ],
  ott_streaming: [
    'Automatic renewal disclosure',
    'Removal of content the user paid for',
    'Children under 13 and profile-level controls',
  ],
  social_ugc: [
    'The content licence — scope, duration, sublicensing, and whether it survives deletion',
    'Designated DMCA agent and repeat infringer policy',
    'Minimum age',
    'Biometric or face data',
  ],
  identity_provider: [
    'What is shared with sites the user signs into',
    'Revocation of a connected app’s access',
    'What happens to connected sites when the account is deleted',
  ],
  saas_productivity: [
    'AI training opt-out for customer content',
    'Data export and deletion on termination',
    'Administrator access to an individual user’s content',
  ],
  health_wellness: [
    'Health data handled as a sensitive category, with a stated basis',
    'Sharing with insurers, employers or advertisers',
    'Retention of health records',
  ],
  other: [],
};

const DOC_TYPE_LABEL: Record<PolicyDocType, string> = {
  terms: 'Terms of service',
  privacy: 'Privacy policy',
  cookie: 'Cookie notice',
  eula: 'End user licence agreement',
  acceptable_use: 'Acceptable use policy',
  data_processing: 'Data processing agreement',
  regulatory_disclosure: 'Regulatory disclosure',
  copyright: 'Copyright / DMCA policy',
  program_terms: 'Program terms',
  esign_consent: 'Electronic disclosure consent',
};

export const buildSitePolicyAnalysisSystemPrompt = () =>
  `
You are Unshafted, reading a website's own policy document on behalf of the person using that site.

This is a contract of adhesion. It was accepted by using the service, there is nobody on the other
end of a redline, and any suggestion to "ask for", "push back on" or "negotiate" a clause is dead on
arrival. The only verbs that mean anything here are KNOW, OPT OUT, AVOID and LEAVE. Everything you
write has to survive one question: what can this person actually do on Tuesday morning?

You are reading ONE document. Other documents the site publishes, and any page this one links to,
are not in front of you and their contents are unknown to you.

STANDING RULES. These are not style preferences. Output that breaks them is worse than no output,
because it is a false claim about a real company published under the user's own name.

1. Never state a fact the document does not state. Not an effective date, not a jurisdiction, not
   the legal entity, not a deadline's anchor. If a clause defers to a linked page you were not
   given, the answer is that this document does not say — not what the linked page probably says.
2. Where the text you are given is incomplete, cap confidence at "medium" and record what you could
   not check as unverified. Never report a disclosure as absent on the strength of a partial read.
   "Absent" is an accusation; from an excerpt it is an unfounded one.
3. Deadlines are windows, never countdowns. You do not know when this person signed up, accepted,
   or was charged, and you must not compute a date or a number of days remaining. State the window
   the document grants and the event it runs from, in the document's own terms.
4. Make no comparative claim. Not "unusually broad", not "most services do not", not "standard for
   the industry". Peer share needs a corpus and a minimum of ten peers; you have one document and
   no peers, and an invented norm is the same error as an invented clause.

HOW TO READ

- Quote before you characterise. Every exposure carries a reference: the section heading as it
  appears in the text, plus the verbatim wording wherever that wording IS the finding. Never invent
  a section number, and never tidy a quote into something it does not say.
- The text was captured from a live page, so it carries page furniture: navigation, footers,
  help-centre chrome, feedback widgets, lists of other articles. None of that is the document. A
  link in the footer is evidence that a page exists, never evidence of what that page says.
- Read the carve-outs. "Does not apply to", "except", "shall not be applicable", "other than" —
  the list of what a right, a guarantee or a compensation scheme excludes is usually where the real
  cost sits, and it is usually further down the page than the promise it qualifies. Load-bearing
  clauses also hide inside all-caps blocks that scan as noise; read them.
- "whatItMeans" restates what the document provides, in plain words. "whyItMatters" is the cost to
  a real person — money, safety, recourse, or something they cannot undo. If you cannot name the
  cost, the finding is not an exposure.
- Prefer the finding that would change what someone does over the finding that sounds worst.
- Say what the document does well when it does. A document that names its grievance officer, gives
  a direct phone number and commits to a timeline has earned that said about it, and an analysis
  that only ever finds fault is not being read carefully.
- If the text you were given is not a policy document at all — a login wall, an error page, a
  navigation shell, a marketing page — say exactly that in the summary, set confidence "low", and
  return no exposures. Manufacturing findings from the wrong page is the worst failure available.

CALIBRATION

- severity "high": the cost lands on money, physical safety, legal recourse, or identity, and the
  clause takes away the ability to do anything about it.
- severity "medium": a real cost, but bounded, or a route out exists and the user has to find it.
- severity "low": worth knowing, no material loss on its own — a stale date, a business-hours limit.
- riskLevel "Low": the document mostly hands the reader routes, named contacts and commitments, and
  what it costs is small and specific. This grade is available and should be used when earned.
- riskLevel "Medium": ordinary adhesion terms. Real exposures, none of them severe, and the reader
  keeps a way to act.
- riskLevel "High": several severe exposures, or a single one that removes recourse.
- riskLevel "Very High": the document disclaims the thing the service is for, or stacks the removal
  of recourse — liability capped near nothing, confidential arbitration or a class waiver, a
  perpetual sublicensable licence, termination without cause or notice.
- confidence is about YOUR READ, not about the company. "high" only for a complete document you
  could follow end to end. "medium" for an excerpt, or a document that defers most of its substance
  to links you do not have. "low" when the text cannot support findings at all.

Return JSON only.
`.trim();

export const buildSitePolicyAnalysisUserPrompt = (params: {
  domain: string;
  sourceUrl: string;
  docType: PolicyDocType;
  verticals?: Vertical[];
  preparedText: string;
  excerpted: boolean;
}): string => {
  const verticals = params.verticals?.filter(vertical => vertical !== 'other') ?? [];
  const verticalChecklist = [...new Set(verticals.flatMap(vertical => VERTICAL_CHECKLIST[vertical]))];

  return `
Analyse this site policy document.

Document:
- Site: ${params.domain}
- Type: ${DOC_TYPE_LABEL[params.docType]} (${params.docType}) — ${DOC_TYPE_BRIEF[params.docType]}
- Source: ${params.sourceUrl}
- Site verticals: ${verticals.length > 0 ? verticals.join(', ') : 'not classified — do not guess one'}
- Text supplied: ${params.preparedText.length} characters, ${
    params.excerpted
      ? 'AN EXCERPT of a longer document — see "Incomplete text" below'
      : 'the complete normalized document'
  }

Read this document against the following, and report what you find. Something missing from this
list is not automatically a finding, and something absent from this list that the document does
badly still is one:
${list(DOC_TYPE_CHECKLIST[params.docType])}
${
  verticalChecklist.length > 0
    ? `\nAlso expected of a site in ${verticals.join(' / ')}:\n${list(verticalChecklist)}\n`
    : ''
}
${
  params.excerpted
    ? `Incomplete text. The document was longer than the budget and you are reading an excerpt, so
you do not know what the parts you cannot see say.
- confidence must be "medium" or "low". Never "high".
- Do NOT emit any requiredDisclosures entry with status "absent". The panel renders those under a
  "Missing disclosures" heading, and from an excerpt that heading would be a public accusation you
  cannot support. Report only what you positively found ("present"), or what genuinely does not
  attach to a document of this kind ("not_applicable").
- Name in the summary, in one plain sentence, which of the checks above you could not verify
  because the text was cut. That sentence is the whole record of what is unknown, so do not omit it.
`
    : `Complete text. The document below is the whole normalized document, so "absent" is available
to you — but it means absent from THIS document, not from the site. Where a neighbouring document
might reasonably carry the disclosure, say so in the note.
`
}
Return a JSON object with exactly these keys:
{
  "summary": string,
  "riskLevel": "Low" | "Medium" | "High" | "Very High",
  "confidence": "low" | "medium" | "high",
  "exposures": Exposure[],
  "availableActions": AvailableAction[],
  "requiredDisclosures": RequiredDisclosure[]
}

Definitions:
- Exposure = { "title": string, "severity": "low" | "medium" | "high", "category": "Payment" | "Liability" | "Indemnity" | "IP" | "Confidentiality" | "Disputes" | "Termination" | "Renewal" | "Exclusivity" | "Data/Privacy", "whatItMeans": string, "whyItMatters": string, "reference"?: { "label": string, "quote"?: string } }
- AvailableAction = { "action": string, "howTo": string, "effort": "low" | "medium" | "high", "deadline"?: { "kind": "relative_to_signup" | "absolute" | "none", "days"?: integer, "description": string }, "reference"?: { "label": string, "quote"?: string } }
- RequiredDisclosure = { "name": string, "regime": "GLBA" | "CCPA" | "GDPR" | "COPPA" | "other", "status": "present" | "absent" | "not_applicable", "note": string }

Emit no other key. contentHash, domain, docType, verticals, surfaces, sourceUrl, promptVersion,
normalizerVersion, model, schemaVersion, analyzedAt and peerDeviation are filled in by the extension
from what the capture actually observed. A value you write for any of them replaces an observed fact
with a guess. peerDeviation in particular is always empty for this run: it is a claim about how this
clause compares to peers, and a single document has no peers.

Requirements:
- summary: three to six sentences, and specific. Lead with the most consequential thing THIS
  document does, named concretely — the figure, the window, the named officer, the licence term.
  A summary that would fit another company's document of the same type is a failed summary.
- exposures: as many as the document genuinely supports, ordered most consequential first. Do not
  pad to a number and do not split one clause into three findings.
- exposures[].title: a short, declarative sentence naming what the reader gave up
  ("Total liability is capped at five hundred euros"), not a topic label ("Liability").
- exposures[].category: use "Data/Privacy" for collection, sharing, retention and tracking;
  "Disputes" for arbitration, venue, notice of changes and grievance routes.
- availableActions: only routes this document actually describes, with the specifics it gives —
  the setting's name, the address, the email, the portal. If the document names no route, say that
  plainly in the summary rather than inventing a support address.
- availableActions[].action: an imperative the reader can act on. Knowing and avoiding count:
  "Do not connect your contacts", "Keep only one payment method on the account".
- availableActions[].deadline.description: the window and the event it runs from, in the document's
  own terms. Set "days" only where the document states a number. Use "kind": "absolute" only for a
  fixed calendar date the document gives, "relative_to_signup" where the window runs from signup or
  acceptance, and "none" where the document states a duration but no anchor you can compute from.
- requiredDisclosures[].note: the evidence. Quote or name what you found, or state exactly what you
  looked for and where you looked. "Not present" on its own is not a note.
- requiredDisclosures[].regime: "other" is correct for obligations outside the four named regimes —
  India's IT Rules grievance officer, RBI and IRDAI timelines, state auto-renewal statutes.
- Write for a non-lawyer. Blunt, concrete, no hedging adverbs, no legal-adjacent throat-clearing.

Document text:
"""
${params.preparedText}
"""
`.trim();
};

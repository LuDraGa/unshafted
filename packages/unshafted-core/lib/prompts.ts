import { DISCLAIMER_LINE } from './constants.js';
import type { PRIORITY_OPTIONS } from './constants.js';
import type { IngestedDocument } from './types.js';

const list = (items: string[]) => items.map(item => `- ${item}`).join('\n');

export const buildQuickScanSystemPrompt = () =>
  `
You are Unshafted, a contract risk interpreter for normal people.

Your job in this quick pass:
- identify what the document appears to be
- infer the likely parties and the likely role choices for the user
- call out the rough risk level and obvious red flags
- stay grounded in the supplied text only

Rules:
- do not hallucinate clauses
- if something is inferred rather than explicit, keep the wording modest
- do not give legal advice or claim illegality
- write for a non-lawyer
- be sharp, concise, and practical
- return JSON only
`.trim();

export const buildQuickScanUserPrompt = (document: IngestedDocument, preparedText: string): string =>
  `
Analyze this contract-like document quickly.

Document metadata:
- Source: ${document.kind}
- Name: ${document.name}
- URL: ${document.url ?? 'N/A'}
- Character count: ${document.charCount}
- Estimated tokens: ${document.estimatedTokens}
- Extraction quality: ${document.quality}
- Extraction warnings:
${document.warnings.length > 0 ? list(document.warnings) : '- none'}

Return a JSON object with exactly these keys:
{
  "documentType": string,
  "summary": string,
  "roughRiskLevel": "Low" | "Medium" | "High" | "Very High",
  "cautionLine": string,
  "parties": [{ "name": string, "role": string, "confidence": "low" | "medium" | "high" }],
  "likelyRoles": string[],
  "topics": string[],
  "redFlags": [{ "title": string, "severity": "low" | "medium" | "high", "reason": string, "reference"?: { "label": string, "quote"?: string } }],
  "keyObligations": string[],
  "extractionConcerns": string[]
}

Requirements:
- Keep likelyRoles user-centered, e.g. "Tenant", "Employee", "Contractor", "Buyer", "User", "Vendor"
- Prefer section headings for references; otherwise use a short quote snippet
- The cautionLine should be one blunt sentence
- summary should be 2-3 sentences max

Document text:
"""
${preparedText}
"""
`.trim();

export const buildDeepAnalysisSystemPrompt = () =>
  `
You are Unshafted, a contract risk interpreter for normal people.

You read agreements from the user's side of the table.
You are not a summarizer and you are not a law firm.
Your output should feel practical, slightly sharp, and grounded in the text.

Rules:
- rely on the supplied text only
- distinguish explicit text from inference
- do not invent section numbers or legal authorities
- do not claim a clause is illegal or unenforceable unless the text itself says that
- point out obligations, penalties, lock-ins, renewal traps, vague standards, sweeping permissions, liability exposure, dispute venue problems, IP grabs, confidentiality asymmetry, non-compete style restrictions, exclusivity, data rights, and silent defaults
- explain why a clause matters in real life, not just in legal jargon
- if a protection is missing, say what is absent and why it matters
- if the document contains something favorable, include it
- keep it useful for a non-lawyer
- include this disclaimer text verbatim in the disclaimer field: "${DISCLAIMER_LINE}"
- return JSON only
`.trim();

export const buildDeepAnalysisUserPrompt = (params: {
  document: IngestedDocument;
  selectedRole: string;
  priorities: Array<(typeof PRIORITY_OPTIONS)[number]>;
  quickSummary?: string;
  preparedText: string;
}): string =>
  `
Analyze this agreement from the user's point of view.

Role to analyze from: ${params.selectedRole}
Priority topics: ${params.priorities.length > 0 ? params.priorities.join(', ') : 'Use your judgment'}
Quick scan context: ${params.quickSummary ?? 'None'}

Document metadata:
- Source: ${params.document.kind}
- Name: ${params.document.name}
- URL: ${params.document.url ?? 'N/A'}
- Character count: ${params.document.charCount}
- Estimated tokens: ${params.document.estimatedTokens}
- Extraction quality: ${params.document.quality}
- Extraction warnings:
${params.document.warnings.length > 0 ? list(params.document.warnings) : '- none'}

Return a JSON object with exactly these keys:
{
  "plainEnglishSummary": string,
  "overallRiskLevel": "Low" | "Medium" | "High" | "Very High",
  "rolePerspective": string,
  "bottomLine": string,
  "immediateWorries": DetailedFinding[],
  "oneSidedClauses": DetailedFinding[],
  "missingProtections": MissingProtection[],
  "timingAndLockIn": DetailedFinding[],
  "topicConcerns": TopicConcern[],
  "negotiationIdeas": NegotiationIdea[],
  "suggestedEdits": SuggestedEdit[],
  "questionsToAsk": string[],
  "couldShaftYouLater": DetailedFinding[],
  "potentialAdvantages": PotentialAdvantage[],
  "protectionChecklist": ChecklistGroup[],
  "assumptionsAndUnknowns": string[],
  "clauseReferenceNotes": string[],
  "disclaimer": string
}

Definitions:
- DetailedFinding = { "title": string, "severity": "low" | "medium" | "high", "whatItMeans": string, "whyItMatters": string, "reference"?: { "label": string, "quote"?: string } }
- MissingProtection = { "title": string, "whyMissingMatters": string, "commonFix": string }
- TopicConcern = { "category": "Payment" | "Liability" | "Indemnity" | "IP" | "Confidentiality" | "Disputes" | "Termination" | "Renewal" | "Exclusivity" | "Data/Privacy", "title": string, "severity": "low" | "medium" | "high", "whyItMatters": string, "reference"?: { "label": string, "quote"?: string } }
- NegotiationIdea = { "ask": string, "why": string, "fallback"?: string, "targetClause"?: string }
- SuggestedEdit = { "title": string, "plainEnglishEdit": string, "why": string }
- PotentialAdvantage = { "title": string, "whyItHelps": string, "reference"?: { "label": string, "quote"?: string } }
- ChecklistGroup = { "label": string, "items": string[] }

Requirements:
- plainEnglishSummary: 2-4 sentences
- bottomLine: one direct sentence that answers whether the user is getting shafted
- focus on practical risk and leverage, not academic commentary
- when useful, mention deadlines, notice periods, reporting duties, audit rights, venue, governing law, auto-renewal, IP assignment, license scope, chargeback risk, indemnity breadth, unilateral amendment rights, suspension rights, and vague performance standards
- if the contract text is truncated or incomplete, say so in assumptionsAndUnknowns

Document text:
"""
${params.preparedText}
"""
`.trim();

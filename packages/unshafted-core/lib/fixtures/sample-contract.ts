import { DISCLAIMER_LINE } from '../constants.js';
import type { DeepAnalysisResult, QuickScanResult } from '../types.js';

export const sampleContractText = `
SERVICE AGREEMENT

This Service Agreement is entered into between Bright Acre Studio ("Contractor") and Northline Ventures ("Client").

1. Scope. Contractor will deliver brand strategy and visual design services.

2. Fees. Client will pay $8,000 within 10 days of invoice. Late balances accrue interest at 2% per month. Client may withhold payment for any dissatisfaction in its sole discretion.

3. Intellectual Property. All work product, drafts, concepts, source files, and related know-how created during the engagement become Client property upon creation, whether or not fully paid.

4. Confidentiality. Contractor must keep Client information confidential indefinitely. Client has no matching confidentiality obligation.

5. Term and Termination. Either party may terminate for convenience on 3 days' notice. Client may terminate immediately for any perceived delay. Contractor must refund any prepaid fees upon termination, including for partially completed work.

6. Liability. Contractor is liable for any direct, indirect, incidental, special, or consequential damages arising from the services. Contractor will indemnify Client against all claims related to the services.

7. Disputes. Any dispute must be resolved exclusively in Delaware courts.

8. Non-Solicit. Contractor will not provide similar services to any Northline competitor for 18 months after the engagement.
`.trim();

export const sampleQuickScan: QuickScanResult = {
  documentType: 'Service Agreement',
  summary:
    'A client-friendly service agreement for design work. It pushes payment leverage, IP ownership, liability, and post-term restrictions heavily toward the client.',
  roughRiskLevel: 'High',
  cautionLine: 'Client gets broad control while your downside stays mostly uncapped.',
  parties: [
    { name: 'Bright Acre Studio', role: 'Contractor', confidence: 'high' },
    { name: 'Northline Ventures', role: 'Client', confidence: 'high' },
  ],
  likelyRoles: ['Contractor', 'Client', 'Vendor'],
  topics: ['Payment', 'IP', 'Termination', 'Liability', 'Confidentiality', 'Exclusivity'],
  redFlags: [
    {
      title: 'Client can withhold payment in its sole discretion',
      severity: 'high',
      reason: 'Payment depends on a subjective standard that the client controls.',
      reference: { label: 'Fees', quote: 'withhold payment for any dissatisfaction in its sole discretion' },
    },
    {
      title: 'IP transfers before full payment',
      severity: 'high',
      reason: 'You lose leverage if ownership passes immediately instead of after payment clears.',
      reference: { label: 'Intellectual Property', quote: 'become Client property upon creation' },
    },
  ],
  keyObligations: [
    'Deliver services',
    'Maintain confidentiality indefinitely',
    'Refund prepaid fees on termination',
    'Indemnify the client',
  ],
  extractionConcerns: [],
};

export const sampleDeepAnalysis: DeepAnalysisResult = {
  plainEnglishSummary:
    'This agreement is workable only if you have very little leverage and are comfortable carrying most of the risk. The client controls payment, termination, IP ownership, and damages in a way that can leave you doing the work while still exposed afterward.',
  overallRiskLevel: 'Very High',
  rolePerspective: 'Contractor',
  bottomLine:
    'Yes, this can shaft the contractor later because the client keeps most of the control while your financial exposure stays wide open.',
  immediateWorries: [
    {
      title: 'You can lose payment based on vague dissatisfaction',
      severity: 'high',
      whatItMeans: 'The client can claim it is unhappy and hold back payment without an objective acceptance standard.',
      whyItMatters: 'That gives the client leverage to renegotiate or stall payment after the work is done.',
      reference: { label: 'Fees', quote: 'withhold payment for any dissatisfaction in its sole discretion' },
    },
    {
      title: 'Your liability is effectively uncapped',
      severity: 'high',
      whatItMeans: 'The clause reaches direct and indirect losses with no cap tied to fees.',
      whyItMatters: 'A dispute can cost much more than the contract value.',
      reference: { label: 'Liability', quote: 'direct, indirect, incidental, special, or consequential damages' },
    },
  ],
  oneSidedClauses: [
    {
      title: 'Immediate IP ownership transfer',
      severity: 'high',
      whatItMeans: 'The client owns the work even before full payment clears.',
      whyItMatters: 'You lose a basic leverage point if invoices go unpaid.',
      reference: { label: 'Intellectual Property', quote: 'become Client property upon creation' },
    },
    {
      title: 'One-way confidentiality',
      severity: 'medium',
      whatItMeans: 'You owe indefinite confidentiality but the client owes no mirror duty to you.',
      whyItMatters: 'Your drafts, methods, or business information may not be protected the same way.',
      reference: { label: 'Confidentiality', quote: 'Client has no matching confidentiality obligation' },
    },
  ],
  missingProtections: [
    {
      title: 'No liability cap',
      whyMissingMatters: 'There is no ceiling on what you might owe if something goes wrong.',
      commonFix: 'Cap liability to fees paid under the agreement, excluding fraud or willful misconduct.',
    },
    {
      title: 'No acceptance criteria',
      whyMissingMatters: 'The agreement never defines when work is accepted or how feedback must be given.',
      commonFix: 'Add a review period and objective acceptance or revision process.',
    },
  ],
  timingAndLockIn: [
    {
      title: 'Three-day termination right is too short',
      severity: 'medium',
      whatItMeans: 'The client can walk quickly while still expecting refunds for partial work.',
      whyItMatters: 'That makes scheduling and staffing harder and shifts business risk to you.',
      reference: { label: 'Term and Termination', quote: 'terminate for convenience on 3 days notice' },
    },
  ],
  topicConcerns: [
    {
      category: 'Payment',
      title: 'Subjective payment holdback right',
      severity: 'high',
      whyItMatters: 'The client controls whether your invoice gets paid.',
      reference: { label: 'Fees' },
    },
    {
      category: 'IP',
      title: 'Ownership transfers before payment',
      severity: 'high',
      whyItMatters: 'You may lose leverage if the client delays or disputes payment.',
      reference: { label: 'Intellectual Property' },
    },
    {
      category: 'Exclusivity',
      title: 'Competitor restriction runs for 18 months',
      severity: 'medium',
      whyItMatters: 'That can materially limit future client work after a short engagement.',
      reference: { label: 'Non-Solicit' },
    },
  ],
  negotiationIdeas: [
    {
      ask: 'Tie payment withholding to a short written acceptance process with defined revision rounds.',
      why: 'It removes the client’s ability to hold payment for vague dissatisfaction.',
      fallback: 'At minimum require specific written reasons within 5 business days.',
      targetClause: 'Fees',
    },
    {
      ask: 'Move IP transfer to after full payment.',
      why: 'That keeps a normal leverage point if invoices are late.',
      targetClause: 'Intellectual Property',
    },
  ],
  suggestedEdits: [
    {
      title: 'Add a liability cap',
      plainEnglishEdit: 'Your total liability under this agreement cannot exceed the fees paid to you under it.',
      why: 'That stops a small engagement from turning into an outsized damages claim.',
    },
    {
      title: 'Add mutual confidentiality',
      plainEnglishEdit:
        'Both parties must protect each other’s confidential information using the same standard of care.',
      why: 'The current version protects only the client.',
    },
  ],
  questionsToAsk: [
    'What objective standard decides whether the work is accepted?',
    'Why does ownership transfer before payment is complete?',
    'Can the non-compete style restriction be narrowed to named competitors or removed entirely?',
  ],
  couldShaftYouLater: [
    {
      title: 'The venue clause can make disputes expensive',
      severity: 'medium',
      whatItMeans: 'All disputes have to go through Delaware courts whether or not that is convenient for you.',
      whyItMatters: 'Distance and cost can make it harder to enforce your rights or defend a claim.',
      reference: { label: 'Disputes', quote: 'resolved exclusively in Delaware courts' },
    },
  ],
  potentialAdvantages: [
    {
      title: 'Short notice termination can also free you up quickly',
      whyItHelps:
        'If the relationship is going badly, you can exit without a long tail, assuming refund rules are fixed.',
      reference: { label: 'Term and Termination' },
    },
  ],
  protectionChecklist: [
    {
      label: 'Before signing',
      items: [
        'Define acceptance criteria and revision rounds.',
        'Move IP transfer until after full payment.',
        'Add a liability cap and mutual confidentiality.',
      ],
    },
    {
      label: 'During the engagement',
      items: ['Keep a written record of approvals and feedback.', 'Send invoices and milestone summaries promptly.'],
    },
  ],
  assumptionsAndUnknowns: ['No statement of work or deliverable acceptance rubric was provided.'],
  clauseReferenceNotes: ['References are based on headings and nearby quoted text, not formal legal citations.'],
  disclaimer: DISCLAIMER_LINE,
};

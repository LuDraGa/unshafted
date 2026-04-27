import { DISCLAIMER_LINE } from './constants.js';
import {
  buildSuggestedPriorities,
  computeContentHash,
  estimateTokens,
  makePreview,
  stripDocumentTextForHistory,
} from './document.js';
import { sampleContractText, sampleDeepAnalysis, sampleQuickScan } from './fixtures/sample-contract.js';
import { CurrentAnalysisSchema, HistoryRecordSchema, IngestedDocumentSchema } from './schemas.js';
import type { CurrentAnalysis, HistoryRecord, IngestedDocument } from './types.js';

const EXTRACT_PAGE_MESSAGE_TYPE = 'unshafted/extract-page';

type ExtractPageRequest = {
  type: typeof EXTRACT_PAGE_MESSAGE_TYPE;
};

type ExtractPageResponse =
  | {
      ok: true;
      document: IngestedDocument;
    }
  | {
      ok: false;
      error: string;
    };

const RUN_QUICK_SCAN_MESSAGE = 'unshafted/run-quick-scan';
const RUN_DEEP_ANALYSIS_MESSAGE = 'unshafted/run-deep-analysis';

type RunQuickScanRequest = {
  type: typeof RUN_QUICK_SCAN_MESSAGE;
  isSignedIn: boolean;
};

type RunDeepAnalysisRequest = {
  type: typeof RUN_DEEP_ANALYSIS_MESSAGE;
};

type AnalysisMessageResponse = { ok: true } | { ok: false; error: string };

const createCurrentAnalysis = (document: IngestedDocument): CurrentAnalysis =>
  CurrentAnalysisSchema.parse({
    id: globalThis.crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: IngestedDocumentSchema.parse(document),
    selectedRole: 'Signer',
    priorities: [],
    customRole: '',
    status: 'ready',
    quickScan: null,
    deepAnalysis: null,
    error: null,
  });

const createSampleAnalysis = async (): Promise<CurrentAnalysis> => {
  const capturedAt = new Date().toISOString();
  const document = IngestedDocumentSchema.parse({
    kind: 'demo',
    name: 'Sample service agreement',
    slug: 'sample-service-agreement',
    contentHash: await computeContentHash(sampleContractText),
    charCount: sampleContractText.length,
    estimatedTokens: estimateTokens(sampleContractText),
    preview: makePreview(sampleContractText),
    text: sampleContractText,
    quality: 'good',
    warnings: ['Demo result only. Upload your own contract after setup for real analysis.'],
    capturedAt,
  });

  return CurrentAnalysisSchema.parse({
    ...createCurrentAnalysis(document),
    quickScan: sampleQuickScan,
    deepAnalysis: sampleDeepAnalysis,
    selectedRole: 'Contractor',
    priorities: buildSuggestedPriorities(sampleQuickScan),
    status: 'complete',
    error: null,
  });
};

const touchCurrentAnalysis = (analysis: CurrentAnalysis): CurrentAnalysis => ({
  ...analysis,
  updatedAt: new Date().toISOString(),
});

const createHistoryRecord = (
  analysis: CurrentAnalysis,
  options: { storageState?: HistoryRecord['storageState'] } = {},
): HistoryRecord =>
  HistoryRecordSchema.parse({
    id: analysis.id,
    createdAt: analysis.createdAt,
    source: stripDocumentTextForHistory(analysis.source),
    quickScan: analysis.quickScan,
    deepAnalysis: analysis.deepAnalysis ?? undefined,
    selectedRole: analysis.customRole || analysis.selectedRole,
    priorities:
      analysis.priorities.length > 0 ? analysis.priorities : buildSuggestedPriorities(analysis.quickScan).slice(0, 3),
    storageState: options.storageState ?? 'local-only',
  });

const reportList = (items: string[], emptyText: string): string =>
  items.length > 0 ? items.map(item => `- ${item}`).join('\n') : `- ${emptyText}`;

const reportDecision = (riskLevel: 'Low' | 'Medium' | 'High' | 'Very High'): string => {
  switch (riskLevel) {
    case 'Low':
      return 'Likely okay to proceed after confirming the facts.';
    case 'Medium':
      return 'Review and clarify before signing.';
    case 'High':
      return 'Negotiate the highlighted terms before signing.';
    case 'Very High':
      return 'Pause and get qualified help before signing.';
    default:
      return 'Review the highlighted risks before signing.';
  }
};

const createReportMarkdown = (record: HistoryRecord): string => {
  const risk = record.deepAnalysis?.overallRiskLevel ?? record.quickScan.roughRiskLevel;
  const bottomLine = record.deepAnalysis?.bottomLine ?? record.quickScan.cautionLine;
  const summary = record.deepAnalysis?.plainEnglishSummary ?? record.quickScan.summary;
  const createdAt = new Date(record.createdAt).toLocaleString();
  const topRisks = record.deepAnalysis
    ? [
        ...record.deepAnalysis.immediateWorries,
        ...record.deepAnalysis.oneSidedClauses,
        ...record.deepAnalysis.timingAndLockIn,
        ...record.deepAnalysis.couldShaftYouLater,
      ]
        .slice(0, 6)
        .map(item => `${item.title} (${item.severity}): ${item.whyItMatters}`)
    : record.quickScan.redFlags.slice(0, 5).map(flag => `${flag.title} (${flag.severity}): ${flag.reason}`);
  const quickFlags = record.quickScan.redFlags
    .slice(0, 5)
    .map(flag => `${flag.title} (${flag.severity}): ${flag.reason}`);
  const asks = record.deepAnalysis
    ? [
        ...record.deepAnalysis.negotiationIdeas.map(item => `${item.ask}: ${item.why}`),
        ...record.deepAnalysis.suggestedEdits.map(item => `${item.title}: ${item.plainEnglishEdit}`),
        ...record.deepAnalysis.missingProtections.map(item => `${item.title}: ${item.commonFix}`),
        ...record.deepAnalysis.questionsToAsk.map(item => `Ask: ${item}`),
      ].slice(0, 8)
    : record.quickScan.redFlags
        .slice(0, 3)
        .map(flag => `Clarify ${flag.title}: ask whether this can be narrowed or explained in writing.`);
  const edits =
    record.deepAnalysis?.suggestedEdits.slice(0, 5).map(item => `${item.title}: ${item.plainEnglishEdit}`) ?? [];
  const evidence = [
    ...record.quickScan.redFlags
      .filter(flag => flag.reference?.label)
      .map(flag => `${flag.title}: ${flag.reference?.label}`),
    ...(record.deepAnalysis?.clauseReferenceNotes ?? []),
  ];
  const caveats = [
    ...(record.quickScan.extractionConcerns ?? []),
    ...(record.deepAnalysis?.assumptionsAndUnknowns ?? []),
  ];

  return [
    `# Unshafted Report: ${record.source.name}`,
    '',
    `Created: ${createdAt}`,
    `Document type: ${record.quickScan.documentType}`,
    `Reviewed as: ${record.selectedRole}`,
    `Risk posture: ${risk}`,
    '',
    '## Decision',
    '',
    reportDecision(risk),
    '',
    '## Bottom Line',
    '',
    bottomLine,
    '',
    '## Top Risks',
    '',
    reportList(topRisks, 'No major blockers were found.'),
    '',
    '## What To Ask For',
    '',
    reportList(asks, 'No specific negotiation asks were generated.'),
    '',
    '## Evidence',
    '',
    reportList(evidence, 'No clause references were recorded.'),
    '',
    '## Summary',
    '',
    summary,
    '',
    '## Quick-Scan Flags',
    '',
    reportList(quickFlags, 'No major quick-scan flags found.'),
    '',
    '## Suggested Edits',
    '',
    reportList(edits, 'No specific edits were generated.'),
    '',
    '## Caveats',
    '',
    reportList(caveats, 'No additional caveats were recorded.'),
    '',
    '## Disclaimer',
    '',
    record.deepAnalysis?.disclaimer ?? DISCLAIMER_LINE,
    '',
  ].join('\n');
};

const toVerdictTone = (riskLevel: 'Low' | 'Medium' | 'High' | 'Very High'): 'LOW' | 'CAUTION' | 'HIGH' | 'DANGER' => {
  switch (riskLevel) {
    case 'Low':
      return 'LOW';
    case 'Medium':
      return 'CAUTION';
    case 'High':
      return 'HIGH';
    default:
      return 'DANGER';
  }
};

export {
  EXTRACT_PAGE_MESSAGE_TYPE,
  RUN_DEEP_ANALYSIS_MESSAGE,
  RUN_QUICK_SCAN_MESSAGE,
  createCurrentAnalysis,
  createHistoryRecord,
  createReportMarkdown,
  createSampleAnalysis,
  toVerdictTone,
  touchCurrentAnalysis,
};
export type {
  AnalysisMessageResponse,
  ExtractPageRequest,
  ExtractPageResponse,
  RunDeepAnalysisRequest,
  RunQuickScanRequest,
};

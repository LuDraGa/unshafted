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

const createReportMarkdown = (record: HistoryRecord): string => {
  const risk = record.deepAnalysis?.overallRiskLevel ?? record.quickScan.roughRiskLevel;
  const bottomLine = record.deepAnalysis?.bottomLine ?? record.quickScan.cautionLine;
  const summary = record.deepAnalysis?.plainEnglishSummary ?? record.quickScan.summary;
  const createdAt = new Date(record.createdAt).toLocaleString();
  const topFlags = record.quickScan.redFlags
    .slice(0, 5)
    .map(flag => `${flag.title} (${flag.severity}): ${flag.reason}`);
  const asks = record.deepAnalysis?.negotiationIdeas.slice(0, 5).map(item => `${item.ask}: ${item.why}`) ?? [];
  const edits =
    record.deepAnalysis?.suggestedEdits.slice(0, 5).map(item => `${item.title}: ${item.plainEnglishEdit}`) ?? [];
  const questions = record.deepAnalysis?.questionsToAsk.slice(0, 8) ?? [];
  const caveats = [
    ...(record.quickScan.extractionConcerns ?? []),
    ...(record.deepAnalysis?.assumptionsAndUnknowns ?? []),
    ...(record.deepAnalysis?.clauseReferenceNotes ?? []),
  ];

  return [
    `# Unshafted Report: ${record.source.name}`,
    '',
    `Created: ${createdAt}`,
    `Document type: ${record.quickScan.documentType}`,
    `Reviewed as: ${record.selectedRole}`,
    `Risk posture: ${risk}`,
    '',
    '## Bottom Line',
    '',
    bottomLine,
    '',
    '## Summary',
    '',
    summary,
    '',
    '## Top Quick-Scan Flags',
    '',
    reportList(topFlags, 'No major quick-scan flags found.'),
    '',
    '## What To Ask For',
    '',
    reportList(asks, 'No specific negotiation asks were generated.'),
    '',
    '## Suggested Edits',
    '',
    reportList(edits, 'No specific edits were generated.'),
    '',
    '## Questions To Ask',
    '',
    reportList(questions, 'No specific questions were generated.'),
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

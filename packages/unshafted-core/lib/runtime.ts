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

/**
 * The verdict's call to action: a short imperative that sits beside the risk badge. The popup and
 * the report page both lead with it, so it lives here rather than in either of them.
 */
const getDecisionAction = (riskLevel: 'Low' | 'Medium' | 'High' | 'Very High'): string => {
  switch (riskLevel) {
    case 'Low':
      return 'Likely okay to proceed';
    case 'Medium':
      return 'Review before signing';
    case 'High':
      return 'Negotiate first';
    case 'Very High':
      return 'Pause and get help';
    default:
      return 'Review before signing';
  }
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
  RUN_DEEP_ANALYSIS_MESSAGE,
  RUN_QUICK_SCAN_MESSAGE,
  createCurrentAnalysis,
  createHistoryRecord,
  createSampleAnalysis,
  getDecisionAction,
  toVerdictTone,
  touchCurrentAnalysis,
};
export type { AnalysisMessageResponse, RunDeepAnalysisRequest, RunQuickScanRequest };

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

export const EXTRACT_PAGE_MESSAGE_TYPE = 'unshafted/extract-page';

export type ExtractPageRequest = {
  type: typeof EXTRACT_PAGE_MESSAGE_TYPE;
};

export type ExtractPageResponse =
  | {
      ok: true;
      document: IngestedDocument;
    }
  | {
      ok: false;
      error: string;
    };

export const RUN_QUICK_SCAN_MESSAGE = 'unshafted/run-quick-scan';
export const RUN_DEEP_ANALYSIS_MESSAGE = 'unshafted/run-deep-analysis';

export type RunQuickScanRequest = {
  type: typeof RUN_QUICK_SCAN_MESSAGE;
  isSignedIn: boolean;
};

export type RunDeepAnalysisRequest = {
  type: typeof RUN_DEEP_ANALYSIS_MESSAGE;
};

export type AnalysisMessageResponse = { ok: true } | { ok: false; error: string };

export const createCurrentAnalysis = (document: IngestedDocument): CurrentAnalysis =>
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

export const createSampleAnalysis = async (): Promise<CurrentAnalysis> => {
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

export const touchCurrentAnalysis = (analysis: CurrentAnalysis): CurrentAnalysis => ({
  ...analysis,
  updatedAt: new Date().toISOString(),
});

export const createHistoryRecord = (analysis: CurrentAnalysis): HistoryRecord =>
  HistoryRecordSchema.parse({
    id: analysis.id,
    createdAt: analysis.createdAt,
    source: stripDocumentTextForHistory(analysis.source),
    quickScan: analysis.quickScan,
    deepAnalysis: analysis.deepAnalysis ?? undefined,
    selectedRole: analysis.customRole || analysis.selectedRole,
    priorities:
      analysis.priorities.length > 0 ? analysis.priorities : buildSuggestedPriorities(analysis.quickScan).slice(0, 3),
  });

export const toVerdictTone = (
  riskLevel: 'Low' | 'Medium' | 'High' | 'Very High',
): 'LOW' | 'CAUTION' | 'HIGH' | 'DANGER' => {
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

import { CurrentAnalysisSchema, HistoryRecordSchema, IngestedDocumentSchema } from './schemas.js';
import type { CurrentAnalysis, HistoryRecord, IngestedDocument } from './types.js';
import { buildSuggestedPriorities, stripDocumentTextForHistory } from './document.js';

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
      analysis.priorities.length > 0
        ? analysis.priorities
        : buildSuggestedPriorities(analysis.quickScan).slice(0, 3),
  });

export const toVerdictTone = (riskLevel: 'Low' | 'Medium' | 'High' | 'Very High'): 'LOW' | 'CAUTION' | 'HIGH' | 'DANGER' => {
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

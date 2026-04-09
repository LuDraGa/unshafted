import type { z } from 'zod';
import type {
  AnalysisErrorSchema,
  AppSettingsSchema,
  ClauseReferenceSchema,
  CurrentAnalysisSchema,
  DeepAnalysisResultSchema,
  DetailedFindingSchema,
  HistoryRecordSchema,
  IngestedDocumentSchema,
  MissingProtectionSchema,
  NegotiationIdeaSchema,
  PendingActionSchema,
  PotentialAdvantageSchema,
  QuickScanResultSchema,
  TopicConcernSchema,
  UsageSnapshotSchema,
} from './schemas.js';

export type ClauseReference = z.infer<typeof ClauseReferenceSchema>;
export type QuickScanResult = z.infer<typeof QuickScanResultSchema>;
export type DetailedFinding = z.infer<typeof DetailedFindingSchema>;
export type MissingProtection = z.infer<typeof MissingProtectionSchema>;
export type TopicConcern = z.infer<typeof TopicConcernSchema>;
export type NegotiationIdea = z.infer<typeof NegotiationIdeaSchema>;
export type PotentialAdvantage = z.infer<typeof PotentialAdvantageSchema>;
export type DeepAnalysisResult = z.infer<typeof DeepAnalysisResultSchema>;
export type AnalysisError = z.infer<typeof AnalysisErrorSchema>;
export type IngestedDocument = z.infer<typeof IngestedDocumentSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type CurrentAnalysis = z.infer<typeof CurrentAnalysisSchema>;
export type HistoryRecord = z.infer<typeof HistoryRecordSchema>;
export type PendingAction = z.infer<typeof PendingActionSchema>;
export type UsageSnapshot = z.infer<typeof UsageSnapshotSchema>;

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenRouterUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type OpenRouterStructuredResponse<T> = {
  data: T;
  model: string;
  raw: string;
  usage?: OpenRouterUsage;
};

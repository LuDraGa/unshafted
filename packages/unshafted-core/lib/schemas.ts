import { z } from 'zod';
import {
  DEFAULT_DEEP_MODEL,
  DEFAULT_MONTHLY_SOFT_LIMIT,
  DEFAULT_OPENAI_API_KEY,
  DEFAULT_OPENAI_DEEP_MODEL,
  DEFAULT_OPENAI_QUICK_MODEL,
  DEFAULT_OPENROUTER_API_KEY,
  DEFAULT_PROVIDER,
  DEFAULT_QUICK_MODEL,
  DEFAULT_TEMPERATURE,
  DISCLAIMER_LINE,
  PRIORITY_OPTIONS,
} from './constants.js';

export const ConfidenceSchema = z.enum(['low', 'medium', 'high']);
export const SeveritySchema = z.enum(['low', 'medium', 'high']);
export const RiskLevelSchema = z.enum(['Low', 'Medium', 'High', 'Very High']);
export const SourceKindSchema = z.enum(['page', 'file', 'demo']);
export const SourceQualitySchema = z.enum(['good', 'thin', 'noisy']);

export const ClauseReferenceSchema = z.object({
  label: z.string().min(1),
  quote: z.string().min(1).optional(),
});

export const PartySchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  confidence: ConfidenceSchema.default('medium'),
});

export const QuickFlagSchema = z.object({
  title: z.string().min(1),
  severity: SeveritySchema,
  reason: z.string().min(1),
  reference: ClauseReferenceSchema.optional(),
});

export const QuickScanResultSchema = z.object({
  documentType: z.string().min(1),
  summary: z.string().min(1),
  roughRiskLevel: RiskLevelSchema,
  cautionLine: z.string().min(1),
  parties: z.array(PartySchema).default([]),
  likelyRoles: z.array(z.string().min(1)).min(1),
  topics: z.array(z.string().min(1)).default([]),
  redFlags: z.array(QuickFlagSchema).default([]),
  keyObligations: z.array(z.string().min(1)).default([]),
  extractionConcerns: z.array(z.string().min(1)).default([]),
});

export const DetailedFindingSchema = z.object({
  title: z.string().min(1),
  severity: SeveritySchema,
  whatItMeans: z.string().min(1),
  whyItMatters: z.string().min(1),
  reference: ClauseReferenceSchema.optional(),
});

export const MissingProtectionSchema = z.object({
  title: z.string().min(1),
  whyMissingMatters: z.string().min(1),
  commonFix: z.string().min(1),
});

export const ConcernCategorySchema = z.enum([
  'Payment',
  'Liability',
  'Indemnity',
  'IP',
  'Confidentiality',
  'Disputes',
  'Termination',
  'Renewal',
  'Exclusivity',
  'Data/Privacy',
]);

export const TopicConcernSchema = z.object({
  category: ConcernCategorySchema,
  title: z.string().min(1),
  severity: SeveritySchema,
  whyItMatters: z.string().min(1),
  reference: ClauseReferenceSchema.optional(),
});

export const NegotiationIdeaSchema = z.object({
  ask: z.string().min(1),
  why: z.string().min(1),
  fallback: z.string().min(1).optional(),
  targetClause: z.string().min(1).optional(),
});

export const SuggestedEditSchema = z.object({
  title: z.string().min(1),
  plainEnglishEdit: z.string().min(1),
  why: z.string().min(1),
});

export const PotentialAdvantageSchema = z.object({
  title: z.string().min(1),
  whyItHelps: z.string().min(1),
  reference: ClauseReferenceSchema.optional(),
});

export const ChecklistGroupSchema = z.object({
  label: z.string().min(1),
  items: z.array(z.string().min(1)).min(1),
});

export const DeepAnalysisResultSchema = z.object({
  plainEnglishSummary: z.string().min(1),
  overallRiskLevel: RiskLevelSchema,
  rolePerspective: z.string().min(1),
  bottomLine: z.string().min(1),
  immediateWorries: z.array(DetailedFindingSchema).default([]),
  oneSidedClauses: z.array(DetailedFindingSchema).default([]),
  missingProtections: z.array(MissingProtectionSchema).default([]),
  timingAndLockIn: z.array(DetailedFindingSchema).default([]),
  topicConcerns: z.array(TopicConcernSchema).default([]),
  negotiationIdeas: z.array(NegotiationIdeaSchema).default([]),
  suggestedEdits: z.array(SuggestedEditSchema).default([]),
  questionsToAsk: z.array(z.string().min(1)).default([]),
  couldShaftYouLater: z.array(DetailedFindingSchema).default([]),
  potentialAdvantages: z.array(PotentialAdvantageSchema).default([]),
  protectionChecklist: z.array(ChecklistGroupSchema).default([]),
  assumptionsAndUnknowns: z.array(z.string().min(1)).default([]),
  clauseReferenceNotes: z.array(z.string().min(1)).default([]),
  disclaimer: z.string().min(1).default(DISCLAIMER_LINE),
});

export const AnalysisErrorSchema = z.object({
  code: z.enum([
    'missing_api_key',
    'unsupported_page',
    'extraction_failed',
    'llm_request_failed',
    'parse_failed',
    'invalid_settings',
    'unknown',
  ]),
  message: z.string().min(1),
  suggestion: z.string().min(1).optional(),
  retryable: z.boolean().default(false),
  raw: z.string().optional(),
});

export const IngestedDocumentSchema = z.object({
  kind: SourceKindSchema,
  name: z.string().min(1),
  slug: z.string().min(1).default('unnamed-document'),
  contentHash: z.string().default(''),
  url: z.string().url().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  charCount: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
  preview: z.string().min(1),
  text: z.string().min(1),
  originalFileBase64: z.string().optional(),
  originalMimeType: z.string().optional(),
  quality: SourceQualitySchema,
  warnings: z.array(z.string().min(1)).default([]),
  capturedAt: z.string().min(1),
});

export const HistorySourceSchema = IngestedDocumentSchema.omit({ text: true, originalFileBase64: true });

export const ProviderSchema = z.enum(['openrouter', 'openai']);

export const AppSettingsSchema = z.object({
  provider: ProviderSchema.default(DEFAULT_PROVIDER),
  apiKey: z.string().default(DEFAULT_OPENROUTER_API_KEY),
  quickModel: z.string().min(1).default(DEFAULT_QUICK_MODEL),
  deepModel: z.string().min(1).default(DEFAULT_DEEP_MODEL),
  openaiApiKey: z.string().default(DEFAULT_OPENAI_API_KEY),
  openaiQuickModel: z.string().min(1).default(DEFAULT_OPENAI_QUICK_MODEL),
  openaiDeepModel: z.string().min(1).default(DEFAULT_OPENAI_DEEP_MODEL),
  temperature: z.number().min(0).max(1).default(DEFAULT_TEMPERATURE),
  monthlySoftLimit: z.number().int().positive().default(DEFAULT_MONTHLY_SOFT_LIMIT),
});

export const CurrentAnalysisSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  source: IngestedDocumentSchema,
  quickScan: QuickScanResultSchema.nullable().default(null),
  deepAnalysis: DeepAnalysisResultSchema.nullable().default(null),
  selectedRole: z.string().min(1).default('Signer'),
  priorities: z.array(z.enum(PRIORITY_OPTIONS)).default([]),
  customRole: z.string().default(''),
  status: z.enum(['ready', 'quick-running', 'quick-ready', 'deep-running', 'complete', 'error']).default('ready'),
  error: AnalysisErrorSchema.nullable().default(null),
});

export const HistoryRecordSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  source: HistorySourceSchema,
  quickScan: QuickScanResultSchema,
  deepAnalysis: DeepAnalysisResultSchema.optional(),
  selectedRole: z.string().min(1),
  priorities: z.array(z.enum(PRIORITY_OPTIONS)).default([]),
});

export const PendingActionSchema = z.object({
  type: z.enum(['none', 'focus-upload', 'analyze-current-page', 'open-history']),
  analysisId: z.string().optional(),
  requestedAt: z.string().optional(),
});

export const OnboardingStepSchema = z.enum([
  'provider',
  'api-key',
  'save-settings',
  'test-connection',
  'sign-in',
  'upload',
  'results',
]);

export const OnboardingStateSchema = z.object({
  dismissedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  currentStep: OnboardingStepSchema.default('provider'),
  seenResultGuidance: z.boolean().default(false),
  testedProvider: ProviderSchema.nullable().default(null),
  testedKeyHash: z.string().nullable().default(null),
  testedModel: z.string().nullable().default(null),
  keyTestedAt: z.string().nullable().default(null),
});

export const UsageSnapshotSchema = z.object({
  monthKey: z.string().min(1),
  fullAnalysesUsed: z.number().int().nonnegative().default(0),
  dayKey: z.string().min(1).default(''),
  quickScansToday: z.number().int().nonnegative().default(0),
});

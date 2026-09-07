import type {
  QuickScanResult,
  DeepAnalysisResult,
  LocalAnalysisProvenance,
  PolicyDocType,
  SitePolicyAnalysis,
} from '@extension/unshafted-core';

export interface DriveQuickScanFile {
  contentHash: string;
  documentName: string;
  analysisType: 'quick-scan';
  createdAt: string;
  updatedAt: string;
  role: string;
  charCount: number;
  estimatedTokens: number;
  result: QuickScanResult;
}

export interface DriveDeepAnalysisFile {
  contentHash: string;
  documentName: string;
  analysisType: 'deep-analysis';
  createdAt: string;
  updatedAt: string;
  role: string;
  charCount: number;
  estimatedTokens: number;
  priorities: string[];
  result: DeepAnalysisResult;
}

/**
 * A `LocalPolicyAnalysis` in its Drive envelope: `provenance` and `result` are its two halves,
 * splayed out so the envelope keeps the field conventions the other two files use.
 *
 * `domain` and `docType` are lifted out of `result` deliberately. This file may be opened years
 * from now by someone browsing their own Drive with no extension installed, and the head of the
 * JSON has to say which site it is about without their reading the whole analysis. `provenance`
 * is carried for the same reason: it is the only thing that says which model produced this and
 * whether that model saw the whole document or an excerpt.
 *
 * No `role` and no `estimatedTokens`, unlike the two above. A policy governs a visitor, not a
 * party, so there is no role to pick; and when `provenance.excerpted` is true the text actually
 * sent to the model is shorter than `charCount`, which would leave a token figure here meaning
 * neither one thing nor the other.
 */
export interface DriveSitePolicyFile {
  contentHash: string;
  documentName: string;
  analysisType: 'site-policy';
  createdAt: string;
  updatedAt: string;
  domain: string;
  docType: PolicyDocType;
  /** Characters in the full normalized document, before any excerpting. */
  charCount: number;
  provenance: LocalAnalysisProvenance;
  result: SitePolicyAnalysis;
}

export type DriveAnalysisFile = DriveQuickScanFile | DriveDeepAnalysisFile | DriveSitePolicyFile;

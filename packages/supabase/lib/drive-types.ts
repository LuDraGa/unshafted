import type { QuickScanResult, DeepAnalysisResult } from '@extension/unshafted-core';

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

export type DriveAnalysisFile = DriveQuickScanFile | DriveDeepAnalysisFile;

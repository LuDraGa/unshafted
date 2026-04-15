import type { CurrentAnalysis } from '@extension/unshafted-core';
import type { DriveAnalysisFile, DriveQuickScanFile, DriveDeepAnalysisFile } from './drive-types.js';
import { getDriveToken } from './drive-token.js';
import { getOrCreateFolder, upsertAnalysisFile, listAnalysisFiles, deleteAnalysisFile } from './drive.js';

const buildFilename = (slug: string, analysisType: string, contentHash: string): string =>
  `${slug}_${analysisType}_${contentHash.slice(0, 8)}.json`;

/** Save quick scan to Drive (fire-and-forget). Never throws. */
export const syncQuickScanToDrive = async (analysis: CurrentAnalysis): Promise<void> => {
  try {
    if (!analysis.quickScan || !analysis.source.contentHash) return;

    const token = await getDriveToken();
    if (!token) return;

    const folderId = await getOrCreateFolder(token);
    const { slug, contentHash, name } = analysis.source;
    const role = analysis.customRole?.trim() || analysis.selectedRole || 'Signer';

    const file: DriveQuickScanFile = {
      contentHash,
      documentName: name,
      analysisType: 'quick-scan',
      createdAt: analysis.createdAt,
      updatedAt: new Date().toISOString(),
      role,
      result: analysis.quickScan,
    };

    const filename = buildFilename(slug, 'quick-scan', contentHash);
    await upsertAnalysisFile(token, folderId, filename, file, contentHash, 'quick-scan');
  } catch {
    // Fire-and-forget — silent failure
  }
};

/** Save deep analysis to Drive (fire-and-forget). Never throws. */
export const syncDeepAnalysisToDrive = async (analysis: CurrentAnalysis): Promise<void> => {
  try {
    if (!analysis.deepAnalysis || !analysis.source.contentHash) return;

    const token = await getDriveToken();
    if (!token) return;

    const folderId = await getOrCreateFolder(token);
    const { slug, contentHash, name } = analysis.source;
    const role = analysis.customRole?.trim() || analysis.selectedRole || 'Signer';

    const file: DriveDeepAnalysisFile = {
      contentHash,
      documentName: name,
      analysisType: 'deep-analysis',
      createdAt: analysis.createdAt,
      updatedAt: new Date().toISOString(),
      role,
      priorities: analysis.priorities,
      result: analysis.deepAnalysis,
    };

    const filename = buildFilename(slug, 'deep-analysis', contentHash);
    await upsertAnalysisFile(token, folderId, filename, file, contentHash, 'deep-analysis');
  } catch {
    // Fire-and-forget — silent failure
  }
};

/** Load all analyses from Drive (for hydrating empty local history). Returns [] on any failure. */
export const loadHistoryFromDrive = async (): Promise<DriveAnalysisFile[]> => {
  try {
    const token = await getDriveToken();
    if (!token) return [];

    const folderId = await getOrCreateFolder(token);
    return await listAnalysisFiles(token, folderId);
  } catch {
    return [];
  }
};

/** Delete analysis from Drive by content hash + analysis type. Never throws. */
export const deleteFromDrive = async (contentHash: string, analysisType: string): Promise<void> => {
  try {
    const token = await getDriveToken();
    if (!token) return;

    const folderId = await getOrCreateFolder(token);
    await deleteAnalysisFile(token, folderId, contentHash, analysisType);
  } catch {
    // Fire-and-forget — silent failure
  }
};

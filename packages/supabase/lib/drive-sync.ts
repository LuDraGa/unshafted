import { getDriveToken } from './drive-token.js';
import {
  getOrCreateFolder,
  upsertAnalysisFile,
  listAnalysisFiles,
  deleteAnalysisFile,
  deleteSourceFileIfOrphaned,
} from './drive.js';
import type { DriveQuickScanFile, DriveDeepAnalysisFile, DriveSitePolicyFile } from './drive-types.js';
import { sanitizeDocumentName } from '@extension/unshafted-core';
import type { CurrentAnalysis, LocalPolicyAnalysis, PolicyDocType } from '@extension/unshafted-core';

const buildFilename = (slug: string, analysisType: string, contentHash: string): string =>
  `${slug}_${analysisType}_${contentHash.slice(0, 8)}.json`;

/**
 * The other two syncs take `slug` off the uploaded document. A site policy was never uploaded, so
 * the only things that identify it are the domain and the doc type, and the slug is derived.
 *
 * Both parts go through `sanitizeDocumentName` so Drive filenames stay consistent with the rest of
 * the app, but the dots and underscores have to be turned into hyphens first: that sanitizer reads
 * a trailing `.com` as a file extension and strips it, which would file zerodha.com and zerodha.in
 * under the same name, and it drops underscores outright, which would render `acceptable_use` as
 * `acceptableuse`.
 */
const buildSitePolicySlug = (domain: string, docType: PolicyDocType): string =>
  `${sanitizeDocumentName(domain.replace(/\./g, '-'))}_${sanitizeDocumentName(docType.replace(/_/g, '-'))}`;

/** Save quick scan to Drive. Returns false on any failure and never throws. */
export const syncQuickScanToDrive = async (analysis: CurrentAnalysis): Promise<boolean> => {
  try {
    if (!analysis.quickScan || !analysis.source.contentHash) return false;

    const token = await getDriveToken();
    if (!token) return false;

    const folderId = await getOrCreateFolder(token);
    const { slug, contentHash, name, charCount, estimatedTokens } = analysis.source;
    const role = analysis.customRole?.trim() || analysis.selectedRole || 'Signer';

    const file: DriveQuickScanFile = {
      contentHash,
      documentName: name,
      analysisType: 'quick-scan',
      createdAt: analysis.createdAt,
      updatedAt: new Date().toISOString(),
      role,
      charCount,
      estimatedTokens,
      result: analysis.quickScan,
    };

    const filename = buildFilename(slug, 'quick-scan', contentHash);
    await upsertAnalysisFile(token, folderId, filename, file, contentHash, 'quick-scan');
    return true;
  } catch (e) {
    console.warn('[Drive sync] quickScan failed:', e);
    return false;
  }
};

/** Save deep analysis to Drive. Returns false on any failure and never throws. */
export const syncDeepAnalysisToDrive = async (analysis: CurrentAnalysis): Promise<boolean> => {
  try {
    if (!analysis.deepAnalysis || !analysis.source.contentHash) return false;

    const token = await getDriveToken();
    if (!token) return false;

    const folderId = await getOrCreateFolder(token);
    const { slug, contentHash, name, charCount, estimatedTokens } = analysis.source;
    const role = analysis.customRole?.trim() || analysis.selectedRole || 'Signer';

    const file: DriveDeepAnalysisFile = {
      contentHash,
      documentName: name,
      analysisType: 'deep-analysis',
      createdAt: analysis.createdAt,
      updatedAt: new Date().toISOString(),
      role,
      charCount,
      estimatedTokens,
      priorities: analysis.priorities,
      result: analysis.deepAnalysis,
    };

    const filename = buildFilename(slug, 'deep-analysis', contentHash);
    await upsertAnalysisFile(token, folderId, filename, file, contentHash, 'deep-analysis');
    return true;
  } catch (e) {
    console.warn('[Drive sync] deepAnalysis failed:', e);
    return false;
  }
};

/** Save a self-run site policy analysis to Drive. Returns false on any failure and never throws. */
export const syncSitePolicyToDrive = async (local: LocalPolicyAnalysis): Promise<boolean> => {
  try {
    const { analysis, provenance } = local;
    if (!analysis.contentHash) return false;

    const token = await getDriveToken();
    if (!token) return false;

    const folderId = await getOrCreateFolder(token);

    const file: DriveSitePolicyFile = {
      contentHash: analysis.contentHash,
      documentName: `${analysis.domain} — ${analysis.docType.replace(/_/g, ' ')}`,
      analysisType: 'site-policy',
      // The moment the user ran it, not the moment we got round to backing it up.
      createdAt: provenance.ranAt,
      updatedAt: new Date().toISOString(),
      domain: analysis.domain,
      docType: analysis.docType,
      charCount: provenance.sourceChars,
      provenance,
      result: analysis,
    };

    const filename = buildFilename(
      buildSitePolicySlug(analysis.domain, analysis.docType),
      'site-policy',
      analysis.contentHash,
    );
    await upsertAnalysisFile(token, folderId, filename, file, analysis.contentHash, 'site-policy');
    return true;
  } catch (e) {
    console.warn('[Drive sync] sitePolicy failed:', e);
    return false;
  }
};

/**
 * Load upload analyses from Drive (for hydrating empty local history). Returns [] on any failure.
 *
 * Site policy files are deliberately not among them — see `listAnalysisFiles`.
 */
export const loadHistoryFromDrive = async (): Promise<(DriveQuickScanFile | DriveDeepAnalysisFile)[]> => {
  try {
    const token = await getDriveToken();
    if (!token) return [];

    const folderId = await getOrCreateFolder(token);
    return await listAnalysisFiles(token, folderId);
  } catch {
    return [];
  }
};

/** Delete analysis from Drive by content hash + analysis type. Cleans up orphaned source file. Never throws. */
export const deleteFromDrive = async (contentHash: string, analysisType: string): Promise<void> => {
  try {
    const token = await getDriveToken();
    if (!token) return;

    const folderId = await getOrCreateFolder(token);
    await deleteAnalysisFile(token, folderId, contentHash, analysisType);
    await deleteSourceFileIfOrphaned(token, folderId, contentHash);
  } catch (e) {
    console.warn('[Drive sync] delete failed:', e);
  }
};

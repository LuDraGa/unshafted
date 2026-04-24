export { supabase } from './client.js';
export { signInWithGoogle, signOut, getSession, getUser, onAuthStateChange, getProfile } from './auth.js';
export type { Profile } from './types.js';
export type { Session } from '@supabase/supabase-js';
export { getDriveToken, clearDriveToken } from './drive-token.js';
export {
  getOrCreateFolder,
  findExistingFile,
  upsertAnalysisFile,
  ensureSourceFile,
  findSourceFile,
  listAnalysisFiles,
  deleteAnalysisFile,
  deleteSourceFileIfOrphaned,
} from './drive.js';
export { syncQuickScanToDrive, syncDeepAnalysisToDrive, loadHistoryFromDrive, deleteFromDrive } from './drive-sync.js';
export type { DriveAnalysisFile, DriveQuickScanFile, DriveDeepAnalysisFile } from './drive-types.js';

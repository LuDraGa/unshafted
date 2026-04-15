import '@src/Popup.css';
import { buildDocumentFromFile, configurePdfWorker, createCurrentAnalysis, PRIORITY_OPTIONS } from '@extension/unshafted-core';
import type { IngestedDocument } from '@extension/unshafted-core';

configurePdfWorker(chrome.runtime.getURL('popup/pdf.worker.min.mjs'));
import { useStorage } from '@extension/shared';
import { analysisHistoryStorage, currentAnalysisStorage, unshaftedSettingsStorage } from '@extension/storage';
import { ErrorDisplay, LoadingSpinner } from '@extension/ui';
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { signInWithGoogle, signOut, getSession, onAuthStateChange, loadHistoryFromDrive, getDriveToken, getOrCreateFolder, ensureSourceFile } from '@extension/supabase';
import type { Session } from '@supabase/supabase-js';
import { AnalysisWorkspace } from './components/AnalysisWorkspace';

const uploadSourceToDrive = async (doc: IngestedDocument): Promise<void> => {
  try {
    if (!doc.originalFileBase64 || !doc.contentHash) return;
    const token = await getDriveToken();
    if (!token) return;
    const folderId = await getOrCreateFolder(token);
    const mime = doc.originalMimeType ?? 'text/plain';
    const ext = mime === 'application/pdf' ? '.pdf' : '.txt';
    const filename = `${doc.slug}_source_${doc.contentHash.slice(0, 8)}${ext}`;
    await ensureSourceFile(token, folderId, filename, doc.originalFileBase64, mime, doc.contentHash);
  } catch (e) {
    console.warn('[Drive] early source upload failed:', e);
  }
};

const UserAvatar = ({
  avatarUrl,
  email,
  onSignOut,
}: {
  avatarUrl?: string;
  email: string;
  onSignOut: () => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const initial = email.charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        className="h-7 w-7 rounded-full overflow-hidden border-2 border-stone-200 hover:border-stone-400 transition flex-shrink-0"
        onClick={() => setMenuOpen(o => !o)}
        title={email}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="h-full w-full bg-stone-900 text-stone-50 flex items-center justify-center text-xs font-bold">
            {initial}
          </div>
        )}
      </button>
      {menuOpen ? (
        <div className="absolute right-0 top-9 z-50 min-w-[180px] rounded-xl border border-stone-200 bg-white shadow-lg p-2">
          <p className="px-2 py-1 text-[11px] text-stone-500 truncate">{email}</p>
          <button
            className="w-full text-left px-2 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 rounded-lg transition"
            onClick={() => {
              setMenuOpen(false);
              onSignOut();
            }}>
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
};

const Popup = () => {
  const settings = useStorage(unshaftedSettingsStorage);
  const currentAnalysis = useStorage(currentAnalysisStorage);

  const [launchError, setLaunchError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load auth state on mount
  useEffect(() => {
    getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });

    const { data: { subscription } } = onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Hydrate local history from Drive when signed in + history is empty
  useEffect(() => {
    if (!session) return;

    const hydrate = async () => {
      try {
        const history = await analysisHistoryStorage.get();
        if (history.length > 0) return;

        const driveFiles = await loadHistoryFromDrive();
        if (driveFiles.length === 0) return;

        // Group Drive files by contentHash to merge quick-scan + deep-analysis for the same doc
        const byHash = new Map<string, typeof driveFiles>();
        for (const file of driveFiles) {
          const existing = byHash.get(file.contentHash) ?? [];
          existing.push(file);
          byHash.set(file.contentHash, existing);
        }

        const prioritySet = new Set<string>(PRIORITY_OPTIONS);

        for (const [, files] of byHash) {
          try {
            const quickFile = files.find(f => f.analysisType === 'quick-scan');
            const deepFile = files.find(f => f.analysisType === 'deep-analysis');

            // HistoryRecordSchema requires quickScan — skip if we only have a deep analysis
            if (!quickFile) continue;

            // Filter priorities to valid enum values to avoid Zod validation errors
            const rawPriorities = deepFile && 'priorities' in deepFile ? deepFile.priorities : [];
            const validPriorities = rawPriorities.filter(p => prioritySet.has(p));

            const record = {
              id: crypto.randomUUID(),
              createdAt: quickFile.createdAt,
              source: {
                kind: 'file' as const,
                name: quickFile.documentName,
                slug: quickFile.documentName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) || 'unnamed-document',
                contentHash: quickFile.contentHash,
                charCount: quickFile.charCount || 0,
                estimatedTokens: quickFile.estimatedTokens || 0,
                preview: `Restored from Google Drive: ${quickFile.documentName}`,
                quality: 'good' as const,
                warnings: [],
                capturedAt: quickFile.createdAt,
              },
              quickScan: quickFile.result,
              deepAnalysis: deepFile ? deepFile.result : undefined,
              selectedRole: quickFile.role,
              priorities: validPriorities,
            };

            await analysisHistoryStorage.push(record as Parameters<typeof analysisHistoryStorage.push>[0]);
          } catch {
            // Skip individual records that fail validation — don't halt hydration
          }
        }
      } catch {
        // Hydration is best-effort — silent failure
      }
    };

    void hydrate();
  }, [session]);

  const handleSignIn = useCallback(async () => {
    setSigningIn(true);
    setLaunchError('');
    const result = await signInWithGoogle();
    if (!result.ok) {
      setLaunchError(result.error);
    }
    setSigningIn(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut();
  }, []);

  const openOptions = () => chrome.runtime.openOptionsPage();

  const handleUploadFlow = () => {
    setLaunchError('');
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLaunchError('');
    setUploading(true);

    try {
      const document = await buildDocumentFromFile(file);
      await currentAnalysisStorage.set(createCurrentAnalysis(document));

      // Push source file to Drive immediately (fire-and-forget, signed-in only)
      if (session && document.originalFileBase64 && document.contentHash) {
        void uploadSourceToDrive(document);
      }
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : 'Unable to open this file.');
    } finally {
      event.target.value = '';
      setUploading(false);
    }
  };

  const hasApiKey = Boolean(
    settings.provider === 'openai' ? settings.openaiApiKey.trim() : settings.apiKey.trim(),
  );

  return (
    <div className="popup-shell">
      <div className="popup-frame">
        <input ref={fileInputRef} type="file" accept=".txt,.pdf,text/plain,application/pdf" className="hidden" onChange={handleFileChosen} />

        {/* Sticky header */}
        <div className="popup-sticky-header">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0 flex-1">
              <p className="popup-eyebrow">Unshafted</p>
              <h1 className="popup-title">Contract risk, without the fog.</h1>
              <p className="popup-subtitle truncate">
                {currentAnalysis ? currentAnalysis.source.name : 'Upload a contract to review (.pdf or .txt).'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${hasApiKey ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-200 text-stone-700'}`}>
                {hasApiKey ? 'Ready' : 'Setup'}
              </div>
              {hasApiKey ? (
                <button
                  className="popup-upload-btn"
                  onClick={handleUploadFlow}
                  disabled={uploading}
                  title={currentAnalysis ? 'Analyze another contract' : 'Upload a contract'}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </button>
              ) : null}
              {!authLoading ? (
                session ? (
                  <UserAvatar
                    avatarUrl={session.user.user_metadata?.avatar_url ?? session.user.user_metadata?.picture}
                    email={session.user.email ?? ''}
                    onSignOut={handleSignOut}
                  />
                ) : (
                  <button
                    className="rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold text-stone-50 hover:bg-stone-700 transition"
                    onClick={handleSignIn}
                    disabled={signingIn}>
                    {signingIn ? 'Signing in...' : 'Sign in'}
                  </button>
                )
              ) : null}
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="popup-content">
          {!currentAnalysis ? (
            <button
              className="popup-primary-button"
              onClick={handleUploadFlow}
              disabled={uploading || !hasApiKey}>
              {uploading ? 'Loading contract...' : 'Upload your contract'}
            </button>
          ) : (
            <AnalysisWorkspace session={session} onSignIn={handleSignIn} />
          )}

          {!hasApiKey ? (
            <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">API key required</p>
              <p className="mt-1 text-amber-800">
                Save your {settings.provider === 'openai' ? 'OpenAI' : 'OpenRouter'} API key in Options first.
              </p>
              <button className="mt-3 popup-link-button" onClick={openOptions}>
                Open Options
              </button>
            </section>
          ) : null}

          {launchError ? (
            <section className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {launchError}
            </section>
          ) : null}
        </div>

        {/* Sticky footer */}
        <div className="popup-sticky-footer">
          <p>Informational only. Not legal advice.</p>
          <button className="popup-link-button" onClick={openOptions}>
            Options
          </button>
        </div>
      </div>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);

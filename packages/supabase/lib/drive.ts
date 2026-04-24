import type { DriveAnalysisFile } from './drive-types.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_NAME = 'Unshafted';
const FOLDER_CACHE_KEY = 'unshafted-drive-folder-id';
const FOLDER_CACHE_TTL = 5 * 60_000; // 5 minutes

const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

// ── In-memory folder cache + single-flight lock ──

let folderCache: { id: string; verifiedAt: number } | null = null;
let folderInflight: Promise<string> | null = null;

/** Ensure "Unshafted" folder exists in Drive. Deduplicates concurrent calls and caches with TTL. */
const getOrCreateFolder = (token: string): Promise<string> => {
  // Return in-memory cache if fresh
  if (folderCache && Date.now() - folderCache.verifiedAt < FOLDER_CACHE_TTL) {
    return Promise.resolve(folderCache.id);
  }

  // Single-flight: reuse in-progress request
  if (folderInflight) return folderInflight;

  folderInflight = resolveFolder(token).finally(() => {
    folderInflight = null;
  });
  return folderInflight;
};

const resolveFolder = async (token: string): Promise<string> => {
  // Check chrome.storage cache
  const cached = await chrome.storage.local.get(FOLDER_CACHE_KEY);
  if (cached[FOLDER_CACHE_KEY]) {
    const checkRes = await fetch(`${DRIVE_API}/${cached[FOLDER_CACHE_KEY]}?fields=id,trashed`, {
      headers: headers(token),
    });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (!checkData.trashed) {
        folderCache = { id: cached[FOLDER_CACHE_KEY] as string, verifiedAt: Date.now() };
        return folderCache.id;
      }
    }
    await chrome.storage.local.remove(FOLDER_CACHE_KEY);
  }

  // Search for existing folder
  const q = `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(`${DRIVE_API}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`, {
    headers: headers(token),
  });

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files?.length > 0) {
      const folderId = searchData.files[0].id;
      await chrome.storage.local.set({ [FOLDER_CACHE_KEY]: folderId });
      folderCache = { id: folderId, verifiedAt: Date.now() };
      return folderId;
    }
  }

  // Create folder
  const createRes = await fetch(DRIVE_API, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create Drive folder: ${createRes.status}`);
  }

  const folder = await createRes.json();
  await chrome.storage.local.set({ [FOLDER_CACHE_KEY]: folder.id });
  folderCache = { id: folder.id, verifiedAt: Date.now() };
  return folder.id;
};

/** Find an existing file by contentHash + analysisType via appProperties query */
const findExistingFile = async (
  token: string,
  folderId: string,
  contentHash: string,
  analysisType: string,
): Promise<string | null> => {
  const q = [
    `'${folderId}' in parents`,
    `appProperties has { key='contentHash' and value='${contentHash}' }`,
    `appProperties has { key='analysisType' and value='${analysisType}' }`,
    `trashed=false`,
  ].join(' and ');

  const res = await fetch(`${DRIVE_API}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`, {
    headers: headers(token),
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data.files?.[0]?.id ?? null;
};

/** Create or update a Drive file (handles dedup via findExistingFile) */
const upsertAnalysisFile = async (
  token: string,
  folderId: string,
  filename: string,
  content: DriveAnalysisFile,
  contentHash: string,
  analysisType: string,
): Promise<void> => {
  const existingId = await findExistingFile(token, folderId, contentHash, analysisType);

  if (existingId) {
    // Preserve original createdAt from existing file
    const existingRes = await fetch(`${DRIVE_API}/${existingId}?alt=media`, {
      headers: headers(token),
    });
    if (existingRes.ok) {
      try {
        const existing = await existingRes.json();
        if (existing.createdAt) {
          content = { ...content, createdAt: existing.createdAt };
        }
      } catch {
        // Parse error — proceed with new content as-is
      }
    }

    const body = JSON.stringify(content, null, 2);
    const res = await fetch(`${DRIVE_UPLOAD_API}/${existingId}?uploadType=media`, {
      method: 'PATCH',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body,
    });
    if (!res.ok) throw new Error(`Drive update failed: ${res.status}`);
  } else {
    // Create new file with metadata + content in multipart request
    const metadata = {
      name: filename,
      parents: [folderId],
      appProperties: { contentHash, analysisType },
    };

    const boundary = crypto.randomUUID();
    const multipart = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      JSON.stringify(content, null, 2),
      `--${boundary}--`,
    ].join('\r\n');

    const res = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart`, {
      method: 'POST',
      headers: {
        ...headers(token),
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipart,
    });
    if (!res.ok) throw new Error(`Drive create failed: ${res.status}`);
  }
};

/** Validate that a parsed object looks like a DriveAnalysisFile */
const isValidAnalysisFile = (data: unknown): data is DriveAnalysisFile => {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.contentHash === 'string' &&
    typeof obj.documentName === 'string' &&
    typeof obj.analysisType === 'string' &&
    (obj.analysisType === 'quick-scan' || obj.analysisType === 'deep-analysis') &&
    typeof obj.createdAt === 'string' &&
    typeof obj.updatedAt === 'string' &&
    typeof obj.role === 'string' &&
    typeof obj.result === 'object' &&
    obj.result !== null
  );
};

/** List analysis JSON files from the Unshafted folder. */
const listAnalysisFiles = async (token: string, folderId: string): Promise<DriveAnalysisFile[]> => {
  const files: DriveAnalysisFile[] = [];
  let pageToken: string | undefined;

  do {
    const q = [
      `'${folderId}' in parents`,
      `(appProperties has { key='analysisType' and value='quick-scan' } or appProperties has { key='analysisType' and value='deep-analysis' })`,
      `trashed=false`,
    ].join(' and ');
    let url = `${DRIVE_API}?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,appProperties,mimeType)&spaces=drive&pageSize=100`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const listRes = await fetch(url, { headers: headers(token) });
    if (!listRes.ok) break;

    const listData = await listRes.json();
    pageToken = listData.nextPageToken;

    const fileIds: string[] = (listData.files ?? []).map((f: { id: string }) => f.id);

    // Fetch file contents in parallel batches of 5
    for (let i = 0; i < fileIds.length; i += 5) {
      const batch = fileIds.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async id => {
          const res = await fetch(`${DRIVE_API}/${id}?alt=media`, { headers: headers(token) });
          if (!res.ok) return null;
          return res.json();
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && isValidAnalysisFile(result.value)) {
          files.push(result.value);
        }
      }
    }
  } while (pageToken);

  return files;
};

/** Delete a file by appProperties match (contentHash + analysisType) */
const deleteAnalysisFile = async (
  token: string,
  folderId: string,
  contentHash: string,
  analysisType: string,
): Promise<void> => {
  const fileId = await findExistingFile(token, folderId, contentHash, analysisType);
  if (!fileId) return;

  await fetch(`${DRIVE_API}/${fileId}`, {
    method: 'DELETE',
    headers: headers(token),
  });
};

// ── Source file management ──

/** Find existing source file by contentHash */
const findSourceFile = async (token: string, folderId: string, contentHash: string): Promise<string | null> => {
  const q = [
    `'${folderId}' in parents`,
    `appProperties has { key='contentHash' and value='${contentHash}' }`,
    `appProperties has { key='fileType' and value='source' }`,
    `trashed=false`,
  ].join(' and ');

  const res = await fetch(`${DRIVE_API}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`, {
    headers: headers(token),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
};

/** Ensure original source file exists in Drive (idempotent — skips if already present) */
const ensureSourceFile = async (
  token: string,
  folderId: string,
  filename: string,
  base64Content: string,
  mimeType: string,
  contentHash: string,
): Promise<void> => {
  const existing = await findSourceFile(token, folderId, contentHash);
  if (existing) return;

  const metadata = {
    name: filename,
    parents: [folderId],
    appProperties: { contentHash, fileType: 'source' },
  };

  // Decode base64 to binary for upload
  const binaryString = atob(base64Content);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const boundary = crypto.randomUUID();
  const metadataPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const binaryHeader = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;

  // Build multipart body as ArrayBuffer to preserve binary content
  const encoder = new TextEncoder();
  const metadataBytes = encoder.encode(metadataPart);
  const headerBytes = encoder.encode(binaryHeader);
  const closingBytes = encoder.encode(closing);

  const body = new Uint8Array(metadataBytes.length + headerBytes.length + bytes.length + closingBytes.length);
  body.set(metadataBytes, 0);
  body.set(headerBytes, metadataBytes.length);
  body.set(bytes, metadataBytes.length + headerBytes.length);
  body.set(closingBytes, metadataBytes.length + headerBytes.length + bytes.length);

  const res = await fetch(`${DRIVE_UPLOAD_API}?uploadType=multipart`, {
    method: 'POST',
    headers: {
      ...headers(token),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Drive source create failed: ${res.status}`);
};

/** Delete source file if no analysis files reference this contentHash */
const deleteSourceFileIfOrphaned = async (token: string, folderId: string, contentHash: string): Promise<void> => {
  const quickId = await findExistingFile(token, folderId, contentHash, 'quick-scan');
  const deepId = await findExistingFile(token, folderId, contentHash, 'deep-analysis');

  if (quickId || deepId) return;

  const sourceId = await findSourceFile(token, folderId, contentHash);
  if (!sourceId) return;

  await fetch(`${DRIVE_API}/${sourceId}`, {
    method: 'DELETE',
    headers: headers(token),
  });
};

export {
  deleteAnalysisFile,
  deleteSourceFileIfOrphaned,
  ensureSourceFile,
  findExistingFile,
  findSourceFile,
  getOrCreateFolder,
  listAnalysisFiles,
  upsertAnalysisFile,
};

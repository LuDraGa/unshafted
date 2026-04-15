import type { DriveAnalysisFile } from './drive-types.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_NAME = 'Unshafted';
const FOLDER_CACHE_KEY = 'unshafted-drive-folder-id';

const headers = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Ensure "Unshafted" folder exists in Drive. Caches folder ID locally. */
export const getOrCreateFolder = async (token: string): Promise<string> => {
  // Check cache first
  const cached = await chrome.storage.local.get(FOLDER_CACHE_KEY);
  if (cached[FOLDER_CACHE_KEY]) {
    // Verify it still exists
    const checkRes = await fetch(`${DRIVE_API}/${cached[FOLDER_CACHE_KEY]}?fields=id,trashed`, {
      headers: headers(token),
    });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (!checkData.trashed) return cached[FOLDER_CACHE_KEY] as string;
    }
    // Cached folder gone — clear and recreate
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
  return folder.id;
};

/** Find an existing file by contentHash + analysisType via appProperties query */
export const findExistingFile = async (
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
export const upsertAnalysisFile = async (
  token: string,
  folderId: string,
  filename: string,
  content: DriveAnalysisFile,
  contentHash: string,
  analysisType: string,
): Promise<void> => {
  const existingId = await findExistingFile(token, folderId, contentHash, analysisType);
  const body = JSON.stringify(content, null, 2);

  if (existingId) {
    // Update existing file content
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

    const boundary = 'unshafted_boundary';
    const multipart = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      body,
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

/** List all analysis files from the Unshafted folder */
export const listAnalysisFiles = async (
  token: string,
  folderId: string,
): Promise<DriveAnalysisFile[]> => {
  const files: DriveAnalysisFile[] = [];
  let pageToken: string | undefined;

  do {
    const q = `'${folderId}' in parents and trashed=false`;
    let url = `${DRIVE_API}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive&pageSize=100`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const listRes = await fetch(url, { headers: headers(token) });
    if (!listRes.ok) break;

    const listData = await listRes.json();
    pageToken = listData.nextPageToken;

    for (const file of listData.files ?? []) {
      const contentRes = await fetch(`${DRIVE_API}/${file.id}?alt=media`, {
        headers: headers(token),
      });
      if (!contentRes.ok) continue;

      try {
        const parsed = await contentRes.json();
        if (parsed.contentHash && parsed.analysisType && parsed.result) {
          files.push(parsed as DriveAnalysisFile);
        }
      } catch {
        // Skip malformed files
      }
    }
  } while (pageToken);

  return files;
};

/** Delete a file by appProperties match (contentHash + analysisType) */
export const deleteAnalysisFile = async (
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

export const DRIVE_TOKEN_KEY = 'unshafted-drive-token';
export const DRIVE_EXPIRES_KEY = 'unshafted-drive-expires-at';
const GOOGLE_CLIENT_ID = process.env.CEB_GOOGLE_CLIENT_ID ?? '';

// Single-flight: deduplicate concurrent refresh attempts
let refreshInflight: Promise<string | null> | null = null;

/** Get a valid Drive access token, silently refreshing if expired. Returns null if unavailable. */
export const getDriveToken = async (): Promise<string | null> => {
  try {
    const stored = await chrome.storage.local.get([DRIVE_TOKEN_KEY, DRIVE_EXPIRES_KEY]);
    const token = stored[DRIVE_TOKEN_KEY] as string | undefined;
    const expiresAt = stored[DRIVE_EXPIRES_KEY] as number | undefined;

    if (token && expiresAt && Date.now() < expiresAt - 60_000) {
      return token;
    }

    // Reuse in-progress refresh if one is already running
    if (refreshInflight) return refreshInflight;

    refreshInflight = silentRefresh().finally(() => {
      refreshInflight = null;
    });
    return await refreshInflight;
  } catch {
    return null;
  }
};

/** Silent refresh via launchWebAuthFlow with interactive: false */
const silentRefresh = async (): Promise<string | null> => {
  try {
    const redirectUri = chrome.identity.getRedirectURL();

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive.file');
    authUrl.searchParams.set('prompt', 'none');

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: false,
    });

    if (!responseUrl) return null;

    const hash = new URL(responseUrl).hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');

    if (!accessToken || !expiresIn) return null;

    const expiresAt = Date.now() + parseInt(expiresIn, 10) * 1000;
    await chrome.storage.local.set({
      [DRIVE_TOKEN_KEY]: accessToken,
      [DRIVE_EXPIRES_KEY]: expiresAt,
    });

    return accessToken;
  } catch {
    return null;
  }
};

/** Clear Drive token (called on sign-out) */
export const clearDriveToken = async (): Promise<void> => {
  await chrome.storage.local.remove([DRIVE_TOKEN_KEY, DRIVE_EXPIRES_KEY]);
};

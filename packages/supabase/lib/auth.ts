import { supabase } from './client.js';
import { clearDriveToken, DRIVE_TOKEN_KEY, DRIVE_EXPIRES_KEY } from './drive-token.js';
import type { Profile } from './types.js';
import type { Session, AuthChangeEvent } from '@supabase/supabase-js';

const GOOGLE_CLIENT_ID = process.env.CEB_GOOGLE_CLIENT_ID ?? '';

/**
 * SHA256 hash a string and return the hex digest.
 * Used to send hashed nonce to Google so Supabase's nonce verification works.
 * Google puts the nonce as-is in the id_token. Supabase hashes our raw nonce
 * and compares. So we send hash(raw) to Google → token contains hash(raw) →
 * Supabase hashes raw → hash(raw) matches.
 */
const sha256Hex = async (input: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Google sign-in via chrome.identity.launchWebAuthFlow.
 * Gets a Google id_token, then exchanges it with Supabase via signInWithIdToken.
 */
export const signInWithGoogle = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const rawNonce = crypto.randomUUID();
    const oauthState = crypto.randomUUID();
    const hashedNonce = await sha256Hex(rawNonce);
    const redirectUri = chrome.identity.getRedirectURL();

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'token id_token');
    authUrl.searchParams.set('scope', 'openid email profile https://www.googleapis.com/auth/drive.file');
    authUrl.searchParams.set('nonce', hashedNonce);
    authUrl.searchParams.set('state', oauthState);
    authUrl.searchParams.set('prompt', 'select_account');

    const responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });

    if (!responseUrl) {
      return { ok: false, error: 'Sign-in was cancelled.' };
    }

    // Extract id_token from the URL fragment
    const hash = new URL(responseUrl).hash.substring(1);
    const params = new URLSearchParams(hash);
    const returnedState = params.get('state');
    const oauthError = params.get('error_description') ?? params.get('error');
    if (oauthError) {
      await clearDriveToken();
      return { ok: false, error: oauthError };
    }

    if (!returnedState || returnedState !== oauthState) {
      await clearDriveToken();
      return { ok: false, error: 'Sign-in state validation failed. Please try again.' };
    }

    const idToken = params.get('id_token');

    if (!idToken) {
      return { ok: false, error: 'No ID token received from Google.' };
    }

    const accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      nonce: rawNonce,
    });

    if (error) {
      await clearDriveToken();
      return { ok: false, error: error.message };
    }

    // Persist Drive access only after Supabase has accepted the Google identity.
    if (accessToken && expiresIn) {
      const expiresAt = Date.now() + parseInt(expiresIn, 10) * 1000;
      await chrome.storage.local.set({
        [DRIVE_TOKEN_KEY]: accessToken,
        [DRIVE_EXPIRES_KEY]: expiresAt,
      });
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sign-in failed.';
    return { ok: false, error: message };
  }
};

export const signOut = async () => {
  await supabase.auth.signOut();
  await clearDriveToken();
};

export const getSession = () => supabase.auth.getSession();

export const getUser = () => supabase.auth.getUser();

export const onAuthStateChange = (callback: (event: AuthChangeEvent, session: Session | null) => void) =>
  supabase.auth.onAuthStateChange(callback);

export const getProfile = async (): Promise<Profile | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.schema('unshafted').from('profiles').select('*').eq('id', user.id).single();
  if (error) {
    console.warn('[Unshafted] profile fetch failed:', error.message);
    return null;
  }

  return data as Profile | null;
};

export const updateProfilePreferences = async ({
  driveBackupEnabled,
}: {
  driveBackupEnabled: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Not signed in.' };
  }

  const { error } = await supabase
    .schema('unshafted')
    .from('profiles')
    .update({
      drive_backup_enabled: driveBackupEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) {
    console.warn('[Unshafted] profile preference update failed:', error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
};

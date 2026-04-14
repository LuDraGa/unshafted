# Phase 1 Execution: Auth + Profiles

**Status:** Complete (2026-04-14)
**Date:** 2026-04-14
**Parent doc:** `execution-docs/supabase-auth-profiles-credits.md`
**Scope:** Supabase project setup, Gmail-only auth from Chrome extension, user profiles, auth-gated deep analysis, anonymous quick scan limit.

---

## What ships in Phase 1

- User can sign in with Google from the popup (one click)
- Popup shows avatar + email when signed in, "Sign in with Google" when not
- Deep analysis requires sign-in (but is free — no credit check yet)
- Anonymous users get 3 quick scans per day (local counter)
- Signed-in users get unlimited quick scans (no limit)
- Supabase `profiles` table auto-created on signup
- No credit tables, no payments, no server-side LLM

## What does NOT ship

- Credit system (Phase 3)
- Payments / Stripe / Cashfree (Phase 3)
- Google Drive storage (Phase 2)
- Server-side LLM calls (Phase 3)
- Options page auth management

---

## Pre-requisites (manual, done in browser)

### 1. Supabase project

- [ ] Create Supabase project `my-chrome-extensions` (region: US East or closest)
- [ ] Note down: `SUPABASE_URL`, `SUPABASE_ANON_KEY`
- [ ] Create schema `unshafted` via SQL editor: `CREATE SCHEMA IF NOT EXISTS unshafted;`
- [ ] Enable Google auth provider in Dashboard → Authentication → Providers → Google (configure after step 2)

### 2. Google Cloud OAuth

- [ ] Create project in Google Cloud Console (or reuse existing)
- [ ] Enable "Google Identity" / People API
- [ ] Create OAuth 2.0 Client ID:
  - Application type: **Web application** (for `launchWebAuthFlow`)
  - Authorized redirect URI: `https://<extension-id>.chromiumapp.org`
  - For dev (unpacked): pin extension ID via `key` field in manifest, or add dev ID as second redirect URI
- [ ] Note down: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] In Supabase Dashboard → Auth → Providers → Google: paste the same Client ID + Secret

### 3. Database setup (SQL editor)

Run in Supabase SQL editor:

```sql
-- Schema
CREATE SCHEMA IF NOT EXISTS unshafted;

-- Profiles table
CREATE TABLE unshafted.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE unshafted.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON unshafted.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON unshafted.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION unshafted.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO unshafted.profiles (id, email, display_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION unshafted.handle_new_user();
```

Note: No `tier` column, no credit tables — those come in Phase 3.

---

## Code changes

### Step 1: Environment variables

**File: `.env`** — add:
```
CEB_SUPABASE_URL=https://xxxxx.supabase.co
CEB_SUPABASE_ANON_KEY=eyJhbG...
CEB_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

**File: `packages/env/lib/types.ts`** — add to `ICebEnv`:
```ts
readonly CEB_SUPABASE_URL: string;
readonly CEB_SUPABASE_ANON_KEY: string;
readonly CEB_GOOGLE_CLIENT_ID: string;
```

**Status:** [ ] Done

---

### Step 2: New package `packages/supabase`

```
packages/supabase/
  lib/
    client.ts        — createClient() with chrome.storage.local adapter
    auth.ts          — signInWithGoogle(), signOut(), getSession(), onAuthStateChange()
    types.ts         — Profile type
    index.ts         — barrel export
  package.json
  tsconfig.json
```

**`packages/supabase/package.json`:**
```json
{
  "name": "@extension/supabase",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "sideEffects": false,
  "types": "lib/index.ts",
  "dependencies": {
    "@supabase/supabase-js": "^2.x",
    "@extension/env": "workspace:*"
  },
  "devDependencies": {
    "@extension/tsconfig": "workspace:*"
  }
}
```

**`packages/supabase/lib/client.ts`:**
```ts
import { createClient } from '@supabase/supabase-js';
import env from '@extension/env';

const chromeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const result = await chrome.storage.local.get(key);
    return result[key] ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string): Promise<void> => {
    await chrome.storage.local.remove(key);
  },
};

export const supabase = createClient(
  env.CEB_SUPABASE_URL,
  env.CEB_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: chromeStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // not in a browser tab context
    },
  },
);
```

**`packages/supabase/lib/auth.ts`:**
```ts
import { supabase } from './client.js';
import env from '@extension/env';
import type { Profile } from './types.js';

/**
 * Google sign-in via chrome.identity.launchWebAuthFlow.
 * Gets a Google id_token, then exchanges it with Supabase via signInWithIdToken.
 */
export const signInWithGoogle = async (): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const nonce = crypto.randomUUID();
    const clientId = env.CEB_GOOGLE_CLIENT_ID;
    const redirectUri = chrome.identity.getRedirectURL();

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'id_token');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('nonce', nonce);
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
    const idToken = params.get('id_token');

    if (!idToken) {
      return { ok: false, error: 'No ID token received from Google.' };
    }

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
      nonce,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sign-in failed.';
    return { ok: false, error: message };
  }
};

export const signOut = async () => {
  await supabase.auth.signOut();
};

export const getSession = () => supabase.auth.getSession();

export const getUser = () => supabase.auth.getUser();

export const onAuthStateChange = (
  callback: (event: string, session: unknown) => void,
) => supabase.auth.onAuthStateChange(callback);

export const getProfile = async (): Promise<Profile | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .schema('unshafted')
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return data as Profile | null;
};
```

**`packages/supabase/lib/types.ts`:**
```ts
export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}
```

**`packages/supabase/lib/index.ts`:**
```ts
export { supabase } from './client.js';
export { signInWithGoogle, signOut, getSession, getUser, onAuthStateChange, getProfile } from './auth.js';
export type { Profile } from './types.js';
```

Add to `pnpm-workspace.yaml`:
```yaml
  - packages/supabase
```

**Status:** [ ] Done

---

### Step 3: Manifest changes

**File: `chrome-extension/manifest.ts`**

Add `identity` permission and pinned `key` for stable extension ID during dev:
```ts
permissions: ['storage', 'tabs', 'activeTab', 'scripting', 'identity'],
```

Also add a `key` field to pin the extension ID. Generate the key by:
1. Run `openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out key.pem`
2. Run `openssl rsa -in key.pem -pubout -outform DER | openssl base64 -A` → this is your `key` value
3. Add to manifest: `key: '<base64-public-key>'`
4. Load the extension once, note the stable extension ID, use that for Google OAuth redirect URI

Note: The `key` field is stripped automatically by Chrome Web Store on publish, so it's safe to leave in.

**Status:** [ ] Done

---

### Step 4: Background worker — Supabase session keep-alive

**File: `chrome-extension/src/background/index.ts`**

Initialize Supabase client in the background service worker so token refresh works even when popup is closed.

```ts
import { supabase } from '@extension/supabase';

console.info('[Unshafted] background worker ready');

// Keep Supabase session alive — auto-refresh tokens
supabase.auth.onAuthStateChange((event, session) => {
  console.info('[Unshafted] auth state:', event, session?.user?.email ?? 'no user');
});
```

**Status:** [ ] Done

---

### Step 5: Anonymous quick scan limit (3/day)

**Modify: `packages/storage/lib/impl/unshafted-usage-storage.ts`**

The existing storage tracks `fullAnalysesUsed` per month. We need to change this to track **quick scans per day** for anonymous users.

Add a new field `quickScansToday` and `dayKey` alongside the existing monthly counter. The existing `fullAnalysesUsed`/`monthKey` stays (it's used for deep analysis history tracking).

```ts
// Add to usage snapshot:
// quickScansToday: number (0-3 for anonymous)
// dayKey: string (YYYY-MM-DD)
```

This requires updating the `UsageSnapshot` type in `unshafted-core` and the storage implementation.

**Logic:**
- On each quick scan, if user is NOT signed in: check `quickScansToday < 3`. If at limit, show "Sign in for unlimited quick scans."
- If user IS signed in: no limit on quick scans.
- `dayKey` resets the counter when the date changes.

**Status:** [ ] Done

---

### Step 6: Popup auth UI

**Modify: `pages/popup/src/Popup.tsx`**

Add auth state to the sticky header:

**When signed in:**
- Circular avatar in header (Google profile photo, or first-letter fallback)
- Click avatar → small dropdown with email + "Sign out"
- Sign-out clears only the auth session — analysis state stays intact
- "Ready"/"Setup" badge remains (shows API key status, separate concern from auth)

**When not signed in:**
- "Sign in" link/button in the header area (subtle, not blocking)
- Everything works as before for quick scan (up to 3/day)
- When user clicks "Run detailed analysis" → show inline prompt: "Sign in with Google to unlock detailed analysis"
- "Ready"/"Setup" badge remains

**Rough header layout (signed in):**
```
┌─────────────────────────────────────────┐
│ Unshafted          [Ready] [upload] [av]│
│ Contract risk, without the fog.         │
│ document-name.pdf                       │
└─────────────────────────────────────────┘
```

**Rough header layout (not signed in):**
```
┌─────────────────────────────────────────┐
│ Unshafted    [Ready] [upload] [Sign in] │
│ Contract risk, without the fog.         │
│ Upload a contract to review.            │
└─────────────────────────────────────────┘
```

**Status:** [ ] Done

---

### Step 7: Auth-gate deep analysis

**Modify: `pages/popup/src/components/AnalysisWorkspace.tsx`**

In `startDeepAnalysis()` (line ~121), add auth check before running:

```ts
const startDeepAnalysis = async () => {
  if (!currentAnalysis) return;

  // Auth gate
  const { data: { session } } = await getSession();
  if (!session) {
    setPanelError('Sign in with Google to unlock detailed analysis.');
    return;
  }

  // ... existing deep analysis flow
};
```

Also update the "Run detailed analysis" button to show sign-in context:
- If not signed in: button text = "Sign in to run detailed analysis" and triggers `signInWithGoogle()` instead
- If signed in: button text = "Run detailed analysis" (same as today)

**Status:** [ ] Done

---

### Step 8: Quick scan anonymous limit in UI

**Modify: `pages/popup/src/components/AnalysisWorkspace.tsx`**

In `startQuickScan()` (line ~99), add anonymous limit check:

```ts
const startQuickScan = async (analysis: CurrentAnalysis) => {
  // Anonymous limit check
  const { data: { session } } = await getSession();
  if (!session) {
    const usage = await usageSnapshotStorage.get();
    if (usage.dayKey === todayKey() && usage.quickScansToday >= 3) {
      setPanelError('You\'ve used your 3 free quick scans for today. Sign in for unlimited scans.');
      return;
    }
  }

  // ... existing quick scan flow

  // After successful scan (not signed in): increment counter
  if (!session) {
    await usageSnapshotStorage.incrementQuickScans();
  }
};
```

**Status:** [ ] Done

---

## Execution order

| # | Task | Type | Depends on |
|---|---|---|---|
| 1 | Supabase project + schema + Google OAuth | Manual (browser) | — |
| 2 | Database: profiles table + trigger | Manual (SQL editor) | 1 |
| 3 | Add env vars to `.env` + update types | Code | 1 |
| 4 | Create `packages/supabase` | Code | 3 |
| 5 | Add `identity` to manifest | Code | — |
| 6 | Background worker Supabase init | Code | 4 |
| 7 | Update usage storage for daily quick scan counter | Code | — |
| 8 | Popup auth UI (avatar, sign-in button) | Code | 4 |
| 9 | Auth-gate deep analysis | Code | 4, 8 |
| 10 | Quick scan anonymous limit in UI | Code | 7, 8 |
| 11 | End-to-end test | Manual | All |

### E2E test plan

1. Load unpacked extension
2. Upload a contract → quick scan runs (anonymous, count 1)
3. Do it 3 times → 4th quick scan blocked with "Sign in for unlimited" message
4. Click "Sign in with Google" → Google consent screen → sign in
5. Quick scan now works without limit
6. Click "Run detailed analysis" → runs (no credit check, free for signed-in users)
7. Click avatar → see email → click "Sign out"
8. Try "Run detailed analysis" → blocked with "Sign in to unlock" message
9. Reload extension → session persists (auto-refresh via background worker)

---

## Resolved decisions

1. **Pinned extension ID for dev?** **Yes.** Add a `key` field to manifest to keep the extension ID stable across dev reinstalls. This keeps the Google OAuth redirect URI (`https://<extension-id>.chromiumapp.org`) consistent so we don't have to update Google Cloud Console every time the unpacked extension is re-added.
2. **"Ready"/"Setup" badge?** **Keep it.** It indicates API key status (BYOK), which is separate from auth status (avatar/sign-in). Both are relevant since the user still provides their own LLM API key. Revisit layout if it feels crowded during implementation.
3. **Sign-out behavior?** **Clear only the auth session.** Analysis state (uploaded contract, quick scan, deep results) stays intact. Losing work-in-progress on sign-out would feel punitive — the user might just be switching accounts or testing.

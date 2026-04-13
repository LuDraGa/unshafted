# Planning Doc: Supabase Backend — Auth, Profiles, Credits

**Status:** Planning (decisions needed before execution)
**Date:** 2026-04-13
**Scope:** Supabase project setup, Gmail-only social auth from the Chrome extension, user profiles, credit system with server-side enforcement.

---

## Context

The extension currently runs entirely client-side. The user provides their own LLM API key, and all analysis happens in the browser. There is no login, no server, no usage enforcement.

This doc plans the backend foundation: authentication, user identity, and a credit system that will eventually gate analysis (especially deep analysis) behind server-enforced limits. Stripe integration and the web app are **out of scope** for this doc — those come after this foundation exists.

### Current Local State (what exists today)

| Storage key | What it holds | Server migration? |
|---|---|---|
| `unshafted-settings` | Provider, API keys, models, temperature, soft limit | **No** — stays local. User's own API keys never go to our server. |
| `unshafted-current-analysis` | Active analysis session (source doc, quick scan, deep result, role, status) | **No** — ephemeral session state, stays local. |
| `unshafted-history` | Last 6 completed analyses (metadata + results, no raw text) | **Maybe later** — sync to server for cross-device history. Not in this phase. |
| `unshafted-usage` | `{ monthKey, fullAnalysesUsed }` — local soft counter | **Replaced** — server-side credits replace this entirely. |
| `unshafted-pending-action` | `{ type: 'none' }` — vestigial, always 'none' | **No** — dead code, should be cleaned up separately. |

---

## Supabase Project

**Project name:** `my-chrome-extensions`
**Purpose:** Shared Supabase project for all future Chrome extensions. Each extension gets its own Postgres schema.
**Region:** Pick closest to target users (likely US).

**Unshafted schema:** `unshafted` — all Unshafted-specific tables, functions, and RLS policies live here. The default `public` schema is left empty/unused.

### Why schema-scoped, not separate projects?

- One project = one auth system, one set of Supabase keys, one billing account.
- Multiple extensions can share the `auth.users` table — a user who signs into Extension A is already known when they try Extension B.
- Schemas provide clean isolation at the database level without multiplying infra.
- Supabase free tier gives you 2 projects. Burning one per extension doesn't scale.

---

## Decision: Auth Flow Mechanism in Chrome Extension MV3

This is the single hardest architectural decision in this doc. Chrome MV3 extensions have strict constraints on how OAuth can work.

### Option 1: `chrome.identity.launchWebAuthFlow()` + Supabase PKCE

**How it works:**
1. Extension generates a PKCE `code_verifier` and `code_challenge`.
2. Extension calls `chrome.identity.launchWebAuthFlow({ url: supabaseAuthUrl, interactive: true })`.
3. Chrome opens a popup browser window showing Google's consent screen.
4. After consent, Google redirects to `https://<extension-id>.chromiumapp.org/` with an auth code.
5. `chrome.identity` captures the redirect and returns the URL to the extension.
6. Extension exchanges the code with Supabase for a session (access token + refresh token).
7. Extension stores the session in `chrome.storage.local`.

**Pros:**
- Native Chrome API, purpose-built for extensions.
- No hosted web page needed.
- Popup window is clean, no extra tabs.

**Cons:**
- Redirect URL is `https://<extension-id>.chromiumapp.org/` — the extension ID is different in development (unpacked) vs. production (Chrome Web Store). Need to handle both.
- Requires `identity` permission in manifest.
- Supabase's `signInWithOAuth` is designed for browser redirects, not `chrome.identity`. You'd need to manually construct the OAuth URL, handle PKCE, and exchange the code — bypassing Supabase's built-in auth helpers.
- Supabase's JS client `supabase.auth.signInWithOAuth()` won't work directly. You'd use `supabase.auth.exchangeCodeForSession(code)` after manually driving the OAuth flow.

### Option 2: Open a tab to a hosted auth page

**How it works:**
1. Extension opens a new Chrome tab to a hosted page (e.g., `https://unshafted.com/auth` or a Supabase-hosted redirect page).
2. That page runs `supabase.auth.signInWithOAuth({ provider: 'google' })`.
3. After Google consent, Supabase redirects back to the hosted page with the session.
4. The hosted page sends the session tokens back to the extension via one of:
   - `chrome.runtime.sendMessage()` from a content script injected on that page
   - URL fragment with tokens that the extension reads by watching `chrome.tabs.onUpdated`
   - A simple "copy this token" manual step (bad UX, last resort)
5. Extension stores the session.

**Pros:**
- Uses Supabase's standard auth flow unmodified.
- Works with any Supabase auth provider.

**Cons:**
- Requires hosting a web page (even a static one).
- Opens a full browser tab, not a clean popup.
- The message-passing from hosted page → extension is fragile and has UX jank (tab opens, auth happens, tab needs to close or show "you can close this tab").
- Requires `externally_connectable` in manifest or content script injection.

### Option 3: `chrome.identity.launchWebAuthFlow()` directly with Google (not through Supabase)

**How it works:**
1. Extension uses `chrome.identity.launchWebAuthFlow()` to do Google OAuth directly.
2. Gets a Google `id_token` (or access token).
3. Calls Supabase's `supabase.auth.signInWithIdToken({ provider: 'google', token: id_token })`.
4. Supabase creates/finds the user and returns a Supabase session.

**Pros:**
- Cleanest flow for extensions. `chrome.identity` handles all the OAuth complexity.
- `signInWithIdToken` is a first-class Supabase method designed for exactly this case (mobile apps, extensions, server-side auth).
- No hosted page needed.
- No manual PKCE handling.
- Works with Supabase's JS client directly.

**Cons:**
- Need to set up a Google Cloud OAuth client (separate from Supabase's built-in Google provider). You need the client ID for `chrome.identity`.
- The Google Cloud OAuth client needs to be configured with the extension's ID as an authorized origin.
- Two OAuth configs to maintain: one in Google Cloud (for the extension), one in Supabase (Google provider settings, needs the same client ID).

### Recommendation: Option 3

Option 3 is the standard pattern for Chrome extension + Supabase. It's what Supabase documents for mobile/native apps. The flow is clean, uses first-class APIs on both sides, and doesn't require hosting anything.

**The flow in detail:**

```
User clicks "Sign in with Google" in extension popup
  → Extension calls chrome.identity.getAuthToken({ interactive: true })
     OR chrome.identity.launchWebAuthFlow() with Google's OAuth endpoint
  → Chrome shows Google consent popup
  → Google returns id_token to extension
  → Extension calls supabase.auth.signInWithIdToken({ provider: 'google', token: id_token })
  → Supabase validates the token, creates/finds user, returns session
  → Extension stores session in chrome.storage.local
  → Extension is now authenticated
```

**Note on `chrome.identity.getAuthToken()` vs `launchWebAuthFlow()`:**
- `getAuthToken()` is simpler but gives you a Google access token, not an id_token. Supabase's `signInWithIdToken` needs an id_token.
- `launchWebAuthFlow()` with Google's OAuth endpoint and `response_type=id_token` gives you the id_token directly.
- Alternatively, use `getAuthToken()` to get an access token, then call Google's `userinfo` endpoint... but that's roundabout.
- **Simplest path:** `launchWebAuthFlow()` with `response_type=id_token` and `nonce` parameter.

---

## Decision: Where Does the Supabase Client Live?

### Option A: In `packages/unshafted-core`

The core is meant to be portable to the future web app. Putting the Supabase client here means the web app gets it for free.

**But:** The core currently has zero runtime dependencies beyond `zod`. Adding `@supabase/supabase-js` (which pulls in `@supabase/gotrue-js`, `@supabase/postgrest-js`, etc.) is a significant dependency. The core is also used in the popup, which means the Supabase client bundle ends up in the popup's JS.

### Option B: New package `packages/supabase`

A dedicated package that wraps Supabase client initialization, auth helpers, and credit queries. The popup and background worker import from it. The core stays dependency-free.

### Option C: In `packages/shared`

Shared already has extension-specific utils. Adding Supabase here keeps the package count down.

### Recommendation: Option B

Clean separation. The core stays portable and light. The new package is explicitly about the backend connection. The web app can later import from it or create its own Supabase client with different config.

---

## Decision: Where Does the Session Live?

After `signInWithIdToken` returns a session (access token + refresh token), where do we store it?

### Option A: `chrome.storage.local`

Same as all other extension state. Survives browser restarts. Accessible from popup, background worker, content scripts.

### Option B: Supabase JS client's built-in storage

The Supabase client can be configured with a custom `storage` adapter. You can point it at `chrome.storage.local` so it manages its own session persistence.

### Recommendation: Option B

Configure the Supabase client with a `chrome.storage.local`-backed storage adapter. This way `supabase.auth.getSession()`, `supabase.auth.onAuthStateChange()`, and automatic token refresh all work out of the box. You don't have to manually manage token lifecycle.

```ts
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key) => chrome.storage.local.get(key).then(r => r[key] ?? null),
      setItem: (key, value) => chrome.storage.local.set({ [key]: value }),
      removeItem: (key) => chrome.storage.local.remove(key),
    },
    autoRefreshToken: true,
    persistSession: true,
    flowType: 'pkce',
  },
});
```

---

## Database Schema

All tables in the `unshafted` schema. RLS enabled on all tables.

### `unshafted.profiles`

Created automatically when a new `auth.users` row appears (via a Postgres trigger on `auth.users`).

```sql
create schema if not exists unshafted;

create table unshafted.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  tier text not null default 'free' check (tier in ('free', 'pro', 'team')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table unshafted.profiles enable row level security;

-- Users can only read/update their own profile
create policy "Users read own profile"
  on unshafted.profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on unshafted.profiles for update
  using (auth.uid() = id);
```

### `unshafted.credit_balances`

Tracks current credit balance per user. Separate from the ledger for fast reads.

```sql
create table unshafted.credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  last_daily_grant date,
  updated_at timestamptz not null default now()
);

alter table unshafted.credit_balances enable row level security;

create policy "Users read own balance"
  on unshafted.credit_balances for select
  using (auth.uid() = user_id);

-- No direct update policy — balance changes only through server functions
```

### `unshafted.credit_ledger`

Immutable append-only log. Every credit change (grant, spend, purchase, expiry) is a row.

```sql
create table unshafted.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,  -- positive = credit added, negative = credit spent
  reason text not null check (reason in (
    'daily_grant', 'signup_bonus', 'purchase', 'quick_scan', 'deep_analysis', 'admin_adjustment', 'expiry'
  )),
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

alter table unshafted.credit_ledger enable row level security;

create policy "Users read own ledger"
  on unshafted.credit_ledger for select
  using (auth.uid() = user_id);

-- No insert/update/delete policy for users — only server functions write here
```

### Trigger: Auto-create profile + credit balance on signup

```sql
create or replace function unshafted.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into unshafted.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', '')
  );

  insert into unshafted.credit_balances (user_id, balance, last_daily_grant)
  values (new.id, 5, current_date);  -- signup bonus: 5 credits

  insert into unshafted.credit_ledger (user_id, delta, reason)
  values (new.id, 5, 'signup_bonus');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function unshafted.handle_new_user();
```

---

## Decision: Credit Model

### What costs credits?

| Action | Credit cost | Where it runs |
|---|---|---|
| Quick scan | **0 (free)** | Extension, user's own API key |
| Deep analysis | **1 credit** | Extension for now, web app later |

Quick scan stays free because it's cheap (small model, small prompt) and it's the hook that shows value. Deep analysis is the premium action.

### How are credits granted?

| Event | Credits | Frequency |
|---|---|---|
| Signup | 5 | Once |
| Daily login/use | Depends on tier | Daily (if not already granted today) |

**Daily grant by tier:**

| Tier | Daily credits | Notes |
|---|---|---|
| `free` | 1 | Enough for 1 deep analysis per day |
| `pro` | 10 | ~$X/month via Stripe (future) |
| `team` | 30 | Future |

### Daily grant mechanism

**Option A: Cron job (Supabase pg_cron or Edge Function on schedule)**
Runs once per day, grants credits to all active users. Simple, but grants credits even to inactive users (wasteful accounting) and requires scheduled infra.

**Option B: Grant-on-demand (check on each API call)**
When the user tries to spend a credit, first check if today's daily grant has been applied. If `last_daily_grant < today`, apply the grant first, then deduct. Lazy evaluation — no cron needed.

**Recommendation: Option B (grant-on-demand)**
Simpler, no scheduled jobs, no wasted grants. The logic lives in a single Postgres function or Edge Function that handles "ensure daily grant, then spend."

### Credit spend function

This should be an **RPC function** (Postgres function called via `supabase.rpc()`) or an **Edge Function**. Not a direct table update — credits must be enforced atomically server-side.

```sql
create or replace function unshafted.spend_credit(
  p_reason text,
  p_cost integer default 1,
  p_metadata jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_tier text;
  v_balance integer;
  v_last_grant date;
  v_daily_amount integer;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Lock the balance row for atomic update
  select cb.balance, cb.last_daily_grant, p.tier
  into v_balance, v_last_grant, v_tier
  from unshafted.credit_balances cb
  join unshafted.profiles p on p.id = cb.user_id
  where cb.user_id = v_user_id
  for update;

  -- Determine daily grant amount
  v_daily_amount := case v_tier
    when 'free' then 1
    when 'pro' then 10
    when 'team' then 30
    else 1
  end;

  -- Apply daily grant if not yet granted today
  if v_last_grant is null or v_last_grant < current_date then
    v_balance := v_balance + v_daily_amount;

    insert into unshafted.credit_ledger (user_id, delta, reason, metadata)
    values (v_user_id, v_daily_amount, 'daily_grant', jsonb_build_object('tier', v_tier, 'date', current_date));

    update unshafted.credit_balances
    set balance = v_balance, last_daily_grant = current_date, updated_at = now()
    where user_id = v_user_id;
  end if;

  -- Check balance
  if v_balance < p_cost then
    return jsonb_build_object('ok', false, 'error', 'insufficient_credits', 'balance', v_balance);
  end if;

  -- Deduct
  update unshafted.credit_balances
  set balance = v_balance - p_cost, updated_at = now()
  where user_id = v_user_id;

  insert into unshafted.credit_ledger (user_id, delta, reason, metadata)
  values (v_user_id, -p_cost, p_reason, p_metadata);

  return jsonb_build_object('ok', true, 'balance', v_balance - p_cost);
end;
$$;
```

### Credit check flow in the extension

```
User clicks "Run detailed analysis"
  → Extension calls supabase.rpc('spend_credit', { p_reason: 'deep_analysis' })
  → If { ok: true } → proceed with deep analysis using user's own API key
  → If { ok: false, error: 'insufficient_credits' } → show "Out of credits" UI
  → If { ok: false, error: 'not_authenticated' } → show "Sign in to continue"
```

**Important:** The user still provides their own LLM API key and the analysis still runs client-side. The credit check is a **gate**, not a proxy. The server doesn't run the analysis — it just authorizes it. This means:

- No LLM API costs for you.
- The server never sees the contract text (privacy win).
- Credits enforce a usage cadence, not a cost pass-through.

This changes later when deep analysis moves server-side (your item #6), but that's a future phase.

---

## Decision: Manifest Changes

Need to add `identity` permission for `chrome.identity.launchWebAuthFlow()`.

```ts
permissions: ['storage', 'tabs', 'activeTab', 'scripting', 'identity'],
```

Also need `oauth2` section if using `chrome.identity.getAuthToken()`:
```ts
oauth2: {
  client_id: 'YOUR_GOOGLE_CLOUD_CLIENT_ID.apps.googleusercontent.com',
  scopes: ['openid', 'email', 'profile'],
},
```

If using `launchWebAuthFlow()` instead of `getAuthToken()`, the `oauth2` manifest key is not needed — you construct the URL manually.

---

## Decision: Where Does Auth UI Live?

### Option A: In the popup (inline)

Add a "Sign in with Google" button to the popup launcher. When not signed in, show the sign-in button. When signed in, show the user's avatar/name and credit balance.

### Option B: In the Options page

Auth lives in Options alongside API key setup. Popup just shows auth status.

### Option C: Popup for sign-in trigger, Options for account management

Popup shows "Sign in" or user avatar + credits. Options shows full account details, tier, credit history.

### Recommendation: Option C

The popup is the primary surface. Sign-in should be one click from there. But detailed account management (if any) belongs in Options.

---

## New Package: `packages/supabase`

### Structure

```
packages/supabase/
  lib/
    client.ts        — createClient() with chrome.storage adapter
    auth.ts          — signInWithGoogle(), signOut(), getUser(), onAuthStateChange()
    credits.ts       — getBalance(), spendCredit(), getCreditHistory()
    types.ts         — Supabase-specific types (Profile, CreditBalance, etc.)
    constants.ts     — SUPABASE_URL, SUPABASE_ANON_KEY (from env)
    index.ts         — barrel export
  package.json
  tsconfig.json
```

### Dependencies

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.x"
  }
}
```

### Environment variables

```
CEB_SUPABASE_URL=https://xxxxx.supabase.co
CEB_SUPABASE_ANON_KEY=eyJhbG...
CEB_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
```

These go in `.env` (gitignored) and are injected via the existing `packages/env` build pipeline (which already reads `CEB_*` env vars).

---

## Google Cloud Setup (Required for Auth)

1. Go to Google Cloud Console → create a new project (or use existing).
2. Enable "Google Identity" (or "People API").
3. Create OAuth 2.0 Client ID:
   - Application type: **Chrome Extension** (if using `getAuthToken`) or **Web application** (if using `launchWebAuthFlow`).
   - For `launchWebAuthFlow`: add `https://<extension-id>.chromiumapp.org` as an authorized redirect URI.
   - For development (unpacked extension): the extension ID changes. You may need to add the dev ID as well, or use a pinned extension ID via the `key` field in the manifest.
4. Copy the Client ID.
5. In Supabase Dashboard → Authentication → Providers → Google:
   - Enable Google provider.
   - Paste the same Client ID and Client Secret.
   - This tells Supabase to trust tokens issued by this Google OAuth client.

---

## Extension Auth UX Flow

### Not signed in (popup launcher)

```
┌────────────────────────────┐
│ Unshafted                  │
│ Contract risk, without the │
│ fog.                       │
│                            │
│ [Sign in with Google]      │ ← primary action when not authed
│                            │
│ ─── or ───                 │
│                            │
│ [Upload your contract]     │ ← still works for quick scan (free, no auth)
│                            │
│ ⚠ Sign in for deep         │
│   analysis (1 credit)      │
└────────────────────────────┘
```

### Signed in (popup launcher)

```
┌────────────────────────────┐
│ Unshafted          [avatar]│
│ Contract risk, without the │
│ fog.              3 credits│
│                            │
│ [Upload your contract]     │
└────────────────────────────┘
```

### Deep analysis gating

When user clicks "Run detailed analysis":
- If not signed in → "Sign in with Google to unlock detailed analysis."
- If signed in but 0 credits → "You're out of credits for today. Credits refresh daily."
- If signed in with credits → spend 1 credit, run analysis.

Quick scan always runs free, no auth required.

---

## Migration Path: What Changes in Existing Code

### `analysis-workflow.ts` (`runDeepAnalysis`)

Add a credit check before the LLM call:
```ts
// Before running the deep analysis API call:
const creditResult = await spendCredit('deep_analysis');
if (!creditResult.ok) {
  // Return error state with creditResult.error
}
// ... existing LLM call
```

### `AnalysisWorkspace.tsx`

The "Run detailed analysis" button needs to handle auth/credit states:
- Check if user is signed in (from Supabase auth state).
- If not, show sign-in prompt instead of running analysis.
- If signed in, the `spendCredit` call in the workflow handles the rest.

### `Popup.tsx`

Add auth state display (avatar, credits) and sign-in button.

### `background/index.ts`

Initialize the Supabase client here so token refresh happens in the background (service worker stays alive for auth state changes).

### `manifest.ts`

Add `identity` permission.

---

## Revised Decisions Summary (2026-04-14)

Based on review, several decisions were revised to support an incremental build strategy.

| # | Decision | Choice | Notes |
|---|---|---|---|
| 1 | Auth flow mechanism | **Option 3: `chrome.identity` + `signInWithIdToken`** | Standard pattern, no hosted page needed |
| 2 | Supabase client location | **Option B: New `packages/supabase` package** | Keeps core clean |
| 3 | Session storage | **Option B: Supabase client with `chrome.storage.local` adapter** | Auto token refresh works |
| 4 | Credit model | **Deferred to Phase 3** | Credits + payments designed together. Rough sketch: quick=10cr, deep=100cr, ~$10=2000cr |
| 5 | Auth UI location | **Popup only** — profile icon + sign-out in popup header | No separate Options page for auth |
| 6 | Quick scan gating | **3/day for anonymous users** (local counter, no sign-in) | Free hook to show value |
| 7 | Deep analysis gating | **Auth-gated** — sign in required, but free while credits don't exist | Credit gating added in Phase 3 |
| 8 | LLM call location | **Client-side BYOK for now** | Server-side LLM is a big decision, deferred |
| 9 | Contract/analysis storage | **Google Drive (user's own)** — deferred to Phase 2 | Avoids PII on our server |

### Key change: Incremental phased approach

Instead of shipping auth + credits + gating in one phase, the work is split:

- **Phase 1: Auth + Profiles** — Supabase, Google OAuth, profiles table, sign-in flow in popup, auth-gate deep analysis, 3/day anonymous quick scan limit.
- **Phase 2: Google Drive storage** — Store contracts + analysis results in user's Drive. Cross-device history.
- **Phase 3: Credits + Payments** — Credit system, pricing model, Stripe/Cashfree. Quick scan and deep analysis both cost credits. Server-side LLM decision made here.

See `execution-docs/phase1-auth-profiles.md` for Phase 1 execution plan.

---

## Out of Scope (Future Phases)

- **Credits + payments (Phase 3)** — credit system, pricing, Stripe/Cashfree. Designed together so pricing model is coherent.
- **Google Drive integration (Phase 2)** — contract/analysis storage in user's Drive for PII avoidance.
- **Server-side LLM proxy** — deep analysis runs through our API key on the server. Requires Edge Functions. Decision tied to credits/pricing.
- **Web app** — the companion site where detailed analysis lives long-term. Separate project.
- **Cross-device sync** — syncing analysis history to Supabase or Drive. Comes with Phase 2.
- **Team features** — shared credits, shared analyses. Future.
- **Credit expiry** — daily credits that don't roll over. Designed with Phase 3.

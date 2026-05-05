Privacy Policy
==============

**Effective date:** May 5, 2026

**Unshafted** (Chrome Web Store item ID: `fpjjdlffjfkdiibljglmgfkbpkkibpia`) is a browser extension that analyzes contracts and agreements for risk using AI models. This policy explains what data the extension collects, how it is handled, how it is stored, and how it is shared.

---

Data we collect
---------------

### 1. Account information (signed-in users)

When you sign in with Google, we receive your **email address**, **display name**, and **profile picture** from Google. This information is used solely for authentication and to display your account in the extension. Authentication is handled by Supabase; your Google ID and email are stored in our Supabase-hosted auth database.

### 2. User preferences and settings

Your chosen AI provider, model selection, temperature setting, API keys (OpenRouter or OpenAI), onboarding state, and a cached copy of your Drive backup preference are stored locally on your device in `chrome.storage.local`. The Drive backup preference is also persisted to your Supabase profile row so it follows your account across devices; the local copy is a cache of that profile value. API keys are not sent to our servers.

### 3. Contract and agreement text

When you upload a `.pdf` or `.txt` file for analysis, the document text is extracted locally and held in `chrome.storage.session` for the active analysis session. If you are signed in and Drive backup is enabled before a new scan, the original PDF/TXT source file is uploaded to an "Unshafted" folder in your Google Drive.

### 4. Analysis results

AI-generated risk analysis results (quick scans and deep analyses) are stored locally. The analysis results contain the AI-generated risk summary, which includes referenced excerpts from the contract. If you are signed in and Drive backup is enabled, quick-scan and deep-analysis report JSON files are stored as separate files in the "Unshafted" folder in **your own Google Drive** account. If you enable Drive backup after a local report already exists, the extension asks before backing up the visible report; that manual backup may only sync report JSON if the original source file was not uploaded during the original scan.

### 5. Usage counters

Anonymous users: a daily quick-scan counter is stored locally to enforce the free-tier limit (3 quick scans per day). Signed-in users get unlimited quick scans; a monthly full-analysis counter is stored locally.

### 6. Authentication tokens (signed-in users)

When you sign in or enable Drive backup, the extension receives and stores authentication tokens issued by Google and Supabase. These tokens are used only to keep your session alive and to authorize calls to the issuing service; they are not transmitted to any other party.

| Token | Issued by | Where it is stored | Lifetime | Purpose |
|-------|-----------|--------------------|----------|---------|
| Google ID / profile payload | Google Sign-In | `chrome.storage.local` (Supabase session) | Refreshed by Supabase | Identify your account on sign-in |
| Google OAuth access token (`drive.file`) | Google OAuth | `chrome.storage.local` (`unshafted-drive-token`) | ~1 hour, silently re-issued | Authorize Google Drive API calls when Drive backup is enabled |
| Supabase session JWT | Supabase | `chrome.storage.local` (managed by `supabase-js`) | Short-lived, auto-refreshed | Authenticate requests to your Supabase profile row |
| Supabase refresh token | Supabase | `chrome.storage.local` (managed by `supabase-js`) | Long-lived until sign-out | Obtain a new session JWT without re-prompting |

All tokens are scoped to the extension's storage origin (no web page or other extension can read them) and are cleared on sign-out or when you clear extension data.

---

How we use your data
--------------------

| Data | Purpose |
|------|---------|
| Email and profile | Authenticate your session; display your account in the extension |
| Drive backup preference | Stored in your Supabase profile and cached locally so the extension can remember whether Drive backup is enabled |
| API keys | Sent directly to the AI provider you configured (OpenRouter or OpenAI) to authorize model requests |
| Contract text | Sent to the AI provider you configured so the model can generate a risk analysis |
| Original source file | Signed-in users with Drive backup enabled before a new scan: uploaded to your Google Drive for cross-device access. Otherwise kept locally only during the active scan flow |
| Analysis results | Displayed in the extension and stored locally. Signed-in users with Drive backup enabled: stored as report JSON files in your Google Drive |
| Usage counters | Enforce free-tier daily limits for anonymous users |

---

Signed-in vs. anonymous users
------------------------------

Unshafted works without an account. Signing in with Google unlocks additional features but also changes how data flows:

| | Anonymous | Signed in (Google) |
|---|---|---|
| Quick scans | 3 per day | Unlimited |
| Deep analysis | Requires sign-in | Available |
| Data stored locally | Yes | Yes |
| Data synced to Google Drive | No | Only if Drive backup is enabled |
| Account info collected | None | Email, display name, profile picture |
| Auth session | None | Supabase + Google OAuth tokens (stored locally) |

---

How we handle and protect your data
-----------------------------------

- **In transit:** All network requests from the extension — to Supabase, Google (Sign-In and Drive API), OpenRouter, and OpenAI — are made over HTTPS/TLS. The extension does not send data over plaintext channels.
- **At rest (Supabase):** Authentication records and profile rows (Google user ID, email, display name, avatar URL, Drive backup preference) are stored in our Supabase project, which provides managed encryption at rest. Access is restricted to the project owner; row-level security policies prevent users from reading other users' rows.
- **At rest (your device):** API keys, OAuth/session tokens, preferences, local history, and usage counters live in `chrome.storage.local`, which Chrome scopes to the extension's origin and is not readable by web pages or other extensions. Active scan text lives in `chrome.storage.session` and is cleared when the browser session ends.
- **At rest (your Google Drive):** Files written via the `drive.file` scope are stored in your own Google Drive under Google's infrastructure and protections. The extension cannot read or modify any other files in your Drive.
- **API keys:** Your AI provider API key is sent only from your device directly to the provider you configured (OpenRouter or OpenAI) to authorize model requests. It is never transmitted to or stored on our servers.
- **No server-side storage of contract content:** Contract text and analysis results are never stored on any server we operate. They live only on your device and, if you opt in, in your own Google Drive.
- **No human access to your content:** No employee, contractor, or administrator has access to your contract text, analysis results, API keys, or OAuth tokens, because they are never stored in any system we administer.
- **No model training:** We do not use information received from Google APIs, your contract text, or your analysis results to train, fine-tune, or improve any AI/ML model.

---

How we store your data
----------------------

- **On your device:** API keys, preferences, a short analysis history, and usage counters are stored in `chrome.storage.local`. The active contract text for the current scan is stored in `chrome.storage.session`, so it is cleared when the browser session ends. This data never leaves your device except as described below.
- **Supabase (authentication and profile preference):** Your Google user ID, email, display name, avatar URL, and Drive backup preference are stored in our Supabase project's auth/profile database for session management and profile-backed preferences. No contract text or analysis results are stored in Supabase.
- **Your Google Drive (optional for signed-in users):** Signing in with Google grants the extension the `drive.file` scope, but files are saved to Drive only when Drive backup is enabled. New scans with Drive backup enabled upload the original PDF/TXT source file and store quick-scan/deep-analysis report JSON as separate files. Backing up an already-visible local report requires confirmation and may only store report JSON if the source file was not uploaded during the original scan. The `drive.file` scope limits access to only files created by the extension — it cannot read or modify any other files in your Drive. These files count against your own Drive storage quota and are visible to you in Drive. Anonymous users' data never leaves the device except for AI-provider analysis requests.

---

Data sharing and third parties
------------------------------

- **AI model providers:** When you run an analysis, the contract text and your API key are sent to the provider you selected (OpenRouter or OpenAI). We do not control how these providers handle your data; refer to their privacy policies:
  - OpenRouter: https://openrouter.ai/privacy
  - OpenAI: https://openai.com/privacy
- **Supabase:** Handles authentication and the profile-backed Drive backup preference. See https://supabase.com/privacy.
- **Google Drive API:** Used to store and retrieve Unshafted-created source files and report JSON files in your own Drive when Drive backup is enabled. See https://policies.google.com/privacy.

We do **not** sell, rent, or transfer your data to any other third parties. We do **not** use your data for advertising, analytics, profiling, or creditworthiness purposes.

---

Google API Services User Data Policy (Limited Use)
--------------------------------------------------

Unshafted's use and transfer to any other app of information received from Google APIs will adhere to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements.

Specifically, information received from Google APIs (your Google account email, profile, and files created by Unshafted in your Google Drive via the `drive.file` scope) is used **only** to provide and improve user-facing features of the Unshafted extension. We do **not**:

- Transfer this information to third parties except as necessary to provide or improve user-facing features, comply with applicable law, or as part of a merger, acquisition, or sale of assets with the user's prior consent.
- Use this information to serve advertising, including personalized or retargeted advertising.
- Allow humans to read this information unless we have the user's affirmative agreement for specific messages, it is necessary for security purposes (e.g., investigating abuse), to comply with applicable law, or the information has been aggregated and anonymized.
- Use this information to develop, train, or improve generalized or non-personalized AI/ML models.

---

Data retention and deletion
---------------------------

- **Local data:** You can clear local reports or all local extension data from the popup. Clearing all local data removes local API keys, auth/session data, active scan text, local history, preferences, and usage counters. You can also remove this data by uninstalling the extension or clearing extension storage from your browser settings.
- **Google Drive files:** Source files and report JSON files in your Drive persist until you delete them. You can delete them directly from Google Drive or from the extension's history view when possible.
- **Supabase auth records:** If you want your authentication record removed, email us at the address below and we will delete it within 30 days.

---

What we do NOT collect
----------------------

- No browsing history or page content (the extension does not read web pages)
- No analytics, telemetry, or crash reporting
- No cookies, fingerprinting, or tracking
- No location data
- No financial or payment information

---

Children's privacy
------------------

Unshafted is not directed at children under 13. We do not knowingly collect data from children.

---

Changes to this policy
----------------------

We may update this policy from time to time. Material changes will be noted with an updated effective date at the top of this document.

---

Not legal advice
----------------

Unshafted is for informational purposes only. It is not a substitute for qualified legal counsel.

---

Contact
-------

For questions about this policy or to request data deletion, email: **abhiroopprasad@gmail.com**

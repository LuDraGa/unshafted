Privacy Policy
==============

**Effective date:** April 17, 2026

**Unshafted** is a browser extension that analyzes contracts and agreements for risk using AI models. This policy explains what data the extension collects, how it is used, how it is stored, and when it is shared.

---

Data we collect
---------------

### 1. Account information (signed-in users)

When you sign in with Google, we receive your **email address**, **display name**, and **profile picture** from Google. This information is used solely for authentication and to display your account in the extension. Authentication is handled by Supabase; your Google ID and email are stored in our Supabase-hosted auth database.

### 2. User preferences and settings

Your chosen AI provider, model selection, temperature setting, and API keys (OpenRouter or OpenAI) are stored locally on your device in `chrome.storage.local`. These are never sent to our servers.

### 3. Contract and agreement text

When you upload a `.pdf` or `.txt` file for analysis, the document text is extracted and held in local extension storage for the duration of the analysis session. If you are signed in, the original source file is also uploaded to your Google Drive alongside the analysis results.

### 4. Analysis results

AI-generated risk analysis results (quick scans and deep analyses) are stored locally. The analysis results contain the AI-generated risk summary, which includes referenced excerpts from the contract. If you are signed in, the analysis results and the original source file are synced to an "Unshafted" folder in **your own Google Drive** account so you can access them across devices.

### 5. Usage counters

Anonymous users: a daily quick-scan counter is stored locally to enforce the free-tier limit (3 quick scans per day). Signed-in users get unlimited quick scans; a monthly full-analysis counter is stored locally.

---

How we use your data
--------------------

| Data | Purpose |
|------|---------|
| Email and profile | Authenticate your session; display your account in the extension |
| API keys | Sent directly to the AI provider you configured (OpenRouter or OpenAI) to authorize model requests |
| Contract text | Sent to the AI provider you configured so the model can generate a risk analysis |
| Original source file | Signed-in users: uploaded to your Google Drive for cross-device access. Anonymous users: kept locally only |
| Analysis results | Displayed in the extension. Signed-in users: synced to your Google Drive |
| Usage counters | Enforce free-tier daily limits for anonymous users |

---

Signed-in vs. anonymous users
------------------------------

Unshafted works without an account. Signing in with Google unlocks additional features but also changes how data flows:

| | Anonymous | Signed in (Google) |
|---|---|---|
| Quick scans | 3 per day | Unlimited |
| Deep analysis | Available | Available |
| Data stored locally | Yes | Yes |
| Data synced to Google Drive | No | Yes (analysis results + original source file) |
| Account info collected | None | Email, display name, profile picture |
| Auth session | None | Supabase + Google OAuth tokens (stored locally) |

---

How we store your data
----------------------

- **On your device:** API keys, preferences, the current analysis session, a short analysis history, and usage counters are stored in `chrome.storage.local`. This data never leaves your device except as described below.
- **Supabase (authentication):** Your Google user ID and email are stored in our Supabase project's auth database for session management. No contract text or analysis results are stored in Supabase.
- **Your Google Drive (signed-in users only):** Signing in with Google grants the extension the `drive.file` scope, which is required for cross-device sync. Analysis results (JSON) and original source files (PDF or TXT) are saved to an "Unshafted" folder in your personal Google Drive. The `drive.file` scope limits access to only files created by the extension — it cannot read or modify any other files in your Drive. These files count against your own Drive storage quota and are visible to you in Drive. Anonymous users' data never leaves the device.

---

Data sharing and third parties
------------------------------

- **AI model providers:** When you run an analysis, the contract text and your API key are sent to the provider you selected (OpenRouter or OpenAI). We do not control how these providers handle your data; refer to their privacy policies:
  - OpenRouter: https://openrouter.ai/privacy
  - OpenAI: https://openai.com/privacy
- **Supabase:** Handles authentication only. See https://supabase.com/privacy.
- **Google Drive API:** Used to store and retrieve your analysis files in your own Drive. See https://policies.google.com/privacy.

We do **not** sell, rent, or transfer your data to any other third parties. We do **not** use your data for advertising, analytics, profiling, or creditworthiness purposes.

---

Data retention and deletion
---------------------------

- **Local data:** You can clear all local data at any time by uninstalling the extension or clearing extension storage from your browser settings.
- **Google Drive files:** Analysis files in your Drive persist until you delete them. You can delete them directly from Google Drive or from the extension's history view.
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

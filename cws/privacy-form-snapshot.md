# CWS Privacy Form — Snapshot

**Item:** Unshafted: AI Contract Risk Analyzer
**Item ID:** `fpjjdlffjfkdiibljglmgfkbpkkibpia`
**Version live:** 0.7.1 — approved and published 2026-05-11
**Snapshot date:** 2026-09-07 — **PREPARED, NOT YET ENTERED IN THE DASHBOARD.** This file now
describes the form as it must look for the site-policy release. The live form is still the
0.7.1 state: single purpose names uploads only, `Website content` unchecked, and no
`host_permissions` justification. See `cws/submission-checklist.md`.
**Source:** Chrome Web Store Developer Dashboard → Privacy tab

This file mirrors the live values entered in the CWS dashboard's Privacy tab so the source of truth lives in git alongside `privacy-policy.md`. Update this file whenever the dashboard form is changed.

---

## Single purpose

> Show a user the risk in the agreements they are asked to accept. Unshafted analyzes contracts the user uploads, and reads the legal documents a website links to — terms of service, privacy policy, cookie policy — so it can tell the user what that site makes them agree to. Both produce the same structured findings: unfavorable clauses, missing protections, and what the user can still do about them.

---

## Permission justification

### `storage`

> Stores the user's API key (OpenRouter or OpenAI), model preferences, current analysis session, local analysis history, usage counters, and Google auth session tokens in chrome.storage.local. No data is synced to external servers from storage — Drive sync uses a separate API flow.

`284 / 1,000` characters.

### `identity`

> Unshafted uses Google Sign-In to securely authenticate users and enable storage of contract data and AI-generated analysis results in the user's own Google Drive. The user's email address is used solely for authentication, user profile data and session identification.

`268 / 1,000` characters.

### `host_permissions` (`<all_urls>`)

> Unshafted tells a user what the site they are on makes them agree to. To do that it must read that site's own page to find the legal documents it links to — terms of service, privacy policy, cookie policy — and fetch their text. Standing site access is required because Chrome grants activeTab only when the user clicks the toolbar icon and revokes it the moment the tab navigates, which makes automatic detection impossible. The read is a single one-shot script run only while the Unshafted side panel is open on that page. There is no persistent content script. Only links that identify a legal document are kept; all other page content is discarded inside the tab. No page content and no record of visited sites is sent to Unshafted.

### `tabs`

> Reads the URL of the active tab so the extension can tell whether the site the user is on appears in Unshafted's bundled index of already-analysed policy documents, and show the corresponding risk level. This lookup is local and involves no network request.

### `activeTab`

> Retained as the fallback path for reading the current page when a user has restricted the extension's site access from chrome://extensions. Used for the same one-shot policy-document read described under host_permissions.

### `scripting`

> Runs the one-shot script that collects the current page's legal-document links and fetches the text of a policy document, in the page's own session. No script is registered to run persistently on any page.

### `sidePanel`

> Renders the policy analysis in Chrome's side panel beside the page, so the extension never injects UI into the page itself.

---

## Remote code

- [x] **No, I am not using remote code**
- [ ] Yes, I am using remote code

(Justification field left blank — not applicable.)

---

## Data usage — what user data is collected now or in the future

| | Category | Selected |
|---|---|---|
| ✅ | **Personally identifiable information** — name, address, email address, age, or identification number | **Yes** |
| ⬜ | Health information — heart rate, medical history, symptoms, diagnoses, procedures | No |
| ⬜ | Financial and payment information — transactions, credit card numbers, credit ratings, statements, payment history | No |
| ✅ | **Authentication information** — passwords, credentials, security questions, PINs | **Yes** |
| ⬜ | Personal communications — emails, texts, chat messages | No |
| ⬜ | Location — region, IP address, GPS coordinates, nearby-device info | No |
| ⬜ | Web history — pages visited, page titles, visit times | No |
| ⬜ | User activity — network monitoring, clicks, mouse position, scroll, keystrokes | No |
| ✅ | **Website content** — text, images, sounds, videos, hyperlinks | **Yes** |

### Rationale for unselected categories

- **Personal communications** — user-uploaded contracts/agreements are documents the user supplies for analysis, not communications observed or intercepted by the extension. The extension does not read email, chat, or messaging content.
- **User activity** — the extension stores local rate-limit counters (daily quick-scan count, monthly deep-analysis count) on the user's own device. It does not perform network monitoring, click/scroll/keystroke logging, or any cross-session activity tracking.
- **Web history, Location, Health, Financial** — never collected. The extension reads the page the side panel is open on in the moment, but does not record, store, or transmit which sites the user visited, so no history is collected.

### Rationale for Website content (selected as of the site policy awareness release)

The extension reads the current page's hyperlinks to find the legal documents the site links to, and fetches the text of those documents. Selected honestly even though the collection is narrow, because the category covers hyperlinks and text and the read is real. Scope, in the extension and in the privacy policy: a single one-shot script run only while the side panel is open on that page; no persistent content script; only legal-document links retained, everything else discarded inside the tab; policy text hashed on-device for comparison against the bundled corpus; text leaves the device only to the AI provider the user configured, on the user's own API key, and only when the user explicitly asks for an analysis. Nothing is sent to Unshafted.

---

## Certified disclosures

All three boxes checked:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## Privacy policy URL

```
https://gist.github.com/LuDraGa/782b874f1e7fe0076fb2bf1509937e95
```

`64 / 2,048` characters.

The gist is auto-synced from `privacy-policy.md` on every push to `main` via `.github/workflows/sync-privacy-policy.yml`.

---

## Cross-checks against `privacy-policy.md`

| Form field | Mirrored in policy | Section |
|---|---|---|
| Single purpose | Yes (intro paragraph) | Top of file |
| `storage` justification | Yes | §1–§7 + "How we store your data" |
| `identity` justification | Yes | §1, §7, "How we handle and protect your data" |
| `host_permissions` justification | Yes | §5 "Website content (policy documents only)" |
| PII checkbox | Yes — email, display name, profile picture | §1 |
| Authentication info checkbox | Yes — Google OAuth tokens, Supabase JWT/refresh | §7 |
| Website content checkbox | Yes — page hyperlinks and policy-document text | §5 |
| No remote code | Implicit (no eval/remote script in source) | n/a |
| No-sell / single-purpose / no-credit certifications | Yes | "Data sharing and third parties" + Limited Use section |

---

## Change log

- **2026-09-07** — Prepared for the site-policy release. Single purpose rewritten to name reading a site's linked legal documents, because that is the sentence a reviewer maps `<all_urls>` against and the old one described uploads only. `Website content` selected. Justifications added for `host_permissions`, `tabs`, `activeTab`, `scripting`, `sidePanel` — the last four were live without justifications because they predate this file. **Not yet entered.**
- **2026-05-05** — Initial snapshot at v0.7.0 resubmission. Captures form state after Purple Nickel hardening pass (Limited Use disclosure, handling section, §6 auth-token enumeration in policy).

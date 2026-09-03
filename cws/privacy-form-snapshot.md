# CWS Privacy Form — Snapshot

**Item:** Unshafted: AI Contract Risk Analyzer
**Item ID:** `fpjjdlffjfkdiibljglmgfkbpkkibpia`
**Version live:** 0.7.1 — approved and published 2026-05-11
**Snapshot date:** 2026-05-05 (form values unchanged by the 0.7.1 resubmission;
no permissions or data-usage categories changed between 0.7.0 and 0.7.1)
**Source:** Chrome Web Store Developer Dashboard → Privacy tab

This file mirrors the live values entered in the CWS dashboard's Privacy tab so the source of truth lives in git alongside `privacy-policy.md`. Update this file whenever the dashboard form is changed.

---

## Single purpose

> Analyze contracts and agreements for risk, unfavorable clauses, and missing protections using AI models, then display structured findings to the user.

`151 / 1,000` characters.

---

## Permission justification

### `storage`

> Stores the user's API key (OpenRouter or OpenAI), model preferences, current analysis session, local analysis history, usage counters, and Google auth session tokens in chrome.storage.local. No data is synced to external servers from storage — Drive sync uses a separate API flow.

`284 / 1,000` characters.

### `identity`

> Unshafted uses Google Sign-In to securely authenticate users and enable storage of contract data and AI-generated analysis results in the user's own Google Drive. The user's email address is used solely for authentication, user profile data and session identification.

`268 / 1,000` characters.

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
| ⬜ | Website content — text, images, sounds, videos, hyperlinks | No |

### Rationale for unselected categories

- **Personal communications** — user-uploaded contracts/agreements are documents the user supplies for analysis, not communications observed or intercepted by the extension. The extension does not read email, chat, or messaging content.
- **User activity** — the extension stores local rate-limit counters (daily quick-scan count, monthly deep-analysis count) on the user's own device. It does not perform network monitoring, click/scroll/keystroke logging, or any cross-session activity tracking.
- **Website content** — the extension does not read web pages. The page-extraction flow was removed during the v0.6 UI simplification, and `tabs`/`activeTab`/`scripting` permissions were dropped from the manifest.
- **Web history, Location, Health, Financial** — never collected.

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
| `storage` justification | Yes | §1–§6 + "How we store your data" |
| `identity` justification | Yes | §1, §6, "How we handle and protect your data" |
| PII checkbox | Yes — email, display name, profile picture | §1 |
| Authentication info checkbox | Yes — Google OAuth tokens, Supabase JWT/refresh | §6 |
| No remote code | Implicit (no eval/remote script in source) | n/a |
| No-sell / single-purpose / no-credit certifications | Yes | "Data sharing and third parties" + Limited Use section |

---

## Change log

- **2026-05-05** — Initial snapshot at v0.7.0 resubmission. Captures form state after Purple Nickel hardening pass (Limited Use disclosure, handling section, §6 auth-token enumeration in policy).

# CWS Store Listing — Snapshot

**Item:** Unshafted: AI Contract Risk Analyzer
**Item ID:** `fpjjdlffjfkdiibljglmgfkbpkkibpia`
**Snapshot date:** 2026-05-05
**Source:** Chrome Web Store Developer Dashboard → Store listing

Companion to `cws-privacy-form-snapshot.md`. Captures the public-facing listing copy so the source of truth is in git.

---

## Editing language

`English – en` (default; only language configured).

---

## Product details

### Title (from `package.json`)

> Unshafted: AI Contract Risk Analyzer

### Summary (from `package.json`)

> Spot risky clauses before you sign. Upload contracts and get plain-English risk guidance with privacy-first AI.

### Description (1,386 / 16,000 chars)

```
Unshafted reviews contracts, terms, and licenses from your side of the table. Upload a .pdf or .txt file to receive a clear, structured breakdown of risks, missing protections, negotiation points, and key questions—before you sign.

- Works with OpenRouter (free models available) or OpenAI (GPT-5). Bring your own API key; nothing leaves your browser except the API call to the model provider you choose.

- What you get:
  🔍 Instant contract risk analysis
  ⚖️ Plain-English explanations of complex clauses
  🚩 Detection of one-sided and hidden risks
  🛡️ Identification of missing protections
  ✍️ Negotiation tips and suggested improvements
  🔐 Privacy-first: bring your own OpenAI or OpenRouter API key
  💾 Local storage—no external servers or tracking

- Privacy First by Design
  No accounts required
  No analytics or tracking
  No cloud storage
  Your data stays on your device
  Contract text is sent only to the AI provider you configure

Disclaimer: Unshafted provides informational insights and does not constitute legal advice.
```

---

## Category

`Tools` (applies to all languages).

---

## Graphic assets

### Store icon
- **128×128 px** — uploaded.

### Localized assets (English)
- **Promo video (YouTube URL):** none
- **Screenshots:** 2 uploaded (1280×800 or 640×400, JPEG/24-bit PNG, no alpha). Slots used: Screenshot 1, Screenshot 2.

### Global assets
- **Promo video (YouTube URL):** none
- **Screenshots:** 1 uploaded (Screenshot 1).
- **Small promo tile (440×280):** not uploaded.
- **Marquee promo tile (1400×560):** not uploaded.

---

## Additional fields

| Field | Value |
|---|---|
| Official URL | None |
| Homepage URL | (empty, 0 / 2,048) |
| Support URL | (empty, 0 / 2,048) |
| Mature content | Not flagged |
| Additional metrics (GA4) | Not configured |
| Item support visibility | Off |

---

## ⚠️ Inconsistencies with current product reality

The description's "Privacy First by Design" block was written for v0.1 (local-only, no auth) and still claims things that are no longer universally true after Phase 1 (Supabase auth) and Phase 2 (Drive backup). Reviewers compare listing copy against `privacy-policy.md`; mismatches can themselves trigger a Purple Nickel-class rejection ("policy/listing not consistent").

| Listing claim | Reality | Risk |
|---|---|---|
| "No accounts required" | True for anonymous users; **Google Sign-In is offered** for unlimited quick scans, deep analysis, and Drive backup. | Medium — phrasing implies accounts are *never* used. |
| "No cloud storage" | True for anonymous; **signed-in users with Drive backup enabled have files in their own Google Drive**, and Supabase stores auth/profile rows. | High — directly contradicts privacy policy §1, §6, "How we store your data". |
| "Your data stays on your device" | True for anonymous; partially false for signed-in users (Supabase profile row, Drive files when opted in). | High — same as above. |
| "Local storage—no external servers or tracking" | "No tracking" is true; "no external servers" is false (Supabase auth, Google Drive API). | High. |
| "nothing leaves your browser except the API call to the model provider" | False as written — also leaves for Supabase auth and Google Drive API when signed in. | High. |

### Recommended rewrite (replace the "Privacy First by Design" + first bullet)

```
- Works with OpenRouter (free models available) or OpenAI (GPT-5). Bring your own API key; the only data sent off your device is the contract text and your key, going directly to the AI provider you choose.

- Privacy First by Design
  No accounts required to start — sign in is optional
  No analytics, no tracking, no ads
  Local-first: contracts and analysis live on your device by default
  Optional Google Sign-In unlocks unlimited scans and Google Drive backup to your own Drive (drive.file scope — we cannot see other Drive files)
  Contract text is only sent to the AI provider you configure
```

This wording stays punchy for marketing while staying truthful about the auth/Drive features documented in `privacy-policy.md`. Doing this *before* the 0.7.0 resubmission is cheap insurance — a reviewer flagging a listing/policy mismatch is a slow rejection cycle to recover from.

---

## Change log

- **2026-05-05** — Initial snapshot at v0.7.0 resubmission. Flags description ↔ privacy-policy drift introduced when auth + Drive backup shipped.

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

### Description — paste this verbatim into the Chrome Web Store Developer Dashboard → Store listing → Description

```
Unshafted reviews contracts, terms, and licenses from your side of the table. Upload a .pdf or .txt file to receive a clear, structured breakdown of risks, missing protections, negotiation points, and key questions — before you sign.

- Works with OpenRouter (free models available) or OpenAI (GPT-5). Bring your own API key; the only data sent off your device is the contract text and your API key, going directly to the AI provider you choose.

- What you get:
  🔍 Instant contract risk analysis
  ⚖️ Plain-English explanations of complex clauses
  🚩 Detection of one-sided and hidden risks
  🛡️ Identification of missing protections
  ✍️ Negotiation tips and suggested improvements
  🔐 Bring your own OpenAI or OpenRouter API key — stored locally in chrome.storage.local
  💾 Local-first: contracts and analyses live on your device by default

- Privacy at a glance
  No analytics, no tracking, no ads
  No account required to start — sign in is optional
  Optional Google Sign-In unlocks unlimited quick scans, deep analysis, and Google Drive backup to your own Drive
  Drive backup uses the limited drive.file scope — Unshafted cannot read or modify other Drive files
  Authentication is handled by Supabase; only your Google email, profile, and a backup-preference flag are stored on our side
  Contract text is sent only to the AI provider you configure
  Full disclosure of data handling: see the privacy policy linked from the Privacy tab below

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
| Mature content | Not flagged (toggle off) |
| Additional metrics (GA4) | Enabled — "Opt out of Google Analytics" / "Go to Google Analytics" buttons present. This is **listing-side dashboard analytics** (installs, impressions, ratings) shared with developers who have access to the item. It does **not** track end users from inside the extension and does not affect the "no analytics or tracking" claim about the extension itself. |
| Item support visibility | Off |

---

## Change log

- **2026-05-07** — Replaced description with privacy-accurate copy after Purple Nickel re-rejection on 0.7.0. Removes the v0.1 "no accounts / no cloud storage / data stays on device" claims that contradicted Phase 1 (Supabase auth) and Phase 2 (Drive backup). Paired with in-extension consent disclosure.
- **2026-05-05** — Initial snapshot at v0.7.0 resubmission.

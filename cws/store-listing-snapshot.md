# CWS Store Listing — Snapshot

**Item:** Unshafted: AI Contract Risk Analyzer
**Item ID:** `fpjjdlffjfkdiibljglmgfkbpkkibpia`
**Snapshot date:** 2026-09-07 — **entered in the draft listing, not yet submitted for review.**
The published listing is still the 0.7.1 copy, which describes an upload-only product.
**Source:** Chrome Web Store Developer Dashboard → Store listing

Companion to `privacy-form-snapshot.md`. Captures the public-facing listing copy so the source of truth is in git.

---

## Editing language

`English – en` (default; only language configured).

---

## Product details

### Title (from `package.json`)

> Unshafted: AI Contract Risk Analyzer

Unchanged. Worth noting that the title still names only the upload half of the product while the
description now gives both halves equal weight. That is deliberate: the title is what carries
search traffic for "contract analyzer", and renaming a live item costs recognition with existing
users. Revisit only if site policy becomes the dominant install path.

### Summary (from `chrome-extension/public/_locales/en/messages.json`)

> Spot risky clauses before you sign — and see what the sites you already use make you agree to.

Ships with the build via `__MSG_extensionDescription__`. Nothing to paste; it updates when the ZIP
is uploaded.

### Description — paste this verbatim into the Chrome Web Store Developer Dashboard → Store listing → Description

```
Unshafted reads the fine print from your side of the table — the contract you are about to sign, and the terms you already accepted without reading.

BEFORE YOU SIGN
Upload a .pdf or .txt — a lease, an offer letter, a freelance contract, a licence — and get a structured read: the clauses that work against you, the protections that are missing, what is worth negotiating, and the questions to ask before you agree.

WHAT YOU ALREADY SIGNED
Open the side panel on a site you use and Unshafted shows you what its terms and privacy policy actually took: the rights you signed away, what you can still opt out of, and how long you have to do it.

36 sites come already analysed and built into the extension — Netflix, PayPal, Uber, Amazon, LinkedIn, Instagram, TikTok, Chase, Coinbase, Reddit and more. No API key, no account, nothing to configure: install it, open the panel, read.

On any other site, Unshafted finds the terms, privacy policy and cookie policy that site links to and lists them for you. If you want them graded, you can run the analysis on your own API key — and nothing is sent anywhere until you press the button.

- What you get:
  🔍 Risk analysis of contracts you upload, and of the terms sites hold you to
  ⚖️ Plain-English explanations of complex clauses
  🚩 Detection of one-sided and hidden risks
  🛡️ Identification of missing protections
  ✍️ Negotiation tips and suggested improvements
  📄 On any site: the legal documents it links to, found for you
  🗂️ 36 sites analysed in advance — works with no key and no account
  🔐 Bring your own OpenAI or OpenRouter API key — stored locally in chrome.storage.local
  💾 Local-first: contracts and analyses live on your device by default

- Privacy at a glance
  No analytics, no tracking, no ads
  No account required to start — sign in is optional
  Optional Google Sign-In unlocks unlimited quick scans, deep analysis, and Google Drive backup to your own Drive
  Drive backup uses the limited drive.file scope — Unshafted cannot read or modify other Drive files
  Authentication is handled by Supabase; only your Google email, profile, and a backup-preference flag are stored on our side
  Contract text is sent only to the AI provider you configure
  Site policies are read only while the side panel is open on that page, to find and read that site's legal documents — no persistent page script, no record of the sites you visit, and nothing about the page is ever sent to Unshafted
  Policy documents are fetched without your cookies, so a site cannot see the read as coming from your signed-in session
  Full disclosure of data handling: see the privacy policy linked from the Privacy tab below

Disclaimer: Unshafted provides informational insights and does not constitute legal advice. The named sites above are companies whose public terms we have analysed; Unshafted is not affiliated with any of them.
```

### Why the description is structured this way

The old copy led with contract upload and appended site policy as a second paragraph. That was
backwards on two counts.

**As marketing:** "upload a contract, get an AI analysis" is the generic claim in a crowded
category. The distinctive thing is that the extension already knows what 36 major sites make you
agree to, with no key and no account, the moment it is installed. The listing never said so.

**As review strategy:** the single-purpose field now leads with *"Show a user the risk in the
agreements they are asked to accept"*, and the entire `<all_urls>` argument rests on reading a
site's linked documents **being** that purpose rather than sitting beside it. A listing that
treated site policy as an addendum would have contradicted the emphasis of the field a reviewer
maps the permission against. The two-column structure gives both halves equal weight so the
listing and the single purpose tell the same story.

**On naming brands:** the corpus paragraph names real companies because concrete names make the
feature legible to both a user and a reviewer in one line. The non-affiliation sentence is folded
into the closing disclaimer rather than the body, so the paragraph stays clean while the
affiliation question is still answered.

**First two lines matter most.** Chrome truncates the description behind a "Read more" control, so
the opening sentence is doing all the work of covering both halves for anyone who never expands it.

---

## Category

`Tools` (applies to all languages).

---

## Graphic assets

### Store icon
- **128×128 px** — uploaded.

### Screenshots

**Live:** 2 uploaded, both showing the upload flow only.

**Planned for this release** (1280×800 or 640×400, JPEG or 24-bit PNG, **no alpha channel**).
Order is load-bearing: slot 1 is the tile shown in the listing.

| # | Shot | Why it earns the slot |
|---|---|---|
| 1 | Side panel open on a **Very High** covered site (snapchat.com, tiktok.com or coinbase.com), verdict and a named exposure visible | Makes `<all_urls>` self-evident, and shows the product working with zero setup |
| 2 | Side panel on an **uncovered** site showing the discovered document list | Shows the mechanism honestly, and shows the user choosing |
| 3 | The `AnalyseConfirm` sheet, with *"runs on your own API key… nothing is sent until you press the button"* legible | Aimed at the reviewer as much as the user: answers the consent question visually |
| 4 | Contract upload result (reuse the better of the two live shots) | The other half of the two-column story |
| 5 | Options / onboarding with the BYO-key field | Closes the "where does the key live" question |

macOS `screencapture` writes PNG **with** an alpha channel, which CWS rejects. Capture a 16:10
region so the downscale does not distort (size the window so the captured area is 1600×1000 or
2560×1600), then flatten:

```bash
sips -s format jpeg -s formatOptions 90 -z 800 1280 shot.png --out shot-1280x800.jpg
```

### Promo tiles
- **Small promo tile (440×280):** not uploaded. **Worth doing.** These do not appear on the listing
  page itself; they feed Google's curated and featured placements on the Store homepage. Absent,
  nothing is substituted and the item is simply never eligible for those slots.
- **Marquee promo tile (1400×560):** not uploaded. Low priority, only used if Google features the
  item.

### Promo video
- None (both localized and global).

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

- **2026-09-07** — Description rewritten for the site-policy release, which adds
  `host_permissions: ['<all_urls>']`. Restructured from upload-first into a balanced two-column
  form so the listing carries the same emphasis as the rewritten single purpose; added the bundled
  36-site corpus, which the listing had never mentioned despite it being the only part of the
  product that works with no key and no account; added the cookie-less policy fetch to the privacy
  block. Paired with privacy policy §5, the `Website content` data-usage checkbox, and seven
  permission justifications. **Entered in the draft listing; not yet submitted for review.**
- **2026-05-11** — v0.7.1 approved and published. Purple Nickel cleared.
- **2026-05-07** — Replaced description with privacy-accurate copy after Purple Nickel re-rejection
  on 0.7.0. Removed the v0.1 "no accounts / no cloud storage / data stays on device" claims that
  contradicted Phase 1 (Supabase auth) and Phase 2 (Drive backup). Paired with in-extension consent
  disclosure.
- **2026-05-05** — Initial snapshot at v0.7.0 resubmission.

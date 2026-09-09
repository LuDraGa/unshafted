# CWS Store Listing — Snapshot

**Item:** Unshafted: AI Contract Risk Analyzer
**Item ID:** `fpjjdlffjfkdiibljglmgfkbpkkibpia`
**Version live:** 0.8.0 — approved and published on or before 2026-09-08
**Snapshot date:** 2026-09-09 — **the copy below is NOT what is live.** It is the corrected draft
written after the 0.8.1 submission was rejected on Yellow Argon (excessive keywords) the same day.
The live 0.8.0 listing still carries the rejected brand-list paragraph and will keep carrying it
until a version publishes behind this text, because the description is a property of the draft.
Paste it into the dashboard, then submit.
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
Unshafted helps you understand the fine print before and after you agree to it.

BEFORE YOU SIGN
Upload a contract and get a clear breakdown of:
• Risky or one-sided clauses
• Missing protections
• Hidden costs and lock-ins
• What you should negotiate or question
Works with leases, offer letters, freelance contracts, licences and more.

ON WEBSITES
Open Unshafted on any site to understand its Terms, Privacy Policy and Cookie Policy. See:
• What rights you gave away
• What you can still opt out of, and how much effort each takes
• Deadlines, where a document sets one
• Risky or unusual terms
• A risk grade for the site, based on its worst document

36 popular sites are already analysed and available immediately, including major banks, streaming services, social networks and payment apps. No key, no account, nothing to set up.

For other sites, Unshafted finds their legal documents and can analyse them using your own OpenAI or OpenRouter API key. Nothing is analysed until you ask.

PRIVACY
• No ads, no tracking, no analytics
• No account needed to start. Optional Google Sign-In adds unlimited scans, deep analysis, and backup to your own Google Drive
• Drive backup uses the limited drive.file scope, so Unshafted cannot read or change anything else in your Drive
• Sign-in is handled by Supabase. Only your Google email, profile and a backup preference are stored on our side
• Contract text goes only to the AI provider you configure. Your API key stays on your device, in chrome.storage.local
• Site policies are read only while the panel is open, to find that site's legal documents. No persistent page script, no record of the sites you visit, and nothing about the page reaches Unshafted
• Policy documents are fetched without your cookies, so a site cannot see the read as coming from your signed-in session
• Full details in the privacy policy linked from the Privacy tab below

Know what you are agreeing to, before it matters.

Unshafted provides informational analysis, not legal advice. For anything high-stakes, talk to a qualified lawyer. Unshafted is not affiliated with any company whose terms it analyses.
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
maps the permission against. `BEFORE YOU SIGN` and `ON WEBSITES` are the same size and the same
shape, so the parity is visible without being argued. Do not let a later edit shrink the second
one back into a footnote.

**On naming brands: do not.** The paragraph above used to read *"Netflix, PayPal, Uber, Amazon,
LinkedIn, Instagram, TikTok, Chase, Coinbase, Reddit and more"*, on the reasoning that concrete
names make the feature legible to a user and a reviewer in one line. That reasoning cost the item a
Yellow Argon rejection on 2026-09-09, quoted back verbatim as excessive keywords. The corpus is now
described by category, which is what the rectification asked for and is arguably the better copy
anyway: a reader learns whether their bank or their streaming service is covered without having to
pattern-match against a list of ten.

The brand names that remain — OpenAI, OpenRouter, Google, Supabase, Chrome — are functional
disclosures, not keywords. A user has to know which providers their key is for, and the privacy
block has to name who holds authentication. Removing those would recreate the Purple Nickel problem
of a listing that says less than the privacy policy. The distinction that matters is not "is this a
brand name" but "does the sentence stop being true without it".

**Watch the shape, not just the words.** Two drafts in a row reproduced the shape while removing the
words. The first swapped the ten company names for a ten-item run of priority keywords in the same
sentence position; the second described the corpus as seven category fragments in a row. Neither
names anything, and both are lists sitting where a list was cited. The shipped copy names what the
sites are to the reader inside a sentence, which is not a list and carries more information than one.
A reviewer pattern-matching their own finding does not stop to check whether the nouns are companies
or categories.

**Claims are checked against the shipped corpus, not asserted.** Every number in the copy is
verifiable from `chrome-extension/public/policy-corpus.json` or from source: 36 domains, 82
documents, effort ratings, absent disclosures, the four risk levels. Two specific traps, both caught
in review of the draft rather than by CWS:

- The toolbar badge is a coloured **dot** (`BADGE_TEXT = '•'` in
  `chrome-extension/src/background/site-policy.ts`); the grade words live in the tooltip. A draft
  that promised a grade on the icon would have been misleading metadata in the same policy family as
  the rejection it was fixing.
- Only 59 of 519 available actions carry a deadline, and `hasTimeSensitiveAction` is absent from all
  82 analyses. Any deadline claim must stay hedged.

**Say the narrow true thing.** "Nothing leaves your browser until you press the button" was replaced
by "no document text reaches your AI provider until you ask", because discovery does fetch documents
before any button is pressed and the privacy block two paragraphs down admits it. A listing
contradicted by its own privacy block is exactly how Purple Nickel was earned.

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

- **2026-09-09** — **Description rewritten after the Yellow Argon rejection, and cut to roughly half
  the length of what it replaced.** The bundled-corpus paragraph named ten companies; review quoted
  all ten back as excessive keywords and rejected the 0.8.1 draft. No company whose policies are
  analysed is named anywhere in the listing now. The 36 sites are described by what they are to the
  reader — their bank, their streaming subscriptions, the social networks they use — in one clause
  rather than a list, because a run of seven category fragments is the same shape as the run of ten
  brand names, and shape is what the citation was about.

  **2,137 characters, down from the rejected version's 2,881.** The version this replaced was itself a full rewrite that ran
  to 4,049, and it was too long: it argued the `<all_urls>` case at a reviewer instead of describing
  the product to a user, which reads as an inability to say plainly what the thing does. The shipped
  copy leads with a one-line statement of the offering, gives each half of the product a header and a
  short bullet list, and stops. Length was cut everywhere it was free and spent only where a missing
  sentence has previously cost a rejection.

  **The privacy block is the part that did not shrink**, and it is worth saying why in the file that
  future edits will read. A five-bullet draft of it, reading "PRIVACY FIRST / No account required /
  Contracts and analyses stay local by default", was rejected during drafting for being within a word
  or two of the copy that earned Purple Nickel twice, while the product has Google Sign-In, Supabase
  auth and Drive backup. All twelve commitments are present: Sign-In and what it adds, the
  `drive.file` scope, Supabase and the three fields it holds, where contract text goes, the
  panel-only read, the absence of a persistent page script, the absence of a browsing record, the
  cookie-less fetch, the local API key, and the pointer to the policy on the Privacy tab. "PRIVACY
  FIRST" was reduced to "PRIVACY", because the superlative invites a reviewer to test it against
  three data flows and the bullets do not need the help.

  Claims are checked against the shipped corpus before they are written. Two were corrected in draft:
  the toolbar badge is a coloured dot rather than a printed grade, and deadlines exist on a minority
  of actions, so the listing says "where a document sets one". The site grade is described as
  covering the site's worst document, which is the in-product tooltip's own wording.
  **Entered in the draft listing? Not yet — paste before submitting.**

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

# Site Policy Awareness — Part 3: Corpus Capture

**Status: v1 capture complete. 48 of 49 sites captured, 147 documents, 181 unique files on disk.**
Findings below are counted from `corpus/manifest.json` by `tools/corpus/report.ts`, not written
ahead of the run.

## Scope

Build the base corpus: a map of 49 high-adhesion sites, multi-tagged, each with the full
inventory of policy documents its footer actually publishes, every document fetched, normalized
and hashed with the **shipped** normalizer, provenance-stamped.

### What this session is not

No analysis. No severities, risk levels, disclosure statuses, gold set, grading or analysis
prompt. No publishing. `chrome-extension/policy-seed.json` is untouched and still holds RFC 2606
reserved domains only.

Writing a severity for a real company would be a false claim about that company, and the map has
to exist before anything can be graded against it anyway.

### Also descoped, deliberately

- **Signup-surface walking.** Originally in scope. Cut because it is unscriptable, bot-walled,
  and — critically — roughly half of consumer-finance flows gate their terms behind entering an
  email or phone number. Submitting an account-creation step is not something this pipeline will
  ever do, so those walks would yield a one-line "blocked at step 1" rather than a document
  inventory. The `surface` field survives in the manifest type, populated only with `footer`,
  which is what is machine-observable without a walk.
- **PDF policies.** Recorded as `pdf_not_captured` with their URL. `computePolicyHash` takes
  HTML; `lib/pdf.ts` is a separate path, and building a second hashing path forks the one thing
  that must never fork (AD-1). "This bank publishes its privacy notice only as a PDF" is itself
  a finding, and it is preserved as one.

---

## Decisions

### D1 — Verticals are TAGS, multi-valued

Eight tags: `finance_banking`, `payments_fintech`, `ecommerce`, `subscription_autorenewal`,
`ott_streaming`, `social_ugc`, `identity_provider`, `saas`.

A site carries every tag that is true of it. Amazon is ecommerce **and** streaming **and**
payments **and** an identity provider; forcing one label per site throws away most of what makes
a site interesting, and single-label filing is what the shipped `VerticalSchema` assumes today.

**Minimum-N: tag freely, gate the statistic.** No `peerShare` is published for a tag with fewer
than **10 members**. Tagging costs nothing and loses nothing; a peer baseline computed over four
members is a number that looks like evidence and is not. The floor applies at publish time, in
the analysis session — capture just has to make sure the members exist. Every tag in the set
below clears 6; five of eight clear 10.

### D2 — Selection rule, written before selecting

1. **Adhesion frequency, not market cap.** An ordinary person plausibly holds an account here or
   has clicked accept.
2. **Every tag gets ≥6 members**, so a peer baseline is computable later.
3. **Geographic mix** ~60% US / ~22% India / rest global-but-serving-both.
4. **Deliberate spread within each tag** — some members have public regulatory history on their
   terms, billing or data handling, some have none, so the analysis session sees variance rather
   than a uniform blob. *Selection input only. No judgement about any company is recorded in the
   manifest, and none is implied by membership.*
5. **Excluded**: policies behind a login; multi-tenant hosts (a policy on a public suffix would
   be attributed to every unrelated tenant beneath it).

The set is in `tools/corpus/sites.ts`, which carries this rule in its module comment so the two
cannot drift apart.

### D3 — Every discoverable document, not a fixed shortlist

Capture is not "terms + privacy". Every policy-looking link the **shipped** in-page collector
returns is captured, capped at 24 per site. Auto-renewal, billing and program terms are where
subscription exposure actually lives, and they are never the two documents on a shortlist.

### D4 — Canonical content is browser-transported RAW HTML

This is the decision that determines whether any of this ever reaches a user, so it is worth
stating precisely.

The client does **not** render policies. `fetchDocumentInPage` performs `fetch(url)` →
`response.text()` inside the page and runs a DOM-free normalizer over those bytes. JavaScript
never executes against the policy document.

So capturing a **rendered** DOM would produce hashes no real browser can ever reproduce, and
every such corpus entry would be permanently unreachable — badge says covered, panel says not
analyzed, forever, silently. Rendering is the wrong canonical.

What a real browser still buys is **transport**: real TLS fingerprint, real headers, a real
cookie jar, so bot walls do not serve us an interstitial instead of a policy. Hence: navigate
with Chrome, then take the raw response body. `page.content()` is never used for canonical text.

`playwright-core` drives the Chrome already installed on the machine — no browser download.

### D5 — Two extra hashes, for measurement only

- **Node `fetch` hash, on every document.** This is what a Part 2 server re-fetching to verify a
  submission would compute. If it disagrees with the canonical hash at a meaningful rate, Part 2
  Q4's "verify the hash server-side" gate rejects honest submissions, and that is much cheaper to
  learn here than in production.
- **Rendered-DOM hash, only when canonical text came back thin** (<2,000 normalized characters).
  Its only job is to separate "this is an SPA shell, the policy is JS-rendered and the extension
  will never see it" from "this URL is simply wrong". Capturing it unconditionally would cost a
  second pass on 400 documents to answer a question that only arises on a handful.

Neither is canonical. Neither is ever stored as the document's identity.

### D6 — Capture must use the client's own discovery, and record where it goes wrong

`collectPolicyCandidatesInPage`, `choosePolicyUrl` and `guessDocType` are **imported from the
shipped module**, not reimplemented. If capture hand-picked URLs and the client picked different
ones, the hashes would never match and the corpus would be invisible to the product.

Where the shipped chooser does something surprising it is **recorded, never corrected**. That
record — cross-origin picks, path-guess fabrications, untyped documents, links the regex never
sees — is a bug report against shipped code written from real data, and it is one of the most
valuable outputs of this pass.

A second, deliberately wider collector runs alongside the shipped one for exactly one purpose:
to count the policy documents `POLICY_LINK_PATTERN` never even collects. It never feeds capture.

### D7 — Jurisdiction provenance on every capture

The same URL serves different text to EU, US and Indian readers. `/d/{sha256(domain)}.json`
already carries `hashes[]` plural, so multiple valid hashes per domain is accommodated — but
nothing records *which* variant an object describes.

Egress country/region/city is stamped on the manifest. This run captures from **IN**, which
means US sites are captured as an Indian reader sees them, and a US user's browser may compute a
different hash for the same URL. That is a limitation of this capture, recorded rather than
papered over.

### D8 — Captured text is gitignored; the manifest is committed

~400 documents of third-party policy text. Part 2 lists the copyright posture on storing and
serving normalized policy text as an **open question** — committing them to a public repository
answers it by accident, in the most exposed way available, before anyone decided anything.

So `corpus/raw/`, `corpus/text/` and `corpus/sites/` stay local, bound for a Supabase object
store once their structure is settled. `corpus/manifest.json` is committed: it is facts *about*
documents, not the documents.

Files are named by `contentHash`, which makes the eventual move a copy rather than a
restructure, dedupes shared documents for free, and means a filename can never disagree with its
contents.

**Consequence worth naming:** Part 1 §5 asks for 20 real pages captured two weeks apart to be
dropped into `packages/unshafted-core/test/fixtures/site-policy/` so the normalizer stability
gate stops being synthetic. Those fixtures are *tracked*. That instruction and D8 are in direct
conflict, and it is unresolved. The v2 pass can still compare **hashes** against v1 from the
committed manifest alone — which is enough to measure stability — but showing *what* changed, or
committing fixtures, needs the copyright question answered first.

### D9 — The two-week clock starts now

The manifest carries `captureId` (`v1-YYYY-MM-DD`) and `normalizerVersion`. A v2 run in two
weeks diffs its hashes against v1's, per document, and that measurement is the real stability
gate. Every day this is not started is a day the gate stays synthetic.

### D10 — Shipped schemas untouched this session

`SitePolicyAnalysisSchema` and friends are unchanged. The manifest has its own capture-side
vocabulary in `tools/corpus/types.ts`. Nothing is published and `CEB_POLICY_CDN_URL` is unset,
so the window stays open. See "Schema consequences" below for what the analysis session inherits.

---

## The set

**49 registrable domains.** Tags: `fin` `pay` `ecom` `sub` `ott` `soc` `idp` `saas`.

| Domain | Tags | Market | Docs captured |
|---|---|---|---|
| amazon.com | ecom sub ott idp pay | US | 5 |
| walmart.com | ecom sub | US | 4 |
| ebay.com | ecom pay | US | 6 |
| flipkart.com | ecom | IN | 5 |
| myntra.com | ecom | IN | 0 |
| shein.com | ecom | GLOBAL | 0 |
| temu.com | ecom | GLOBAL | 0 |
| doordash.com | ecom sub | US | 2 |
| swiggy.com | ecom sub | IN | 0 |
| zomato.com | ecom sub | IN | 3 |
| uber.com | ecom pay | GLOBAL | 2 |
| airbnb.com | ecom pay | GLOBAL | 0 |
| booking.com | ecom | GLOBAL | 5 |
| makemytrip.com | ecom | IN | 3 |
| chase.com | fin | US | 8 |
| bankofamerica.com | fin | US | 7 |
| capitalone.com | fin | US | 1 |
| americanexpress.com | fin pay | US | 9 |
| robinhood.com | fin pay | US | 3 |
| coinbase.com | fin pay | US | 5 |
| hdfcbank.com | fin | IN | 5 |
| icicibank.com | fin | IN | 0 |
| zerodha.com | fin | IN | 2 |
| stripe.com | pay saas | GLOBAL | 3 |
| paypal.com | pay fin | US | 2 |
| cash.app | pay | US | 0 |
| phonepe.com | pay | IN | 1 |
| paytm.com | pay fin | IN | 2 |
| netflix.com | ott sub | GLOBAL | 4 |
| spotify.com | ott sub | GLOBAL | 0 |
| disneyplus.com | ott sub | US | 2 |
| hotstar.com | ott sub | IN | 2 |
| facebook.com | soc idp | GLOBAL | 2 |
| instagram.com | soc | GLOBAL | 1 |
| whatsapp.com | soc | GLOBAL | 0 |
| x.com | soc idp | GLOBAL | 3 |
| reddit.com | soc | US | 5 |
| linkedin.com | soc saas | GLOBAL | 9 |
| snapchat.com | soc | US | 10 |
| tiktok.com | soc ott | GLOBAL | 3 |
| youtube.com | soc ott | GLOBAL | 0 |
| google.com | idp saas pay | GLOBAL | 2 |
| apple.com | idp ott ecom pay | GLOBAL | 3 |
| microsoft.com | idp saas | GLOBAL | 3 |
| adobe.com | saas sub | US | 0 |
| openai.com | saas sub | US | 4 |
| dropbox.com | saas sub | US | 2 |
| zoom.us | saas sub | US | 7 |
| canva.com | saas sub | GLOBAL | 2 |

Tag members: `ecom` 15 · `sub` 14 · `pay` 14 · `fin` 11 · `saas` 9 · `soc` 9 · `ott` 8 · `idp` 6.

Disney serves both `disneyplus.com` and `hotstar.com` from one pair of documents — that
exercises the one-document-many-sites case for free, and is the only such pair that survived
capture.

---

## Pipeline

`tools/corpus/capture.ts`, run with `node --import tsx`.

Per site:

1. Navigate to `https://{domain}/` with real Chrome, scroll to the bottom (footers are lazy).
2. Run the **shipped** `collectPolicyCandidatesInPage` in the page.
3. Run the wide collector alongside it, purely to measure what the shipped regex misses.
4. Run the **shipped** `choosePolicyUrl` for all six doc types; record its picks verbatim.
5. Capture every discovered URL plus any pick not among them — real links first, fabricated path
   guesses last, so a 429 cascade cannot corrupt documents that actually exist.
6. Per document: canonical hash (browser transport, raw body), Node-fetch hash, and a rendered
   hash only when the canonical text came back thin.
7. Store `raw/{hash}.html` and `text/{hash}.txt`; write `sites/{domain}.json`.

Runs are resumable — a site with an existing JSON is skipped, and the manifest is reassembled
from those files every run, so a partial capture still produces a coherent manifest.

---

## Findings against shipped code

Regenerate with `node --import tsx tools/corpus/report.ts`. The v2 pass in two weeks runs the
same script against the same set, so the numbers are comparable by construction.

### Headline

| | |
|---|---|
| Sites attempted | 49 (`youtube.com` not reached before the run was stopped) |
| Sites with ≥1 captured document | 38 (78%) |
| Documents discovered | 389 |
| Documents captured | 147 (38%) — 7.1M characters of normalized text, 181 unique files |
| Node-fetch hash agreement | **109 / 126 (87%)** |
| Cross-origin, unreachable by the client | 59 (15%) |
| `guessDocType` returned `null` | 91 (23%) |
| Policy links `POLICY_LINK_PATTERN` never collects | 51, across 20 sites |

### 1. `choosePolicyUrl` selects the wrong document, often, and confidently

This is the most serious finding and it is not statistical — the failures are individually wrong
in ways an aggregate would hide. Of **288** picks the chooser made, **78** resolved to a document
that captured. Among those 78, verbatim:

| Site | Asked for | Chooser returned |
|---|---|---|
| doordash.com | `privacy` | **`cloudflare.com/privacypolicy/`** — a third party's policy, presented as DoorDash's |
| bankofamerica.com | `privacy` | `/online-banking/childrens-privacy-policy/` — the *children's* policy, not the main one |
| dropbox.com | `privacy` | `dropbox.com/terms` — the terms page, returned as privacy |
| hdfcbank.com | `cookie` | `/privacy-policy` — same URL it returned for privacy |
| netflix.com | `cookie` | `/legal/privacy#cookies` — same document as privacy; the fragment is not content |
| amazon.com | `privacy` | `/privacyprefs` — an ad-preferences page (2,377 chars), not the Privacy Notice |
| ebay.com | `privacy` | `/adchoice/ccpa` (2,012 chars) — a CCPA notice, not the privacy policy |
| openai.com | `privacy` | `/security-and-privacy/` (4,544 chars) — a marketing page |
| coinbase.com | `privacy` | `/en-in/legal` — a legal index page, not a policy |
| microsoft.com | `privacy` | `/en-ca/privacy` — the Canadian variant, chosen from an Indian egress |
| disneyplus.com | `terms` | `hotstar.com/tnc/in` — geo-redirect; correct behaviour, wrong attribution |
| hdfcbank.com | `terms` | `hdfc.bank.in/terms-and-conditions` at **1,566,369** normalized chars — the whole site, not a document |

The mechanism is `scoreCandidate`. Path depth is penalised 3 points per segment and same-origin
is worth 100, so a shallow decoy (`/privacyprefs`, `/adchoice/ccpa`, `/en-ca/privacy`) reliably
beats the real policy sitting two directories down. Nothing in the score models *document
identity* — only URL shape.

**A full hand-verification of all 78 picks is the analysis session's first task.** The twelve
above are the ones visible without reading a single document.

### 2. Path-guess fallback is almost pure noise

`choosePolicyUrl` found no link and fabricated a URL **194** times. **8 of 193** fetched guesses
(4%) returned a real document. The other 96% were 404s, 403s and rate-limit cascades.

Worse, the failure is silent and self-reinforcing: when a bot wall or an unhydrated SPA yields
zero candidates, the chooser "recovers" by inventing paths, and a capture built on that looks
complete while containing nothing. The first run of this pipeline did exactly that on Amazon,
DoorDash and Shein before the browser fingerprint was fixed.

### 3. `guessDocType` cannot classify paths `wellKnownPolicyPaths` itself generates

`DOC_TYPE_PATTERNS` uses `/acceptable\s*use/` and `/data\s*processing/`. `\s*` does not match a
hyphen, and `wellKnownPolicyPaths` emits `/acceptable-use` and `/data-processing`. So the chooser
fabricates a URL, fetches it, and then cannot type its own result. Structural, not site-specific.

More broadly, `guessDocType` returned `null` for **91 documents (23%)** that `POLICY_LINK_PATTERN`
had already accepted — collected and fetched, then unclassifiable. American Express alone
contributes 15: *Schedule of Fees and Charges*, *Know Your Customer*, *Financial Disclosure*,
*Do Not Call Registry*, *Complaints*, *Notice Board*. These are real regulated-disclosure
documents in consumer finance, and the shipped enum has no value for any of them.

### 4. The link pattern also produces false positives

`POLICY_LINK_PATTERN` matches on substrings, so it collected — and `guessDocType` typed — things
like `flipkart.com/food-nutrition/snacks-nibbles/cookies` (a grocery category page, typed
`cookie`), `reddit.com/r/india/comments/…` (a forum thread), and
`linkedin.com/jobs/legal-jobs-bengaluru` (a job search, matched on `legal`).

Both failure directions are live at once: 23% of what it collects cannot be typed, and some of
what it types is not a policy.

### 5. 51 real policy documents are invisible to the pattern

Across 20 sites, links naming genuine policy documents that `POLICY_LINK_PATTERN` never collects:

| Missing term | Occurrences | Example |
|---|---|---|
| `policy` | 10 | *Content guidelines and reporting* (booking.com) |
| `program` | 10 | *Genius loyalty program* (booking.com) |
| `agreement` | 4 | *Deferred Prosecution Agreement* (ebay.com) |
| `notice` | 4 | *Notice Board* (hdfcbank.com) |
| `rewards` | 4 | *offer rewards* (chase.com) |
| `disclosure` | 3 | *Regulatory disclosure section* (icicibank.com) |
| `cancellation` | 3 | *Cancellation & Returns* (flipkart.com) |
| `billing` | 3 | *Billing* (stripe.com) |
| `consent` | 3 | (coinbase.com) |
| `electronic` | 1 | *Signing documents* (dropbox.com) |

The pattern does not contain the word **`policy`**. It matches `privacy|terms|cookie|legal|eula|conditions|do not sell`, so *"Content Policy"* and *"Cancellation Policy"* are both invisible.

### 6. 33 policies are JS-rendered and the extension can never read them

**100** documents normalized to under 2,000 characters. **33** of those grew substantially once
JavaScript ran — the policy is real and substantial, it is simply rendered client-side.

The starkest case: **Myntra's Terms of Use is 9 characters of raw HTML and 56,275 rendered.**
Swiggy's terms, cookie and privacy policies are all 0 characters raw. The client hashes raw
HTML with a DOM-free normalizer (that is what makes it run identically in a service worker), so
these documents are structurally unreachable — not a bug to fix in capture, a property of AD-4
plus the DOM-free normalizer.

This is why capturing rendered DOM as canonical would have been wrong: it would produce hashes
no client can reproduce, and the corpus would claim coverage it does not have.

### 7. Hash agreement: 87%, and 14% unfetchable

Of 147 canonically captured documents, **21 (14%)** could not be fetched by plain Node at all —
Amazon 403s nearly everything. Of the **126** comparable, **109 agreed (87%)**.

The 17 disagreements split two ways:

- **Node got nothing** (0 chars) where the browser got a full policy: facebook.com,
  instagram.com, reddit.com, booking.com's cookie/eula/dpa. Bot-walled without a browser.
- **Node got a different rendering**: booking.com terms (170,114 vs 192,441 chars),
  ebay.com member policies (123,654 vs 487), paypal.com (90,570 vs 90,561 — a 9-character drift).

**Consequence for Part 2 Q4.** The proposed gate is: server re-fetches `sourceUrl`, normalizes,
hashes, and rejects unless it matches the submission. Measured against real sites, that gate
would reject **13% of honest submissions** and be **unable to verify another 14% at all**. It
needs a browser-based fetcher, or the gate has to become advisory rather than blocking.

### 8. 15% of discovered documents are cross-origin and unreachable

**59 of 389**. Concentrated: `cdn.robinhood.com` (10), `help.netflix.com` (5), `www.snap.com` (5),
`values.snap.com` (4), `corporate.walmart.com` (3), `policies.google.com` (2).

Part 1's open question 3 asked how common this is in practice and suggested measuring it on the
first ~50 domains. Measured: **15% of documents, on 20 of 49 sites.** Netflix and Robinhood serve
essentially their entire policy set off-origin, so for those sites AD-4 means near-total
unreachability, not a degraded edge case.

### 9. Documents shared across sites

Only **2** documents are byte-identical across sites after normalization — both Disney's,
serving `disneyplus.com` and `hotstar.com`. Fewer than expected, because the Meta and Google
properties largely 403'd or geo-redirected rather than resolving to one shared document.

The case is real but rarer than assumed, which lowers the urgency of schema consequence #6.

### 10. PDFs

**12 documents** are PDFs, recorded and deliberately not hashed: `cdn.robinhood.com` and
`www.americanexpress.com`. Both are consumer finance, which is exactly where this was predicted.
Not captured — see Scope.

### Outstanding

| Site | State |
|---|---|
| youtube.com | Never attempted — run stopped first. Delete `corpus/sites/youtube.com.json` and re-run. |
| airbnb.com, capitalone.com, cash.app, shein.com, spotify.com, temu.com | Homepage loaded, zero policy links found. The improved footer settle-and-scroll landed *after* these were processed, so they are worth one retry. |
| myntra.com, swiggy.com, icicibank.com, adobe.com, whatsapp.com | Reached, links found, all documents thin. Genuinely JS-rendered — a retry will not change this. |

Re-run any of them with `rm corpus/sites/<domain>.json && node --import tsx tools/corpus/capture.ts --only=<domain>`.

## Schema consequences — inherited by the analysis session

All still free: nothing is published, `CEB_POLICY_CDN_URL` is unset.

**Correction to the framing they were raised under.** `SitePolicyAnalysisSchema` is a plain
`z.object` on Zod 3, which **strips** unknown keys rather than rejecting them. So an older client
meeting an object with extra fields reads it fine. Only three of the seven are actually breaking
after first publish:

| # | Change | Breaking after publish? |
|---|---|---|
| 1 | `vertical` → `verticals[]` | **Yes** — type change |
| 2 | New `VerticalSchema` values (OTT, identity provider) | **Yes** — unknown enum value rejects |
| 4 | New `PolicyDocTypeSchema` values (E-SIGN, program terms, marketing consent) | **Yes** — same |
| 3 | Peer-set field on `PeerDeviationSchema` | No — additive |
| 5 | `surface` on documents | No — additive |
| 6 | `domains[]` alongside `domain` | No — additive (changing `domain` itself would break) |
| 7 | `normalizerVersion` on the published object | No — additive |

The four additive ones cost nothing to add later beyond having to be `.optional()`, because
published objects are immutable and old ones stay readable forever. The three breaking ones are
the real deadline, and the deadline is **first publish**, not the end of this session.

Two that are worth settling regardless of cost:

- **#7, `normalizerVersion`.** `SitePolicyPanel.tsx` sends it on submission but
  `SitePolicyAnalysisSchema` has no field for it, so a published object does not record which
  normalizer produced its `contentHash` — the one thing needed to know whether that hash can
  still be trusted after a normalizer change.
- **#3, the peer set.** Under one bucket per site the peer set was implicit. Under tags a clause
  can be normal among streaming peers and an outlier among fintech peers. That is better signal,
  but only if the object says which peer set the share was computed against.

---

## Status

- [x] Branch `feat/site-policy-corpus-capture`
- [x] Tag vocabulary settled (D1) — 8 tags, multi-valued, minimum-N 10 for `peerShare`
- [x] Selection rule written before selecting (D2); 49 domains in `tools/corpus/sites.ts`
- [x] `playwright-core` added to root devDependencies; drives installed Chrome
- [x] Capture pipeline — `tools/corpus/capture.ts`
- [x] Manifest types — `tools/corpus/types.ts`
- [x] `corpus/` gitignored except the manifest and README (D8)
- [x] `tools/corpus` made a workspace package — it was outside every tsconfig, and `tsx` does
      not type-check, so none of this code was being checked at all
- [x] v1 capture run — 48/49 sites, 147 documents, 7.1M characters
- [x] Findings report generator — `tools/corpus/report.ts`
- [x] Findings written up from the run
- [ ] Retry the 6 zero-link sites and youtube.com
- [ ] Hand-verify all 78 chooser picks (analysis session's first task)
- [ ] v2 re-capture in two weeks against `captureId` `v1-2026-09-04` (D9)

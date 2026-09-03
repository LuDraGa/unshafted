# Site Policy Awareness — Scoping

**Status:** Scoping / not started
**Created:** 2026-09-04
**Owner:** @LuDraGa

Ambient awareness of the agreements a user is bound by (or about to be bound by) on the sites
they visit. Complements the existing upload-first flow; does not replace it.

- **Guardian** (highest value): interrupt at the consent moment — cookie wall, signup checkbox, checkout.
- **Standing** (also valuable): for agreements already accepted, surface what you're exposed to and
  what you can still *do* about it — arbitration opt-out windows, deletion rights, auto-renewal.

**Critical path:** precomputed corpus → hashed local index → badge → panel.
Detection, submissions, credits and community scores are all downstream and are not worth building
until a few hundred domains are analyzed well enough that the badge is right more often than it is noise.

---

## 0. Two findings that shape everything below

### 0.1 The extension has no page access at all today

`chrome-extension/manifest.ts` declares `permissions: ['storage', 'identity']`. There are no
`host_permissions`, no `content_scripts`, and `pages/content/` does not exist on disk — the
page-scraping bundle was excised in `3657ca0` to clear Purple Nickel, not merely disabled.
(The README's "Dormant content-script bundle" line is stale and should be corrected.)

Consequence: adding page access is a **re-litigation of a review issue that was just settled**.
It needs a planned justification, not an afterthought.

Mitigation — and this is the key sequencing insight: **the badge does not need a content script.**
`chrome.tabs.onUpdated` + `chrome.action.setBadgeText/setBadgeBackgroundColor` gives ambient
per-site indication with only the `tabs` permission and zero page access. Only the *inline nudge
next to the consent button* requires a content script. That splits cleanly into M2 (no host
permissions, shippable) and M3 (host permissions, needs a review story).

### 0.2 The existing analysis engine assumes a negotiable contract

`packages/unshafted-core/lib/schemas.ts` is built around bilateral negotiation:
`NegotiationIdeaSchema` (`ask`, `why`, `fallback`, `targetClause`), `SuggestedEditSchema`
(`plainEnglishEdit`), `MissingProtectionSchema` (`commonFix`). All of that presumes a counterparty
who might say yes.

Site policies are **contracts of adhesion**. There is no negotiation. The output verb changes from
*"ask for this"* to *"know this / opt out / avoid / leave"*. Reusing `DeepAnalysisResult` here would
produce confidently useless advice ("negotiate Meta's content licence").

This needs a **sibling schema**, sharing the primitives (`SeveritySchema`, `ClauseReferenceSchema`,
`ConfidenceSchema`) and diverging at the top level. See §3.1.

---

## 1. Tech / code changes and effort

Effort key: **S** ≈ half a day · **M** ≈ 1–3 days · **L** ≈ 1–2 weeks (solo, part-time)

### 1.1 Server-side corpus — the bulk of the work

| # | Change | Where | Effort | Notes |
|---|---|---|---|---|
| 1 | Migration `004_policy_corpus.sql` | `supabase/migrations/` | **S** | Tables in §2.2. RLS: anon read on `status='published'` only; all writes service-role. |
| 2 | Storage bucket `policy-text` | Supabase Storage | **S** | Raw + normalized text blobs keyed by content hash. Keeps Postgres rows small. |
| 3 | Policy discovery + fetch | new `tools/` or Edge Function | **M** | Footer-anchor scraping is the ~90% path (§2.1). Path guessing is the fallback. |
| 4 | HTML → text normalizer | `packages/unshafted-core/` | **M** | The fiddly part. Strip nav/header/footer/cookie chrome so the content hash is stable across unrelated redesigns. A readability-style extraction. Getting this wrong means constant false "policy changed" churn. |
| 5 | Analyzer runner | local script, **not** an Edge Function for v1 | **M** | Mostly prompt iteration. Local keeps cost and iteration speed sane, and matches the stated intent to seed the DB manually at first. Promote to hosted only when submissions land (M4). |
| 6 | Re-crawl scheduler | pg_cron | **S** | The pattern already exists — `003_heartbeat_rpc.sql` / commit `479ce99`. Re-analysis fires only on content-hash change. |

**Cost note:** hash-gated re-analysis keeps this cheap. A changed policy should be re-analyzed as a
**diff** against the prior version, not from scratch — cheaper, and the diff is better content than
the analysis ("their arbitration clause changed last month").

### 1.2 Index distribution — small, critical

| # | Change | Effort | Notes |
|---|---|---|---|
| 7 | Build step emits hashed domain index | **S** | `sha256(domain)` truncated to 8 bytes, sorted array, binary search at runtime. |
| 8 | Bundle index into extension | **S** | Refreshed per release. Signed delta fetch is a later optimization. |

**Correcting an earlier suggestion of mine:** a bloom filter is the wrong tool at this scale. At 5k
domains a sorted array of truncated hashes is ~40 KB, is exact, and has no false positives. Bloom
filters only start to pay at ~100k+ entries. Use the simple thing.

**Why hashed and local at all:** if the extension asks the server "what do you know about
`facebook.com`?" on every page load, Unshafted has built a browsing-history pipe to its own server.
For a privacy product that is disqualifying, and it is exactly the class of thing CWS review probes.
Local index → the common case is answered with **zero network**. Only an explicit user click fetches
the analysis by `version_id`.

### 1.3 Extension surface

| # | Change | Effort | Permissions added | Milestone |
|---|---|---|---|---|
| 9 | `tabs.onUpdated` → hash hostname → index lookup → `setBadgeText` | **S–M** | `tabs` | M2 |
| 10 | Popup "this site" view; fetch analysis by `version_id` on click only | **M** | — | M2 |
| 11 | Staleness + live-clock rendering (opt-out days remaining, auto-renewal) | **M** | — | M2 |
| 12 | Consent-point detection content script + inline nudge | **L** | `content_scripts`, broad host perms | M3 |
| 13 | "Request analysis" queue affordance | **S** | — | M2 |

Item 12 is the open-ended one. Consent-point detection is an arms race against every CMP, modal
library and bespoke checkbox on the web; it is never "done". Time-box it and accept partial recall —
a nudge that fires on 60% of consent points and never fires wrongly is far better than one that
fires on 95% and cries wolf.

### 1.4 Rough total to a shippable M2

Items 1–11, 13. Realistically **3–5 weeks part-time**, of which the majority is items 4, 5 and the
rubric work in §3 — not extension code. **The extension is the small half of this project.**

---

## 2. Corpus: where to start, minimal capture

### 2.1 Sourcing — what actually works

| Method | Verdict |
|---|---|
| **Footer anchor text** matching `privacy\|terms\|cookie\|legal\|EULA\|conditions\|do not sell` | **The ~90% solution.** Near-universal convention. Start here. |
| Well-known path guesses — `/privacy`, `/terms`, `/legal/*`, `/privacy-policy` | Good cheap fallback when the footer misses. |
| `sitemap.xml` | Inconsistent; frequently an index-of-indexes. Third resort. |
| `robots.txt` | **Dead end.** It is disallow rules; it does not point at policies. Do not build on it. |
| **ToS;DR** | Bootstrap + cross-check, *not* ground truth. Open, human-curated, thousands of services. Also prior art worth positioning against — it is sparse, human-paced, and does no guardian. Check its licence before ingesting anything. |

### 2.2 Minimal capture — resist modelling everything

Per document version, only:

- `domain` — **registrable domain (eTLD+1)**. `m.facebook.com`, `www.facebook.com` and `facebook.com`
  are one site. Getting this normalization wrong fragments the corpus invisibly. Use the Public Suffix List.
- `doc_type` — `terms | privacy | cookie | eula | acceptable_use | data_processing`
- `source_url`, `fetched_at`, `http_status`
- `content_hash` — over the *normalized* text, not the raw HTML
- `text_ref` — Storage key
- `analysis` (JSONB), `analyzed_at`, `model`, `prompt_version`
- `status` — `published | draft | stale | failed`

Deferred until M4: credits, submissions, community scores, approval queue, publishing workflow.

### 2.3 Where to start — depth, not breadth

**Do not start with "the top 1000 sites."** Two reasons, and the second is the important one:

1. Coverage is not the first milestone — **being right** is.
2. Severity is only meaningful **relative to a vertical's norm**. Arbitration clauses are near-universal
   in US consumer finance; flagging every bank for arbitration is noise, not signal. The signal is
   *deviation from peer baseline* — and a baseline requires enough peers in one vertical to compute it.

So: seed **~50 domains deep in two verticals** rather than 500 shallow across ten. Suggested first two:
consumer fintech/payments and subscription ecommerce — high consent frequency, real money, clear
statutory hooks.

### 2.4 The gold set — the step people skip and regret

Before any badge ships, hand-grade **20 sites you read yourself** and score independently. That is the
only way to know whether the model's severity ratings track reality. It becomes the regression suite
for every future prompt change. Without it there is no evidence the badge is not noise, and the badge
being noise is the single failure mode that kills this feature.

---

## 3. New core concepts to develop

### 3.1 Adhesion vs negotiated — a sibling schema

Shares primitives with the existing schema; diverges at the top level.

```
SitePolicyAnalysis
  vertical            — see 3.2
  exposures[]         — what you gave up   { title, severity, whatItMeans, reference }
  availableActions[]  — what you can still do
                        { action, deadline?, howTo, effort }   ← replaces negotiationIdeas
  requiredDisclosures — present / absent / not-applicable      ← see 3.3
  peerDeviation       — where this deviates from vertical norm ← see 3.4
  staleness           — analyzedAt, sourceVersionHash
```

`availableActions[]` with a `deadline` is what powers the arbitration opt-out clock — the single most
concrete, differentiated thing this feature can do.

### 3.2 Vertical rubrics

Different business types create structurally different exposure. One generic "risk score" flattens
exactly the information that matters. Each vertical gets a checklist of what to look for:

| Vertical | What the rubric checks |
|---|---|
| **Finance / banking** | Arbitration + class-action waiver, credit-bureau reporting, account freeze/closure discretion, liability for unauthorized transactions, affiliate data sharing |
| **Payments / fintech** | Fund holds and reserve rights, chargeback liability, termination without notice, dormancy fees |
| **Ecommerce / subscription** | Auto-renewal and cancellation friction, refund carve-outs, unilateral price change, negative-option billing |
| **Social / UGC** | Content licence scope (perpetual? sublicensable? transferable?), biometric data, data sale/sharing, account termination and content loss, minors' data |
| **Health / wellness** | Whether HIPAA actually applies (often it does **not**), sale of health data, research use |
| **SaaS / productivity** | Training on your data, IP ownership of outputs, data export on termination, subprocessor list |

### 3.3 Disclosure obligation vs actual practice

Some verticals are *legally required* to disclose specific things — GLBA privacy notices in US finance,
CCPA "Do Not Sell or Share" links, GDPR lawful basis. **The absence of a required disclosure is itself
a signal**, and a stronger one than most clause readings: *"this site takes card payments and publishes
no privacy notice at all"* is a harder fact than any severity rating.

This is a differentiated detector that clause-reading competitors structurally cannot produce, because
it depends on knowing what *should* be there — which is what the vertical rubric encodes.

### 3.4 Vertical classification + peer baseline

- **Classification** happens once at ingest (LLM, human-correctable), stored on the `sites` row. Never per-visit.
- **Peer baseline** is computed per vertical once there are enough members: what fraction of peers have
  this clause. Severity is then reported as deviation. This is why §2.3 argues for depth over breadth —
  the baseline is a corpus-size-gated feature, and it is what makes the badge quiet enough to be trusted.

---

## 4. Milestones and tickets

### M0 — Rubric and schema *(no user-facing code)*
- [ ] `SitePolicyAnalysis` sibling schema in `unshafted-core`
- [ ] Adhesion-contract prompt; `prompt_version` from day one
- [ ] Vertical taxonomy + rubric for the first two verticals
- [ ] Hand-graded 20-site gold set
- [ ] Measure model output against gold set; iterate prompt until severity correlates

### M1 — Corpus pipeline
- [ ] Migration `004_policy_corpus.sql` + RLS
- [ ] Storage bucket
- [ ] eTLD+1 normalization (Public Suffix List)
- [ ] Footer-anchor discovery + path-guess fallback
- [ ] HTML → text normalizer, content hashing
- [ ] Analyzer runner (local script)
- [ ] Seed 50–100 domains across the two chosen verticals
- [ ] pg_cron re-crawl; hash-gated re-analysis

### M2 — Badge and panel *(shippable; no host permissions)*
- [ ] Hashed domain index build step + bundling
- [ ] `tabs.onUpdated` badge path
- [ ] Popup "this site" view; click-only analysis fetch
- [ ] Staleness display + live-clock actions
- [ ] "Request analysis" queue
- [ ] Verify: zero network traffic on ordinary browsing

### M3 — Guardian *(host permissions; needs a CWS review story)*
- [ ] Written justification for broad host permissions, drafted **before** code
- [ ] Consent-point detection (time-boxed; optimize precision over recall)
- [ ] Inline nudge component
- [ ] In-product disclosure pass matching the `v0.7.1` Purple Nickel precedent

### M4 — Community
- [ ] Submission schema + review queue
- [ ] BYOK-funded user analysis
- [ ] Approval → publish flow
- [ ] Auto-validation by re-running submissions against the stored doc hash — human approval does not
      scale past a few hundred submissions

---

## 5. Open questions

1. Which two verticals seed first? (§2.3 suggests fintech/payments + subscription ecommerce.)
2. Does the guardian need to *read* the banner it interrupts, or is "covered site + consent point
   reached" enough? Materially different permission footprints.
3. Is the corpus public (a web-visible library, SEO surface, credibility) or extension-only?
   This is a positioning decision, not a technical one, but it changes the RLS and the API shape.
4. Index refresh: bundled-per-release only, or signed delta fetch? Delta fetch reintroduces a
   server call — needs to stay domain-agnostic to preserve the §1.2 privacy property.

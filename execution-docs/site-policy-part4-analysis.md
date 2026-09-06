# Site Policy Awareness — Part 4: Analysis

**Status as of 2026-09-06 — PASS 1 COMPLETE, and the corpus is now being shipped.** The first
user-facing surface is specified in `site-policy-part5-side-panel.md` and under implementation: the
83 analyses bundle into the extension, `policy-seed.json` gets real domains at last, and a Chrome
side panel renders them. Two long-open questions closed there — the index risk byte is **worst**,
and the scope-metadata ticket no longer gates the seed. Pass 2 is unaffected and still blocked on
the clause vocabulary.

**Pass 1 — 83 of 83 analysed, 0 invalid.** The schema changes
are applied. The final 21 documents were analysed in one parallel run of six analysts; the
committed index is rebuilt. **Pass 2 is unstarted and `peerDeviation` is still 0 of 83** — the
blocker is not coverage, it is that no clause key exists to compute a share over. Analysing the
last 21 did not change which peer sets publish, as predicted: still three of eight tag/docType
pairs. Next: the clause vocabulary, and a canonicalisation pass before it — see "Pass 2" below.
Resume from "How to resume" below. Live status page: https://claude.ai/code/artifact/da53d135-e641-46c2-b3c7-37b99b1bccff

## Input

`corpus/curated.json` — **83 documents, 36 domains, 4,352,844 normalized characters.** (Down from
the 85 this doc originally recorded; documents that turned out not to be policies were removed
from `curated.ts` with the reason inline as pass 1 found them.) Built by
`node --import tsx tools/corpus/build-curated.ts` from `tools/corpus/curated.ts` and the
manifest. Each entry carries `domain`, `tags[]`, hand-assigned `docType`, `contentHash`,
`sourceUrl`, `normalizedLength`, `textPath`, and sometimes a `note`.

**Analyse `corpus/text/{hash}.txt`, never `corpus/raw/`.** The normalized text is what
`contentHash` is taken over, and it is what the client will re-derive and look the analysis up
by. Analysing the raw HTML would grade text that no lookup will ever match.

Read every `note`. They record where the shipped classifier was wrong, where one document serves
two sites, and where a page carries several policies at once.

## Decided

- **Analyst: Claude, directly in-session.** Not the OpenRouter pipeline — the free model is
  rate-limited and unreliable at 42k-character legal reasoning under a strict JSON schema, and a
  paid run costs real money for a corpus that will be re-analysed as the rubric moves. Record
  provenance honestly: `model: 'claude-opus-5'`, and a `promptVersion` for the rubric used.
- **Long documents: chunk and merge.** 12 documents exceed the repo's 42,000-character
  `DEEP_ANALYSIS_CHAR_LIMIT` — Paytm 294k, Microsoft 213k, Booking 170k, Stripe 161k, Flipkart
  150k. Split at paragraph boundaries (the normalizer's `\n\n` breaks are stable by
  construction — that is what `splitPolicyBlocks` in `diff.ts` relies on), analyse each part,
  merge the exposures. Truncating Microsoft's privacy statement to 20% and grading the remainder
  produces an analysis that is confidently wrong, which is the one failure mode this feature
  cannot survive.

## Blocking prerequisite — the schema must change first — **done**

All seven landed in `packages/unshafted-core/lib/site-policy/schemas.ts` before pass 1 began, while
they were still free. Kept below as the record of what changed and why.

`SitePolicyAnalysisSchema` cannot represent the analysis this corpus needs. **Nothing is
published and `CEB_POLICY_CDN_URL` is unset, so these are still free.** They stop being free at
first publish. Needs approval before editing.

Three are breaking after publish (an unknown enum value or a changed type makes an older client
reject the whole object):

1. **`vertical: VerticalSchema` → `verticals: VerticalSchema[]`.** Tags are multi-valued and
   settled (Part 3, D1). Amazon carries five.
2. **`VerticalSchema` needs the settled eight tags.** Currently `finance_banking`,
   `payments_fintech`, `ecommerce_subscription`, `social_ugc`, `health_wellness`,
   `saas_productivity`, `other`. Needed: split `ecommerce_subscription` into `ecommerce` and
   `subscription_autorenewal`, add `ott_streaming` and `identity_provider`, map `saas` onto
   `saas_productivity`. Keep `health_wellness` and `other`.
3. **`PolicyDocTypeSchema`** has no value for the documents the corpus actually found — Know
   Your Customer, Grievance Redressal, Digital Asset Disclosures, Copyright/DMCA policy,
   Restricted Businesses. Four curated entries are currently filed under a `docType` that only
   approximately fits.

Four are additive and stay cheap (Zod 3 `z.object` strips unknown keys), but are free now:

4. **`normalizerVersion`** on the published object. `SitePolicyPanel.tsx` already sends it on
   submission; the published object has nowhere to record which normalizer produced its hash.
5. **`surface`** — footer / signup / checkout / in-app. Only `footer` is populated by this
   capture, but the field should exist before publish.
6. **Peer-set field on `PeerDeviationSchema`.** Under tags, a clause can be normal among
   streaming peers and an outlier among fintech peers. The object must say which set the share
   was computed against or the number is meaningless.
7. **`domains[]` alongside `domain`.** Two curated documents serve both `hotstar.com` and
   `disneyplus.com`.

## Two passes, because peer baselines need the corpus first

**Pass 1 — per document.** `exposures[]`, `availableActions[]`, `requiredDisclosures[]`,
`summary`, `riskLevel`, `confidence`. Leave `peerDeviation` empty.

**Pass 2 — peer baselines.** For each tag with enough members, compute what fraction carry each
clause, then fill `peerDeviation` with the peer set named.

**Minimum-N is 10** (Part 3, D1): no `peerShare` is published for a tag below it. After capture,
tag members with at least one document are `ecommerce` 10, `subscription_autorenewal` 11,
`payments_fintech` 12, `finance_banking` 10 — those four clear it. `saas` 8, `social_ugc` 7,
`ott_streaming` 6, `identity_provider` 6 do not. **Those four tags get no peer baseline**, and
that is the gate working, not a failure to route around.

> **Superseded — these are captured-site counts, and the floor is applied per tag *and* per
> docType over *analysed* sites.** Counted correctly it is three tag/docType pairs that publish,
> not four tags. See "Pass 2" below; this paragraph is kept because the error it contains is the
> one worth not repeating.

## Rubrics

Per-vertical checklists are in `site-policy-awareness-scoping.md` §3.2 — what to look for in
finance, payments, ecommerce/subscription, social/UGC, health, SaaS. §3.3 covers the
disclosure-obligation detector, which is the differentiated one: absence of a legally required
disclosure is a harder fact than any severity rating.

## Output

- One `SitePolicyAnalysis` per document, keyed by `contentHash`.
- `corpus/analysis/{hash}.json` — **gitignored**, like the text. They are derived from
  third-party documents and their storage posture is the same open question (Part 3, D8).
- A committed index of what was analysed, mirroring `curated.json`.

## Packaging — what actually reaches the product

`CEB_POLICY_CDN_URL` is unset and there is no CDN. So packaging means bundling statically, and
that runs into a shipped constraint worth settling before building anything:

**`policy-seed.json` drives the badge, and every entry must carry a `riskLevel`.** The index
payload is 2 bits of risk plus 1 bit of time-sensitivity — there is no "covered but ungraded"
state, and the badge tooltip reads *"…high risk in this site's policies."* Once analysis exists
those risk levels are earned rather than invented, so seeding real domains becomes legitimate
for the first time.

Open question for that session: a domain has several documents with several risk levels, and
the index byte holds one. Part 1's open question 2 — worst, or aggregate? — has to be answered
before the seed is generated.

## Testable domains

A domain only works end-to-end if the client can reach its document from the page it is on
(AD-4). Of the 36 curated domains:

**24 fully testable** — amazon.com, americanexpress.com, apple.com, booking.com, chase.com,
coinbase.com, doordash.com, facebook.com, flipkart.com, hdfcbank.com, hotstar.com,
instagram.com, linkedin.com, makemytrip.com, openai.com, paypal.com, paytm.com, phonepe.com,
reddit.com, robinhood.com, stripe.com, tiktok.com, uber.com, zomato.com

**5 partial** — bankofamerica.com (1/2), dropbox.com (1/2), ebay.com (2/4), x.com (2/3),
zoom.us (2/3)

**7 unreachable in-page** — canva.com, google.com, microsoft.com, netflix.com, snapchat.com,
walmart.com, zerodha.com. Four of those seven fail for reasons that are fixable client-side
without host permissions; see Part 3, finding 12.

**Caveat for manual testing.** Capture ran from Bengaluru on 2026-09-04. The extension hashes
the live page, so any policy edited since then produces a different hash and will read as not
analysed — correctly. `disneyplus.com` serves Hotstar's documents from an Indian egress and will
behave as `hotstar.com`.

## Status

- [x] Approve and apply the seven schema changes — all seven are in
      `packages/unshafted-core/lib/site-policy/schemas.ts`
- [x] Pass 1 — **83 of 83, 0 invalid.** Priority subset 40/40, peer-coverage queue 16/16, final
      batch 21/21. Whole corpus read: 4,352,844 normalized chars.
- [ ] **Canonicalise the disclosure vocabulary a second time** — 100 distinct names now, and the
      parallel run added coinages faster than any single-threaded pass would. Do this BEFORE pass 2.
- [ ] Pass 2 — blocked on the clause vocabulary, not on coverage. Baselines publish for three
      tag/docType pairs: `payments_fintech`/privacy (11), `ecommerce`/terms (10),
      `subscription_autorenewal`/terms (10).
- [x] **Decide worst-vs-aggregate for the index risk byte — WORST.** Settled in
      `site-policy-part5-side-panel.md` D1. Measured over the 37 domains: worst-of yields
      Low 0 / Medium 1 / High 27 / Very High 9, aggregate yields 0 / 4 / 28 / 5, and the two rules
      disagree on only 7 domains. Worst was taken because aggregate understates exactly where the
      corpus proves disagreement is real — 19 of 37 domains have documents that disagree, 4 by two
      full levels. The badge being red on 36 of 37 domains is accepted deliberately: that is the
      corpus's result, not a defect in the metric.
- [ ] Generate `policy-seed.json` from real analysis — in flight under Part 5 W1
- [ ] Manual test pass over the 24 fully-testable domains — x.com is now 3/3 and no longer partial
- [ ] Retry list from capture — 6 zero-link sites plus youtube.com, untouched
- [x] **Decided what to do about documents a hash cannot serve.** `665e157e` (stripe.com cookie)
      is excluded from the bundle and the seed — it hashed transient banner state and can never match
      a live page. Snapchat's two documents ship as-is and begin matching on 21 Sep 2026; Dropbox's
      stop matching on 1 Jan 2027. Both are correct behaviour under AD-1, not gaps. Part 5 D6/D7.
- [ ] **Validity window + jurisdictional scope** — `site-policy-scope-metadata-ticket.md`. Free now,
      breaking after publish. **No longer blocks `policy-seed.json`** — Part 5 D3 moved every precise
      claim down to the document and restated the domain byte as an explicit worst-of, so Snapchat and
      Dropbox self-correct through AD-1 and x.com's two editions are labelled rather than averaged.
      Still blocks the first CDN publish.

---

## Pass 2 — peer baselines

### The priority subset did not unblock pass 2

This doc previously recorded that all four tags clearing the minimum-N of 10 "draw their members
from the priority subset, so the peer baselines can be computed on a complete set for those
four." That is wrong, and the error is worth keeping because it is the same class of mistake as
the disclosure-name drift.

Those counts — `ecommerce` 10, `subscription_autorenewal` 11, `payments_fintech` 12,
`finance_banking` 10 — count sites with **at least one captured document**. A share can only be
computed over sites that have been **analysed**. Peer sets are defined over every site carrying
the tag, and the priority subset deliberately excluded the sites that are not testable in-page.
Those excluded sites are peers regardless of whether the client can reach their policies.

Current coverage, as sites (captured / analysed):

| tag | terms | privacy | either |
|---|---|---|---|
| `payments_fintech` | 8 / 6 | 11 / 9 | 12 / 10 |
| `ecommerce` | 10 / 8 | 8 / 6 | 10 / 8 |
| `finance_banking` | 6 / 5 | 9 / 7 | 9 / 7 |
| `subscription_autorenewal` | 10 / 5 | 8 / 4 | 10 / 5 |

`finance_banking` has also dropped from 10 captured sites to 9 since the original note, through
one of the three curation removals. It cannot reach N=10 on a site basis at any coverage.

### Two decisions taken

**D1 — close the gap before computing.** Analyse the 16 documents that hold a peer set below
full captured coverage, then compute. The alternative was publishing `payments_fintech` alone
(the only tag at 10 analysed sites) or reopening the minimum-N floor, which Part 3 D1 settled.

**D2 — `peerShare` is a fraction of sites, scoped by docType.** A peer is a company, not a
document. A clause counts as present for a site when that site's document of the relevant type
carries it: arbitration is scored across sites with analysed terms, retention across sites with
analysed privacy.

Counting documents instead would clear N=10 for all four tags (17/16/13/11) by letting capture
depth stand in for market practice — eBay contributes four documents and Zomato two, so eBay
would weigh twice as much on a question about companies. Counting sites on an "any analysed
document" basis reproduces the original 12/10/10/9 but scores a site with only its privacy
policy analysed as carrying no arbitration clause, which is the flattering-direction error
again.

The consequence of D2 is that **`finance_banking` will not publish a baseline** at 9 sites, and
`ecommerce`-privacy (8) and `subscription_autorenewal`-privacy (8) will not either. That is the
minimum-N gate working.

### Blocking queue — 16 documents, 931,535 chars — **complete**

Analysed with the pass-1 loop and rubric; these are ordinary pass-1 analyses that happen to be
the ones peer baselines need.

| site | doc | hash8 | chars | status |
|---|---|---|---|---|
| zerodha.com | privacy | `160a8f6a` | 17,155 | [x] Medium |
| bankofamerica.com | privacy | `8d8c3508` | 21,148 | [x] High |
| netflix.com | terms | `e14eef68` | 21,941 | [x] Medium |
| dropbox.com | terms | `57d58481` | 25,414 | [x] High |
| google.com | terms | `c60d3001` | 29,510 | [x] High |
| canva.com | terms | `c1c703a5` | 46,127 | [x] High |
| walmart.com | privacy | `b8f08b0e` | 52,898 | [x] High |
| netflix.com | privacy | `80a9c1b3` | 54,118 | [x] High |
| zoom.us | privacy | `bc86ac55` | 54,188 | [x] High |
| google.com | privacy | `b7688f54` | 55,133 | [x] High |
| zerodha.com | terms | `da51e355` | 58,319 | [x] Very High |
| canva.com | privacy | `15da0f5a` | 63,333 | [x] High |
| zoom.us | terms | `f57c6574` | 87,356 | [x] High |
| walmart.com | terms | `f5977930` | 90,565 | [x] Very High |
| ebay.com | privacy | `530c8a6d` | 123,654 | [x] High |
| ebay.com | terms | `e33c29e5` | 130,676 | [x] High |

### Coverage after closing the gap

Every peer set is now at full captured coverage — `missing: none` for all four tags on both
document types. Under D2 the pairs that clear the minimum-N of 10 are:

| tag | terms | privacy | publishes |
|---|---|---|---|
| `payments_fintech` | 8 / 8 | 11 / 11 | **privacy** |
| `ecommerce` | 10 / 10 | 8 / 8 | **terms** |
| `subscription_autorenewal` | 10 / 10 | 8 / 8 | **terms** |
| `finance_banking` | 6 / 6 | 9 / 9 | — |

Three of eight tag/docType pairs publish a baseline. `finance_banking` cannot reach 10 on this
corpus at any coverage, and the three privacy/terms pairs sitting at 8 are short by two sites
each. That is the gate working: the answer to "is this clause normal among ecommerce peers?"
exists for terms and does not exist for privacy, and the published objects should say so by
omission rather than by publishing a share over eight.

### Then: the clause vocabulary

`peerShare` needs a clause key, and neither existing field is one.

- **`exposures[].title` is unusable.** 689 exposures carry 679 distinct titles. They are written
  as findings about one document, not as labels from a shared vocabulary. The seven repeats are
  Meta's en-GB/en-US pair hashing twice (finding 6).
- **`requiredDisclosures[].name` is close but not sufficient.** 698 records (443 present, 232
  absent, 23 not applicable) under 100 names, with an explicit present/absent/not_applicable status — it is the
  field designed for absence claims. But it records what each analysis found worth recording, not
  a systematic checklist: LinkedIn's terms carry no "Notice of changes to terms" record because
  the finding went under "Non-retroactivity of changes", deliberately left distinct.

So a clause is present for a site only where a document was **read against that clause**. Silence
in a pass-1 analysis is not absence, for the same reason an incomplete capture is recorded as
*unverified* rather than *absent*.


---

## How to resume

Everything is committed on `feat/site-policy-corpus-capture`. Nothing is in flight.

```
nvm use
node --import tsx tools/corpus/validate-analysis.ts          # progress + integrity
node --import tsx tools/corpus/validate-analysis.ts --todo   # what is left, with paths
```

**Peer coverage, counted the way the floor is actually applied** — per tag *and* per docType, over
sites that have been analysed rather than captured. Rerun this before claiming any tag publishes:

```
node -e '
const fs=require("fs"),g=require("glob");
const cur=JSON.parse(fs.readFileSync("corpus/curated.json")).entries;
const done=new Set(fs.readdirSync("corpus/analysis").map(f=>JSON.parse(fs.readFileSync("corpus/analysis/"+f)).contentHash));
for(const t of ["payments_fintech","ecommerce","subscription_autorenewal","finance_banking"])
 for(const dt of ["terms","privacy"]){
  const a=new Set(cur.filter(e=>e.tags.includes(t)&&e.docType===dt&&done.has(e.contentHash)).map(e=>e.domain));
  console.log(t,dt,a.size,a.size>=10?"PUBLISHES":"");
 }'
```

**The loop, per document:** read `corpus/text/<hash>.txt` in full (chunk the long ones at
paragraph boundaries — the normalizer's `\n\n` breaks are stable by construction), then pipe a
body to the writer:

```
node --import tsx tools/corpus/write-analysis.ts <<'EOF'
{ "hash8": "...", "summary": "...", "riskLevel": "...", "confidence": "...",
  "exposures": [...], "availableActions": [...], "requiredDisclosures": [...] }
EOF
```

The writer fills `contentHash`, `docType`, `verticals`, `sourceUrl`, `normalizerVersion`,
`promptVersion` and `model` from `corpus/curated.json` and schema-checks before writing, so a
malformed or mis-keyed object cannot land. Then `build-analysis-index.ts` to refresh the
committed index.

**Rules that have held so far and should keep holding:**

- Analyse the normalized text, never `corpus/raw/`.
- Every exposure carries a `reference` with the section label, and a `quote` where the wording
  is the finding.
- Where a capture is incomplete, mark `confidence: medium` and record the affected disclosure as
  *unverified*, not *absent* — saying "absent" from a capture artefact is a false claim about a
  real company.
- If a document turns out not to be a policy, remove it from `curated.ts` with the reason inline.
  Three have been removed this way so far.

## Where pass 1 stands

| | |
|---|---|
| Analysed | **83 of 83** · 4,352,844 chars · 0 invalid |
| Priority subset | 40 of 40 |
| Peer-coverage queue | 16 of 16 |
| Final batch | 21 of 21 (six parallel analysts) |
| Peer coverage | full for every tag on both docTypes |
| Risk | Low 1 · Medium 21 · High 49 · Very High 12 |
| Exposures | 689 (331 high severity) across 679 distinct titles |
| Actions recorded | 524 |
| Disclosures recorded | 698 — 443 present, 232 absent, 23 n/a |
| Distinct disclosure names | 100 |
| `peerDeviation` written | 0 of 83 |

### Correction: finishing the priority subset did not unblock pass 2

An earlier revision of this doc and of the ledger claimed it had. It was wrong, in two ways, and
both are worth keeping written down because they are easy to repeat.

1. **The minimum-N counts were taken over sites with a *captured* document, not an *analysed* one.**
   That number comes from the capture manifest and was carried into this doc before any analysis
   existed, so it never moved. Nine sites contributing to the four qualifying tags sat outside the
   priority subset and were unread — eBay, Walmart, Google, Zerodha, Bank of America, Canva,
   Dropbox, Netflix, Zoom. A peer share computed then would have been a share over whoever happened
   to be reachable in-page, which is not a fact about market practice.
2. **The floor has to be applied per tag *and* per document type.** A clause lives in one or the
   other, so a peer set mixing terms and privacy documents is not a peer set. Counted that way it is
   three of eight pairs that publish, not four tags:

| Tag | Terms | Privacy | Publishes |
|---|---|---|---|
| `payments_fintech` | 8/8 | 11/11 | privacy |
| `ecommerce` | 10/10 | 8/8 | terms |
| `subscription_autorenewal` | 10/10 | 8/8 | terms |
| `finance_banking` | 6/6 | 9/9 | — short of 10 at any coverage |

Counted as sites rather than documents, deliberately: counting documents would clear the floor for
all four tags and let capture depth stand in for market practice, since eBay contributes four
documents and Zomato two. Reproduce with the snippet in "How to resume".

### The final batch — 21 documents, 770,176 chars — **complete**

Run as six parallel analysts against a shared brief, grouped so a site's documents went to one
analyst (a site's documents read as a set is what produced findings 4, 13 and 16, and it produced
three more here). Every analyst wrote through `write-analysis.ts`, so nothing landed unvalidated;
the index was rebuilt once at the end rather than raced on.

| analyst | documents | chars |
|---|---|---|
| A | microsoft.com privacy | 213,097 |
| B | snapchat.com terms + privacy | 141,108 |
| C | x.com terms + privacy + cookie | 102,835 |
| D | stripe.com cookie + acceptable_use, coinbase.com regulatory + cookie | 119,945 |
| E | ebay.com ×2, walmart.com, bankofamerica.com, americanexpress.com ×2 | 131,733 |
| F | openai.com, tiktok.com, linkedin.com ×2, zoom.us | 62,820 |

Two results worth recording about the run itself:

- **`3bf2cd88` (zoom.us cookie) is genuine Zoom**, not the OneTrust marketing page. The curated
  `note` in `tools/corpus/curated.ts` is stale — it describes the original mis-pick, not the
  corrected capture on disk. Clear it so the next reader does not re-litigate it.
- **Parallelism costs vocabulary discipline.** Six analysts working from the same canonical list
  still coined seven new names between them, each individually defensible. A canonicalisation pass
  is now a prerequisite for pass 2, not an optional tidy — see below.

### `docType` calibration was wrong in the brief, and the corpus corrected it

The brief told analysts that cookie policies and regulatory disclosures legitimately run lower-risk
than terms and privacy policies. That is true on average and false as a rule, and two analysts
pushed back with evidence:

- **Cookie policies spread Medium→High on substance.** Stripe itemises 273 cookies with host,
  party, duration and purpose; LinkedIn names zero cookies, zero durations and zero third parties
  and takes consent from "continuing to visit". Coinbase names three and gives retention as "a few
  days, weeks or months". **Disclosure depth inverts against risk** — the corpus's most exposed
  cookie policy is also its least specific. Any pass-2 share over `Named third-party recipients`
  or `Retention period` now has a real range to sit in.
- **The corpus has its first `Low`.** `887b98bf`, American Express India's grievance policy: three
  named officers with direct numbers, emails and address across a six-level chain, 30-day
  commitment (14 for insurance under IRDAI), and the RBI credit-information compensation framework
  with a 21-day correction window. A document that does its job is a finding too, and recording it
  is what makes the other 82 grades mean anything.

### Most-repeated absent disclosures

| Disclosure | Documents |
|---|---|
| Retention period | 39 |
| Notice of changes to terms | 30 |
| Named Grievance Officer | 25 |
| Named third-party recipients | 17 |
| AI training opt-out | 15 |
| Do Not Sell or Share My Personal Information | 10 |
| Consent mechanism for non-essential cookies | 9 |
| Automated decision-making rights | 9 |
| Limitation on indemnity | 7 |
| Consent withdrawal mechanism | 6 |
| Equal treatment regardless of jurisdiction | 6 |

Counts are after canonicalising the `name` field. It is free text, and the first 36 documents had
drifted into synonyms — the grievance-officer requirement was recorded under three spellings,
notice-of-changes under eight. Pass 2 computes what fraction of a peer set carries a clause, and a
clause split across three names divides its own share, so the published number would have been wrong
in the direction that flatters the companies. Only unambiguous synonyms were merged; narrower
disclosures (fee-change notice, granular cookie consent, Quebec-scoped ADM rights) were left
distinct. **Keep using the canonical names when writing new analyses.**

## Findings that came out of doing it

Recorded here because they are corpus-level and no single document produces them.

1. **Two documents describe protections that stop at a border.** Uber marks with an asterisk
   every collection it does not perform in the EEA/UK/Switzerland — including buying household
   income and streaming habits from data resellers. LinkedIn collects device data on people
   outside the EU "where you have not engaged with our Services". Both are disclosed rather than
   hidden, which makes the pattern countable. The rubric did not anticipate this category.
2. **Good terms and broad data practice are different axes.** LinkedIn's user agreement is the
   least restrictive in the corpus (Medium: no arbitration, no class waiver, non-retroactive
   changes); its privacy policy is High. A single per-site risk level would erase that.
3. **The same practice, opposite handling, same vertical.** Robinhood, OpenAI and Flipkart build
   records of people who never signed up. Coinbase collects the identical category for the
   identical purpose and expressly does not retain it, twice. That contrast is the shape of
   evidence a peer baseline runs on.
4. **A site's documents can be read as a set.** JioHotstar's privacy policy cancels your paid
   subscription without refund if you exercise erasure; its terms make fees non-refundable
   whether or not you used the service and keep ads on live sport for ad-free plans. Consistent
   posture across two documents, invisible from either alone.
5. **Every finance and payments document is High.** That is the peer-baseline problem arriving on
   schedule: once a vertical rates uniformly, only deviation from the vertical norm carries
   information. Pass 2 cannot start until the set is complete.
7. **Four Indian platforms claim they can override the national Do Not Disturb registry.** PhonePe's
   privacy notice, MakeMyTrip's user agreement, Paytm's terms and Zerodha's terms each take consent to
   call and message that expressly supersedes a user's NCPR/DND registration. Zerodha's extends the
   override to its affiliates and representatives and offers no withdrawal mechanism. MakeMyTrip goes further and makes the user
   indemnify it for losses arising from an "erroneous" complaint to TRAI — a financial risk attached to
   using a consumer-protection channel. Three instances is a sector practice, not a drafting quirk.
8. **The ideas-become-our-property boilerplate is at nine, and it has a gradient.** HDFC Bank,
   American Express India, Zomato, Paytm, Netflix, Dropbox, Canva, Zoom (in *both* its terms and its
   privacy statement). Three are outright *assignments* of title — Paytm, Canva and Zoom. Netflix takes
   a perpetual worldwide licence with a moral-rights waiver. Dropbox merely disclaims obligation.
   Google carves feedback out of its content licence entirely. Zoom sits at the far end and adds
   something no one else does: feedback is assigned *and* becomes Zoom Confidential Information until
   Zoom decides otherwise, so you surrender the idea and the right to discuss it. The clause is
   near-universal, its severity spans five distinct drafting choices, and that gradient — not mere
   presence — is what a peer baseline should measure.
9. **Two travel agencies hand the hotel the same guest scorecard.** Booking.com and MakeMyTrip both
   disclose to the property whether the account is verified, the number of completed bookings, the
   percentage cancelled, and — phrased as an absence — whether misconduct has ever been reported. The
   wording is close to identical. The rubric had no category for a reputation score disclosed to a
   third party the user has no relationship with.
17. **Mass arbitration now has its own countermeasure, and it is spreading.** Zoom and Walmart both
   throttle coordinated individual claims: Zoom turns fifty demands into sixteen, Walmart turns
   twenty-five into ten and makes the rest wait until every bellwether appeal is exhausted. Walmart
   adds two things Zoom does not — the fact of the arbitration and the award are confidential, and
   awards carry no preclusive effect even against the same counsel on the same issues, so no claimant
   can discover that anyone else won. Read with the class action waiver these clauses answer the
   remedy that answered the last one. The rubric had a category for arbitration and one for class
   waivers; it had none for suppressing the aggregation of individual claims.

18. **Walmart requires a wet-ink signature, by courier, to start a claim.** The demand must reach
   Bentonville by first-class mail, FedEx or UPS bearing the original personal signatures of the
   claimant *and* their lawyer — the terms exclude digital, scanned, electronic, copied and facsimile
   signatures by name — sworn under penalty of perjury. The entire relationship it governs is
   electronic. No other document in the corpus does this, and it is a pure filter: it protects nothing
   and screens out anyone unwilling to post a letter to Arkansas.

10. **The arbitration opt-out has a spectrum, not a binary.** OpenAI reopens its window on every update;
   DoorDash offers 30 days from signup and states expressly that updates never reopen it; Amazon offers
   none. Paytm is off the scale in the other direction — arbitration there is an election *Paytm* holds
   and the consumer does not, which no other document in the corpus does.
11. **A sectoral exemption can switch off a consumer privacy right.** PayPal states it relies on a
   Gramm-Leach-Bliley exemption for precise geolocation instead of offering the CCPA right to limit
   sensitive personal information; Robinhood says GLBA may mean it has no obligation to honour a
   deletion request. The category is "financial-sector carve-out used against a consumer right", and
   the rubric did not anticipate it.
12. **A named grievance officer is a choice, not an Indian convention.** Thirteen documents lack one.
   Zomato names Swati Chauhan with address, phone, hours and a 48-hour commitment plus a separate Nodal
   Officer; Flipkart names Karthik R with a 24-48 hour guarantee; MakeMyTrip names Manav Narula. Paytm,
   across 294,000 characters, names none of its own — the only grievance chain in the document belongs
   to a third-party silver vendor.

16. **The within-site split can invert the whole grade.** Zerodha's privacy policy is the mildest
   finance document in the corpus at Medium — Aadhaar genuinely voluntary, an offline route that works,
   no sale of data at all. Zerodha's terms are Very High and contain the lowest absolute liability cap
   found anywhere: INR 100, about a dollar, for a broker holding the client's portfolio, alongside full
   client liability for trades made with stolen credentials and an indemnity covering Zerodha's own
   technical failures. Finding 13 showed one protection granted in one document and withheld in
   another. This is the stronger case: the two documents of one company land three risk levels apart,
   so any single per-domain byte is not a summary of Zerodha but a coin flip between two true answers.
   This is the sharpest evidence yet for Part 1's open question 2, and it argues against "aggregate".

13. **A site's two documents can promise different amounts of notice.** Netflix's terms of use commit
   to at least one month before a material change and before any price rise — among the strongest in
   the corpus. Netflix's privacy statement, last updated the same day, promises notice only "as
   required by law" and counts continued use as acceptance. Finding 2 said good terms and broad data
   practice are different axes; this is the sharper version — the *same* protection, granted in one
   document and withheld in the other. A per-site risk level would average these into a number that
   describes neither.

14. **A reseller you never met can read your content.** Zoom states that where an account was bought
   through a reseller, that reseller "may be able to access personal data and content for users,
   including meetings, webinars, and messages". Google lists resellers alongside domain administrators
   as able to read stored email, change your password, and *restrict your ability to edit your own
   privacy settings*. In both cases the party with access is not named, has no relationship with the
   participant, and is invisible from the product. The corpus already had the employer-administrator
   category; the reseller is a second, longer arm of it that no rubric anticipated.

15. **Encryption can be scoped to exclude the party you were worried about.** Zoom Email is end-to-end
   encrypted by default and the account owner can read it anyway, because the account owner may hold
   the key. The guarantee is real — Zoom cannot read it — but the phrase "end-to-end encrypted" carries
   an implication about *employers* that this drafting does not honour. Worth a rubric category of its
   own: security claims whose threat model excludes the reader's actual adversary.

6. **One policy, many hashes.** Facebook and Instagram serve the identical Meta policy in en-GB
   and en-US and hash differently — see Part 3, finding 13. The corpus needs a document-identity
   concept above the hash.

19. **Finding 12 has its counterexample, and it is a per-document choice, not a jurisdictional
   convention.** American Express India's grievance policy is the strongest instance in the corpus —
   three named officers, each with a direct number, email and the Gurgaon address, across a six-level
   chain up to the CEO. It sits alongside Amex's *own terms*, which this corpus already records as
   lacking a grievance officer. The same company both proves and breaks the pattern depending on which
   document you open.
20. **A sectoral carve-out can remove the whole population from the whole document.** Bank of America's
   online privacy notice routes Californians "covered by the CCPA" to its CCPA notice; that notice then
   states it does not apply to information collected about residents who apply for or obtain financial
   products for personal, family or household purposes — the GLBA exemption. The bank's retail
   customers are sent to a rights document that has already excluded them, and the "covered by"
   qualifier is the one thing a reader cannot evaluate without making the trip. Finding 11 had GLBA
   declining one right; this is the escalation.
21. **Two documents can assert contradictory facts about the same practice.** Walmart's privacy notice:
   "We do not engage in profiling in furtherance of decisions that produce legal or similarly
   significant effects concerning consumers." Walmart's California notice: "We may use Automated
   Decision-Making Technologies to help us make decisions that could have a significant impact on you",
   with access and opt-out rights attached. Both current. This is stronger than finding 13 (different
   promises) and different from finding 16 (different severities) — and only the document a user is
   less likely to read carries the rights. **Aggregation would average a contradiction into a number
   describing neither.** This is now the second-strongest argument on the worst-vs-aggregate question.
22. **A disclosure can stop at a border, not just a practice.** eBay's global privacy notice states
   six-to-ten years for European contracts and business records. The US States/California notice gives
   no figure at all, only a pointer to internal "regional data retention guidelines". Same company,
   one concrete retention number, not carried into the document Americans are sent to. Finding 1's
   shape with a disclosure in place of a collection.
23. **A consent split can be a consistent company-wide posture visible only across three documents.**
   eBay gives EEA/CH/UK a consent settings page with withdrawal and everyone else AdChoice, which
   governs use of eBay activity rather than whether third-party cookies are set. Read with the privacy
   notice (consent vs legitimate interest) and the state notice, it is deliberate and uniform — the
   mirror image of findings 13/16, where a site's documents disagree.
24. **Disclosure-by-reference is a systematic blind spot for a product that hashes a page.** California
   §7102 metrics are satisfied by a hyperlink almost everywhere. eBay prints them inline: 58,311
   deletion requests, 30,521 complied with, **27,766 not** — 48%, footnoted as mostly user
   cancellations during an undescribed grace period; access 4,145 of 63,449 denied; all 661,520
   opt-outs honoured at a median of one day. Bank of America and Walmart link theirs off-page. The only
   company whose actual compliance rate is in the captured text is the one that chose to inline it.
25. **A control can be offered against a technology that escapes it.** eBay's cookie notice discloses
   fingerprinting by name and admits such techniques work without local storage and "are not fully
   managed by your browser" — while every control it gives non-European readers operates on stored
   files. It also sends data to Meta server-to-server as well as by pixel, under joint control where
   Meta becomes an independent controller with "exclusive responsibility". Second instance of the
   finding-14 category.
26. **A company can classify less as sensitive than it collects, then sell the remainder.** Walmart's
   sensitive-information list has three entries. Voice prints, iris/retina imagery, face geometry and
   palm prints are defined elsewhere in the same notice and appear as a row in the sold-or-shared
   table — outside the sensitive-information protections and outside the limit right. Criminal
   convictions go to "business partners… for their own independent use." Bank of America's CCPA notice
   *does* classify biometric processing as sensitive, so this is a drafting choice with a peer contrast
   sitting in the same corpus.
27. **A disclosure that is also an admission of a compliance failure, remediated at the consumer's
   expense.** Amex India's KYC page is the corpus's best Aadhaar handling — one of six OVDs, never the
   default, mask-first-eight-digits on all ten appearances. It then discloses that Amex failed to
   collect address proof for changes between 13 Feb 2019 and 15 Apr 2020, and puts the remediation work
   on the affected customers. New rubric category.
28. **The invisible-third-party category has a fourth member: the infrastructure vendor.** Stripe's `m`
   (2 years) and `__stripe_mid` (1 year) are set at checkout on *merchant* sites, and the consent
   surface documenting them is a Stripe URL the affected person has no reason to visit and no path to
   from the shop they were on. After the employer-administrator, the reseller (finding 14) and
   Microsoft's ISP-created account, this is the payment processor behind a site you did visit.
29. **The un-refusable bucket is where the un-nameable recipients sit.** Stripe's "Required" category
   holds 118 cookies, 23 of them third-party — 18 reCAPTCHA entries, 13 written to `google.com` for a
   year, plus Human Security, Datadome, PerimeterX and a Mastercard 3-D Secure cookie. Refusing
   everything refusable still hands Google a year-long identifier. Generalises the Dropbox
   five-year strictly-necessary finding into a category.
30. **A stated global neutrality commitment, contradicted by a jurisdiction annex on the same page.**
   Stripe states it does not restrict access on political viewpoint or affiliation, then applies eleven
   country lists. The US bars four categories, none civic; **India bars 22, including charities,
   non-profits, religious organisations, lobby groups and political organisations.** Both statements
   are true as drafted. Sibling of finding 1 with the polarity reversed — the *restriction* is
   border-scoped, not the protection.
31. **Candour without a management policy.** Coinbase discloses, asset by asset, that it holds 209 of
   209 New York trading assets on its own balance sheet and has a commercial engagement on 163 of them
   (Prime custody: 327 of 384 held, 277 engaged) — then states no mitigation at all. No information
   barrier, no listing-committee independence, no restriction on trading against customer flow.
   Everything disclosed, nothing controlled.
32. **Liquidated damages against a consumer, for reading.** X charges $15,000 (€15,000 in the EU
   edition) per 1,000,000 posts "requesting, viewing, or accessing" in 24 hours, joint and several,
   expressly "not a penalty", against a $100 liability cap — a **150-to-1 ratio** between what a user
   can owe X and what X can ever owe a user. Nothing else in the corpus prices a user's consumption.
33. **A class-action waiver with no arbitration behind it.** "Arbitration" does not appear in 58,498
   characters of X's terms, and the class/collective/representative waiver is kept anyway, enforced
   exclusively in Wichita or Tarrant County, Texas. The usual bargain trades aggregation for a cheap
   forum; here the forum is a courthouse in north Texas and X reserves sole discretion to sue you at
   home instead. The rubric has categories for arbitration and for class waivers and assumes they
   travel together.
34. **Fee-shifting inside consumer arbitration.** Snapchat's terms: serve an offer of judgment, and a
   claimant who rejects it and fails to beat it recovers none of their post-offer costs and pays Snap's
   — "including all fees paid to the arbitral forum" — against a $100 damages cap. Distinct from both
   arbitration and class waivers: it prices the act of refusing a lowball settlement.
35. **Mass arbitration has a third countermeasure and a third mechanism.** Zoom throttles (finding 17),
   Walmart batches (finding 17), and Snap **voids**: "A Pre-Arbitration Demand brought on behalf of
   multiple individuals is invalid as to all", compliance is a condition precedent, the arbitrator
   *shall dismiss*, and Snap holds a separate judicial route to have the arbitration thrown out on that
   ground. Three companies, three mechanisms, one target.
36. **Finding 7 is mis-scoped: the do-not-contact override is not an Indian-sector practice.**
   Snapchat's terms, in *both* editions, take consent to message users "even if your mobile phone
   number is registered on any state or federal Do Not Call list, or international equivalent." Four
   Indian platforms plus a US one. The countable category is "consent clause overriding a statutory
   do-not-contact registry" — rewrite finding 7 accordingly.
37. **Finding 3 is undercounting because it was scoped to privacy policies.** LinkedIn is a fourth
   company building records of people who never signed up — ad ID, IP, OS and browser data from devices
   "where you have not engaged with our Services", outside undefined "Designated Countries" — and it
   discloses this in its **cookie policy**. A sweep of the corpus's cookie policies for non-user
   collection is warranted before pass 2 counts anything here.
38. **The corollary the rubric has no slot for: signing out is not an exit either.** LinkedIn logs a
   logged-out member's browsing "until the expiration of the cookie", and gives no cookie durations
   anywhere, so the period is unknowable from the document. Non-user collection and post-logout
   collection are two halves of one category — tracking that survives the user's own withdrawal.
39. **The administrator boundary leaks into the personal account.** Microsoft: "If you use a work or
   school email address to create a Microsoft account, your organization may access your data
   associated with your Microsoft account." Every prior instance of the administrator category was
   scoped to the managed account; this one reaches a *personal* account because of an address chosen
   years earlier. Microsoft also adds an ISP-created "third-party account" where the provider can
   access or delete the account outright.
40. **A quantified silence is a finding, and only a whole read produces one.** The word "sell" appears
   **once in Microsoft's 213,097-character privacy statement** — "not sell or rent student personal
   data", K-12 only. A statement that long never says whether adult consumer data is sold. This is the
   direct payoff of the no-truncation rule.
41. **Presence/absence is the wrong shape for the AI-training opt-out, and the corpus now has all three
   states.** X grants the training right inside the content licence, again for its own models and a
   third time for third-party collaborators, with **no opt-out anywhere** — and §3.2 conditions
   third-party training on the words "If you do not opt out" without ever naming, locating or linking
   one. Microsoft has a *scope mismatch*: the general training clause carries no opt-out, while the
   opt-out that exists covers Copilot conversation data in some markets. Recorded `present` with the
   limitation named, but pass 2's binary will flatten it. Microsoft's Copilot Health is the
   counter-case — expressly not used for training or advertising.
42. **Finding 8 needs a sixth tier: perpetuity achieved by survival rather than by adjective.** X's
   content licence never says "perpetual" or "irrevocable"; the survival clause carries the licence
   past termination instead. It reads milder than TikTok and lands in the same place. X also sits at
   *both ends* of the gradient at once — its feedback clause is the mildest tier in the corpus, pure
   disclaimer, while its content licence is top-tier.
43. **One hash, two contracts, and the split is where the protections live.** X's terms carry the
   US/RoW edition and the EU/EFTA/UK edition on one page, diverging on termination grounds ("any other
   reason or no reason at our convenience" vs five enumerated grounds), notice (30 days vs "we will try
   to notify you"), and the liability cap ($100 vs none). **The EU licence alone promises to respect a
   user's choice to restrict distribution** — protected posts are a product feature everywhere and a
   contractual commitment only in Europe. Snapchat's terms do the same across Snap Inc. (US) and Snap
   Group Limited, diverging on licence duration, grounds for deletion, moral rights and dispute route.
   Finding 13's shape, inside a single document.
44. **A safeguard scoped to a regulator's territory — finding 1 inverted.** X does not store off-X
   browsing history for users in the EU, Iceland, Liechtenstein, Norway or Switzerland, and stores it
   by default for everyone else. Findings 1 and 22 recorded a collection and a disclosure stopping at a
   border; this is a *protection* that does.
45. **A counter-notice route can exist and still be converted from a right into a discretion.**
   TikTok's removed content is deleted after "a period of time" that is never quantified and then "can
   no longer be reinstated", and reinstatement is "at TikTok's sole discretion" — the DMCA §512(g)
   put-back obligation turned into a favour. **No designated DMCA agent, address, phone or email
   appears anywhere in the document**, which §512(c)(2) requires and LinkedIn publishes. TikTok also
   forwards the entire appeal including contact details to the claimant and states the claimant may use
   it to sue you.
46. **Cookie tables now disclose B2B de-anonymisation.** ZoomInfo, Clearbit, Demandbase and Madison
   Logic appear in Stripe's advertising list with their purpose stated: identify which company is
   visiting, enrich form submissions with firmographic data, track visits at account level. Not
   tracking — resolution of an unauthenticated visitor to their employer. No rubric category covers it.
47. **Ancillary documents age out while the terms they attach to move on.** eBay's cookie notice is
   self-dated 23 Feb 2022 while the User Privacy Notice it must be read with is 21 Apr 2025 and the
   User Agreement 28 Jun 2026. Second instance after Amazon's Jan 2020 cookie notice. Amex's KYC page
   carries no date, effective date or version marker at all — worse than a stale date, because there is
   nothing to compare against.

## Capture-quality notes found during pass 1

- **The normalizer is not stripping markup on hdfc.bank.in.** `corpus/text/b48d44d5….txt` carries raw
  HTML attributes (`data-font-size`, `data-line-height`) inline. The hash is stable either way, so the
  client will still match it, but the text is degraded for any downstream analysis. Worth checking
  whether other captures share the pattern before pass 2.
- **A document can announce its own replacement.** Dropbox's terms open with a banner saying the
  Terms of Service change effective 1 January 2027, and link the successor. The captured text is
  the 7 January 2025 version, so the hash is correct and will simply stop matching on that date.
  It is a clean illustration of why the hash is the version — but also of a gap: the corpus has no
  way to record that an analysis has a known expiry, and a user reading it on 2 January 2027 gets
  "not analysed" with no hint that a newer document exists.
- **Canva's Indian editions claim to be AI-translated, in English.** Both `canva.com/en_in/` documents
  open with "This page has been AI-translated... The official English version prevails to the extent of
  any inconsistency." The captured text is English throughout. Harmless here, but it means a served
  page can carry a machine-translation disclaimer that does not describe it — worth knowing before any
  future locale work treats that banner as a signal.
- **One hash can cover more than one document.** Stripe's privacy policy carries a full Hindi
  translation of itself under the same hash, so an English-only rendering of the same policy would
  hash differently. MakeMyTrip's privacy page carries three policies (India, EU/UK/US, MyBiz) and
  Paytm's terms carry every product's terms at once. This is the mirror of the Meta en-GB/en-US
  finding: there, one policy produced two hashes; here, several policies share one.

## Two documents a content hash cannot serve — decide before the seed

Both surfaced in the final batch, and neither is fixable by better analysis.

- **`665e157e` (stripe.com cookie) hashes transient UI state.** Its first three lines are two
  mutually contradictory banner states — "This link has expired. Please start a new opt-out
  request." and "You have successfully opted out of data sharing with advertising platforms." It is
  a live preference manager, not a static policy. A client re-deriving the hash on a real visit will
  almost certainly see different banner text and **miss the lookup entirely**. This may be a class
  of URL (`*/cookie-settings` and similar) that hash-based matching structurally cannot serve.
- **`01af0ece` and `7dcf6330` (snapchat.com) are not yet in force.** Both are "Effective: September
  21, 2026" and both open with a banner saying the prior version applies until then; capture ran 4
  September 2026. The corpus holds the *successor*, so a Snapchat user today hashes to a document
  the corpus does not have, and a perfectly good analysis sits unused. This is the exact inverse of
  the Dropbox note, where a document announced its own replacement. Same missing concept from the
  other side: **an analysis needs a validity window, not an implicit "now."**

Check whether any other capture is future-dated before generating `policy-seed.json`.

**Raised as a ticket:** `execution-docs/site-policy-scope-metadata-ticket.md` — validity window and
jurisdictional scope as two optional, evidence-gated fields. Both are free to add now and breaking
after first publish, so they sit in the same window the seven Part 4 schema changes did. The
jurisdiction half is driven by the same evidence: findings 1, 22, 30, 43 and 44, plus the one-hash
-two-contradictory-editions problem in x.com, snapchat.com and ebay.com.

## Vocabulary — canonicalise again before pass 2

100 distinct names over 698 records. The parallel run added coinages faster than a single-threaded
pass would have: seven new names across six analysts, each individually defensible.

New this batch, all flagged in their own notes: `Effect of termination on connected third-party
sign-ins`, `Consequences of account restriction for user content`, `Treatment of funds on account
termination`, `Conflict of interest management policy`, `Custody and segregation of customer
assets`, `Treatment of customer assets in insolvency`, `Do Not Track response disclosure`.

Pre-existing drift that was never merged, and should be now:

- `Automated decision-making rights` (9) · `Rights over automated decision-making` (4) ·
  `Automated decision-making disclosure` (2) · `Automated decision-making rights outside Quebec` (1)
- `Repeat infringer policy` (5) · `Repeat-infringer policy threshold` (1)
- `Refund and cancellation rights` (11) · `Refund and cancellation policy` (2)
- `Biometric data consent` (3) · `Biometric information consent` (1)
- four cookie-category spellings: `Categories of cookies and their purposes`, `Cookie categories and
  retention periods`, `Cookie duration and purpose detail`, `Purposes for which cookies are used`

Merge only unambiguous synonyms, as `a0ecba9` did. `Automated decision-making rights outside Quebec`
is narrower and stays distinct; the cookie spellings are not all the same question.

**Then the harder problem remains unchanged:** a canonical name still records what each analysis
found worth recording, not a systematic checklist, so silence is not absence. That is what the
clause vocabulary has to fix, and it is the only thing standing between here and pass 2.

## Capture quality — three patterns, not one-offs

The single-analyst passes recorded these as isolated notes. With 83 documents read they are
patterns, and two of them corrupt exactly what pass 2 computes over.

1. **Accordion doubling — at least four instances.** Microsoft's privacy statement was captured with
   *Expand All* on, so ~15–20 paragraphs render twice (collapsed summary plus expanded detail);
   x.com's cookie notice renders its four section headings twice; x.com's privacy policy duplicates
   §7 "X's Audience" verbatim; linkedin.com's AUP repeats its section headings in a hero block.
   Hash-stable and harmless to a reading, but it inflates `normalizedLength` and would produce false
   duplicate-block hits in any diff. **Sweep the accordion-style captures (Netflix, Zoom) before
   anything computes over block counts.**
2. **Markup leaking into normalized text — second and third instances.** x.com's cookie notice opens
   with ~600 characters of raw SVG path data and `data-*` attributes before the first heading, the
   same class as the recorded hdfcbank.in defect. Walmart's regulatory disclosure carries the full
   corporate nav twice plus `#f2f2f2` and a stock-ticker line; eBay's cookie notice carries
   help-centre search chrome and related-article blurbs. The normalizer needs a look.
3. **One hash covering several documents — now five instances.** Stripe privacy (Hindi translation),
   MakeMyTrip (three policies), Paytm (every product's terms), plus two new and higher-stakes ones:
   `e3c3ba23` (x.com terms — US/RoW *and* EU/UK editions that **contradict each other** on
   termination, notice and the liability cap) and `3df9b323` (ebay.com — US States and California
   notices). Where the editions diverge, a per-hash claim must say which one it describes; both
   analysts named the edition in every affected exposure and note.

Two more, lower stakes but worth knowing:

- **`4e98cb9d` (linkedin.com cookie) carries unfilled CMS placeholders** — the literal strings
  `ENTER A SUMMARY` and `ENTER SUMMARY` where the policy promises plain-language summaries of its
  tables. Recorded as *what the captured text carries*, not asserted about LinkedIn's live page.
  **Confirm against live before this ships** — it is a claim about a real company.
- **Snap's own HTML spaces its email addresses** (`arbitration-opt-out @ snap.com`) as an
  anti-scrape measure — verified against `corpus/raw/`, not a normalizer bug. Harmless for hashing,
  but any contact extraction over the corpus will miss them, and that address is the one a user most
  needs to act on.

## Still open from the original plan

- **The seven schema changes are applied** (verticals[], four new docTypes, normalizerVersion,
  surfaces, domains[], peer set on deviations). Two discovery bugs were fixed as a consequence:
  the `\s*`-versus-hyphen bug in `guessDocType`, and `policy` missing from `POLICY_LINK_PATTERN`.
- **Pass 2 (peer baselines) not started.** Minimum-N is 10, applied per tag *and* per docType
  (D2), over **analysed** sites. Coverage is now total — every document in the corpus is analysed —
  and exactly three of eight pairs publish: `payments_fintech`/privacy (11), `ecommerce`/terms (10),
  `subscription_autorenewal`/terms (10). `finance_banking` cannot reach 10 on this corpus at any
  coverage. Analysing the last 21 changed none of it, which is the gate working. The blocker is that
  no clause key exists to compute a share over.
- **Packaging not started.** `policy-seed.json` still holds RFC 2606 reserved domains only. The
  open question there is Part 1's: one risk byte per domain, worst or aggregate.
- **Retry list from capture** — 6 zero-link sites plus youtube.com, untouched.

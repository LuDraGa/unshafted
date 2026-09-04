# Site Policy Awareness — Part 4: Analysis

**Status: not started.** Written as a handoff at the end of the Part 3 capture session, so a new
session can start work without re-deriving anything.

## Input

`corpus/curated.json` — **85 documents, 36 domains, 4,371,569 normalized characters.** Built by
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

## Blocking prerequisite — the schema must change first

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

- [ ] Approve and apply the seven schema changes
- [ ] Pass 1 — per-document analysis of all 85
- [ ] Pass 2 — peer baselines for the four tags that clear N=10
- [ ] Decide worst-vs-aggregate for the index risk byte
- [ ] Generate `policy-seed.json` from real analysis
- [ ] Manual test pass over the 24 fully-testable domains

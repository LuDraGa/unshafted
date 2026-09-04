# Site Policy Awareness — Part 4: Analysis

**Status: pass 1 in progress — 34 of 83 analysed, 28 of 40 in the priority subset.**
Resume from "How to resume" below. Live status page: https://claude.ai/code/artifact/da53d135-e641-46c2-b3c7-37b99b1bccff

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

---

## How to resume

Everything is committed on `feat/site-policy-corpus-capture`. Nothing is in flight.

```
nvm use
node --import tsx tools/corpus/validate-analysis.ts          # progress + integrity
node --import tsx tools/corpus/validate-analysis.ts --todo   # what is left, with paths
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
| Analysed | 34 of 83 |
| Priority subset | 28 of 40 |
| Risk | Medium 7 · High 22 · Very High 5 |
| Exposures | 222 (98 high severity) |
| Actions recorded | 144 |

### Remaining in the priority subset

| Domain | Type | Chars | Hash |
|---|---|---|---|
| paytm.com | `terms` | 294,737 | `0d82e1a0` |
| booking.com | `terms` | 170,114 | `fc60f015` |
| stripe.com | `privacy` | 161,486 | `fd42eb7f` |
| flipkart.com | `terms` | 149,663 | `6bc14ba2` |
| hdfcbank.com | `privacy` | 147,381 | `b48d44d5` |
| makemytrip.com | `terms` | 140,519 | `7292c997` |
| zomato.com | `terms` | 136,640 | `13137974` |
| doordash.com | `terms` | 136,335 | `51e9b28e` |
| paypal.com | `privacy` | 119,960 | `4f437c00` |
| paypal.com | `terms` | 90,570 | `dc62c4d1` |
| makemytrip.com | `privacy` | 83,176 | `1e80ec13` |
| booking.com | `privacy` | 74,379 | `8e40cf40` |

`paypal.com/terms` was part-read when the session ended; nothing was written for it, so start it
fresh. Its notable clauses so far: 14 days' notice for changes that reduce your rights, payment
card details auto-updated from third-party sources without your action, credit report pulled on
business accounts at opening and whenever PayPal perceives risk, account closure blocked while
under hold or investigation, and Buyer Protection decided at PayPal's sole discretion with the
original determination final.

### Most-repeated absent disclosures

| Disclosure | Documents |
|---|---|
| Retention period | 12 |
| Notice of changes to terms | 5 |
| Do Not Sell or Share My Personal Information | 4 |
| Named Grievance Officer | 4 |
| AI training opt-out | 3 |
| Grievance Officer | 3 |
| Consent mechanism for non-essential cookies | 2 |
| Biometric data retention | 2 |

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
6. **One policy, many hashes.** Facebook and Instagram serve the identical Meta policy in en-GB
   and en-US and hash differently — see Part 3, finding 13. The corpus needs a document-identity
   concept above the hash.

## Still open from the original plan

- **The seven schema changes are applied** (verticals[], four new docTypes, normalizerVersion,
  surfaces, domains[], peer set on deviations). Two discovery bugs were fixed as a consequence:
  the `\s*`-versus-hyphen bug in `guessDocType`, and `policy` missing from `POLICY_LINK_PATTERN`.
- **Pass 2 (peer baselines) not started.** Minimum-N is 10; on current coverage `ecommerce`,
  `subscription_autorenewal`, `payments_fintech` and `finance_banking` clear it and `saas`,
  `social_ugc`, `ott_streaming` and `identity_provider` do not.
- **Packaging not started.** `policy-seed.json` still holds RFC 2606 reserved domains only. The
  open question there is Part 1's: one risk byte per domain, worst or aggregate.
- **Retry list from capture** — 6 zero-link sites plus youtube.com, untouched.

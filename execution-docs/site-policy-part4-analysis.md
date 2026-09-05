# Site Policy Awareness — Part 4: Analysis

**Status: pass 2 started. 46 of 83 analysed; the priority subset is complete, but it did not
unblock pass 2 — see "Pass 2" below for the 16-document coverage gap now being closed.**
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
- [~] Pass 1 — 46 of 83 done; the 40-document priority subset is complete
- [ ] Pass 2 — peer baselines for the four tags that clear N=10
- [ ] Decide worst-vs-aggregate for the index risk byte
- [ ] Generate `policy-seed.json` from real analysis
- [ ] Manual test pass over the 24 fully-testable domains

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

### Blocking queue — 16 documents, 931,535 chars

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
| canva.com | privacy | `15da0f5a` | 63,333 | [ ] |
| zoom.us | terms | `f57c6574` | 87,356 | [ ] |
| walmart.com | terms | `f5977930` | 90,565 | [ ] |
| ebay.com | privacy | `530c8a6d` | 123,654 | [ ] |
| ebay.com | terms | `e33c29e5` | 130,676 | [ ] |

### Then: the clause vocabulary

`peerShare` needs a clause key, and neither existing field is one.

- **`exposures[].title` is unusable.** 346 exposures carry 339 distinct titles. They are written
  as findings about one document, not as labels from a shared vocabulary. The seven repeats are
  Meta's en-GB/en-US pair hashing twice (finding 6).
- **`requiredDisclosures[].name` is close but not sufficient.** 276 records, 92 names after the
  `a0ecba9` canonicalisation, with an explicit present/absent/not_applicable status — it is the
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
| Analysed | 46 of 83 |
| Priority subset | **40 of 40 — complete** |
| Risk | Medium 8 · High 30 · Very High 8 |
| Exposures | 346 (179 high severity) |
| Actions recorded | 263 |

### Remaining

Nothing in the priority subset. The 37 outstanding documents are cookie, copyright, acceptable-use
and regulatory disclosures, plus terms and privacy for the domains that are not testable in-page —
canva.com, google.com, microsoft.com, netflix.com, snapchat.com, walmart.com, zerodha.com — and the
partials at bankofamerica.com, dropbox.com, ebay.com, x.com and zoom.us.

**Pass 2 is now unblocked.** All four tags that clear the minimum-N of 10 (`ecommerce`,
`subscription_autorenewal`, `payments_fintech`, `finance_banking`) draw their members from the
priority subset, so the peer baselines can be computed on a complete set for those four.

### Most-repeated absent disclosures

| Disclosure | Documents |
|---|---|
| Retention period | 16 |
| Named Grievance Officer | 13 |
| Notice of changes to terms | 12 |
| AI training opt-out | 7 |
| Consent withdrawal mechanism | 5 |
| Consent mechanism for non-essential cookies | 5 |
| Rights over automated decision-making | 5 |
| Do Not Sell or Share My Personal Information | 4 |

Counts are after canonicalising the `name` field. It is free text, and 36 documents of hand-written
analysis had drifted into synonyms — the grievance-officer requirement was recorded under three
spellings, notice-of-changes under eight. Pass 2 computes what fraction of a peer set carries a
clause, and a clause split across three names divides its own share, so the published number would
have been wrong in the direction that flatters the companies. Only unambiguous synonyms were merged;
narrower disclosures (fee-change notice, granular cookie consent, Quebec-scoped ADM rights) were left
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
8. **The ideas-become-our-property boilerplate is now at seven, and it has a gradient.** HDFC Bank,
   American Express India, Zomato, Paytm, Netflix, Dropbox and Canva. Two are outright *assignments* of
   title — Paytm and Canva. Netflix takes a perpetual worldwide licence with a moral-rights waiver.
   Dropbox merely disclaims obligation. Google carves feedback out of its content licence entirely and
   handles it in a single sentence. So the clause is near-universal but its severity spans four distinct
   drafting choices, which is exactly the shape a peer baseline should measure: not whether the clause
   is present, but where on the gradient it sits.
9. **Two travel agencies hand the hotel the same guest scorecard.** Booking.com and MakeMyTrip both
   disclose to the property whether the account is verified, the number of completed bookings, the
   percentage cancelled, and — phrased as an absence — whether misconduct has ever been reported. The
   wording is close to identical. The rubric had no category for a reputation score disclosed to a
   third party the user has no relationship with.
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
- **One hash can cover more than one document.** Stripe's privacy policy carries a full Hindi
  translation of itself under the same hash, so an English-only rendering of the same policy would
  hash differently. MakeMyTrip's privacy page carries three policies (India, EU/UK/US, MyBiz) and
  Paytm's terms carry every product's terms at once. This is the mirror of the Meta en-GB/en-US
  finding: there, one policy produced two hashes; here, several policies share one.

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

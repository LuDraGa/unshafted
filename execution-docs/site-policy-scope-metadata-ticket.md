# Site Policy Awareness — Scope Metadata: Validity Window & Jurisdiction

**Status:** Ticket — open on its merits, **no longer blocking the seed.** See "Unblocked" below.
**Scope grew 2026-09-06:** three fields now, not two — validity window, jurisdiction, and a
`DeadlineKind` that names its anchor (§1b, evidence measured in Part 5 W4).
**Date raised:** 2026-09-05
**Owner:** @LuDraGa
**Parent:** `execution-docs/site-policy-part4-analysis.md`
**Blocks:** ~~`policy-seed.json` generation~~ (released — see "Unblocked"); still blocks the first
CDN publish, because both fields are breaking to add after it

---

## Unblocked — 2026-09-06

**This ticket no longer gates `policy-seed.json`.** Part 5
(`site-policy-part5-side-panel.md`) settled the question that made it a blocker.

The blocking claim was that a per-domain risk byte cannot be honest over Snapchat (not yet in
force), Dropbox (announces its own expiry) or x.com (one hash, two contradictory editions). Part 5
D1 keeps the byte but restates what it asserts: **the worst document on this site**, not a
description of the site. That is true of x.com under either edition, and D3 pushes every precise
claim down to the document, where the corpus can support it.

The two time cases resolve themselves through AD-1, with no schema change:

- **Snapchat** — a user today hashes the in-force document, misses, and gets "changed since we read
  it" (Part 5 D6/D7). Correct. On 21 September 2026 the hash starts matching and the analysis is
  right. The work is not wasted, only early.
- **Dropbox** — the same mechanism in reverse on 1 January 2027.

One document is genuinely unservable and is excluded from the bundle and the seed rather than
ticketed: **`665e157e` (stripe.com cookie)** hashed transient banner state, so its hash can never
match what a real user's page produces.

**What stays open, and why it still matters:** both fields are still free before Part 2 publishes
and breaking after, and the within-document edition split (question 1 below) is unanswered — Part 5
labels both editions and declines to choose, because choosing needs the user's legal residence and
that is not a question this product should ask. Do this work before the CDN goes live, not before
the side panel ships.

---

## The problem, in one sentence

A published `SitePolicyAnalysis` claims to describe "this document" with no statement of **when**
it applies or **where** it applies, and pass 1 found real documents where both are wrong.

Every analysis currently carries an implicit "now, everywhere." Both halves of that are false for
documents already in the corpus.

---

## Evidence from pass 1 — this is not hypothetical

### Time

- **`01af0ece` / `7dcf6330` (snapchat.com terms + privacy) are not yet in force.** Both are
  "Effective: September 21, 2026" and open with a banner saying the prior version applies until
  then. Capture ran 4 September 2026. The corpus holds the **successor**: a Snapchat user today
  hashes the *current* document, misses the lookup, and is told "not analysed" while a complete,
  correct analysis of the incoming document sits unused two weeks from being right.
- **Dropbox terms are the inverse.** The captured 7 January 2025 text opens with a banner announcing
  its own replacement effective 1 January 2027 and links the successor. The hash is correct and will
  simply stop matching on that date, with no way to record that the analysis has a known expiry.
- **`e853637b` (tiktok.com copyright)** was released 27 March 2025 and effective 26 April 2025 — a
  30-day gap between publication and commencement, disclosed on the page.
- **`a75dfac1` (americanexpress.com KYC)** carries no date, no effective date and no version marker
  at all. There is nothing to compare against.
- **`63c24cb2` (ebay.com cookie)** is self-dated 23 Feb 2022 while the privacy notice it must be read
  with is 21 Apr 2025 and the user agreement 28 Jun 2026.

Two documents, one corpus, pointing opposite directions: an analysis needs a **validity window**,
not an implicit "now."

### Place

- **`e3c3ba23` (x.com terms) is one hash over two contracts** — US/rest-of-world and EU/EFTA/UK —
  that **contradict each other**: termination "for any other reason or no reason at our convenience"
  vs five enumerated grounds; "we will try to notify you" vs 30 days' notice; a $100 liability cap vs
  none. The EU edition alone promises to respect a user's choice to restrict distribution. A single
  risk level over that hash is a coin flip between two true answers.
- **`01af0ece` (snapchat.com terms)** does the same across Snap Inc. (US) and Snap Group Limited
  (rest of world): licence duration, grounds for deletion, moral-rights waiver and dispute route all
  diverge.
- **`3df9b323` (ebay.com)** carries the US States notice (18 states) and the California notice under
  one hash.
- **`9379c60e` (stripe.com restricted businesses)** states a global neutrality principle, then
  applies eleven country lists — the US bars four categories, none civic; India bars 22, including
  charities, non-profits, religious organisations and political organisations.
- **`52809d7d` (x.com cookie)**: off-X browsing history is not stored for users in the EU, Iceland,
  Liechtenstein, Norway and Switzerland, and stored by default for everyone else.
- **`dee82681` / `71f60eed` (coinbase.com)** are served from `/en-in/` while the document states it
  is directed to US customers only and covers New York assets.
- Findings 1, 22 and 44 in the parent doc are the same shape: a collection, a disclosure and a
  protection respectively, each stopping at a border.

---

## What is being asked for

Two fields on the published object, both **optional and evidence-gated**.

### 1. Validity window

```
validity?: {
  effectiveFrom?: string      // ISO date, only when the document states one
  effectiveUntil?: string     // ISO date, only when the document announces its own replacement
  observedAt: string          // when the capture ran — always known
  basis: 'stated' | 'observed'
}
```

**Rule: if the document states a date, record it. If not, `observed` is the honest answer and the
window is open-ended.** Never infer, never default `effectiveFrom` to the capture date and present
it as stated — that manufactures a fact about a real company, which is the failure mode this whole
feature is built to avoid.

### 1b. A `DeadlineKind` that names its anchor *(added 2026-09-06, from Part 5 W4)*

A third field in the same free-now/breaking-later window, and the evidence is already measured.

`AvailableActionSchema.deadline.kind` offers `relative_to_signup | absolute | none`. **32 deadlines
in the corpus carry `relative_to_signup`, and most of them do not run from signup.** Pass 1 used it
for a window measured from *some* event: a coupon's generation, the harm occurring, a notice of
dispute served, a transaction not delivered, the next meal delivery slot, first becoming subject to
an arbitration agreement.

Part 5 D14 fixed the rendering by dropping the invented anchor and falling back to the document's
own wording. That is honest but lossy — the client cannot group, sort or clock these actions
without knowing what the window is measured from, and the arbitration opt-out clock is the single
most concrete thing this feature was supposed to do.

```
deadline: {
  kind: 'relative' | 'absolute' | 'none'
  anchor?: 'acceptance' | 'first_subject_to_clause' | 'notice_served' | 'event_occurred'
         | 'transaction' | 'issuance' | 'other'   // only when the document states it
  days?: number
  description: string
}
```

Same rule as the other two fields: **record what the document states, never infer.** `other` plus
the stated wording is the honest answer where the anchor is not named, and it must never be
rendered as though it were `acceptance`.

Backfill cost is real — the anchor has to be read back out of 32 `description` strings that already
contain it in prose.

### 2. Jurisdictional scope

```
jurisdiction?: {
  scope: 'global' | 'scoped'
  applies?: string[]          // ISO 3166 / 'EU' / 'EEA' — only when the document says so
  excludes?: string[]
  basis: 'stated' | 'inferred_from_url' | 'unknown'
}
```

Same rule, and the same trap. `/en-in/` in a URL is **not** evidence a document applies to India —
Coinbase is the counterexample already in the corpus. `inferred_from_url` exists so that a weaker
basis can never be displayed as a stated one.

The harder case is the **within-document split** (x.com, snapchat.com, ebay.com): one hash, two
editions, contradictory terms. That is a document-identity problem, not a metadata problem, and the
POC has to say whether it is solved by scoping the *analysis* or by splitting the *document*.

---

## Questions the POC has to answer

1. **Does the client have enough to pick an edition?** The extension knows the page URL and the
   user's locale. It does not know the user's legal residence, and asking for it is a privacy cost
   on a product whose whole pitch is zero network and no browsing history. Is edition selection
   even answerable client-side, or does the honest answer surface **both** and say which is which?
2. **What does the badge do with a scoped analysis?** The index byte holds one risk level. x.com's
   two editions do not share one. This is Part 1's open question 2 (worst vs aggregate) arriving on
   a second axis — and finding 21 (Walmart asserting contradictory facts across two documents)
   already argues that aggregation averages a contradiction into a number describing neither.
3. **What does the client do with a not-yet-in-force analysis?** Options: hide it (today's
   behaviour, and it wastes real work), show it as "takes effect 21 September", or show it and offer
   a diff against the current document. The third is the most useful and the most expensive.
4. **Does a validity window need re-capture, or can it be derived?** `effectiveUntil` is usually
   stated in a banner on the page. If pass 1's analyses recorded it in prose, it may be extractable
   without re-capturing 83 documents.
5. **How does this interact with the content hash as the version?** AD-1 says the hash IS the
   version. A validity window does not replace that — it explains why a *correct* hash may still be
   the wrong document to show today. Confirm the two do not fight.

---

## Cost and timing

**Both fields are free right now and breaking later.** `CEB_POLICY_CDN_URL` is unset, nothing is
published, and Zod 3's `z.object` strips unknown keys — so adding them is additive today and a
schema migration after first publish. This is the same window the seven Part 4 schema changes were
made in, and the same reason they were made then.

**Do not generate `policy-seed.json` before this is settled.** Snapchat would seed a risk level for
a document no user's page matches, and x.com would seed one number over two contradictory contracts.

---

## Definition of done

- [ ] POC written up: answers to the five questions above, with a recommendation per field
- [ ] Decide whether the within-document edition split is a metadata problem or a document-identity
      problem
- [ ] Schema changes drafted and approved (still free — check `CEB_POLICY_CDN_URL` is unset first)
- [ ] Backfill pass over the 83 analyses: stated dates and stated jurisdictions only, `unknown`
      everywhere else
- [ ] Sweep for other future-dated or expiring captures before the seed is generated

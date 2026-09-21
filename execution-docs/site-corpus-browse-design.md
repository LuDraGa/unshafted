# "What we've read" — browse view design pass

**Status:** Design settled, nothing built. Written 2026-09-22 against the corpus as it stands
(82 analyses, 37 domains, `formatVersion` 1).
**Read this with:** `site-policy-part5-side-panel.md` (D1–D16, the panel's settled design) and
`site-policy-part5-handoff.md` §3, which is where this view was first argued for.

The panel can show you the site you are on. It cannot show you a site you are *not* on — which the
handoff argues is when the information is worth most, because that is the moment before you sign up.
This is the design for that surface, and the reason it is a document rather than a component is that
**the corpus does not support the obvious layout**, and finding that out after writing the component
is the expensive order.

---

## What the data forces

Every number below is computed from `chrome-extension/public/policy-corpus.json` as it currently
ships, not estimated.

### 1. Absent disclosures cannot be a section, because almost everything is in it

| | |
|---|---:|
| domains with at least one disclosure found absent | **35 of 37** |
| domains with a clocked action | 19 of 37 |
| domains with neither | 1 (`reddit.com`) |

The proposed organisation was *deadline first, then missing-disclosure, then a quiet list*. Run
against the real corpus that produces sections of **19, 16 and 2** — and the middle section is not a
finding, it is the default. 95% membership is not a signal.

This is the badge problem one column over, and the handoff already names it as the open worry about
the badge: *"red on 36 of 37 domains… whether a user learns anything after week one, or stops seeing
it."* A section that nearly everything qualifies for teaches nothing, and building one would
reproduce a failure the project has already written down.

**What does vary is the count**, and it varies a lot:

| distinct disclosures found absent | domains |
|---|---:|
| 0 | 2 |
| 1–3 | 8 |
| 4–7 | 20 |
| 8+ | 7 |

`x.com` at 15 against `apple.com` at 1 is a real difference. Which is a trap of its own — see §3.

### 2. The clock is the one boolean that splits the corpus

19 of 37, close to even, and it is the only property in the manifest that divides the list into two
halves a reader could care about differently. It is also the only thing in the corpus that is
**actionable and can expire** — the handoff's complaint that *"a deadline you can still act on is the
most actionable thing in the corpus and it currently reads as body text"* is answered here or
nowhere.

The predicate is not "has a deadline object". `hasTimeSensitiveAction` in `corpus-bundle.ts:91`
excludes `kind: 'none'`, which exists for windows that are described but unbounded. Counting deadline
objects instead gives 22 domains and is wrong — `americanexpress.com` has four, all unbounded.
Cross-checked the seed's flag against the corpus for all 37 domains: **zero mismatches**, so
`policy-seed.json` is a trustworthy source for this field and does not need recomputing.

### 3. Three things the view is not allowed to say

**"Live", "still open", "expiring".** A `relative_to_signup` window needs the date the reader
accepted, and we do not have it. D14 exists because inferring an anchor got done once already. The
section can say the document *names* a window; it cannot say whether yours has closed.

**Any tally that reads as a total.** From the handoff's standing rules: `requiredDisclosures` records
*what each analysis found worth recording*, not a systematic checklist — **silence is not absence**.
So "10 disclosures missing" is a lower bound on findings, not a measurement of the document, and
rendering it beside another domain's "1" invites a comparison the data cannot support. This is a
claim about a real company, which is the category the corpus rules are strictest about.

**Anything shaped like a leaderboard.** Which follows from the above, and is worth stating separately
because "worst offenders, ranked" is the most attractive thing you could build from this data and it
is not supportable.

### 4. Risk stays off the list, and the corpus agrees

High 27, Very High 9, Medium 1, Low 0. Colouring 37 rows along a ramp where 36 land on two adjacent
steps is noise with a legend. Risk colour stays on the document cards, where a grade is attached to
the document that earned it.

---

## The shape

### Two jobs, and search is the one that wins

**Lookup** — *"I'm about to sign up for X."* Wants a search field and a flat list.
**Discovery** — *"what have you actually read?"* Wants structure that says something, because it is
the free-without-a-key evidence that this extension has substance.

Search is primary: it is the job the handoff argues for, and at 37 rows it resolves in one keystroke.
The structure exists for the reader who has not typed anything yet.

```
┌─ header ──────────────────────────────────────────────────┐
│ What we've read                                     ✕     │
│ 82 documents across 37 sites. Nothing here is live —      │
│ these are the versions we read, on the dates shown.       │
├───────────────────────────────────────────────────────────┤
│ ⌕ Find a site                                             │
├───────────────────────────────────────────────────────────┤
│ SOMETHING YOU CAN STILL DO                          19    │
│ These name a window — an opt-out, a refund, a deadline    │
│ to object. Whether yours is open depends on when you      │
│ signed up.                                                 │
│                                                            │
│   amazon.com                            3 documents       │
│   canva.com                             2 documents       │
│   dropbox.com                           2 documents       │
│   …                                                        │
├───────────────────────────────────────────────────────────┤
│ EVERYTHING ELSE                                     18    │
│                                                            │
│   americanexpress.com                   4 documents       │
│   apple.com                             1 document        │
│   …                                                        │
└───────────────────────────────────────────────────────────┘
```

**Typing dissolves the groups.** A query produces one flat result list — grouping is an answer to
"show me something interesting", and a reader who typed `zer` has already said what is interesting.

**Alphabetical inside each group.** Not by document count (meaningless to a reader), not by absent
count (§3), not by risk (§4). Alphabetical is the only ordering that makes scanning work and claims
nothing.

**The second group gets a heading and no explanation.** "Everything else" is deliberately flat — the
absence of a named window is not a finding about the site, and dressing it up as one would be the
same error as the missing-disclosure section.

### The row

```
ebay.com                                        4 documents
```

Plain text, `.panel-row`, a document count in the panel's existing idiom (`N documents read.` is
already the header's phrasing). **No risk pill, no gap count, no severity colour.** Opening a row
replaces the browse list with that domain's existing `DocumentCard` stack.

The gap count does not render, and that is the §3 constraint doing its job. Where an absent
disclosure *does* render is where it already renders: inside the opened document, named, with its
regime, one row per finding. Named findings are honest; a tally is not.

### Getting in, and getting back

Three entry points, in descending order of how well they fit:

1. **`NoSiteView`** — `chrome://`, `file://`, a new tab. The panel currently says "This is a browser
   page, not a website" and then has nothing to offer. It is the only surface in the product that is
   deliberately empty, and D13's sticky availability means *"one navigation away from every
   session"*, in its own words. Best entry point in the product and the one the original sketch did
   not list.
2. **`UncoveredView`** — the reader has just been told we have not read this site. "Here is what we
   have read" is the correct next sentence.
3. **The panel header**, on every surface including covered ones. Smallest and most discoverable;
   also the one that has to fight for space against the domain name.

**Back** returns to the tab-driven view, whatever it is by then.

### Browse owns the whole surface, and survives navigation

This is the structural decision, and it follows from D13 rather than from taste.

The panel's three existing views are all functions of the active tab. Browse is not — it is a mode
the reader entered on purpose. If a background navigation yanked them out of it, the panel would be
closing itself mid-sentence, which is precisely what D13's sticky availability exists to prevent.

So **browse replaces the whole panel, header included**, and persists until the reader leaves it. It
cannot render under a header naming a site it is not about.

---

## The data it reads

### A third bundled artifact, ~650 bytes gzipped

`tools/corpus/build-bundle.ts` already emits two files from one read pass. A third joins them:

```jsonc
// chrome-extension/public/policy-browse.json
{
  "formatVersion": 1,
  "domains": [{ "domain": "amazon.com", "documentCount": 3, "hasTimeSensitiveAction": true }]
}
```

Measured on the current corpus: **3,412 bytes raw, 646 gzipped.** Three fields, because three fields
are what the view renders. `worstRiskLevel` is not among them (§4) and neither is an absent count
(§3) — and #79 is the standing precedent for not shipping a field with no consumer, having deleted
six tokens for exactly that.

`hasTimeSensitiveAction` keeps the name it already has in `policy-seed.json` and `corpus-bundle.ts`.
One property, one spelling — this is #82's lesson and it costs nothing to apply up front.

**Why not just extend `policy-seed.json`?** It is two thirds of this file already, and adding
`documentCount` would finish it. But the seed's stated contract is *"Build input for the bundled
domain-coverage index"* — it is consumed at build time by `make-policy-index-plugin.ts` and does not
ship. Making it a runtime artifact overloads a build input with a rendering contract and a format
version it does not have. 646 bytes is not worth that, so the seed stays a build input. Worth
revisiting only if a third consumer appears.

**Enumeration has to be derived, not read.** Nothing in `corpus-bundle.ts` enumerates — every query
is keyed to one site. And `policy-index.bin` cannot be the source: its records are 8-byte
`sha256(domain)` prefixes (`index-format.ts:17`), which are one-way by construction. The build pass
derives the manifest from the analyses it is already holding, using the existing
`hasTimeSensitiveAction`.

**No new network, permissions or meaningful weight.** A bundled asset read through
`chrome.runtime.getURL`, like the other two.

### The lazy split, and where it actually pays

`loadBundledPolicyCorpus()` stays lazy. Browse reads only the manifest; opening a domain triggers the
corpus parse and lands in `DocumentCard`.

Worth being precise about what that buys, because on a covered site it buys nothing — the panel has
already parsed the corpus to render the page you are on, and `corpusPromise` caches it for the life
of the document. The manifest pays off exactly on `UncoveredView` and `NoSiteView`, where the corpus
has never been parsed. Which is where two of the three entry points live, so the split is worth
having; it is just not a general-purpose saving.

### Privacy: nothing changes, and the domains are already shipped

The hashing in `policy-index.bin` is a **compactness** decision — fixed 9-byte records and a binary
search, sized to stay under 256 KB at 5,000 domains (`index-format.ts`). The privacy-motivated
hashing is the CDN path `/d/{sha256(domain)}.json`, so a server cannot observe which site a reader is
on. A bundled manifest observes nothing, ships identically to everyone, and lists domains that
`policy-corpus.json` — 1.08 MB of verbatim analyses — already carries in plaintext. The badge path
still makes no network call, and browse adds none.

---

## Considered and rejected

**Browse by what is missing.** `Retention period — found missing on 28 sites`, `Notice of changes —
20`, `Named Grievance Officer — 18`. The most compelling thing in this data, and the handoff's
"the findings are better than the product" complaint points straight at it. Rejected for now because
**"found missing on 28 sites" reads as "the other 9 are fine"**, and silence is not absence. It
becomes buildable when the disclosure names are canonicalised a second time and a systematic
checklist exists per vertical — which is Pass 2's blocker (handoff §2A), not this view's. Worth
reopening the day that lands; the numbers are there and they are strong.

**Group by vertical.** Eight verticals, 11–28 analyses each. Domains hold several at once
(`paytm.com` is payments and fintech), so groups overlap and counts stop adding up. The handoff also
records coverage as lopsided enough that `finance_banking` cannot reach minimum-N at any coverage.

**Rank by document count.** `linkedin.com` has 5 and `reddit.com` has 1. That is a fact about how
much they publish, not about how they treat you, and putting it in the sort order implies otherwise.

**A risk-sorted list.** §4.

**Peer deviation as an ordering.** `peerDeviation` is `[]` on all 82 analyses — confirmed, not
assumed. It needs the clause vocabulary that Pass 2 is blocked on.

---

## Open, and worth deciding before the component is written

1. **Does the row show anything beyond the document count?** The design says no. The counter-argument
   is that a row of pure text across 37 rows is hard to scan. A non-comparative marker — the word
   `window` on clocked rows — would help, at the cost of repeating what the group heading says.
2. **Does browse survive the panel closing?** Cheap to persist in `sessionStorage`; the question is
   whether reopening the panel into a list rather than the current site is helpful or disorienting.
   Leaning: it does not persist.
3. **The empty result.** `notion.com` is not in the corpus. "We have not read notion.com" is honest
   and is also the natural home for AD-6's "request an analysis" when that exists. Out of scope now;
   do not build a dead button.
4. **Does the header entry point earn its space on covered sites?** Entry points 1 and 2 are free —
   they fill surfaces that are otherwise empty. The header one competes with the domain name on every
   panel open, forever.

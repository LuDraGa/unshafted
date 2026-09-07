# Site Policy Awareness — Part 5 Handoff

**Status:** Handoff · written 2026-09-06
**Owner:** @LuDraGa
**Read this with:** `site-policy-part5-side-panel.md` (the settled design, D1–D16)

For picking this up in a fresh session. Three parts: **where it actually stands**, **what to do
next in order**, and **ideas worth arguing about** — the third is deliberately unfiltered.

---

## 1. Where it stands

Branch `feat/site-policy-corpus-capture`. Commit `fd757f7` carries W1–W4; D15 and the copy changes
sit on top.

**The corpus reaches a user for the first time.** 82 analyses ship inside the extension (308 KB
gzipped), 37 real domains are seeded with earned risk levels, a Chrome side panel renders them, and
none of it added host permissions or a content script.

### What is genuinely done

| | |
|---|---|
| Bundle + seed + loader | `tools/corpus/build-bundle.ts` emits both artifacts from one read |
| Badge | risk-tinted, worst-of, tooltip names the unit of the claim |
| Popup | `SiteStrip` in two strengths (covered / uncovered), opens the panel |
| Side panel | bundle-first render, three freshness states, changed-version view, document reader |
| Tests | 65/65 in `packages/unshafted-core` |

### What is NOT done, in priority order

1. **`pnpm type-check` and `pnpm build` have never run on the whole workspace.** Per-package
   `tsc --noEmit` passes for `side-panel`, `popup`, `shared` and `unshafted-core`. Nothing has been
   bundled. **This is the first gate and it may well fail.**
2. **Manual pass over the 24 fully-testable domains** (Part 4 lists them). Only a handful have been
   looked at.
3. **`net-export` zero-egress release gate** — open since M1b. Load the built extension, browse 20
   covered and 20 uncovered sites, assert zero requests to any CDN origin. Structurally the path
   cannot egress; the gate exists to catch a future regression.
4. **`pages/popup/src/Popup.tsx` fails `prettier --check`** — pre-existing on `main`, deliberately
   not touched so this milestone's diff stayed readable.

### Test targets that exercise the interesting branches

- `reddit.com` — the **only** Medium badge in 37 domains
- `zomato.com` — Very High + a deadline, reachable in-page → expect **"Current"**
- `zerodha.com` — Very High, **not** reachable in-page → expect **"As we read it"**, no error, and
  two documents three risk levels apart
- `linkedin.com` — five documents, worst-first ordering
- `americanexpress.com` — three-level spread; the corpus's only `Low` sits under a High badge
- any uncovered site — dark badge, uncoloured strip, panel opens into the reader (D15). Discovery
  on this path was dead until D16, so it has never actually been seen working
- `chrome://extensions` with the panel already open — D13's sticky availability keeps it, and D16
  is the state it lands in. Expect no reader, no grade, no claim about a site

---

## 2. What to do next, in order

### Immediately

- [ ] `pnpm type-check`, then `pnpm build`. Fix what falls out.
- [ ] Load `dist/` unpacked and walk the test targets above.
- [ ] Run the `net-export` gate and tick it in Part 1 M1b and Part 5 W5.

### The three things that block the next milestone

**A. Pass 2 needs a clause vocabulary.** This is the real blocker on the corpus and it has not
moved. `peerDeviation` is 0 of 83 because there is no clause key to compute a share over:
`exposures[].title` has 679 distinct values over 689 exposures, and
`requiredDisclosures[].name` has 100 names but records what each analysis found worth recording
rather than a systematic checklist — so silence is not absence. Canonicalise the disclosure names a
second time first; Part 4 lists the pending merges.

**B. Part 2 is still an options document.** The bundle is a temporary channel with a 1 MB gzipped
build assertion as its forcing function. Do not raise the cap to buy time — that is written into
the Part 2 ticket on purpose.

**C. The scope-metadata ticket now tracks three fields, not two.** Validity window, jurisdiction,
and the `DeadlineKind` anchor (§1b, added from D14). All three are free before the first CDN publish
and breaking after. **This is the last cheap moment.**

### Smaller, well-defined

- [ ] Fixture corpus for the normalizer is half-built — 8 synthetic stable pairs + 4 changed. The
      20 real pages captured two weeks apart are a data-collection task, not a code task.
- [ ] `evictToBudget` in `unshafted-policy-storage.ts` has no test.
- [ ] Capture-quality sweep: accordion doubling (Microsoft, x.com, LinkedIn), markup leaking into
      normalized text (hdfcbank.in, x.com cookie, Walmart, eBay). Both corrupt what pass 2 computes.
- [ ] Retry list from capture — 6 zero-link sites plus youtube.com, untouched.
- [ ] `4e98cb9d` (linkedin.com cookie) carries literal `ENTER A SUMMARY` placeholders. **Confirm
      against the live page before this ships** — it is a claim about a real company.

---

## 3. Ideas worth arguing about

Unfiltered. Some of these are probably bad. None are decided.

### On the surface

- **The badge is red on 36 of 37 domains, deliberately (D1).** The open question is whether a user
  learns anything after week one, or stops seeing it. The instrumentation to answer that does not
  exist and would itself be a privacy decision. Worth thinking about *before* adding coverage,
  because more domains makes it worse, not better.
- **`chrome.notifications` was rejected, not refuted.** It is still the only way to get an
  unsolicited on-landing notification without host permissions. Revisit once there is evidence
  anyone clicks the badge.
- **The time-sensitive bit has no channel.** D2 took its colour away and gave it nothing back. A
  deadline you can still act on is the most actionable thing in the corpus and it currently reads
  as body text.
- **Nothing surfaces the corpus as a whole.** A user can see the site they are on. There is no
  "here is everything we have read" view, no search, no way to look up a site you are *not* on
  before signing up — which is arguably when the information is worth most.
- **Peer deviation will change the badge's meaning when it lands.** "High, and worse than 80% of
  its peers" is a different sentence from "High". Plan for the badge to get quieter, not louder.

### On the corpus

- **The findings are better than the product.** Part 4 holds 47 corpus-level findings — the
  150-to-1 liability ratio in X's terms, three separate mass-arbitration countermeasures, a
  class-action waiver with no arbitration behind it, "sell" appearing once in 213,097 characters.
  None of that reaches a user today. The per-site panel structurally cannot show it, because the
  findings are *about the corpus*, not about one site.
- **Absence of a required disclosure is the strongest signal and is buried.** §3.3 argued it is a
  harder fact than any severity rating. It currently renders below the fold as "Missing
  disclosures". The most-repeated absences are already counted: retention period (39 documents),
  notice of changes (30), named grievance officer (25).
- **Vertical coverage is lopsided.** `finance_banking` cannot reach the minimum-N of 10 on this
  corpus at any coverage. Either capture more finance sites or accept that vertical never publishes
  a baseline.
- **The "one hash, many documents" problem is unsolved.** Five instances. Stripe's privacy policy
  carries a Hindi translation under the same hash; MakeMyTrip carries three policies; Paytm carries
  every product's terms. AD-1 says the hash is the version, and these are cases where one version
  is several documents.
- **The inverse — one policy, many hashes — is also unsolved.** Meta serves the identical policy in
  en-GB and en-US and hashes differently. The corpus needs a document-identity concept above the
  hash, and both problems want the same answer.

### Bigger swings

- **The public library (AD-6) is a positioning move, not a feature.** `/site/facebook.com` over the
  same objects. It is an SEO surface, a credibility surface, and the thing that makes "request an
  analysis" worth doing. It needs no extension release to grow.
- **Diffing across time is the differentiated product nobody else has.** The corpus is
  content-addressed, so once two versions of a document exist the diff is free. "Their arbitration
  clause changed last month" is a better product than "their arbitration clause is bad."
- **The `availableActions` clock is the most concrete thing here and it does not work yet.** It
  needs the anchor field (§1b of the scope ticket) *and* a date the user supplies. An
  "I accepted this on…" input is a small feature that unlocks a real countdown.
- **Nothing connects the site corpus to the upload flow.** A user uploading an employment contract
  and a user reading Zerodha's terms are the same person with the same problem, and the product
  treats them as unrelated.

---

## Rules that have held and should keep holding

- Analyse `corpus/text/`, never `corpus/raw/`.
- Where a capture is incomplete, mark `confidence: medium` and **do not record the disclosure as
  *absent***. Saying "absent" from a capture artefact is a false claim about a real company.
  (Corrected 2026-09-07: this rule used to read "record it as *unverified*", which cannot be done —
  `DisclosureStatusSchema` is `present | absent | not_applicable` and has no such value. In the
  corpus "unverified" appears only inside prose `note` text. The operation is to omit the entry;
  Part 6 §S6 carries the code that enforces it.)
- Never infer a fact the document does not state — not an effective date, not a jurisdiction, not a
  deadline's anchor. D14 exists because that rule got broken once already.
- Deadlines render as windows, never countdowns.
- Bundle our writing, never theirs (D5).
- The badge path makes no network call, ever (AD-2 / D11).

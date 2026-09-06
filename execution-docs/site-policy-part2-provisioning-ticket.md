# Site Policy Awareness — Part 2: Submission, Review & Provisioning

**Status:** Options document — **not a settled design**
**Date:** 2026-09-04
**Owner:** @LuDraGa
**Parent doc:** `execution-docs/site-policy-awareness-scoping.md`
**Sibling:** `execution-docs/site-policy-part1-client-corpus.md` (settled; implementation-ready)

---

## How to read this document

Part 1 is decided. **This one is not.** Each section below states a question, lays out the
pathways considered with honest costs, and gives a current recommendation. The recommendations
are a starting position, not a closed decision — the alternatives are recorded deliberately so
that reversing course later is cheap and informed rather than archaeological.

Nothing here should be built until Part 1's M1b ships and the corpus is large enough that the
badge is right more often than it is noise.

---

## The goal, stated plainly

A user encounters a document that is unanalyzed, or that has changed since it was analyzed.

1. That fact must **reach the maintainer**.
2. Analysis must happen **once**, not once per user.
3. The result must **propagate to every other user without an extension release**.

That is the whole problem. Every option below is a different answer to one of those three.

### The closed loop we want

> The first user to hit an unanalyzed document pays the analysis cost and publishes the result.
> The maintainer reviews it. It lands on the CDN as an immutable object. Every subsequent user
> gets it **free**, on their next popup open, with no release and no scheduled pull.

The cost of covering a document is paid once, by the person who cared enough to be there first.
Everyone downstream free-rides, which is the correct outcome — the corpus is a public good and
its marginal cost should approach zero.

---

## Q1 — Provisioning / update channel

**How does a published analysis reach users?**

### Option A — Bundled per release
Ship the corpus inside the extension; update by publishing a new version.

- **Pro:** trivially simple; zero infrastructure; works offline; no privacy surface at all.
- **Con:** CWS review latency (days) sits between analysis and delivery. Bundle grows without
  bound. A single new domain costs a full release. Fatally slow for a corpus meant to track
  documents that change.
- **Verdict:** correct for the *seed index only* — which is exactly what Part 1 uses it for.
  Unusable as the provisioning channel.

> **Update 2026-09-06 — Option A is temporarily live, widened beyond the index.** Part 5
> (`site-policy-part5-side-panel.md`, D4) bundles all 83 analyses into the extension, because this
> ticket is still an options document and `CEB_POLICY_CDN_URL` is unset, so nothing else can put an
> analysis in front of a user. That is the seed argument above stretched from a 45 KB index to a
> 305 KB (gzipped) corpus, and every objection listed here still applies — a new domain costs a full
> release, and delivery sits behind CWS review latency.
>
> **The forcing function is a build assertion:** the bundle fails the build above 1 MB gzipped.
> When it trips, Option C stops being a recommendation and becomes the work. Do not raise the cap
> to buy time.

### Option B — Scheduled pull
Extension polls the CDN on a `chrome.alarms` cadence and syncs the corpus locally.

- **Pro:** data is local and warm when needed; predictable load.
- **Con:** three objections, and they compound —
  1. **Users wait for updates.** A user who visits a site five minutes after an analysis
     publishes still sees nothing until their next poll window. The one moment the data
     matters is the moment it isn't there.
  2. **Unnecessary network volume.** Every install polls on a timer regardless of whether the
     user visits a single covered site. Most polls return nothing useful.
  3. **Bad patch UX.** Keeping a local mirror in sync means building a delta/patch protocol,
     reconciling partial failures, and versioning the sync state — a large amount of machinery
     to reimplement what HTTP caching already does correctly.
- **Verdict:** **rejected.** These three objections are what killed it; recorded here so it is
  not accidentally revived.

### Option C — Lazy conditional GET *(current recommendation)*
Nothing is fetched until the user opens the popup on a covered domain. Freshness resolved by
`If-None-Match` against `/d/{sha256(domain)}.json`; analyses are immutable at `/{hash}.json`.

- **Pro:** network cost scales with *actual interest*, not install count. A newly published
  analysis is available on the very next popup open — no propagation delay at all. No patch
  protocol; HTTP does the work. `304`s are tiny and CDN-cached. Combined with
  stale-while-revalidate the user never waits.
- **Con:** first view of a changed document costs a round trip. Requires the user to open the
  popup — a user who never opens it never learns anything changed. Offline users see only what
  they have cached.
- **Verdict:** **recommended.** It is the only option where propagation delay is effectively
  zero *and* idle users generate no traffic.

### Option D — Push (WebPush / SSE)
Server notifies extensions when relevant analyses change.

- **Pro:** true real-time; could enable "the terms of a site you use just changed" notifications,
  which is a genuinely compelling standalone feature.
- **Con:** requires the server to know **which domains a user cares about** — which is a
  subscription list, which is a browsing-history pipe by another name. That collides head-on
  with Part 1's AD-2. Mitigable via k-anonymity or topic-bucketing, but that is real
  cryptographic design work. Also needs persistent connections from an MV3 worker that Chrome
  aggressively sleeps.
- **Verdict:** **not now.** Revisit only if proactive change notification becomes a headline
  feature, and only with the privacy design solved first.

---

## Q2 — How the maintainer learns a document changed

### Option A — The user's "request analysis" click *(recommended for the long tail)*
The consent-gated signal from Part 1 §9. User hits an unanalyzed or moved hash, clicks a button,
submission arrives.

- **Pro:** explicit consent, visible to the user, nothing implicit. **Avoids building a
  browsing-history pipe** — the single property the whole design is organized around. Demand and
  signal are the same event.
- **Con:** only surfaces what users actually click on. Coverage is reactive. A changed policy on
  a site nobody opens the popup on stays stale indefinitely.
- **On that con — it is mostly a feature, not a bug.** Sites nobody visits do not need freshness.
  Demand-driven prioritization means effort concentrates exactly where users are.

### Option B — Automatic client telemetry
Extension silently reports domains and hashes it encounters.

- **Pro:** complete, effortless coverage of real usage.
- **Con:** **privacy-disqualifying.** This is a browsing-history feed to our servers, dressed as
  a corpus-freshness mechanism. It contradicts the product's stated posture, and it is precisely
  what CWS review looks for on an extension that just cleared review by *removing* page access.
- **Verdict:** **rejected outright.** Not a tradeoff to be balanced — a line not to cross.

### Option C — Maintainer-side scheduled re-crawl of a curated seed set
A small server-side job re-fetches a hand-picked list (the top few hundred domains) on a cadence.

- **Pro:** proactive freshness where it matters most; no client involvement; no privacy surface
  whatsoever, since it never touches user data. Bounded, predictable cost.
- **Con:** infrastructure the project does not have today. Doesn't scale past the curated list.
  Some sites rate-limit or block datacenter fetches.

### Recommended split — curated proactive, long-tail demand-driven

| Track | Discovery | Rationale |
|---|---|---|
| **Curated** (~top 200–500) | Option C, maintainer-side re-crawl | High-traffic sites are worth proactive freshness; cost is bounded and known |
| **Long tail** | Option A, user request click | Demand *is* the prioritization signal |

Note the asymmetry this resolves: the parent scoping doc's rejected crawler was rejected as a
*general* mechanism serving the whole corpus. A small, bounded, maintainer-side job over a
curated list is a different thing and remains on the table.

---

## Q3 — Who pays for the analysis run

### Option A — Maintainer's key
- **Pro:** total quality control; one prompt version; consistent output; no client complexity.
- **Con:** **the project's first real COGS.** Unbounded exposure to demand — a popular site
  submitted by a thousand users could be analyzed once (fine) but a long tail of thousands of
  distinct sites is not fine. Needs rate limiting, which means needing accounts, which means the
  submission path is no longer anonymous.

### Option B — Submitting user's BYOK
The submitter's own key funds the run; the client produces the analysis and submits the result.

- **Pro:** **cost scales to zero for the maintainer.** Fits the existing BYOK posture exactly —
  users already bring keys. Crowdsourced compute: the person who wants the answer pays for it,
  which is the fair allocation. Naturally rate-limited by the submitter's own budget.
- **Con:** output quality now varies by whatever model the user configured. Opens a poisoning
  surface (see Q4). Requires shipping the analysis prompt to the client, where it is readable —
  though the prompt is not really the moat; the corpus is.

### Option C — Credits
Users spend credits; the maintainer runs it server-side.

- **Pro:** consistent quality *and* bounded cost; a natural monetization hook; aligns with the
  Phase 3 credits work already on the roadmap.
- **Con:** needs the payments infrastructure that does not exist yet. Puts a paywall in front of
  contributing to a public good, which is backwards — it taxes exactly the users doing the
  project a favour.

### Recommendation
**B now, C later, A never as the primary.** BYOK-funded submission matches the existing product
posture and keeps marginal cost at zero during the phase where coverage matters most. Revisit C
once Phase 3 credits exist, and then only as an *alternative* for users without a key — not as a
replacement. Reserve A for the curated track from Q2, where volume is bounded by design.

---

## Q4 — Submission trust and review

If users submit analyses, the corpus can be poisoned. It is served to everyone, so a bad row is
a shared-fate problem.

### Before anything else — verify the hash server-side

**Non-negotiable regardless of which option below is chosen.** A submission arrives with
`{sourceUrl, contentHash, normalizedText, analysis}`. The server must independently
`fetch(sourceUrl)` → normalize → hash, and reject unless it matches `contentHash`. Otherwise a
submitter can attach a plausible analysis to text that was never on that site, and it becomes
canonical for every user.

This also means the server needs the **exact same normalizer** as the client — so the normalizer
from Part 1 §5 must be isomorphic across both, and the PSL snapshot id must be carried on the
submission. Build it once, in `packages/unshafted-core`, and run it in both places.

### Option A — Manual approval gate
Maintainer reads and approves each submission.

- **Pro:** maximum quality; the right posture for the first hundred rows, when the rubric itself
  is still being tuned and every submission teaches something.
- **Con:** **does not scale past a few hundred submissions.** Becomes the bottleneck precisely
  when the feature starts working.

### Option B — Auto-validation by re-running against the stored hash
Server re-runs the analysis on the verified text and compares to the submission.

- **Pro:** scales; no human in the loop; catches both malice and bad models.
- **Con:** costs a run per submission, which partly defeats Q3's BYOK savings. And **LLM output
  is non-deterministic** — this needs a *structural* comparator (do the same exposures, severities
  and categories appear?) not string equality. Building a good comparator is real work.

### Option C — Multi-user consensus on the same hash
Publish once N independent submissions for the same `contentHash` agree.

- **Pro:** **this falls out of content-addressing for free** — the hash-is-version decision means
  two users analyzing the same document are, by construction, analyzing byte-identical input.
  Their outputs are directly comparable in a way they would not be under any other versioning
  scheme. Divergence is itself a quality signal: documents where independent runs disagree are
  exactly the ambiguous ones worth a human look.
- **Con:** needs N users to independently hit the same document — works for popular sites,
  never fires on the long tail, which is where coverage is thinnest. Slow to first publish.

### Option D — Reputation
Weight submissions by submitter track record.

- **Pro:** scales well once established; concentrates trust where it has been earned.
- **Con:** cold-start problem; needs accounts; a whole subsystem to build and defend against
  reputation farming. Premature.

### Recommendation
**Stage them.** A while the corpus is small and the rubric is still moving (it doubles as the
quality feedback loop). Add C as volume permits — it is nearly free given content-addressing.
Reach for B only when A becomes the bottleneck, and build the structural comparator properly
when you do. D only if abuse actually materializes; do not build it speculatively.

---

## Q5 — Publish mechanics

### Option A — Regenerate static CDN objects *(recommended)*
Approval writes `/{hash}.json`, `/{hash}.txt`, and updates `/d/{sha256(domain)}.json`.

- **Pro:** the read path never touches a database. Immutable objects mean `Cache-Control:
  immutable` and no invalidation logic for analyses — only the small per-domain index object
  ever changes, and conditional GET handles that. Cheap, fast, and hard to take down. Supabase
  stays entirely off the hot path, used only for the submission queue and authoring.
- **Con:** publish is a write-and-invalidate step, not a transaction. Regenerating a domain index
  touches one small object — manageable, but it is a job that must be reliable.

### Option B — DB-served
Extension queries Supabase directly for analyses.

- **Pro:** no publish step; RLS gives access control; queryable for admin tooling.
- **Con:** puts a database on the hot path of every popup open — the read path that must stay
  fast and cheap. Reintroduces per-request infrastructure cost and a scaling ceiling for data
  that is *immutable and public*, which is the exact profile static hosting exists for.

### Option C — Hybrid
Static CDN for analyses; DB for the mutable per-domain index and submission state.

- **Pro:** immutable data gets immutable hosting; mutable data gets a database. Honest
  separation.
- **Con:** the per-domain index is the one thing fetched most often per user, so putting it on
  the DB puts the DB back on the hot path — which is what Option A was avoiding.
- **Note:** C is really A with the domain index moved. Only worth it if the index turns out to
  need query semantics richer than "give me this one object", which it currently does not.

### Recommendation
**A.** The read path is static because the data is content-addressed and immutable, and that
property was deliberately engineered in Part 1's AD-1. Spending it by putting a database in
front would be giving up the main thing that decision bought.

---

## Settled — corpus visibility

**Decision (2026-09-04): extension-only now, public library later.**

No web surface, no crawlable index, no marketing site in this phase. The corpus is consumed by
the extension and nothing else.

**Important honesty check: this is a product decision, not an access-control one.** CDN objects
are publicly fetchable by anyone who knows a hash. "Extension-only" means we are not *promoting*
or *indexing* the corpus — it does not mean the data is private. Do not build anything that
assumes otherwise, and never put anything in a published object that would be a problem in
public.

Three cheap constraints now that keep the later door open. All three are expensive to retrofit,
because retrofitting means rewriting every object already published:

1. **Published objects stay PII-free.** No submitter identity, no account id, no submission
   metadata in `/{hash}.json`. Submitter linkage lives in the Supabase queue only. If this leaks
   into published objects it becomes a rewrite of the entire corpus later, plus a disclosure
   problem.
2. **Published objects stay self-describing.** `schemaVersion`, `domain`, `docType`, `vertical`,
   `promptVersion`, `analyzedAt` are already on `SitePolicyAnalysisSchema` — enough to render a
   standalone web page from one object with no extension context. Keep it that way; resist
   adding fields whose meaning only makes sense inside the client.
3. **Mark the CDN origin `noindex` while in this phase.** `X-Robots-Tag: noindex` plus a
   `robots.txt` disallow. Without it we half-launch the public library by accident, and
   content-addressed URLs — `/{hash}.json` — become the project's SEO footprint. Those are
   exactly the wrong URLs to be indexed on.

**What the later public library needs, so it is not a surprise:** a plaintext, guessable routing
layer (`/site/facebook.com`) over the same objects. This does **not** conflict with the extension
path. The extension keeps using `/d/{sha256(domain)}.json` for the AD-2 privacy property; the web
uses plaintext paths. Both resolve to identical content, one source of truth. Adding the
plaintext layer later is a routing change, not a data migration — provided constraints 1 and 2
hold.

Q5's recommendation (static CDN objects) is *reinforced* by this, not complicated: static,
content-addressed, immutable objects are precisely what a public library wants underneath it.

---

## Decision log

Record decisions here as they are made, with the date and the reasoning, so the options above
stay readable as history rather than being edited away.

| Date | Question | Decision | Reasoning |
|---|---|---|---|
| — | Q1 provisioning | *open* — lazy conditional GET recommended | |
| — | Q2 discovery | *open* — curated proactive + long-tail demand-driven recommended | |
| — | Q3 who pays | *open* — BYOK now, credits later recommended | |
| — | Q4 trust | *open* — manual gate now, consensus as volume permits | |
| — | Q5 publish | *open* — static CDN objects recommended | |
| 2026-09-04 | Corpus visibility | **Extension-only now, public library later** | Defer the web surface; keep it cheap to add. See "Settled — corpus visibility" above. |

---

## Open questions not yet framed as options

1. **Copyright posture on storing and serving normalized policy text.** These are published
   documents and the use is transformative and factual, which is a defensible position — but
   serving `/{hash}.txt` is redistribution of someone else's text, and it is worth a considered
   answer before it is a surprise. The diffing feature in Part 1 §8 depends on it.
   **The corpus-visibility decision raises the stakes here rather than settling them:** quietly
   serving normalized text to an extension is a far lower-profile posture than a public,
   indexed library redistributing full policy text under our own brand. Answer this *before*
   the public library, not before the extension.
2. **What happens to a published analysis when `promptVersion` changes?** Bulk re-analysis of the
   whole corpus is expensive. Options include lazy re-analysis on next request, curated-track
   only, or accepting mixed prompt versions in the corpus and surfacing the version. Not urgent
   until the rubric stabilizes, but it will arrive.
3. **Attribution and abuse handling for community submissions.** If a submission is wrong in a
   way that harms a site's reputation, who is answerable? Worth an answer before submissions open
   to the public rather than after.

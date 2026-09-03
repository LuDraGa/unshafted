# Site Policy Awareness — Part 1: Client & Corpus Consumption

**Status:** Part 1 complete (M1a–M1d) · Part 2 not started
**Date:** 2026-09-04
**Owner:** @LuDraGa
**Parent doc:** `execution-docs/site-policy-awareness-scoping.md`
**Sibling:** `execution-docs/site-policy-part2-provisioning-ticket.md`

---

## Scope

Everything client-side and in-package: the corpus **as consumed**, not as produced.

Part 2 covers submission, review, and provisioning back out to users. Where this doc says
"the CDN serves X", Part 2 is what puts X there.

### Supersedes

`site-policy-awareness-scoping.md` is partly dead. **Not carried forward:** the server-side
crawler, the pg_cron re-crawl scheduler, the scheduled/periodic index pull, staleness fields,
and any Google Drive involvement for policy data. That doc's §3 (core concepts, vertical
rubrics, peer baseline, gold set) still stands and is referenced from the schema below.

---

## What ships in Part 1

- Bundled seed index (binary, hashed domains) + build step that generates it
- Hostname suffix-walk resolution (no Public Suffix List at runtime — see AD-7)
- Per-tab badge driven entirely from the local index — **zero network on ordinary browsing**
- Policy capture on popup open under `activeTab` + `scripting` (user gesture only)
- HTML → text normalization and content hashing
- Analysis lookup: `chrome.storage.local` → miss → CDN `/{hash}.json`
- Freshness via conditional GET on `/d/{sha256(domain)}.json`, stale-while-revalidate
- Local no-LLM clause diffing against `/{hash}.txt` when a hash has moved
- `SitePolicyAnalysis` sibling schema
- "Request analysis" affordance (client half)
- LRU cache eviction inside `chrome.storage.local`

## What does NOT ship

- Auto-capture without user gesture, and the inline consent nudge — both need real host
  permissions. **Deferred entirely.** Page access was excised in `3657ca0` to clear CWS review;
  reopening that is its own deliberate project, not a side effect of this one.
- Any crawler, scheduler, or background pull.
- Submission processing, review, publishing (Part 2).
- Credits or payment for analysis runs (Part 2).

---

## Architecture Decisions

### AD-1 — The content hash is the version

No separate versioning scheme, no staleness fields, no re-crawl schedule. Normalized text →
SHA-256 → that *is* the identity. Document changes → new hash → cache miss → fetch. Everything
downstream (immutable CDN objects, `Cache-Control: immutable`, local diffing, cross-user
consensus in Part 2) falls out of this one property.

Hash over **normalized** text, never raw HTML, so an unrelated site redesign does not churn it.

### AD-2 — Two lookups that must never be conflated

|  | Domain check | Hash check |
|---|---|---|
| Question | "Is this site covered?" | "Is this exact doc version analyzed?" |
| When | Every page load | Popup open only |
| Network | **None** — local bundled index | Conditional GET, one domain |
| Staleness tolerance | High (coarse, slow-changing) | None (that's the point) |

Conflating them is the main design trap: it turns the badge into a per-page server call, which
is a browsing-history pipe to our own infrastructure. For a privacy product that is
disqualifying, and it is exactly what CWS review probes.

### AD-3 — Code placement

No new workspace package. `pnpm-workspace.yaml` stays untouched.

| Concern | Path |
|---|---|
| Schema, normalizer, hashing, diffing | `packages/unshafted-core/lib/site-policy/` |
| Index binary decode + binary search | `packages/unshafted-core/lib/site-policy/index-format.ts` |
| CDN client (conditional GET, SWR) | `packages/shared/lib/utils/policy-cdn.ts` |
| Cache + LRU | `packages/storage/lib/impl/unshafted-policy-storage.ts` |
| Badge listener | `chrome-extension/src/background/site-policy.ts` |
| Index build step | `chrome-extension/utils/plugins/make-policy-index-plugin.ts` |
| Popup UI | `pages/popup/src/components/` |

The build step mirrors `chrome-extension/utils/plugins/make-manifest-plugin.ts` exactly — same
`writeBundle` hook shape, same `colorfulLog` reporting, emits into the same `outDir`.

### AD-4 — Fetch the policy from inside the page, not the extension

`activeTab` grants access to the active tab on user gesture. Whether an extension-context
`fetch()` to that origin is reliably covered is murky across Chrome versions.

Sidestep it: the injected function does its own `fetch()` in the page's own context — same-origin
by construction — and returns the HTML string. No reliance on extension-context host permission
at all.

Tradeoff: this only works when the policy URL is same-origin with the tab (the common case —
`facebook.com/privacy`). For cross-origin policy hosts, degrade to "open that policy page and
click capture there." Accept the gap; do not add host permissions to close it.

### AD-5 — Sorted array, not a bloom filter

At 5k domains a sorted array of truncated SHA-256 prefixes is ~45 KB, exact, and has no false
positives. Bloom filters only pay above ~100k entries. Use the simple thing.

### AD-7 — No Public Suffix List at runtime *(supersedes the original eTLD+1 plan)*

Runtime resolution walks hostname suffixes and takes the first hit, rather than computing a
registrable domain. The index is a known finite set, so membership testing is all we need — and
that is a weaker requirement than general eTLD+1, so it gets a simpler solution.

What this buys:

- **No ~230 KB PSL in the bundle**, against a 45 KB index. The PSL would have been five times
  the size of the thing it was there to help look up.
- **No new dependency.** `tldts` is not installed, and this avoids installing it.
- **An entire bug class deleted.** The original plan needed a `psl_snapshot_id` header byte
  because if the build step and the runtime ever used different PSL snapshots, build-time and
  runtime hashes would stop matching and coverage would silently vanish for affected domains.
  No PSL, no snapshot, no drift, no assertion needed.

What it costs, and how that is covered: a PSL would prevent a *multi-tenant public suffix* being
present in the index — indexing `herokuapp.com` would attribute Heroku's policy to every
unrelated app beneath it. That is prevented at BUILD time by `parsePolicySeed`, where rejecting
such entries is free, instead of at runtime where it would cost every user the bundle size. The
guard list is not exhaustive by design; it only has to cover what the corpus actually indexes,
and the full PSL check belongs in the Part 2 authoring pipeline where a heavyweight dependency
never ships to anyone.

### AD-6 — Published objects are public, and will one day be a public library

Corpus visibility is settled (Part 2, "Settled — corpus visibility"): **extension-only now,
public library later.**

Two consequences bind Part 1 even though the web surface is out of scope:

1. **Nothing consumed here is private.** CDN objects are fetchable by anyone with a hash.
   "Extension-only" is a product decision, not an access-control boundary. Never treat a
   published object as a place to put anything that would be a problem in public.
2. **`SitePolicyAnalysisSchema` must stay PII-free and self-describing.** No submitter identity,
   no account id, no client-only fields whose meaning depends on extension context. The schema
   in §6 already satisfies this — `domain`, `docType`, `vertical`, `promptVersion`, `analyzedAt`
   are enough to render a standalone web page from one object. Keep it that way. Retrofitting
   means rewriting every object already published, plus a disclosure problem.

The later public library is a plaintext routing layer (`/site/facebook.com`) over these same
objects. It does not conflict with §7's `/d/{sha256(domain)}.json` — the extension keeps the
hashed path for the AD-2 privacy property, the web gets plaintext paths, both resolve to
identical content.

---

## Implementation

### 1. Bundled seed index

**Format.** Binary, not JSON. Fixed 9-byte records, sorted ascending by hash prefix:

```
[0..7]  first 8 bytes of sha256(registrableDomain)   big-endian, sort key
[8]     payload  — bits 0-1: risk level (0=Low 1=Medium 2=High 3=Very High)
                   bit  2  : has time-sensitive action (drives a distinct badge tint)
                   bits 3-7: reserved, must be 0
```

Header (16 bytes) precedes the records: magic `UNSF`, `uint8` format version, `uint8` flags,
2 reserved bytes, `uint32` record count (big-endian), 4 reserved bytes.

**Collision safety.** 64-bit prefix, n = 5,000 → birthday probability ≈ n²/2^65 ≈ 7×10⁻¹³.
Still ~3×10⁻⁸ at one million entries. 8 bytes is comfortably right.

**Size budget.** 45 KB at 5k domains. Hard cap the emitted artifact at **256 KB** (~28k domains);
fail the build above it rather than silently shipping a slow cold start.

**Where it lives.** `chrome-extension/public/policy-index.bin`, loaded at runtime via
`fetch(chrome.runtime.getURL('policy-index.bin'))` → `arrayBuffer()`. Held in a module-level
variable in the service worker; MV3 workers sleep, so re-read on cold start. A 45 KB
extension-local read is single-digit milliseconds — **do not** put this in `chrome.storage`,
which is slower and quota-bound.

**Build step.** `make-policy-index-plugin.ts` pulls the published domain list at build time,
normalizes each to eTLD+1, hashes, sorts, packs, writes. The bundle is a **seed for day-one
offline function only** — the CDN is the source of truth, and `prompt_version` deliberately
lives in the CDN index and *not* in the bundle, so re-analysis can be invalidated without
shipping an extension release.

- [ ] Format encoder/decoder + binary search (`index-format.ts`) — **S**
- [ ] Vite plugin emitting `policy-index.bin` — **S**
- [ ] Size-cap build assertion — **S**

### 2. Hostname resolution — suffix walk, no PSL

**This deviates from the original plan, deliberately.** The doc previously specified `tldts`
with a pinned, vendored Public Suffix List and a `psl_snapshot_id` byte in the index header to
detect build-vs-runtime drift. That is not what shipped. See AD-7 for the reasoning; the short
version is that we are doing membership testing against a known finite set, which is a strictly
weaker requirement than computing a registrable domain in general.

`candidateDomains(hostname)` yields suffixes most-specific-first, stopping before a bare TLD:

```
www.foo.co.uk  →  ['www.foo.co.uk', 'foo.co.uk', 'co.uk']
```

First hit wins, so a deliberate subdomain entry (`shop.example.com`) correctly beats its parent
(`example.com`), and an uncovered subdomain (`blog.example.com`) correctly falls back to it.
The walk is capped at 7 labels so a deep subdomain costs a bounded number of digests.

- [x] `candidateDomains` + `lookupHostname` — **S**
- [x] Build-time multi-tenant guard (`parsePolicySeed`) — **S**

### 3. Badge path — the zero-network guarantee

```
chrome.tabs.onUpdated  (changeInfo.url present, or status === 'complete')
chrome.tabs.onActivated (badge is per-tab; re-resolve on tab switch)
  → new URL(tab.url).hostname
  → toRegistrableDomain()
  → sha256 → first 8 bytes
  → binarySearch(index)
  → hit  → chrome.action.setBadgeText({ tabId, text: '•' })
           chrome.action.setBadgeBackgroundColor({ tabId, color: byRiskLevel })
  → miss → setBadgeText({ tabId, text: '' })
```

Always pass `tabId`. A global badge is wrong the moment the user has two tabs open.

Skip non-`http(s)` schemes early (`chrome://`, `file://`, `about:`) — no hashing, no work.

**Permissions added: `tabs` only.** No host permissions, no content scripts.

**Verification (this is an acceptance test, not a vibe):** load the extension, browse 20 covered
and 20 uncovered sites, capture with `chrome://net-export`, and assert **zero** requests to the
CDN origin. Re-run this in CI-ish fashion before every release that touches the badge path.

- [ ] Badge listener + per-tab resolution — **S**
- [ ] Scheme filtering + cold-start index reload — **S**
- [ ] `net-export` zero-egress verification, documented as a release gate — **M**

### 4. Capture on popup open (`activeTab` + `scripting`)

Fires only on an explicit user gesture — the popup opening, or a click within it.

1. `chrome.scripting.executeScript({ target: { tabId }, func: discoverPolicyLinks })`
2. In-page: collect anchors whose text or `href` matches
   `/privacy|terms|cookie|legal|EULA|conditions|do not sell/i`, preferring those inside
   `footer`, `[role=contentinfo]`, or the last 20% of the DOM. Return `{href, text, docTypeGuess}[]`.
3. Fallback when the footer yields nothing: well-known path guesses — `/privacy`, `/terms`,
   `/legal/privacy`, `/privacy-policy`, `/terms-of-service`.
4. `sitemap.xml` is a distant third resort and is **out of scope for Part 1**.
5. **`robots.txt` is a dead end** — it is disallow rules, it does not point at policies. Do not
   build on it.
6. Fetch the chosen URL *in the page context* (AD-4), return HTML.
7. Normalize → hash.

- [ ] `discoverPolicyLinks` injected function — **M**
- [ ] Path-guess fallback — **S**
- [ ] Popup capture flow + gesture wiring — **M**

### 5. HTML → text normalization — the high-risk piece

**This is the fiddly part and the most likely source of silent failure.** Everything is
content-addressed, so a normalizer that is even slightly unstable manufactures phantom "the
policy changed" events forever; one that is too aggressive silently drops clauses and the
analysis is wrong in ways nobody notices.

Pipeline:

1. Strip `script`, `style`, `noscript`, `svg`, `iframe`, `nav`, `header`, `footer`, `aside`,
   `[role=navigation]`, `[role=banner]`, and known cookie-banner containers.
2. Select main content: prefer `main`, `[role=main]`, `article`; else the highest text-density
   block (Readability-style).
3. Flatten to text preserving heading hierarchy and paragraph boundaries (the diffing in §8
   depends on stable paragraph splits).
4. Unicode NFKC, collapse runs of whitespace, strip zero-width characters.
5. **Preserve case and preserve "Last updated" dates** — both are semantically meaningful and
   must move the hash when they move.

**Test strategy — non-negotiable.** Fixture corpus at
`packages/unshafted-core/test/fixtures/site-policy/`, split two ways:

- `stable/` — pairs whose normalized hash MUST match. Acceptance: **≥95% stability**.
- `changed/` — pairs whose normalized hash MUST differ. Acceptance: **100%**, because a missed
  real change is the worse failure. An over-aggressive normalizer that strips a clause makes
  the analysis silently wrong; only this half of the corpus catches it.

Add a fixture every time a real-world false-change is observed. Currently 8 stable + 4 changed,
all passing; real two-week captures still to be collected (see M1a).

- [ ] Normalizer implementation — **M**
- [ ] SHA-256 hashing helper — **S**
- [ ] 20-site fixture corpus + stability test — **M**

### 6. `SitePolicyAnalysis` — sibling schema

New file `packages/unshafted-core/lib/site-policy/schemas.ts`. Shares primitives with
`packages/unshafted-core/lib/schemas.ts` (`SeveritySchema`, `ConfidenceSchema`,
`ClauseReferenceSchema`, `RiskLevelSchema`, `ConcernCategorySchema`) and diverges at the top.

**Why a sibling and not a reuse:** the existing schema is built for *negotiable bilateral*
contracts — `NegotiationIdeaSchema` (`ask`, `why`, `fallback`, `targetClause`),
`SuggestedEditSchema` (`plainEnglishEdit`), `MissingProtectionSchema` (`commonFix`). All of it
presumes a counterparty who might say yes. Site policies are **contracts of adhesion**. Reusing
it produces confidently useless output ("negotiate Meta's content licence").

```ts
export const PolicyDocTypeSchema = z.enum([
  'terms', 'privacy', 'cookie', 'eula', 'acceptable_use', 'data_processing',
]);

export const VerticalSchema = z.enum([
  'finance_banking', 'payments_fintech', 'ecommerce_subscription',
  'social_ugc', 'health_wellness', 'saas_productivity', 'other',
]);

export const ExposureSchema = z.object({
  title:      z.string().min(1),
  severity:   SeveritySchema,
  category:   ConcernCategorySchema,
  whatItMeans: z.string().min(1),
  whyItMatters: z.string().min(1),
  reference:  ClauseReferenceSchema.optional(),
});

// Replaces negotiationIdeas. `deadline` powers the arbitration opt-out clock.
export const AvailableActionSchema = z.object({
  action:   z.string().min(1),
  howTo:    z.string().min(1),
  effort:   z.enum(['low', 'medium', 'high']),
  deadline: z.object({
    kind:        z.enum(['relative_to_signup', 'absolute', 'none']),
    days:        z.number().int().positive().optional(),
    description: z.string().min(1),
  }).optional(),
  reference: ClauseReferenceSchema.optional(),
});

export const RequiredDisclosureSchema = z.object({
  name:   z.string().min(1),
  regime: z.enum(['GLBA', 'CCPA', 'GDPR', 'COPPA', 'other']),
  status: z.enum(['present', 'absent', 'not_applicable']),
  note:   z.string().min(1),
});

export const SitePolicyAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  contentHash:   z.string().length(64),
  domain:        z.string().min(1),
  docType:       PolicyDocTypeSchema,
  vertical:      VerticalSchema,
  sourceUrl:     z.string().url(),
  promptVersion: z.string().min(1),
  model:         z.string().min(1),
  analyzedAt:    z.string().datetime(),
  summary:       z.string().min(1),
  riskLevel:     RiskLevelSchema,
  confidence:    ConfidenceSchema,
  exposures:           z.array(ExposureSchema).default([]),
  availableActions:    z.array(AvailableActionSchema).default([]),
  requiredDisclosures: z.array(RequiredDisclosureSchema).default([]),
  peerDeviation:       z.array(z.object({
    clause: z.string().min(1),
    peerShare: z.number().min(0).max(1),
    note: z.string().min(1),
  })).default([]),
});
```

**No staleness field, deliberately.** Per AD-1 the hash is the version; `analyzedAt` is
provenance, not freshness. Freshness is answered by §7, not by a stored flag.

`requiredDisclosures` and `peerDeviation` carry forward the two strongest ideas from the parent
doc's §3 — absence of a legally required disclosure is a harder fact than any severity rating,
and severity only means anything relative to a vertical's norm.

- [ ] Schema + exported types — **S**
- [ ] Zod validation on every CDN read (never trust the wire) — **S**

### 7. Lookup, cache, and freshness

**Hash lookup.**

```
key = `unshafted-policy-analysis:${hash}`
chrome.storage.local  → hit  → render
                      → miss → GET {CDN}/{hash}.json
                                 200 → Zod validate → store → render
                                 404 → not analyzed → "request analysis" affordance
```

CDN objects are immutable (`Cache-Control: public, max-age=31536000, immutable`) because they
are content-addressed. No revalidation needed on `/{hash}.json`, ever.

**Freshness — conditional GET, no scheduled pull anywhere.**

```
GET {CDN}/d/{sha256(domain)}.json
    If-None-Match: <stored etag>
  → 304 → cached domain record current, nothing to do
  → 200 → { hashes: string[], promptVersion: string }  + new etag
```

Then: is our freshly computed hash in `hashes[]`?

- **Yes** → we're looking at an analyzed version. Render it.
- **No, but the domain has known hashes** → the doc moved (or our normalizer drifted). Go to §8.
- **No hashes at all** → uncovered. Offer "request analysis".

Do **not** build a patch/delta protocol. HTTP conditional GET already solves this, is cached by
the CDN, and needs no invalidation logic of our own.

**Stale-while-revalidate.** Render cached analysis *immediately*, revalidate in the background,
update the view only if something actually changed. The user never waits on the network. This is
the reason the scheduled pull was rejected — it made users wait for updates they didn't ask for.

- [ ] `policy-cdn.ts` — conditional GET, etag persistence, SWR — **M**
- [ ] `unshafted-policy-storage.ts` following the `createStorage` pattern in
      `packages/storage/lib/impl/` — **S**

### 8. Local no-LLM clause diffing

When our computed hash is absent from `hashes[]` but a prior hash for the domain is known:

1. `GET {CDN}/{priorHash}.txt` — the normalized source text of the analyzed version.
2. Split both texts on heading/paragraph boundaries (the normalizer guarantees these are stable).
3. Hash each block; set-difference the two block-hash lists.
4. Map changed blocks back to `exposures[].reference` from the cached analysis.

Output: *"3 sections changed since this was analyzed — including the one behind 'Binding
arbitration'."* **Zero LLM calls, zero cost, fully offline after one text fetch.**

**State the limitation honestly in the UI:** this tells the user *what changed*, not *what it now
means*. Re-analysis is Part 2's problem. The value here is that "the arbitration section moved"
is actionable on its own, and it costs nothing.

Do not cache `/{hash}.txt` — these run 50–500 KB. Fetch, diff, discard.

- [ ] Block splitter + set-difference diff — **M**
- [ ] Map changed blocks → affected exposures — **M**
- [ ] "What changed" UI section — **M**

### 9. "Request analysis" — client half

On a 404 or an uncovered domain, offer an explicit button. On click, POST to Supabase:

```
{ domain, docType, sourceUrl, contentHash, normalizedText, pslSnapshotId }
```

**This click is the only network egress in the entire feature that is tied to a specific domain,
and it is user-initiated.** That is exactly what preserves the AD-2 privacy property — it is a
consent-gated signal, not telemetry. Show the user precisely what will be sent before sending it,
consistent with the `v0.7.1` Purple Nickel disclosure precedent.

Server half — queueing, review, publishing — is Part 2.

- [ ] Submission POST + disclosure copy — **M**
- [ ] Pending/submitted/published state in the popup — **S**

### 10. Cache eviction

`chrome.storage.local` is 10 MB by default. **Do not** add `unlimitedStorage` — it is another
permission on an extension whose whole story is minimal permissions.

- Budget the policy cache at **4 MB**, leaving headroom for existing analysis history.
- Maintain `unshafted-policy-cache-index`: `{ hash, bytes, lastAccessedAt }[]`.
- Evict LRU until under budget, on write.
- Never cache `.txt` source (see §8).

- [ ] Cache index + LRU eviction — **M**
- [ ] Budget assertion test with synthetic 500-entry cache — **S**

---

## Milestones

Effort key: **S** ≈ half a day · **M** ≈ 1–3 days · **L** ≈ 1–2 weeks (solo, part-time)

### M1a — Schema and normalizer *(complete, no user-facing surface)*
- [x] `SitePolicyAnalysis` sibling schema + types —
      `packages/unshafted-core/lib/site-policy/{schemas,types}.ts`
- [x] HTML → text normalizer — `packages/unshafted-core/lib/site-policy/normalize.ts`
- [x] SHA-256 content hashing — `computePolicyHash`, hashes normalized text only (AD-1)
- [x] Fixture harness + stability gate — `packages/unshafted-core/test/site-policy.test.ts`,
      fixtures under `test/fixtures/site-policy/{stable,changed}/`
- [ ] **Real captures still outstanding.** The gate currently runs on 8 synthetic stable pairs
      and 4 changed pairs, each isolating one instability mode (nav markup, consent banner,
      minification, footer links, entity encoding, wrapper divs, analytics scripts, framework
      attribute noise). Capturing 20 real policy pages twice, two weeks apart, is a
      data-collection task, not a code task — drop the pairs into the same directories and the
      gate picks them up with no code change.

**Normalizer is DOM-free by design.** `DOMParser` exists in neither an MV3 service worker nor
Node, and Part 2 requires the server to re-derive the hash with the identical normalizer before
publishing a submission. Pure string→string is what makes one implementation serve Node, the
worker, the popup and a content script.

**Bug the gate caught on its first run, worth remembering:** a newline inside `<p>…</p>` is
just whitespace to HTML, but it was surviving normalization as a hard line break — so any
change to source line-wrapping (Prettier config, CMS re-export, minification toggling) would
have churned the hash on *every* document. Fixed by emitting structural breaks as sentinel
characters, collapsing all real whitespace to spaces, and only then converting sentinels to
newlines. This is exactly the phantom-change failure mode §5 warns about, and it was invisible
until a fixture pair forced it into the open.

### M1b — Index and badge *(complete; `tabs` permission only)*
- [x] Index binary format encoder/decoder + binary search —
      `packages/unshafted-core/lib/site-policy/index-format.ts`
- [x] ~~PSL snapshot pinning + build/runtime consistency assertion~~ — **dropped, see AD-7.**
      Replaced by a suffix walk plus a build-time multi-tenant guard in
      `packages/unshafted-core/lib/site-policy/seed.ts`.
- [x] `make-policy-index-plugin.ts` — registered in `chrome-extension/vite.config.mts`;
      validation lives in `parsePolicySeed`, the plugin is thin I/O
- [x] Badge listener, per-tab, cold-start safe — `chrome-extension/src/background/site-policy.ts`
- [x] `tabs` permission added to `chrome-extension/manifest.ts` (no host permissions,
      no content scripts)
- [x] Seed input at `chrome-extension/policy-seed.json` — **RFC 2606 reserved domains with
      illustrative risk levels only.** A real domain belongs there only once a real analysis
      backs it; an invented risk level for a real company would be a false claim about that
      company shipped to every user.
- [ ] **`net-export` zero-egress release gate — not yet run.** It needs a human loading the
      built extension in Chrome and browsing. Structurally the path cannot make a network call:
      its only fetch is `chrome.runtime.getURL('policy-index.bin')`, which is extension-local.
      The gate exists to catch a future regression, so it stays open until it is actually run.

### M1c — Capture and lookup *(complete; adds `activeTab` + `scripting`)*
- [x] Policy discovery + path-guess fallback —
      `packages/unshafted-core/lib/site-policy/discover.ts`
- [x] In-page fetch (AD-4) — `fetchDocumentInPage`, injected, same-origin by construction
- [x] Capture orchestration — `packages/shared/lib/utils/policy-capture.ts`
- [x] `chrome.storage.local` → CDN `/{hash}.json` —
      `packages/shared/lib/utils/policy-cdn.ts`, Zod-validated, hash-verified on arrival
- [x] Popup "this site" view — `pages/popup/src/components/SitePolicyPanel.tsx`, mounted in
      `Popup.tsx` rather than inlined (that file is already ~1400 lines)
- [x] LRU eviction — `packages/storage/lib/impl/unshafted-policy-storage.ts`, 4 MB budget,
      no `unlimitedStorage` permission
- [x] `activeTab` + `scripting` added to the manifest; still no host permissions and no
      registered content scripts
- [x] `CEB_POLICY_CDN_URL` threaded through `packages/env` and the `PUBLIC_ENV_KEYS` allowlist.
      **Unset is a supported state**, not an error: with no CDN the panel reports "not analyzed
      yet" rather than failing, which is the honest position until Part 2 exists.

**Injected functions are a type-check blind spot.** `chrome.scripting.executeScript({ func })`
stringifies the function, so anything it closes over is gone at the injection site — producing a
runtime `ReferenceError` in the page that neither TypeScript nor an ordinary unit test would
catch. `collectPolicyCandidatesInPage` and `fetchDocumentInPage` therefore declare every
constant inline, and a test stringifies them and asserts they name nothing from module scope.

**Deadlines render as windows, never countdowns.** `availableActions[].deadline` gives the
window a policy grants ("30 days from accepting"), but the extension does not know when the user
accepted and must not guess. A confident "18 days left" that is actually 0 is worse than no
number, so the UI states the window and leaves the arithmetic to the person who knows the date.
A real countdown needs an accepted-on date the user supplies.

### M1d — Freshness and diffing *(complete)*
- [x] Conditional GET on `/d/{sha256(domain)}.json` + ETag persistence —
      `fetchPolicyDomainIndex`, cache in `sitePolicyDomainCacheStorage` (200-entry cap).
      The cache stores `sha256(domain)`, never the plaintext domain, so it is not a
      browsing-history log at rest either.
- [x] Stale-while-revalidate rendering — cached analysis paints before any network call
- [x] Local block diff against `/{hash}.txt` —
      `packages/unshafted-core/lib/site-policy/diff.ts`; `.txt` is fetched, diffed, discarded
- [x] "What changed" UI — names changed sections and which previously-flagged exposures sit in
      moved text, and says plainly that the findings describe the earlier version
- [x] "Request analysis" client half — `submitPolicyAnalysisRequest`, gated on
      `CEB_POLICY_SUBMIT_URL`. The button does not render when unconfigured; shipping a button
      that posts nowhere would be worse than having none.
- [x] Shared index loader extracted to `packages/shared/lib/utils/policy-index-loader.ts` so
      the badge and the popup answer "is this covered?" through one implementation

**Blocks are compared by exact text, not by hash.** Blocks run a few hundred characters and a
`Set<string>` over a few hundred of them is trivial, so there is no hashing step to keep in sync
with anything.

**The diff says what moved, never what it now means.** Inferring the new meaning from a diff
alone would be a guess presented as a finding. "The arbitration section changed" is honest and
actionable on its own; re-analysis is Part 2's job.

**`normalizerVersion` travels on every submission.** Part 2 requires the server to re-derive the
hash with the identical normalizer before publishing; without the version it cannot distinguish
a poisoned submission from an older client.

### Known consequence — the normalizer is part of the corpus's identity

Because the hash is the version (AD-1) and the hash is taken over normalizer *output*, changing
`normalize.ts` changes every hash it produces. That invalidates the published corpus in one
step: every cached entry misses and every CDN object is keyed to text no client will generate
again.

`POLICY_NORMALIZER_VERSION` makes this observable rather than silent. Bump it only alongside a
plan to re-hash what is already published. This deserves a decision in Part 2 (open question 3
there, on `promptVersion`, is the same shape and should be answered together).

### Housekeeping
- [ ] **Fix stale README line 46** — it claims `content/  # Dormant content-script bundle`, but
      `pages/content/` does not exist on disk. It was removed in `3657ca0`, not disabled.
      Leaving it there misrepresents the permission story to anyone reading the repo, including
      a reviewer.

---

## Open questions

1. Badge tint by risk level, or a single neutral dot? A four-colour badge may read as alarmism
   on sites where the score is driven by clauses that are universal in that vertical — which is
   exactly what `peerDeviation` exists to temper. Consider neutral-until-deviation.
2. When a domain has several documents (terms + privacy + cookie), does the badge reflect the
   worst, or the aggregate? The index payload byte currently assumes one rolled-up level.
3. Cross-origin policy hosts (AD-4's known gap) — how common in practice? Worth measuring on the
   first 50 seeded domains before deciding whether it needs solving at all.

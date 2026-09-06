# Site Policy Awareness — Part 5: The First User-Facing Surface

**Status:** Design settled and W1–W4 implemented 2026-09-06 · **not yet compiled or run in Chrome**
· uncommitted in the working tree
**Owner:** @LuDraGa
**Parent:** `execution-docs/site-policy-part4-analysis.md` (pass 1 complete, 83/83)
**Siblings:** `site-policy-part1-client-corpus.md` (AD-1..AD-7) ·
`site-policy-part2-provisioning-ticket.md` (the delivery channel this milestone deliberately
defers) · `site-policy-scope-metadata-ticket.md` (unblocked by D3 below, see "Why the ticket
stopped blocking")

---

## What this milestone is

The corpus is finished and nothing reaches a user. 83 analyses sit in `corpus/analysis/`,
`policy-seed.json` still holds RFC 2606 placeholder domains, and `CEB_POLICY_CDN_URL` is unset —
so the popup's analysis path resolves to nothing on every site.

This milestone puts a real analysis in front of a real person on a site we have read, and adds no
page access to do it.

**Ships:** a risk-coloured badge driven by real domains, a Chrome **side panel** that renders the
full analysis for the current site, the 83 analyses bundled inside the extension, and a document
reader that lets a user open and download the policies found on the page they are on.

**Does not ship:** host permissions, content scripts, any server, the local "what changed" diff
(see D7), and the OS-notification channel (see "Rejected").

---

## Decided

### D1 — The badge carries risk, and it is red almost everywhere on purpose

Measured over the 37 domains in `corpus/analysis-index.json`:

| rule | Low | Medium | High | Very High |
|---|---|---|---|---|
| worst-of | 0 | 1 | 27 | 9 |
| aggregate (rounded mean) | 0 | 4 | 28 | 5 |

Worst-of puts **36 of 37 domains at High or Very High**; the two rules disagree on only 7 domains.

The counter-argument — that a badge firing red on 97% of coverage is a coverage indicator wearing
a risk costume — was raised and **overruled deliberately**. The finding *is* that the products
people use daily are predatory, and a Medium or a Low is rare enough to be information when it
appears. Flattening that to a neutral dot would suppress the corpus's actual result. Recorded here
so this is not re-litigated as an oversight.

**This closes Part 1's open question 2 and open question 1 together:** four-colour tint, and
**worst**, not aggregate.

Worst rather than aggregate because aggregate understates in exactly the cases the corpus proves
are real:

- **Finding 16** — Zerodha's terms are Very High (INR 100 liability cap for a broker holding your
  portfolio) and its privacy policy is Medium. Averaging yields High, which describes neither.
- **Finding 21** — Walmart's privacy notice denies profiling with significant effects; its
  California notice asserts it and attaches opt-out rights. Averaging a contradiction produces a
  number describing neither document.
- **19 of 37 domains** have documents that disagree on risk level; 4 disagree by two full levels.
  Disagreement is the majority case, not an edge case.

### D2 — The time-sensitive tint is removed from v1

`chrome-extension/src/background/site-policy.ts` currently paints `TIME_SENSITIVE_COLOR`
(`#7c3aed`) **instead of** the risk colour whenever `hasTimeSensitiveAction` is set. That fires on
**19 of 37 domains** — so today's code would hide the risk grade on half the corpus, which is the
opposite of D1.

Risk tint always wins. The `hasTimeSensitiveAction` bit stays in the index format (it costs
nothing and the data is real), stays surfaced in the side panel and the badge tooltip, and gets a
non-colour channel later. Do not encode two independent facts in one colour.

### D3 — The unit of a user-facing claim is the document, not the site

The badge is the only per-domain byte, and it is explicitly a *worst-of summary* under D1 —
not a description of the site. Everywhere with room to be precise, claims are per document:
per-document risk, per-document exposures, per-document source URL and date.

This is what AD-1 already committed to by making the content hash the version, and it is what
makes the scope-metadata ticket non-blocking (below).

### D4 — The 83 analyses ship inside the extension

`CEB_POLICY_CDN_URL` is unset and Part 2 is an options document, not a design. Bundling is the
only thing that puts an analysis in front of a user this milestone.

Measured: 1.3 MB on disk, **305 KB gzipped** — which is what ships in a CRX. That is small.

**Part 2 Q1 explicitly rejects "bundled per release" as the provisioning channel**, for reasons
that remain correct (CWS review latency between analysis and delivery, unbounded bundle growth,
a full release per domain). This milestone is not overturning that. It is shipping the seed
Part 2 Q1 Option A already endorses — "correct for the *seed index only*" — widened from the
index to the analyses, for a 36-domain corpus, until Part 2 is built. **The ticket for the real
delivery channel exists and is `site-policy-part2-provisioning-ticket.md`; Q1 Option C (lazy
conditional GET) remains the recommendation there and nothing here changes it.**

Record in that ticket that the bundle is now a live temporary channel with a growth ceiling, so
the decision has a forcing function rather than drifting.

### D5 — The line on third-party text: we bundle our writing, never theirs

| path | size | ships? |
|---|---|---|
| `corpus/analysis/*.json` | 1.05 MB minified · **308 KB gz** | **yes** — our analysis of their documents |
| `corpus/text/*.txt` | 6.9 MB | **no** — their document text |
| `corpus/raw/` | 84 MB | **no** — their HTML |

*(The 1.3 MB figure this doc first carried was `corpus/analysis/` pretty-printed on disk. Minified
it is 1.05 MB; gzipped it is 308 KB, which is what ships.)*

This keeps Part 3's open storage-posture question (D8 there) closed by never redistributing
anyone's document. It is also why the local diff cannot ship — see D7.

The document reader in D9 does not cross this line: the text a user reads and downloads is fetched
by **their own browser, in their own session, from the site they are already on**. We never hold
or serve it.

### D6 — Render from the bundle first; confirm against the live page second

Today the popup can say nothing until an injection, a link discovery, an in-page fetch and a hash
all succeed. By Part 4's own count that fails outright on **7 of 36 domains** and half-fails on
5 more, so roughly a third of the time the badge says "covered" and the panel says *"Couldn't
find a policy document linked from this page."*

Invert it. On a covered site the side panel renders the bundled analysis **immediately, with zero
network and no page access**, then attempts a capture in the background purely to check whether
the live document still hashes to what we read.

| capture outcome | label |
|---|---|
| hash matches a bundled analysis | **Current** — verified against the live page |
| hash differs, domain is covered | **Changed since we read it** — see D7 |
| capture failed or unreachable | **As we read it on 4 Sep 2026** — no error shown |

The honest default is "as of the date we read it." Confirmation is an upgrade, never a
precondition. This makes the 7 unreachable domains a non-event instead of a visible failure.

### D7 — When the version does not match, show only what the reader can check

Common, not an edge case: capture ran 4 September 2026 from a Bengaluru egress, and any edit since
breaks the match.

Showing nothing makes the badge a liar on a large fraction of visits. Showing the stale analysis
whole risks asserting a fact about a real company that is no longer true — the one failure mode
this feature cannot survive.

**The rule: when the hash does not match, show the claims the reader can verify and drop the ones
they cannot.**

- **Show** — exposures with their `reference` section label and `quote`. A quote is checkable: the
  reader can search the live page for it.
- **Show** — `availableActions`, `requiredDisclosures` (absences included), the analysed date and
  the source URL.
- **Drop** — the `riskLevel` headline and `summary`. Those are a judgement about a document we are
  no longer looking at, and nothing on screen lets the reader test them.

**Consequence, stated plainly: the local no-LLM diff (Part 1 §8) cannot ship this milestone.** It
needs `/{hash}.txt` from a CDN, and D5 says we do not ship or serve document text. The code stays
written and dormant. The panel says the page changed and which document we read; it does not say
which sections moved.

### D8 — The surface is a side panel, and the popup keeps its job

The popup is for the document-upload flow. Site policy moves out of it entirely.

`chrome.sidePanel` needs the **`sidePanel` permission only** — no host permissions, no content
script, and **no user-facing install warning**. It is strictly cheaper than the gesture-injected
in-page sidecar that was considered, and it gives full-height real estate that the popup does not.

**Opening it — two clicks, deliberately.**

1. Badge lights up in the risk colour (zero network, bundled index, existing path).
2. User clicks the toolbar icon → popup opens, showing a compact site strip at the top when the
   site is covered: domain, worst risk level, document count, one button.
3. Button calls `chrome.sidePanel.open({ tabId })` — the popup click is the required user gesture.

**Rejected one-click alternative:** clearing `action.default_popup` per tab so
`chrome.action.onClicked` fires and opens the panel directly. It works, but it removes the popup —
and the upload flow with it — from exactly the sites the user is most likely to be on. Not worth
one click.

`chrome.sidePanel.setOptions({ tabId, enabled })` gates the panel per tab. ~~so it is not offered
on uncovered sites.~~ **Revised by D15** — it is now offered on any http(s) page, and gated only
against `chrome://`, `file://` and the Web Store. `setPanelBehavior({ openPanelOnActionClick: false })` keeps the toolbar click on
the popup.

### D13 — Panel availability is sticky per tab *(added 2026-09-06, from W2)*

`sidePanel.setOptions({ enabled: false })` does not merely hide the affordance — **it closes the
panel if it is open.** Under a naive reading of D8, a user reading an analysis who clicks through
to an uncovered page has the panel yanked away mid-sentence. That reads as a crash, not as a
coverage boundary.

So availability is sticky: once a tab has been offered the panel, it stays offered for that tab's
life, and the panel renders "we haven't read this site" for pages outside the corpus. The set of
offered tabs lives in `chrome.storage.session`, not a module variable, because an MV3 worker that
sleeps and forgets would let the next `tabs.query({})` sweep disable — and therefore close — an
open panel. Entries are dropped on `tabs.onRemoved`, since Chrome reuses tab ids.

The cost is that a tab which once visited a covered site keeps offering the panel afterwards. That
is a much smaller sin than closing a panel someone is reading.

**The asymmetry this creates is deliberate.** The badge and the popup strip stay *strictly*
coverage-gated, so on a tab that has navigated from a covered site to an uncovered one there is no
badge and no strip, while the panel remains available. That looks like an inconsistency and is not:
the badge and strip answer *"does the page I am on have something to show?"* — a fact about the
current page, which must go dark when the answer is no. Panel availability answers *"may I keep the
surface I deliberately opened?"* — a fact about the tab. Different questions, correctly different
answers. Do not "fix" this by making the badge sticky.

### D9 — The side panel is also a document reader

Policy documents discovered on the current page are listed in the panel, and each can be **read
in-panel and downloaded**. This is the natural home for what the popup does badly today.

- Discovery uses the existing injected `collectPolicyCandidatesInPage`, on a user gesture.
- Fetching a specific candidate needs a new entry point: `captureActiveTabPolicy` currently picks
  a single document by `docType`. Split it into discovery and per-URL capture.
- Reading renders the **normalized** text — the same text the hash is taken over, so what the
  reader sees is what the analysis graded.
- Download is a blob URL plus `<a download>` from an extension page. **No `downloads`
  permission**, and per D5 the bytes came from the user's own session.

### D10 — What the side panel shows first

83 analyses carry 689 exposures across 679 distinct titles — roughly 8 per document. Order matters.

1. **`example.com` — 3 documents read.** Instant, from the bundle, always true.
2. **Worst risk level**, with the document that earned it named. Per D1 this is the point of the
   product, so it is not buried.
3. **The one thing.** A deadline if the domain has one (19 of 37 do); otherwise the
   highest-severity exposure, with its document named.
4. Per-document cards, collapsed, worst first.
5. Everything else on click: full exposures, actions, absent disclosures, the document reader.

Not the `summary` as the headline — it is prose about a document; an exposure is a fact about the
reader.

### D11 — Zero network is now a fact, not a promise

With the corpus bundled, the badge path and the side panel's first render make **no network calls
at all**. The CDN client stays in place, gated on the unset `CEB_POLICY_CDN_URL`, dormant until
Part 2.

AD-2's split is preserved and sharpened:

| | domain check | analysis render | live confirmation |
|---|---|---|---|
| source | bundled index (45 KB) | bundled corpus (305 KB gz) | the active tab |
| when | every page load | side panel open | side panel open |
| network | none | none | none — in-page fetch, same origin |
| page access | none | none | `activeTab` on gesture |

The `net-export` zero-egress gate (open since M1b) covers this milestone unchanged and stays open.

### D12 — Bundled objects stay verbatim

AD-6 requires one analysis to render standalone with no extension context. The bundle is a
container, not a transformation: full `SitePolicyAnalysis` objects, unmodified, Zod-validated at
build time. Domain and hash lookup tables are derived at load, not baked in as a lossy format.

Do not invent a squashed shape to save bytes. 305 KB gzipped does not need saving, and a lossy
format is what would have to be undone for the public library.

### D14 — `relative_to_signup` does not mean "from signup" *(found in W4; corrects M1c)*

`describeDeadline` rendered `kind: 'relative_to_signup'` as **"N days from when you accepted"**.
That is false for most of the corpus.

Measured over the bundle: **32 deadlines carry `relative_to_signup`, and the large majority do not
run from acceptance.** Pass 1 used the kind for a window measured from *some* event, and the events
are all over the place — a coupon's generation (Zomato, 3 days), the harm occurring (Zomato, one
year), a notice of dispute being served (Paytm, 30 days), a transaction not being delivered (Paytm,
24 hours), the next meal delivery slot (Zomato, 2 hours), first becoming subject to the arbitration
agreement (Snapchat, 30 days).

Telling a reader that x.com's one-year claim window runs from when they accepted the terms is the
**false-countdown failure that the M1c rule exists to prevent, one level up**: M1c stopped us
computing a date we do not know, and this was asserting an *anchor* we do not know.

Fixed by keeping the number and dropping the invented anchor — the window renders with the
document's own stated wording (`Window: 365 days — One year from the occurrence of the event…`).

**This leaves a schema question, and it belongs to the scope-metadata ticket:** a `DeadlineKind`
that names its anchor. `relative_to_signup` is doing the work of at least six distinct anchors, and
no client can render it honestly until the enum says which one. Free now, breaking after the first
CDN publish — the same window the ticket's other two fields sit in.

### D15 — The panel is available everywhere; only the badge is coverage-gated *(added 2026-09-06)*

D8 gated panel availability on coverage. That was wrong, and shipping it made the mistake obvious:
on an uncovered site the badge was dark, the popup strip rendered nothing, and the panel was not
offered — so there was no way in at all. Meanwhile `DocumentReader` sat fully built inside
`CoveredView`, and its uncovered branch was a dead end reading *"We have not read this site's
policies."*

**The reader needs no corpus coverage.** It needs `activeTab` on a user click, which every http(s)
page grants. So an uncovered site is precisely where finding, reading and downloading the documents
is the *only* thing we can offer — and it was the one place we refused to offer it.

The split that replaces it is cleaner than the one it replaces:

| | question it answers | reach |
|---|---|---|
| **Badge** | "Have we read this site's policies?" | the 37 seeded domains |
| **Panel** | "What does this site make you agree to?" | any http(s) page |

Those are different questions and they correctly have different answers. The badge stays
coverage-gated and must not follow the panel.

**The promise gets weaker as it widens, and the UI has to show that.** The covered strip is
risk-toned and states a level and a document count. The uncovered strip has **no colour, no level,
no count** — just the hostname, "Not analysed — you can still read its policies", and a *Find
documents* button. The absence of colour is the message, and it means the uncovered strip makes no
claim the dark badge contradicts.

**Two nested empty states**, because "nothing found" now has two meanings:

- *Uncovered, documents found* → the reader list. Real value, no grading.
- *Uncovered, nothing found* → say we could not find a policy linked from this page, that this is
  common on signed-in pages and sites hosting legal text on another domain, and that we have not
  analysed the site either — so there is nothing to show rather than something broken.

**Known cul-de-sac, accepted.** The honest next step from an uncovered site is *"request an
analysis"*, and that button is gated on `CEB_POLICY_SUBMIT_URL`, which is unset because the server
is Part 2. So the uncovered path ends after reading. Part 1 §9 already settled that a button
posting nowhere is worse than no button, and that still holds — but it means the uncovered branch
is a half-feature until Part 2 lands.

**Consequence for D13:** the sticky-availability set still exists and still matters, but it now
protects a much narrower case — a navigation from a web page into `chrome://` or the Web Store,
rather than the coverage boundary it was written for.

---

## Why the scope-metadata ticket stopped blocking

`site-policy-scope-metadata-ticket.md` blocks `policy-seed.json` on validity windows and
jurisdiction. Under D3 all three of its blocking cases resolve without the schema change:

- **Snapchat** (`01af0ece`, `7dcf6330`, effective 21 Sep 2026, captured 4 Sep). A user today hashes
  the in-force document, misses, and gets D6's "changed since we read it". Correct. On 21 September
  the hash starts matching and the analysis is right. **Self-correcting via AD-1.**
- **Dropbox terms** (expire 1 Jan 2027). The same mechanism, in reverse. Self-correcting.
- **x.com terms** (`e3c3ba23`, one hash over two contradictory editions). The hash matches; the
  pass-1 analysts named the edition in every affected exposure. The panel renders both, labelled.
  Under D3 there is no single per-document risk claim to corrupt — and the badge byte is an
  explicit worst-of summary, not a description.

**What the ticket was actually blocking was a per-domain risk claim presented as a fact.** D1
keeps the per-domain byte but restates it as "the worst document on this site," which is true of
x.com under either edition. The ticket stays open on its merits — the fields are still free now
and breaking after Part 2 publishes — but it does not gate this milestone.

**One genuine exclusion, not a ticket:** `665e157e` (stripe.com cookie) hashed transient banner
state — two mutually contradictory opt-out messages in its first three lines. Its hash can never
match what a real user sees. Exclude it from the bundle and the seed with the reason inline.

---

## Rejected

- **`chrome.notifications` on page landing.** The only permission that buys an unsolicited
  on-landing notification without host permissions. Deferred: an OS toast is the highest-uninstall
  surface in extensions, and there is no evidence yet that anyone clicks the badge. Revisit with
  data.
- **Host permissions + content script (M3).** The badge is standing proof that page access is not
  needed to detect coverage, which makes the justification for reopening `3657ca0` weak in front of
  a reviewer. Unchanged from the scoping doc.
- **Gesture-injected in-page sidecar.** Superseded by D8 — the native side panel needs no page
  access and creates no second standalone renderer of the analysis object.
- **Aggregate risk per domain.** See D1.

---

## Open

1. ~~**Bundle growth ceiling.**~~ **Settled in W1: 1 MB gzipped**, mirroring
   `POLICY_INDEX_MAX_BYTES`, as `POLICY_CORPUS_MAX_GZIP_BYTES`. Measured 308 KB gz at 82 bundled
   documents (83 minus the `665e157e` exclusion), so roughly 3x headroom before the build fails
   and Part 2 becomes the only way forward.
2. **Locale and edition selection.** x.com and Snapchat serve contradictory editions under one
   hash. The panel labels both; it does not choose. Choosing needs the user's legal residence,
   which we will not ask for. Ticket question 1 remains genuinely open.
3. **Does the reader (D9) need candidate ranking?** `choosePolicyUrl` ranks for a single pick.
   Listing several may want a different order, or none.
4. **Badge on a covered domain whose every document has changed.** Currently still tinted by the
   bundled worst-of. Arguably should degrade. Left as-is for v1; revisit with real usage.

---

## Status

### W1 — Data layer *(no user-facing change)* — **done**
- [x] `tools/corpus/build-bundle.ts` — read `corpus/analysis/*.json`, Zod-validate, exclude
      `665e157e`, emit `chrome-extension/public/policy-corpus.json` (committed, verbatim objects).
      It emits the seed too: both artifacts derive from the same read under the same exclusion
      list, and a seed that disagrees with the bundle tints a site the panel then contradicts.
- [x] Regenerate `chrome-extension/policy-seed.json` from real analyses — **worst-of per domain**
      (D1), `hasTimeSensitiveAction` from any document's deadline, `domains[]` expanded so
      `hotstar.com`/`disneyplus.com` both seed. **Actual: 37 domains, Low 0 / Medium 1 / High 27 /
      Very High 9, 19 carrying a deadline** — D1's table reproduced exactly. No real domain trips
      the multi-tenant guard.
- [x] Corpus loader — `corpus-bundle.ts` (parse + derive domain→analyses and hash→analysis) plus
      `packages/shared/lib/utils/policy-corpus-loader.ts` (fetch + module-level cache)
- [x] Build assertion on bundle size — `POLICY_CORPUS_MAX_GZIP_BYTES` = 1 MB gzipped, enforced in
      `check-policy-corpus-plugin.ts` and again in the generator. **Actual: 1,077,883 bytes raw,
      307,986 gzipped** (Open Q1 now has its number).
- [x] Tests: worst-of selection, exclusion of `665e157e`, loader lookups, verbatim round-trip (D12)
      — `packages/unshafted-core/test/policy-corpus.test.ts`, 14 tests. The corpus-backed ones skip
      when `corpus/analysis/` is absent, so a clean checkout still runs green.

### W2 — Side panel scaffold *(scaffold complete; not yet type-checked or run)*
- [x] `pages/side-panel/` package — `withPageConfig`, `outDir dist/side-panel`
- [x] `pnpm-workspace.yaml` entry
- [x] Manifest: `sidePanel` permission + `side_panel.default_path`; comment explaining that this
      adds no page access and no install warning
- [x] Background: `setPanelBehavior({ openPanelOnActionClick: false })`; per-tab
      `setOptions({ enabled })` gated on coverage, in `background/side-panel.ts`
- [x] Panel re-resolves on `tabs.onActivated` and navigation, via the `useActiveTabSite` hook

Three side-panel API facts the design above does not account for, all found while wiring this:

- **`side_panel.default_path` makes the panel available on every tab by default.** Per-tab
  `setOptions` only narrows tabs we have seen an event for, so tabs already open when the worker
  wakes would be offered the panel on uncovered sites. `registerSitePolicySidePanel` sweeps
  `tabs.query({})` on registration to close that hole.
- **Disabling a tab's panel closes it if it is open.** Navigating from a covered site to an
  uncovered one in the same tab therefore shuts the panel rather than showing an "unknown site"
  state. **Resolved by D13 below — availability is now sticky per tab.**
- **Passing `path` per tab gives each covered tab its own panel instance**, not one instance that
  follows the user across tabs. Per-tab UI state in W4 will survive tab switches for free; a
  single shared instance would need `setOptions({ tabId, enabled })` with no `path`.

### W3 — Badge and popup *(done)*
- [x] Badge: risk tint always wins; `TIME_SENSITIVE_COLOR` deleted (D2). The bit still rides the
      index and still reaches the tooltip and the panel — it just no longer owns the colour, with
      the reason left inline so it is not restored as a kindness
- [x] Tooltip states the worst document and its level; mentions a deadline when present
- [x] Popup: `pages/popup/src/components/SiteStrip.tsx` — domain, worst risk, document count,
      one button calling `chrome.sidePanel.open({ tabId })`
- [x] Strip renders only when the site is covered, via the same `resolveCoveredHostname` the badge
      and the panel gate use, so the three surfaces cannot disagree

Two notes from wiring it:

- **The strip renders on the index and fills the count in afterwards.** Coverage and worst risk
  come from the 45 KB index; the document count needs `domainRiskSummary` over the ~1 MB corpus.
  Blocking the strip on that parse would delay the doorway behind data the user did not ask for,
  so the count is absent for a beat rather than rendered as `0 documents` — which reads as a
  denial of coverage rather than as "still loading".
- **`SitePolicyPanel` is unmounted, not deleted.** W4 is harvesting its rendering code for the
  panel. Delete it once W4 has what it needs; nothing imports it now.

### W4 — Side panel UI *(built; not yet type-checked or run in Chrome)*
- [x] Bundle-first render (D6): headline, worst level, the one thing, per-document cards (D10)
- [x] Live confirmation in background; three-state label (D6) — per document, rolled up for the
      strip at the top, because D3 makes the document the unit of the claim
- [x] Changed-version view showing only verifiable claims (D7)
- [x] Edition labelling for one-hash-two-contract documents (x.com, snapchat.com, ebay.com) —
      nothing was built. The analysts named the edition inline in the exposure text and the panel
      renders that text verbatim, which is the whole of the requirement
- [x] Document reader: list candidates, read normalized text, download via blob (D9)
- [x] **D15** — panel available on any http(s) page; uncovered strip in the popup; uncovered panel
      view renders the reader; two nested empty states
- [x] Copy: footer trimmed to "Nothing about the site you are on leaves this browser."; the
      redundant "This site" eyebrow above the domain heading removed — the domain is the label
- [x] `captureActiveTabPolicy` split into discovery + per-URL capture

Three things the design above did not account for, all found while building this:

- **`describeDeadline`'s signup anchor is wrong on most of the corpus.** The popup rendered a
  `relative_to_signup` deadline as "N days from when you accepted". Measured against the bundle,
  **23 of the 30** deadlines that phrasing fires on do not run from signup at all — pass 1 used
  the kind for any window measured from *some* event, and the events are a coupon's generation, a
  statement being made available, a notice of dispute being served, the harm occurring. x.com's
  one-year claim window runs from the event. The panel now renders `N days — <description>`,
  keeping the number and dropping the invented anchor. Same class of error as a false countdown,
  one level up, so it belongs under the M1c rule rather than beside it. A `DeadlineKind` that
  names the anchor honestly is a schema question for the scope-metadata ticket.
- **"Changed" can only be attributed when the doc type is unambiguous.** The live check knows a
  fetched document's type by guessing from its link, so on a domain with two documents of one
  type it cannot say which one it just fetched. Guessing would attach a "this changed" claim to a
  document we never looked at, so ambiguity stays `unconfirmed`. No corpus domain hits this today.
- **The live check runs once per tab and origin, not per navigation.** `activeTab` is revoked when
  the tab navigates, so a re-run after an in-site click is the attempt guaranteed to fail — and it
  would replace a good `current` with an `unconfirmed`. A panel that degrades as you browse is
  worse than one that does not try again.

### W5 — Verification and housekeeping
- [x] Remove `pages/popup/src/components/SitePolicyPanel.tsx` — rendering harvested into
      `pages/side-panel/src/lib/presentation.ts`, last reference dropped by W3's `SiteStrip`.
      Also clears a pre-existing lint error: its `DOC_TYPE_LABELS` never gained the four doc types
      added by the Part 3 capture.
- [x] `packages/unshafted-core` suite green — **65/65**
- [ ] **`pnpm type-check` and `pnpm build` — not run.** Per-package `tsc --noEmit` passed for
      `side-panel`, `shared` and `unshafted-core`, but nothing has been compiled or bundled as a
      whole. This is the first gate.
- [ ] **Load the built extension in Chrome.** Nothing here has run as a real side panel — layout was
      verified against a static 400px mock, not Chrome's panel host.
- [ ] `net-export` zero-egress run over 20 covered + 20 uncovered sites (open since M1b)
- [ ] Manual pass over the 24 fully-testable domains from Part 4
- [ ] `pages/popup/src/Popup.tsx` fails `prettier --check` on `main` — pre-existing, deliberately
      not reformatted so this milestone's diff stays readable. Separate cleanup.
- [x] Fix stale README line 46 — replaced with `side-panel/`; the roadmap's "keep current-page
      analysis dormant" line was also stale and now states the actual posture (no host permissions,
      no content scripts, gesture-only reads under `activeTab`)
- [x] Note the bundle as a temporary channel in `site-policy-part2-provisioning-ticket.md` Q1 —
      recorded with the 1 MB gzipped build assertion as the forcing function
- [x] Note in `site-policy-scope-metadata-ticket.md` that D3 unblocked the seed — status header,
      `Blocks:` line and a new "Unblocked" section; the ticket stays open for the CDN publish
- [x] Part 4 status reconciled — worst-vs-aggregate closed, seed unblocked, `665e157e` exclusion
      recorded as decided rather than open

---

## Notes for whoever picks this up

- **Analyse nothing here.** Pass 1 is complete and its output is the input. This milestone moves
  existing analyses to a screen; it does not grade documents.
- **`corpus/analysis/` is gitignored.** The bundle it produces is not — that is the point. A clean
  checkout must be able to build without the corpus present, so the generated
  `policy-corpus.json` is committed and the build step only validates it.
- **Injected functions are a type-check blind spot.** `chrome.scripting.executeScript({ func })`
  stringifies the function, so anything closed over is gone at the injection site. Any new injected
  function declares every constant inline and gets the stringify test the existing two have.
- **Deadlines render as windows, never countdowns.** Unchanged from M1c. We do not know when the
  user accepted, and a confident "18 days left" that is actually 0 is worse than no number.
- **`deadline.kind` does not name its anchor, and the old copy invented one.** See D14.
- **Tests are `node:test`, not vitest.** `packages/unshafted-core` runs
  `node --import tsx --test test/**/*.test.ts`. There is no vitest anywhere in the repo.
- **Tests that need `corpus/analysis/` must skip, not fail.** That directory is gitignored, so a
  clean checkout has no corpus. The verbatim round-trip, the seed-vs-bundle cross-check and the
  stale-exclusion check all skip with a stated reason rather than going red.
- **Two risk-level arrays exist and must not be merged.** `index-format.ts` pins an order to the
  2-bit wire payload and can never be reordered; `corpus-bundle.ts` holds a comparison order. A
  test asserts they still agree — if they drift, the badge tint stops matching the panel headline.
- **`deadline.kind === 'none'` is real in the corpus.** Actions carry a `deadline` object
  describing an unbounded window. Time-sensitivity tests the `kind`, never the presence of the
  object; testing presence flags more than 19 domains and breaks D2's count.
- **`americanexpress.com` spans three levels** — `Low, Medium, High, High` → badge High. The
  corpus's only `Low` (the India grievance policy, three named officers and a 30-day commitment)
  sits under a High badge. That is D3 working, not a defect: the badge is a worst-of summary and
  the document-level truth is one click away. Do not let the panel bury it.

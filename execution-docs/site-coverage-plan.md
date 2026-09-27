# Site coverage — finding the right documents, covering the right sites, scoping big companies

**Started:** 2026-09-27 · **Branch:** `dev/v0.8.3` · **Status:** decisions taken 2026-09-28;
refined A5 and B awaiting go-ahead. Nothing built.

The release PR ([#92](https://github.com/LuDraGa/unshafted/pull/92)) is back in draft while this is
decided: the director wants more in v0.8.3 before it goes to review.

## What the director reported (2026-09-27)

1. On a new site, exploration is not robust: it often lands on pages that are not the final
   document.
2. The packaged sites are too narrow: missing genres and kinds of site.
3. Google, Meta and similar publish one policy across many products, so the panel shows findings
   about the wrong product (Google's watch data shown on Google Search).
4. "And more like these."

## What was found, measured rather than assumed

### 1. Discovery on uncovered sites

| # | Finding | Where | Effect |
|---|---|---|---|
| F1 | **The in-page link pattern is a stale copy.** It lacks `policy\|policies\|disclosure\|consent`. Those words were added to `POLICY_LINK_PATTERN` after the Part 3 capture found 51 real policy links on 20 sites that the pattern missed, but only the exported copy got them. The collector that actually runs in the page never did. | `discover.ts:240` vs `:61` | Every "Content Policy", "Cancellation Policy", "User Policies" link is still invisible on a new site. A bug, not a design gap. |
| F2 | **Cross-origin documents are thrown away**, although the extension has held `<all_urls>` since 2026-09-07. AD-4 ("only same-origin is reachable") predates the host permission and was never revisited. | `SidePanel.tsx:214`, `useLivePolicyCheck.ts:145`, `AnalyseConfirm.tsx` | `google.com` → `policies.google.com`, `netflix.com` → `help.netflix.com`, and every small site whose policy is hosted by Termly / iubenda / OneTrust cannot be read or analysed. |
| F3 | **"A policy" means 400+ normalized characters.** A legal hub page (a list of links to the real documents), a help-centre landing page or a nav-heavy SPA shell all pass. | `policy-capture.ts:45` | Analysis runs on the hub instead of the document. This is most likely the "wrong location" the director is seeing. |
| F4 | **No step past a hub.** An untyped link like "Legal" is excluded from analysis, and a hub is never followed to the documents it lists. | `SidePanel.tsx:214` (`docType !== null`) | The one link that leads to everything is the one link dropped. |
| F5 | **JS-rendered policies can't be read.** The fetch takes raw HTML (AD-1), and the capture already proved some sites never put the text there: myntra, swiggy, icicibank, adobe, whatsapp. | `fetchDocumentInPage` | These end as "too short", or pass F3 on their boilerplate. |
| F6 | **Collection stops at 100 matches in DOM order.** A header mega-menu can use up the budget before the footer is reached. | `discover.ts:263` | Footer links (the ones that matter) are the ones cut. |

### 2. Multi-product companies

No finding records which product it applies to. `domains` is per document, and only 3 of 83
documents list more than one.

| Site | Findings | Findings naming a specific product |
|---|---|---|
| microsoft.com | 23 | **15** (Windows 7, Bing 4, Xbox 4, Copilot, Outlook, Teams) |
| google.com | 20 | **7** (Fitbit, Pixel, Nest, Gmail, Drive, Gemini, Play) |
| instagram.com | 11 | 3 |
| facebook.com | 11 | 2 |
| amazon.com | 18 | 1 (Alexa, Prime) |

youtube.com, which Google's privacy policy also governs, is not covered at all (it's on the
capture retry list).

### 3. Coverage

49 target sites, 37 covered, 8 capture tags: ecommerce 15, payments 14, subscriptions 14, finance 11,
social 9, SaaS 9, streaming 8, identity 6. **Not represented at all:** travel (airlines, booking),
food delivery and ride-hailing, telecom, health, gaming, dating, AI tools, education, news and
subscriptions media, insurance, jobs. Twelve targets are uncovered: 6 zero-link captures worth one
retry (airbnb, capitalone, cash.app, shein, spotify, temu), youtube.com, and the 5 JS-rendered sites
of F5.

The disclosure vocabulary is still 100 unreconciled names (Part 4 open item). Growing the corpus
before fixing that multiplies the drift.

## Proposed work

### Track A — Discovery that lands on the document (client code)

| Unit | Scope | Gate |
|---|---|---|
| A0 | **A measurement bench first.** A fixed list of ~30 uncovered sites across the missing genres, each with the documents a person would pick by hand. Run the shipped discovery against it through `tools/corpus` (Playwright, as the capture already does) and record found / wrong page / missed. | A baseline number to beat |
| A1 | F1: one pattern. Pass `POLICY_LINK_PATTERN.source` into the injected function as an argument; add a test that fails if the two ever differ. | Test red first |
| A2 | F2: read cross-origin policy documents from the extension context (`credentials: 'omit'`, linked from the page only, never guessed). Retire AD-4 in the Part 1/5 docs. **Check the CWS `<all_urls>` justification in `cws/` still describes this honestly.** | Bench: cross-origin sites found |
| A3 | F3 + F4: a policy-likeness check (link density, prose ratio, legal headings) replaces the bare 400. A page judged to be a hub is not analysed; its policy links become the candidates (one hop, bounded). "Legal" links are followed, not dropped. | Bench: hub cases land on documents |
| A4 | F6: collect footer and `contentinfo` anchors first, then the rest. | Bench |
| A5 | F5: **raw if plausible, else rendered**, as one rule on both sides (see *Decisions*, D2). On the policy page itself, read the rendered DOM. Elsewhere, offer *Read it by opening the page*: a background tab, read, closed; on click only. `tools/corpus/capture.ts` adopts the same rule, so JS-rendered sites become capturable with matching hashes. | Bench renders each page twice: hashes stable before rendered captures may claim *changed* |

### Track B — Scope findings to the product

| Unit | Scope |
|---|---|
| B1 | **A product catalogue** in `unshafted-core`: per company, products with URL matchers (host + path prefix): `google.com/search` → Search, `google.com/maps` → Maps, `mail.google.com` → Gmail, `drive.google.com` → Drive, `youtube.com` → YouTube; Microsoft, Meta, Amazon likewise. A closed vocabulary: free-text product names would drift the way the 100 disclosure names did. |
| B2 | **Schema + prompt.** `products: string[]` on exposures and actions, from the catalogue only (empty means company-wide), and `productScopes: [{ product, riskLevel, summary }]` on the analysis, so the model grades each product rather than a formula inventing one. `validate-analysis.ts` rejects any id not in the catalogue. Re-analyse the affected documents (Google privacy + terms, Microsoft, Meta, Amazon; about 8) and add the sibling sites (youtube.com…) to `domains`. |
| B3 | **The panel scopes to the product in use** (D3). It resolves the product from the tab URL and leads with that product's grade and summary; findings for it and company-wide ones first; findings about other products under one closed *About other Google products (n)* group that is kept but does not count. The toolbar badge follows the product grade. A page on a covered company that matches no product shows the whole-company view and says so. |

### Track C — Wider, better coverage (data)

| Unit | Scope |
|---|---|
| C1 | Canonicalise the disclosure vocabulary (the Part 4 open item) before adding anything. |
| C2 | Extend `sites.ts` under its existing selection rule, with new tags for the missing genres. Director picks genres and size. |
| C3 | Retry the 6 zero-link sites and youtube.com with A1–A4 in place (the fixes should recover some of them). |
| C4 | **One command from site list to bundle.** Today adding a site is capture → curate → analyse → validate → index → bundle → seed, run by hand. Make it `pnpm corpus add <domain>` / `pnpm corpus refresh`, idempotent. This is also the "setup" that makes C2 and future refreshes cheap. |

### Track D — "More like these"

A QA walk of the panel on ~20 sites (covered, uncovered, big multi-product, JS-heavy, non-US), each
problem filed as a GitHub issue, not fixed on the spot. Findings feed A/B/C or the next version.

## Decisions (director, 2026-09-28)

1. **Tracks A and B in v0.8.3; Track C in v0.8.4.**
2. **JS-rendered policies must be readable** ("getting that should be possible somehow"). Proposed:
   AD-1 becomes *raw if plausible, else rendered*, applied identically by the client and the
   capture, so hashes still match. The risk is rendered text that varies between loads; the bench
   measures it before a rendered capture may ever claim *changed*.
3. **Google and the like must be scoped to the product being used** ("much much better based on
   scope of the product being used"). Not just a grouped list: grade, summary and findings all
   follow the product, per B1–B3.
4. **Coverage (v0.8.4): websites, not apps**, the ones people use regularly, plus AI and developer
   tools.

## Sessions

**Next session: S1.** *(Each session moves this line on before it ends.)*

The work is split into five sessions. The director pastes the same prompt every time, and this doc
says where things stand:

```text
Continue the site coverage work. Read CLAUDE.md, then execution-docs/site-coverage-plan.md in
full, and run the session its "Next session" line names, following "How every session runs".
```

| S | Units | Cost |
|---|---|---|
| S1 | A0 bench, A1 one pattern, A4 footer first | none |
| S2 | A2 cross-origin documents, A3 hub pages | none |
| S3 | A5 JS-rendered documents, on both sides | none |
| S4 | B1 product catalogue, B2 schema + prompt + validator | none |
| S5 | B2 re-analysis (~8 documents), B3 panel + badge, then the release | analysis runs; ask first |

### How every session runs

1. **Orient.** Read `CLAUDE.md`, this doc and the memory index. Branch `dev/v0.8.3`; pull first,
   and diff against `origin/release`, never the local ref. PR #92 stays a draft until S5.
2. **Close out the previous session** (not S1). Ask the director for the result of the previous
   session's *Manual test*, and record it in that session's log below. Anything that failed is
   fixed first, before any new work, and re-tested the same way.
3. **Verify every earlier session** against its *Verify* list below. If any of it does not hold,
   stop and report; don't build on it.
4. **Build this session's scope.** Tests first where there is logic: red against the bug, then
   green, then break the guard once to prove it guards. Show the director anything the scope says
   to show before acting on it.
5. **Test it yourself.** Run `eslint`, `test --silent=false` and `prettier --check` under
   `nvm use`, re-run the bench and record its numbers, and walk anything visible in the harness
   (`.claude/panel-harness`) at the panel's widths. The director runs `type-check` and `build`.
6. **Write the session log** below: what landed (commits), the evidence, and a **Manual test**:
   numbered steps the director can follow in the loaded extension, each with what they should see
   and what would mean it's broken. Written for someone who wasn't in the session.
7. **Move the pointer.** Update the status table and the *Next session* line.
8. **End by telling the director** three things, in this order: what was done; the manual test,
   exactly as written in the log; and what's next. The next step is the same prompt above, plus
   anything they must do first (a `build`, reloading the extension, a decision).

Standing rules: after editing `packages/unshafted-core`, run
`pnpm -F @extension/unshafted-core ready` (the pages build against its `dist`); after a mutation
check under `packages/`, run `npx tsc -b --force`. Functions injected with
`chrome.scripting.executeScript` or `page.evaluate` stay self-contained: no imports, no module
constants. Ask before each commit; one holistic message, naming the goal, no AI attribution.
Anything found in passing goes to `gh issue create`, not a fix and not a ticket file.

### S1

**Scope.**

```text
Scope: A0, A1, A4 only.

A0 — a discovery bench. Build a fixed list of ~30 sites we do NOT cover: websites people use
regularly (not apps), including AI and developer tools, US and India mix, plus a few known-hard
cases (a legal hub page, a policy on another subdomain, a third-party-hosted policy, a
JS-rendered policy). For each, record by hand the policy documents a person would pick (URL +
doc type). Show me the list before running anything. Then add a bench script under tools/corpus
that runs the SHIPPED discovery (collectPolicyCandidatesInPage + rankPolicyCandidates /
choosePolicyUrl, as capture.ts does, via playwright-core) and scores each site: found /
wrong page (with what it picked) / missed. Record the baseline numbers in the plan doc.

A1 — the in-page link pattern at discover.ts:240 is a stale copy of POLICY_LINK_PATTERN (:61).
Make there be one pattern: pass its source into the injected function as an argument. Update
every caller (policy-capture.ts and tools/corpus/capture.ts). Test first: it must fail on the
current code.

A4 — collection stops at 100 matches in DOM order, so a header mega-menu can starve the footer.
Collect footer / contentinfo / lower-page anchors first. Test first.

Re-run the bench after A1 and A4 and record the numbers beside the baseline.
```

**Log.** *Not started.*

### S2

**Verify before starting.**

```text
Verify S1 before building anything:
- the status table says A0, A1, A4 done, and the commits exist on origin/dev/v0.8.3;
- there is ONE link pattern (grep discover.ts: no second literal regex in the injected
  function), and its test fails if a second copy is reintroduced (try it, then revert);
- the footer-first test exists and passes;
- the bench runs, and its numbers match what S1 recorded (small drift from live sites is
  expected: note it, don't chase it);
- eslint, test and prettier are green.
```

**Scope.**

```text
Scope: A2, A3.

A2 — F2: cross-origin policy documents are dropped (SidePanel.tsx:214,
useLivePolicyCheck.ts:145, AnalyseConfirm.tsx) although the manifest holds <all_urls>. Read
linked cross-origin documents from the extension context with credentials: 'omit'; only
documents the page links, never guessed paths. Retire AD-4 where the Part 1 / Part 5 docs state
it. Check the <all_urls> justification in cws/ still describes the behaviour honestly; if it
needs changing, show me the wording before editing (cws/ is the store's source of truth).

A3 — F3/F4: "a policy" is just 400+ normalized characters (policy-capture.ts:45), so legal
hubs and landing pages get analysed. Replace it with a policy-likeness judgement (link density,
prose ratio, legal headings; design it against the bench's real pages, not in the abstract). A
page judged to be a hub is not analysed: its policy links become the candidates, one hop,
bounded. Untyped "Legal"-style links are followed rather than dropped. Tests first, built from
fixtures of real pages the bench saw.
```

**Log.** *Not started.*

### S3

**Verify before starting.**

```text
Verify S1 and S2:
- status table: A0, A1, A4, A2, A3 done; commits on origin/dev/v0.8.3;
- S1's checks still pass (one pattern, footer-first test, bench runs);
- cross-origin: the panel lists and can read a linked cross-origin document (a bench site that
  needs it, e.g. one on another subdomain); AD-4 is retired in the docs; cws/ is consistent;
- hubs: the bench's hub cases now land on documents; the likeness tests pass;
- the bench's numbers match S2's record; eslint, test, prettier green.
```

**Scope.**

```text
Scope: A5 — policies that exist only after JavaScript runs (F5; myntra, swiggy, icicibank,
adobe, whatsapp in the Part 3 capture).

The rule, on BOTH sides: raw HTML if it is a plausible policy (S2's judgement), else the rendered
DOM, through the same normalizer, so client and corpus hashes still match (AD-1 amended; update
the Part 1 doc). Client: on the policy page itself, read the rendered DOM; elsewhere offer
"Read it by opening the page": a background tab, read, closed, on click only. Capture:
tools/corpus/capture.ts adopts the identical rule.

Before a rendered read may ever mark a document "changed", measure stability: render each
JS-rendered bench page at least twice (separate loads) and compare hashes. If they differ, find
what varies and fix it in normalization, or mark rendered captures as never claiming "changed",
and tell me which.

Check whether cws/privacy-policy.md needs a sentence about opening a background tab; if so,
show me the wording first (it publishes to the gist CWS review reads).
```

**Log.** *Not started.*

### S4

**Verify before starting.**

```text
Verify S1–S3:
- status table: all of Track A done; commits on origin/dev/v0.8.3;
- the bench runs and matches S3's record; its JS-rendered cases are found;
- the rendered-stability result S3 recorded is what the code does (a rendered read either has
  stable hashes or cannot claim "changed");
- no leftover second pattern, no 400-char plausibility check, no sameOrigin filter in the panel;
- eslint, test, prettier green.
```

**Scope.**

```text
Scope: B1 and B2 (the code, NOT the re-analysis runs).

B1 — a product catalogue in unshafted-core: for Google, Microsoft, Meta and Amazon, the products
with URL matchers (host + path prefix), e.g. google.com/search -> Search, google.com/maps -> Maps,
mail.google.com -> Gmail, youtube.com -> YouTube. Base the product list on what the corpus's own
documents name (measure it from corpus/analysis), not on a guess. A resolver from a tab URL to
{ company, product | null }. Tests first, including URLs that must NOT match.

B2 — schema: products: string[] on exposures and actions (catalogue ids only; empty = company-
wide) and productScopes: [{ product, riskLevel, summary }] on the analysis. Prompt: for a
document the catalogue marks multi-product, the model tags from the closed list and grades and
summarises each product. validate-analysis.ts rejects ids outside the catalogue. Decide whether
schemaVersion changes and write down why (there are no installed users to protect).

List the documents that need re-analysis and estimate the cost; don't run them.
```

**Log.** *Not started.*

### S5

**Verify before starting.**

```text
Verify S1–S4:
- status table: Track A, B1, B2 done; commits on origin/dev/v0.8.3;
- the bench runs and matches the last record;
- the catalogue resolver tests pass, including the must-not-match URLs;
- validate-analysis.ts rejects a product id outside the catalogue (try it);
- eslint, test, prettier green.
```

**Scope.**

```text
Scope: B2 re-analysis, B3, then the release.

1. Re-analyse the documents S4 listed. Confirm the cost with me before running. Validate each.
   Add sibling sites (youtube.com ...) to domains. Rebuild the index, bundle and seed.
2. B3 — the panel resolves the product in use from the tab URL and leads with that product's
   grade and summary; its findings and company-wide ones first; other products' findings in one
   closed "About other <Company> products (n)" group that is kept but not counted. The toolbar
   badge follows the product grade. A covered company page matching no product shows the whole-
   company view and says so. Walk it in the panel harness (.claude/panel-harness) on Google
   Search, Maps, Gmail and YouTube URLs at the panel's widths; send me screenshots.
3. Release: give me the loaded-extension walk list for everything in this plan plus the five
   unticked checks in execution-docs/v0.8.3-handoff.md §1. After I report back, update PR #92's
   description to cover this work, mark it ready, and merge it with "Create a merge commit" only
   once every check, CodeQL included, is green. Close #86 and #89 by hand after the merge.
```

**Log.** *Not started.*

## Status

| Unit | Status | Evidence |
|---|---|---|
| Plan | Decisions taken 2026-09-28; split into S1–S5 | — |
| A0 bench | Not started (S1) | |
| A1 one pattern | Not started (S1) | |
| A4 footer first | Not started (S1) | |
| A2 cross-origin | Not started (S2) | |
| A3 hub pages | Not started (S2) | |
| A5 JS-rendered | Not started (S3) | |
| B1 catalogue | Not started (S4) | |
| B2 schema + prompt | Not started (S4) | |
| B2 re-analysis | Not started (S5) | |
| B3 panel + badge | Not started (S5) | |
| Release | Not started (S5) | |
| Track C, D | v0.8.4 | |

### Bench record

| After | Found | Wrong page | Missed | Notes |
|---|---|---|---|---|
| baseline | | | | |

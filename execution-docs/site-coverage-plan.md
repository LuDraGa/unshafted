# Site coverage — finding the right documents, covering the right sites, scoping big companies

**Started:** 2026-09-27 · **Branch:** `dev/v0.8.3` · **Status:** S2 done 2026-09-28 (A2, A3 in;
bench 28 → 43 of 74). S3 next, after the director's `cws/` wording decision and manual test.

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

### Decisions (director, 2026-09-28, S2)

5. **Origin is not the line; readability is.** "It's not exactly cross-origin or from the page's
   own context." Measured the same day from a real Chrome extension page (the panel's own fetch:
   no page involved, cookies omitted, an ordinary user agent), before anything was built:

   | | Read directly | JS-rendered | Blocked | Other |
   |---|---|---|---|---|
   | Packaged: 83 analysed documents, each fetched from its own `sourceUrl` | **76** (52 hash-identical to the corpus; the 24 others checked are real edits since capture, plus some menu churn) | 4 | — | 3 TikTok (does not load from India) |
   | Discovered: the bench's 74 hand-picked documents | **54**, whatever host they sit on | 15 (Notion, Termly, Jio, Practo, Twitch, Ola's iframe wrapper…) | 3 (Zepto's WAF challenge, Reuters) | 2 PDF (Sensibull) |

   Headless Chrome with its default `HeadlessChrome` user agent was refused about 20 more of these;
   a person's Chrome is not, so any tooling that measures this must send an ordinary user agent.
6. **Packaged sites get the exact document.** "For packaged ones I want the exact right thing."
   The live check fetches each analysed document's own `sourceUrl`, instead of re-discovering links
   and taking the first same-origin one of each type — which could be another document, and never
   reached the 7 domains whose policies sit on another host.
7. **Discovered documents: any host we can read, the site's own domain first.** Parent-company,
   sibling-domain and vendor-hosted documents (openai.com for chatgpt.com, Salesforce for Heroku,
   Termly, iubenda, Notion) are offered; the site's own domain and its subdomains rank first.
8. **Discovered documents are read automatically.** "The policy info should be available; if not,
   it's not much use at all." When the panel opens on a site we do not cover, it fetches the top
   document of each type (bounded) and offers only what came back as a readable policy. This
   changes a promise in the privacy policy and the CWS justification ("only when you ask"), so the
   wording goes to the director before `cws/` is edited.

## Sessions

**Next session: S3.** *(Each session moves this line on before it ends.)*

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

**Log.** *Done 2026-09-28.*

**Commits** on `dev/v0.8.3`, pushed 2026-09-28: `70e3726` (A1 + A4 and their tests), `6512686` (the
bench and this plan).

**Manual test result** (director, recorded at the start of S2): 1 WebMD — as expected. 2 Zepto —
Responsible Disclosure Policy appeared only after **Look again**: A1 works, and the refetch is a
pre-existing gap, not an S1 regression. The panel reads a page once per tab and origin, and Zepto's
bot check reloads the page on the same origin, so the first read is of the challenge page. Filed as
[#94](https://github.com/LuDraGa/unshafted/issues/94). 3 Amazon — as expected.

**A0 — the bench.**
- `tools/corpus/bench-sites.ts`: **37 uncovered sites, 74 expected documents** (privacy + terms;
  21 global, 7 US, 9 India; AI and developer tools included). Hard cases, by count: decoys 12,
  other_domain 8, js_rendered 8, other_subdomain 7, legal_hub 6, third_party_host 4,
  links_need_interaction 2, pdf 1. None overlaps `sites.ts`.
- How the list was made: a homepage survey of ~75 candidates, a hand pick, and every expected URL
  opened in headless Chrome. Then, at the director's request, five independent subagents:
  three re-picked every site from scratch and audited the expectations, one searched ~1,100
  homepages for vendor-hosted policies, one audited the bench script against the shipped panel.
  What they changed is recorded in each entry's `note`; the notable ones:
  - ola's footer links a FAQ page holding no policy text; the documents are iframes from
    olawebcdn.com behind `/tnc?doc=…`. The first expectation had rewarded the wrong pick.
  - notion's consumer terms do render headless and are now expected; mistral's EU terms are a
    different document and were dropped; jetbrains' trap is a "Privacy and Security" landing page,
    not a hub.
  - indeed's privacy site is registered to Indeed (other_domain, not a vendor); postman's privacy
    centre is Transcend on Postman's own subdomain (other_subdomain).
  - vendor hosts were rare: of ~1,100 homepages only a handful link off to a vendor's domain.
    Added chatpdf (Notion), futuretools (Termly), dyno (iubenda) and sensibull (a PDF on S3).
    Termly and Notion documents are empty in raw HTML; iubenda's are server-rendered — which
    matters for A2 and A5 together.
- `tools/corpus/bench-discovery.ts` (`pnpm -F @extension/corpus-tools bench --label=<name>
  [--ref=<commit>] [--compare=<label>]`). What the audit made it:
  - **It scores what the panel offers**, mirrored from `SidePanel.tsx`: every same-origin, typed
    document in the ranked top 20. Verdicts: found / found_unreadable (offered, but the link
    redirects cross-origin, which the in-page fetch cannot follow) / found_lower (offered, not
    first of its type) / wrong_page / missed (with where it was lost) / failed (homepage never
    loaded — never charged to discovery).
  - **`--ref` scores the discovery module at another commit on the same page loads**, so a unit's
    effect is measured free of site drift. Use it for every unit from here on.
  - Three readings: early (at `load`, the panel already open while navigating), **settled**
    (the headline: the panel opened on a loaded page), scrolled.
  - Every reading keeps its raw candidates and resolved redirects, so a run re-scores offline;
    `env` records the collector's arity and hash, git SHA, browser, egress.
  - Runs are written to `corpus/bench/discovery-<label>.json`, which is **gitignored**: the runs
    live on this machine, and this log is the durable record.
- Known limits, accepted: the collector runs in the page's main world, not the isolated world; a
  1280px viewport; HTTP redirects are followed, JS redirects are listed by hand; "found" is about
  the link, not the text — a found JS-rendered document (practo, naukri terms) will still read as
  too short until A5.

**A1 — one pattern.** `collectPolicyCandidatesInPage(patternSource)` compiles what it is given;
every caller passes `POLICY_LINK_PATTERN.source` (`policy-capture.ts`, `capture.ts`, the bench).
Guards, each broken once to prove it: the collector matches with the pattern it is given and no
copy of its own (a reintroduced literal fails it); every word the exported pattern knows reaches
the page; the shared caller test fails if the call site passes nothing or a literal; the exported
pattern's flags must be exactly `i`, the flag the page compiles with.

**A4 — footer first.** The footer landmark's anchors are read before the rest of the page, and
footer-region matches (landmark or bottom 20%) are returned before the others, within the same
100 cap. The scan bound rose from 2,000 to 5,000 anchors, since it now only ever cuts non-footer
anchors. Guards: mega-menu starvation, lower-page-counts-as-footer, a footer past the scan bound,
the bound itself.

**Evidence.**
- Bench, two runs, `--ref=HEAD` (f430cb7): see the bench record below. **Run-to-run spread: 0
  of 74 documents at the headline**, 2 at the early reading (pinterest's links not yet rendered
  at `load` in one run).
- **A1 and A4 do not move the headline, and that is the true result.** A1 collects 37 more links
  across the 37 sites (+20%), and every one is another kind of document — acceptable-use,
  editorial, disclosure, "Responsible Scaling Policy" — none a privacy policy or terms, which is
  all the bench scores. A4 only acts past 100 matches, and no bench page came near (max 34). Both
  are correctness fixes whose effect sits outside what this bench measures; the tests are their
  evidence.
- Where the 46 not-found documents sit (settled, current): 23 listed but cross-origin (A2's), 6
  wrong page and 12 more lost behind hubs (A3's: legal_hub sites found 1 of 12), 5 offered but not
  first (jetbrains, postman, tinder, goindigo ×2 — landing pages and narrower same-company
  documents outranking the document), 2 unreadable redirects (pinterest), 4 behind a click (twitch,
  perplexity — no planned unit reaches them), steam's terms (no word for "agreement" in the
  pattern).
- `pnpm lint` 12/12, `pnpm format:check` clean, `pnpm test -- --silent=false` 16/16 tasks (core
  112/112, shared 5/5), no console warnings. `type-check` and `build` are the director's.
- Not walked in the panel harness: the harness feeds discovery canned candidates, so it cannot
  show a collector change. Its stub needed one fix for A1 (it told discovery from a fetch by the
  absence of arguments); fixed locally, it is gitignored.

**Found in passing:** [#93](https://github.com/LuDraGa/unshafted/issues/93) — `tools/corpus` is
never linted (no `lint` script, so `turbo lint` skips it) and carries 41 errors.

**Decisions taken in the session, for the director to overrule:** perplexity.ai and twitch.tv
stay in the bench although no link-based unit can reach their documents (4 of 74): they are the
honest ceiling, and perplexity's `/privacy` does redirect to its notice, so a well-known-path
fallback could reach it. Bench runs stay gitignored; commit them only if offline re-scoring
across machines turns out to matter.

**Manual test** (in the loaded extension, after `pnpm build` or with `pnpm dev` running, and the
extension reloaded at `chrome://extensions`):

1. Open `https://www.webmd.com/` and open the side panel. It says the site is not analysed; under
   **On this page**, the list should include **Editorial Policy**, **Advertising Policy** and
   **Correction Policy** as well as Privacy Policy and Terms of Use — about 14 rows, where the
   pre-A1 collector gave 8. *Broken:* those three are missing (the old list: privacy, terms,
   cookie, two health "Conditions" pages and Google's policies), or the section shows an error or
   nothing.
2. Open `https://www.zepto.com/` and wait for the page to settle (it passes a bot check and
   reloads once). Under **On this page**, **Responsible Disclosure Policy** should appear beside
   Privacy Policy and Terms of Use. *Broken:* it is missing.
3. Open `https://www.amazon.com/` (a covered site). The panel should show Amazon's grade and
   findings exactly as before, and **Documents on this page** should still open a list. *Broken:*
   an error where the panel used to check the page, or an empty documents list.
4. Nothing in the panel shows A4 (footer first); it only changes which links survive on pages with
   more than 100 policy-looking links, and none of the sites above has that many.

### S2

**Verify before starting.**

```text
Verify S1 before building anything:
- the status table says A0, A1, A4 done, and the commits exist on origin/dev/v0.8.3;
- there is ONE link pattern (grep discover.ts: no second literal regex in the injected
  function), and its test fails if a second copy is reintroduced (try it, then revert);
- the footer-first test exists and passes, and so does the caller test in
  packages/shared/test/policy-capture.test.ts (break the call site's argument once to see it fail);
- the bench runs (pnpm -F @extension/corpus-tools bench --label=s2-start), and its headline
  matches S1's record within the run-to-run spread S1 measured (drift from live sites is
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

The bench MIRRORS the panel's rule for what it offers (`offersOfType` in
tools/corpus/bench-discovery.ts: same-origin, typed, top 20). A2 changes that rule, so change the
mirror in the same commit, or the bench goes on measuring the old panel. Measure each unit with
--ref=<the commit before it>, so old and new are scored on the same page loads.

What S1's bench and reviewers already put in front of A2/A3 (see the S1 log): cross-origin
subdomains and domains (github, medium, mistral, heroku, wikipedia, chatgpt, claude.ai), vendor
hosts (chatpdf/Notion, futuretools/Termly, dyno/iubenda), hubs (figma, jio, mistral, dyno's
/terms stub, ola's FAQ page), landing pages that type as privacy and outrank the notice
(jetbrains /privacy-security/, postman's "Legal Terms Hub"), same-word decoys (a reuters headline,
tinder's state health-data supplement winning a URL-order tie), and a same-origin link that
redirects cross-origin and cannot be read (pinterest).
```

**Log.** *Done 2026-09-28.*

**Close-out and verify.** S1's manual test is recorded in S1's log above. S1's checks all held:
one pattern (reintroducing the stale literal fails 2 core tests); the caller test fails on a literal
at the call site; the footer-first tests pass; eslint, test and prettier green; bench `s2-start`
scored 28/74, **identical to S1's run on every document** at the headline.

**Decisions taken with the director** (recorded above as D5–D8): origin is not the line,
readability is; packaged sites are checked at each analysed document's own address; discovered
documents are offered from any host, the site's own first; and a site we do not cover has its top
documents read automatically, so only readable ones are offered. The measurement that informed them
(76/83 packaged and 54/74 bench documents read from a real extension page) is in D5.

**A2 — every document read by the extension.**
- `packages/unshafted-core/lib/site-policy/read.ts` (new): `fetchPolicyPage` (the one request:
  extension context, `credentials: 'omit'`, 20s timeout, a non-page body never downloaded,
  self-contained so tooling can run its source), `readPolicyDocument`, `chooseOfferedDocuments`
  (D8). `fetchDocumentInPage` and the in-page fetch are gone; `sameOrigin` became `ownSite` (same
  domain, subdomains included, no PSL — `siteOf` in `discover.ts`), which orders and decides nothing
  else. `choosePolicyUrl` prefers the site's own documents the same way, so the capture tool agrees.
- `packages/shared/lib/utils/policy-capture.ts`: `capturePolicyDocument(url)` needs no tab.
  `captureActiveTabPolicy`, which nothing called, went with the in-page fetch.
- Side panel: `useLivePolicyCheck` confirms each analysed document at its own `sourceUrl` (up to 6,
  enough for linkedin's 5), started at once and independent of discovery — so a covered site whose
  page Chrome will not let us into is still confirmed, and two same-type documents each answer for
  themselves instead of both staying unconfirmed. On a site we do not cover it runs
  `chooseOfferedDocuments` after discovery; the Analyse bar says "Reading this page's documents…"
  until it settles; every row can be read here; any typed row can be analysed, and the confirm reads
  it before it asks.
- AD-4 retired in `site-policy-part1-client-corpus.md`, `-part5-side-panel.md` (the network row) and
  `-part6-self-analysis.md` (S10), and in every source comment that stated it.

**A3 — hubs are followed, not analysed.**
- `likeness.ts` (new): `judgePolicyPage` → document / hub / shell over the region the normalizer
  reads (`extractPolicyRegion`, exposed from `normalize.ts` with **all 181 raw captures still hashing
  to their filenames**). Designed on measured pages: document = at least 1,300 characters of prose
  (blocks of 200+ that are not headings). The 83 analysed documents have 1,610 or more; 20 legal hubs
  and landing pages have 991 or less, and all of them link to policies. Link density, legal vocabulary
  and a page naming itself were measured and separated nothing prose did not. The old 400-character
  rule is gone.
- `readPolicyDocument` returns `{ status: 'hub', links }` for a hub. `chooseOfferedDocuments` reads
  privacy and terms first (budget 10, 2 tries per type, a hub is not a try), follows a hub one hop
  (its links join the candidates right where it stood), and follows up to two untyped links as
  possible hubs, never offering them as documents.
- Panel: a hub row explains itself ("lists documents rather than being one") and has no Analyse;
  documents reached through a hub are listed after the page's own; the bar says "from this page".
- Fixtures: 18 real pages reduced by `tools/corpus/make-likeness-fixture.ts` (structure, text
  lengths and policy links kept, wording replaced, since third-party text stays out of the repo); the
  tool refuses to write a fixture that is not judged as its page was.

**Evidence.**
- Tests first: the A2 read tests and the A3 hub tests were run red against the code before them.
  Each new guard was broken once and failed: own-site as same-origin, three tries per type, the
  prose floor at 5,000 and at 900, following every hop, never following untyped links, confirming
  only the first analysis, offering without reading, and `fetchPolicyPage` reaching for a module
  constant. `tsc -b --force` after, and the restored lines checked in `dist`.
- 83/83 analysed corpus documents judged `document`; every labelled hub that has static HTML judged
  `hub`; every bench document that is JS-rendered judged `shell` (their raw HTML has no text).
- The bench now scores what the panel offers **by calling `chooseOfferedDocuments` itself**, with
  reads made by core's own `fetchPolicyPage` inside a real Chrome extension page
  (`tools/corpus/extension-fetch.ts`). No hand mirror is left to drift. A ref from before S2 is scored
  by its own rule.
- Headline (settled): **28 → 38 (A2) → 43 (A2 + A3) of 74**; see the bench record. The pre-S2 column
  was 28/74 on the same loads in both runs. Several of the old 28 were never readable. The old rule
  counted a document it had never fetched: Reuters and Expedia block the read, Zepto's challenge is
  an empty page, and Practo's and Naukri's terms exist only after JavaScript. Under the read rule
  those are honest misses.
- `pnpm lint` 12/12, `pnpm format:check` clean, `pnpm test -- --silent=false` 16/16 (core 138,
  side-panel 47), no console warnings.
- Harness, at 360px: the reading state, the settled offer, a hub row's explanation and missing
  Analyse, and the confirm measuring four read documents (one flagged as an excerpt), with no
  horizontal overflow. It was built into a scratch folder, so `dist/` was not touched. The local
  harness stub now answers the panel's own `fetch`.

**Known limits, accepted and recorded.**
- Other prose passes as a document. A news article (Reuters, "privacy fears…"), an FAQ (Ola), a
  product page (Practo `/providers`) or a marketing landing page (apple.com/privacy) is judged a
  document if it has the prose. The likeness check cannot tell a policy from other prose, and
  nothing measured could.
- Word matching: `terms` inside "midterms" typed a Reuters headline as its terms, reached through
  Reuters' "Legal" *news section*, which reads as a hub because every article links to `/legal/…`.
  Filed as [#95](https://github.com/LuDraGa/unshafted/issues/95), not fixed here.
- A JavaScript shell whose static HTML carries a policy link judges `hub`, not `shell` (Practo), and
  is followed. **For S3:** the "else rendered" rule should treat a zero-prose hub reached as a typed
  document the same as a shell.
- Mistral's legal centre is followed, but "additional terms" ranks above the rest-of-world consumer
  terms, so the terms verdict is wrong_page.

**Found in passing:** [#94](https://github.com/LuDraGa/unshafted/issues/94) (reload on the same
origin is never re-read), [#95](https://github.com/LuDraGa/unshafted/issues/95) (word boundaries).

**`cws/` wording — approved by the director 2026-09-28.** The published wording was untrue in three
places after S2. The privacy-policy text below is applied to `cws/privacy-policy.md` in the S2 code
commit; the two dashboard justifications wait for S5, as the last item says.
- `cws/privacy-policy.md` §5, item 2, was "fetches those policy URLs from the page's own session …
  when you explicitly ask": now —
  > **The text of policy documents.** The extension fetches policy documents itself, with cookies
  > omitted, so the request never carries your signed-in session, and extracts their text. It does
  > this only while the side panel is open on that page, and in three cases: to check that a
  > document we have already analyzed still matches what the site serves (reading that document at
  > the address we analyzed it from); on a site we have not analyzed, to read the top document of
  > each kind the page links to — terms, privacy policy, cookie policy and similar, at most ten — so
  > it only offers you documents it can actually read; and when you ask to read or analyze a
  > document. A document may be hosted on another domain than the page, such as a parent company's
  > site or a policy-hosting service; it is read only because the page links to it.

  The §5 intro's "It does this in a single, one-shot script run in the open tab" became "It finds
  those documents with a single, one-shot script run in the open tab". **The effective date moves at
  S5**, when this ships — not before, since the live 0.8.2 still behaves as the old text says.
- The dashboard's `host_permissions` justification (986/1,000 characters): the same text as the live
  one, except it now says the extension fetches "the text of those documents, including ones the site
  keeps on another domain", and "the page is read by a single one-shot script that runs only while the
  Unshafted side panel is open on it".
- The dashboard's `scripting` justification (439/1,000): "scripting runs the one-shot script that
  looks over the current page for links to legal documents. It runs when the side panel asks for it,
  while the panel is open on that page, and then it is finished. The documents themselves are fetched
  by the extension, not by this script. We never call chrome.scripting.registerContentScripts, and
  there is no content_scripts entry in the manifest, so none of our scripts are left running on any
  page."
- **For S5:** the two justifications are dashboard fields. They go into the 0.8.3 submission
  checklist, and `privacy-form-snapshot.md` changes when the dashboard does, in the same commit —
  including its claims table, which still cites `fetchDocumentInPage`, now removed, for "fetched
  with credentials omitted" (it is `fetchPolicyPage` in `read.ts`). The privacy
  policy can change on `dev/v0.8.3` as soon as it is approved. It reaches the gist only when the
  version merges to `release`.

**Manual test** (in the loaded extension, after `pnpm build` or with `pnpm dev` running, and the
extension reloaded at `chrome://extensions`):

1. Open `https://github.com/` and open the side panel. It says the site is not analysed. For a
   moment the bottom bar says **Reading this page's documents…**, then **Analyse on your own key**.
   Under **On this page**, press **Read here** on the Privacy (or Terms) row: the statement's text
   appears, read from `docs.github.com`. *Broken:* "could not be read", no Read here button on that
   row, or a bar that never stops reading.
2. Open `https://www.figma.com/` and open the side panel. The footer links only "Legal and privacy".
   After the bar settles, press **Analyse…**. The confirm lists Figma's privacy policy and terms of
   service (`figma.com/legal/privacy/`, `/legal/tos/`) with their sizes, and not the "Legal and
   privacy" page itself. Press **Cancel**; nothing is sent. In the list, **Read here** on the
   "Legal and privacy" row says it lists documents rather than being one, and that row has no
   **Analyse…**. *Broken:* the confirm offers `figma.com/legal/`, offers nothing, or lists no terms.
3. Open `https://chatgpt.com/` (logged out). **Analyse…** offers OpenAI's privacy policy and terms
   from `openai.com`. *Broken:* nothing offered, or only chatgpt.com links.
4. Open `https://www.amazon.com/` (covered). The grade and findings are as before, and the header's
   meta line settles on **Current — verified against the live page**: all three of Amazon's
   documents, read at their own addresses, still hash to what we analysed (measured 2026-09-28).
   *Broken:* an error, a documents list that is empty, or a meta line stuck on "Checking against the
   live page…".
5. Open `https://www.uber.com/` (covered). The meta line says **Changed since we read it**: Uber
   re-dated its privacy notice on 17 September, after capture, while its terms still match. The
   privacy document shows as changed and the terms as current. *Broken:* "Current — verified…" for
   the site (the change was missed), or an error.


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
| A0 bench | Done (S1) | 37 sites / 74 docs, audited; runs s1-run1, s1-run2 |
| A1 one pattern | Done (S1) | core + shared guards, each broken once; +37 links collected, 0 privacy/terms |
| A4 footer first | Done (S1) | 4 guards, each broken once; no bench page past the 100 cap |
| A2 cross-origin | Done (S2) | one fetch path (extension, cookies omitted); exact packaged check; D8 automatic reads; bench 28 → 38 |
| A3 hub pages | Done (S2) | `judgePolicyPage` on measured pages; 83/83 analysed = document; one-hop following; bench 38 → 43 |
| A5 JS-rendered | Not started (S3) | |
| B1 catalogue | Not started (S4) | |
| B2 schema + prompt | Not started (S4) | |
| B2 re-analysis | Not started (S5) | |
| B3 panel + badge | Not started (S5) | |
| Release | Not started (S5) | |
| Track C, D | v0.8.4 | |

### Bench record

Headline = the **settled** reading (panel opened on a loaded page). Columns follow the bench's
verdicts; "early" is the same run's reading at the `load` event.

| Run | Collector | Found | Unreadable | Lower | Wrong page | Missed | Failed | Early found | Notes |
|---|---|---|---|---|---|---|---|---|---|
| s1-run1 | baseline (`f430cb7`, `--ref`) | 28/74 | 2 | 5 | 6 | 33 | 0 | 26 | |
| s1-run1 | A1 + A4 (working tree) | 28/74 | 2 | 5 | 6 | 33 | 0 | 26 | identical verdicts on the same loads; +37 links, none privacy/terms |
| s1-run2 | baseline (`f430cb7`, `--ref`) | 28/74 | 2 | 5 | 6 | 33 | 0 | 26 | |
| s1-run2 | A1 + A4 (working tree) | 28/74 | 2 | 5 | 6 | 33 | 0 | 26 | 0 verdicts differ from run 1 at settled; pinterest ×2 at early |
| s2-start | `6512686` (`--ref`) | 28/74 | 2 | 5 | 6 | 33 | 0 | 26 | S1 verified: 0 verdicts differ from s1-run2 at settled |
| s2-a2 | pre-S2 (`6512686`, `--ref`) | 28/74 | 2 | 5 | 6 | 33 | 0 | 26 | |
| s2-a2 | A2, read rule | **38/74** | 0 | 0 | 10 | 26 | 0 | 33 | cross-origin found (github, medium, wikipedia, heroku, chatgpt…); old "found" that never read now honest misses |
| s2-a3 | pre-S2 (`6512686`, `--ref`) | 28/74 | 2 | 5 | 6 | 33 | 0 | 26 | same as in s2-a2: no drift on the reference |
| s2-a3 | A2 + A3, read rule | **43/74** | 0 | 0 | 8 | 23 | 0 | 40 | +figma ×2, dyno ×2, goindigo privacy via hubs; −reuters, practo terms (other prose, #95) |

Egress IN (Maharashtra), Chrome 153.0.8010.54, playwright-core 1.63.0, concurrency 4.

From S2 the read rule's columns mean more than they did: "found" is a document the panel read and
offered, not only one it listed, so `unreadable` and `lower` no longer occur. A ref from before S2
is still scored by its own rule, which is why the reference rows keep them.

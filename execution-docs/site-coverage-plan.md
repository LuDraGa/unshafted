# Site coverage — finding the right documents, covering the right sites, scoping big companies

**Started:** 2026-09-27 · **Branch:** `dev/v0.8.3` · **Status:** S4 done 2026-09-29 (B1 catalogue and
B2 schema, prompt and validator in; nine documents await product scoping, ~250–350k tokens in-session).
S5 next, after the director's S4 manual test; it opens by settling how the badge shows a product
grade.

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

**Next session: S5.** *(Each session moves this line on before it ends.)*

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

**Commits** on `dev/v0.8.3`, pushed 2026-09-28: `a681a8b` (A2 + A3, the `cws/` privacy-policy text),
`ccf5cfa` (the bench scoring what the panel offers, from a real extension page).

**Manual test result** (director, recorded at the start of S3): all five steps as expected — GitHub's
statement read from `docs.github.com`, Figma's confirm listing the two documents and not the hub,
OpenAI's documents offered on chatgpt.com, Amazon settling on *Current*, Uber on *Changed since we
read it*.

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

**Log.** *Done 2026-09-28.*

**Commit** on `dev/v0.8.3`, pushed 2026-09-28: `3e121c6` (A5 on both sides, the stability bench, the
approved `cws/privacy-policy.md` text).

**Manual test result** (director, recorded at the start of S4): all four steps as expected — ChatPDF's
policy read by opening the page in a background tab that closed itself, Myntra's privacy policy
offered from the page itself with no tab opened, Reddit on *Last read on 4 Sep 2026* and its policy
page on *Current — verified*, Amazon on *Current — verified*.

**Close-out and verify.** S2's manual test is recorded in S2's log above (all five as expected).
Every S1 and S2 check held: one link pattern (reintroducing the stale literal fails 2 core tests;
restored from a copy, core 138/138, `dist` rebuilt with `--force`); AD-4 retired in the Part 1, 5
and 6 docs; `cws/privacy-policy.md` carries S2's approved text; `pnpm lint` 12/12, `format:check`
clean, `test --silent=false` 16/16. Bench `s3-start` (`--ref=6512686`, `--compare=s2-a3`): **43/74,
the reference 28/74, and not one verdict different from S2's record** at the headline.

**Decisions taken in the session.**
- **Rendered reads never claim *changed*** (the scope's "tell me which"). Measured, not assumed:
  rendered documents hashed alike on three loads each in one run (29/29) and not in the next
  (27/29). Expedia's privacy page grew a live-chat widget's heading on one load; Instagram's, on a
  cold load, held its whole policy twice (text 1 is exactly text 2 twice over) while still changing
  at the reader's 12s bound. Neither is a normalizer rule that would not be a guess about other
  sites' markup, and noise can only make a false mismatch, never a false match. So a rendered read
  that matches confirms *current*; one that differs is *unconfirmed*; only a raw read of a raw
  analysis may say *changed*.
- **`readMode` on the analysis schema**, optional with default `raw` — every analysis before S3 was
  read raw, so none changes meaning and `schemaVersion` stays 1. **For S4:** this is already in the
  schema when S4 decides whether `products` moves the version.
- **Hubs are opened too.** S2 proposed treating a zero-prose hub reached as a typed document like a
  shell; measured, **7 of the 13 real hub fixtures have zero prose** (Figma, GitHub, Heroku, Postman,
  Stripe, Vercel, dyno), so that rule would stop following them. Instead the literal rule: anything
  that is not a document on its raw read — shell, refused request, bot check's empty answer, or hub —
  is what opening may read. A real hub opened is still a hub.
- **The director approved the `cws/privacy-policy.md` wording** (below) and it is in the S3 commit.

**A5 — policies that exist only after JavaScript runs.**
- `packages/unshafted-core/lib/site-policy/read.ts`: **`readPolicyPage`, the rule** — raw HTML if it
  is a document (A3's judgement), else the page opened and read by `readRenderedPageInPage`, through
  the same normalizer; a PDF is never opened. `readPolicyDocument(url, fetch, render?)` is built on
  it. Every result carries `readMode` (on a document: which text the hash is over; on a hub or an
  unreadable page: whether opening was tried). `readRenderedPageInPage` is injected, self-contained
  and helper-free: it waits for the load event and 1.5s without text changes, gives a page still
  under 2,000 characters until 8s to fill in, and reads `outerHTML` at 12s at the latest.
  `isSamePage` decides that the tab the reader is on is the document.
- `packages/shared/lib/utils/policy-capture.ts`: `readInBackgroundTab` (a tab with `active: false`,
  read, closed in `finally`; a second read if a bot check reloads the page mid-read), self-contained
  with the reader passed in so tooling runs its exact source; `renderInBackgroundTab`;
  `renderFromTab` (refuses a tab that has moved off the document).
- Side panel: the page the reader is on is read from their own tab when it is the document —
  automatically, since nothing is opened (D8 reads and the D6 confirm both). Anywhere else a row that
  did not read offers **Read it by opening the page**, only on click (`openDocument`); what it reads
  is offered in place of its type's offer, and a covered site's analysis at that address learns it
  is current. Rows say why they could not be read and whether opening was tried. `readMode` travels
  into analyses run on the user's own key.
- `tools/corpus/capture.ts` **adopts the identical rule inside a real extension**: raw through core's
  `fetchPolicyPage`, rendered through shared's `readInBackgroundTab` (`extension-fetch.ts` gained
  `scripting` and `renderWith`). Its raw read used to be a page navigation's body, which carries the
  cookies the homepage set — exactly why Facebook, Instagram and Reddit captured as documents while
  the panel's cookieless fetch gets a shell. It records `readMode` (and a new `hub` status), and
  `build-curated.ts` / `write-analysis.ts` carry `readMode` into analyses. `--corpus=<dir>` captures
  into a scratch corpus. S2's leftover AD-4 comment and note in it are gone.
- `tools/corpus/bench-rendered.ts` (new, `pnpm -F @extension/corpus-tools bench:rendered`): opens every
  bench, packaged and F5 document whose raw read is not a document, N times through the shipped
  path, and reports stability and what varies. `bench-discovery.ts` now makes the click: an expected
  document not found unasked, listed under its type and not a document raw, is opened and scored
  `byOpening`; the headline stays what the panel offers unasked.
- AD-1 amended in `site-policy-part1-client-corpus.md`; the manifest's `scripting` comment updated.

**Evidence.**
- Tests first: the new core tests run against HEAD's `read.ts` (with only a stub export added so the
  file imports) fail 12 of 12 A5 cases; green after. Ten guards broken once each, all red, each file
  restored from a copy and hash-checked, then `tsc -b --force` and the restored lines checked in
  `dist`: PDFs opened (1 red), hubs never opened (3), a raw hub losing its links after an empty open
  (1), no thin wait (2), an inner named function in the reader (5 — the tsx `__name` trap), any hash
  difference as *changed* (1), the tab never read in place (2), the click opening nothing (1), a
  moved tab read as the document (1), the opened tab never closed (3).
- **Rendered stability** (`bench-rendered`, 3 loads each, a fresh browser per run, so load 1 is
  cold): 21 bench, 8 packaged and 11 F5 documents are not documents raw; **29 become documents by
  opening**; stable 29/29 (`s3-stability`), then 27/29 with the final reader (`s3-final`, the two
  above). Control: a server-rendered page read rendered hashes like its raw read on 10 of 12
  (ChatGPT's two differ).
- **Cold first loads**: before the thin wait, 3 of 9 cold reads of Postman privacy and Adobe's two
  offer terms came back as a shell (read 1.5s after an early quiet, at 70–93 characters); after it,
  16 of 16 read the document, with the hashes warm loads give.
- **The five packaged documents a cookieless fetch sees as a shell** (Facebook privacy and cookie,
  Instagram privacy, Reddit privacy, eBay's state disclosures) **hash to the corpus exactly when
  opened**, on every settled load: the panel can now confirm them as current, from the page itself.
- **Capture and panel agree**: `capture.ts --corpus=<scratch>` on myntra.com and swiggy.com captures
  all four JS-rendered privacy and terms documents as `rendered`, and every hash equals the panel
  path's (`0a169e19`, `7d6e8512`, `80b9fb16`, `f28b0fcb`). The committed `corpus/` was not touched.
- **Discovery bench** (`s3-a5`, `--ref=ccf5cfa`): **41/74 unasked, +15 by opening the page** —
  chatpdf ×2, futuretools ×2, postman ×2, expedia ×2, zepto ×2, practo ×2, naukri terms, blinkit ×2.
  The reference scored 42; the one difference is Blinkit privacy, whose read was refused on the
  working tree's request but not the reference's on the same load. Blinkit alone, twice: 2/2 on both.
  So unasked is S2's 43 in substance, and **56 of 74 documents are reachable in at most one click**.
- `pnpm lint` 12/12, `format:check` clean, `pnpm test -- --silent=false` 16/16 (core 153, shared 12,
  side panel 55), no console warnings. `tools/corpus` type-checks (its tsconfig gained `chrome`
  types, since the bench and capture now run shared's tab code; a type error that predates S3 in
  `bench-discovery.ts` went with the line it was on). `type-check` and `build` are the director's.
- Harness, 360px, built into a scratch folder (`dist/` untouched): an uncovered site whose privacy
  and terms are shells offers only its cookie policy; the privacy row explains and offers the open;
  *Opening it in a background tab…*; one tab opened on the privacy URL and closed; the text with
  "· read from the opened page"; the bar goes from 1 to 2 documents. Opening that finds nothing says
  so once, with no second button. On the JS-rendered privacy page itself it is offered with no tab
  opened. A hub row keeps its explanation and offers the open. No horizontal overflow.

**Known limits, accepted and recorded.**
- **Opening is on click only**, as scoped: a site whose documents are all built by JavaScript
  (ChatPDF, Futuretools) offers nothing until the reader opens one. D8's automatic reads stay raw.
- **The page itself is recognised only if it links to itself**, which footers almost always do
  (Myntra, Practo do; Reddit's does not — a covered site does not need it, since its confirm reads
  each analysis at its own address).
- **Opened and still nothing**: Ola (policies in cross-origin iframes), Reuters (bot wall), WhatsApp
  from India, TikTok (does not load from India); ICICI's terms and Adobe's privacy are real hubs.
- **A policy on a page still changing at 12s is read as it stands** — Instagram's doubled text would
  go to an analysis twice over. Harmless to freshness (it cannot claim *changed*); it costs tokens.
- **JS-rendered documents never show *changed***, by decision above; a real change to one reads as
  *Last read on …*. Recapturing the five packaged ones under the new rule (Track C) would label
  their analyses `rendered` but, by the same decision, not change that.
- Discovery misses A5 cannot reach: Twitch, Notion terms, Jio and Perplexity links are never
  collected (behind a click, or not in the footer), Practo terms is still offered as `/providers`
  unasked (opening its own row replaces it), Steam's terms need a word the pattern lacks.

**Found in passing:** [#96](https://github.com/LuDraGa/unshafted/issues/96) — `tools/corpus/report.ts`
still says the extension cannot reach cross-origin or JavaScript-rendered documents.

**`cws/` wording — approved by the director 2026-09-28, applied in the S3 commit.**
- `cws/privacy-policy.md` §5: "single, one-shot script" became "one-shot script"; item 2 gained a
  paragraph on reading the open tab when it is the document, and on **Read it by opening the page**
  (a background tab carrying the reader's session, as if they opened the link, only the text kept);
  "What is never read" excepts a document the reader asked to have opened; "What we do NOT collect"
  now says the link read discards the rest in the tab and a policy page's menus are dropped on the
  device. **The effective date still moves at S5.**
- **For S5, the dashboard drafts** (supersede S2's; they go into the 0.8.3 submission checklist with
  `privacy-form-snapshot.md` in the same commit, whose claims table must also cite `fetchPolicyPage`
  and the background-tab read):
  - `host_permissions` (990/1,000): "Unshafted tells people what the site they are on makes them
    agree to, so it has to read that site's page to find the legal documents it links to, such as
    terms of service and privacy policy, and then read their text, including documents kept on
    another domain. activeTab cannot do this: Chrome grants it only when someone clicks the toolbar
    icon and takes it away the moment the tab navigates, so a side panel left open while a person
    browses is refused on every new page. The page is read by one-shot scripts that run only while
    the Unshafted side panel is open on it; nothing is registered to run in the background. We keep
    only links that identify a legal document and discard the rest inside the tab. Documents are
    fetched with credentials omitted. A document whose text only appears once its page runs is read
    from that page if the person is on it, or on their click from a background tab we open and
    close. No page content and no record of the sites someone visits is ever sent to us."
  - `scripting` (624/1,000): "scripting runs two one-shot scripts, each only when the side panel
    asks, while it is open on that page. One looks over the current page for links to legal
    documents. The other reads a legal document's text from a page where that text only exists once
    the page has run: the page the person is on, when it is itself the document, or a page the
    extension opened in a background tab because the person asked it to read that document. Each
    runs once and is finished. We never call chrome.scripting.registerContentScripts, and there is
    no content_scripts entry in the manifest, so none of our scripts are left running on any page."
  - `tabs` (806/1,000): the live text, with one sentence added before "All of this stays local":
    "When someone asks the panel to read a document by opening it, we open that document in a
    background tab and close the tab once it is read."

**Manual test** (in the loaded extension, after `pnpm build` or with `pnpm dev` running, and the
extension reloaded at `chrome://extensions`):

1. Open `https://www.chatpdf.com/` and the side panel. Its privacy policy and terms live on Notion
   and have no text until the page runs, so after *Reading this page's documents…* nothing is
   offered and the bottom bar goes away. Under **On this page**, press **Read here** on the Privacy
   Policy row: it says its text did not come with the page, with a **Read it by opening the page**
   button. Press it. A tab appears beside yours without taking focus, and closes by itself within
   about ten seconds; the row then shows the policy's text, ending "· read from the opened page",
   and the bar offers **1 document**. *Broken:* no button, a tab that stays open or takes focus,
   "Opening it showed no policy text", or the text of some other page.
2. Open `https://www.myntra.com/privacypolicy` itself and the side panel. Without pressing anything,
   the bar settles on **Analyse on your own key** with the privacy policy among what it offers, and
   **no tab opens**: the text was read from the page you are on. **Read here** on its row shows the
   text. *Broken:* privacy not offered, or a background tab flashing open.
3. Open `https://www.reddit.com/` (covered). The header's meta line settles on **Last read on 4 Sep
   2026** — Reddit's privacy policy is a shell to the extension's own fetch, so it cannot be
   confirmed from here. Now open `https://www.reddit.com/policies/privacy-policy`: it settles on
   **Current — verified against the live page**, read from the page itself. Best signed out: signed
   in, the page may carry your account in its text and settle on *Last read on…* instead, which is
   the safe outcome and worth telling me, not a failure. *Broken:* *Changed since we read it* on
   either page, or an error.
4. Open `https://www.amazon.com/` (covered, not JavaScript-rendered). As in S2: **Current — verified
   against the live page**. *Broken:* anything else, or an error.

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

**Log.** *Done 2026-09-29.*

**Commit** on `dev/v0.8.3`, pushed 2026-09-29: `326e0e0` (B1 + B2, their tests, this log and S3's
recorded result).

**Close-out and verify.** S3's manual test is recorded in S3's log above (all four as expected).
Every S1–S3 check held:
- **Track A done.** `3e121c6` is on `origin/dev/v0.8.3`.
- **The bench matches S3.** Bench `s4-start` (`--ref=ccf5cfa`, `--compare=s3-a5`) found **43/74 unasked,
  +13 by opening** — 56 reachable in at most one click, as in S3. The only verdicts that differ are
  Blinkit ×2, now found unasked: S3's load was refused those reads, and S3 had recorded them as 2/2
  when run alone. The JS-rendered cases are found by opening them (ChatPDF, Futuretools, Postman,
  Expedia, Zepto, Practo, Naukri terms).
- **Rendered reads cannot claim *changed*.** `useLivePolicyCheck.ts:207` says *changed* only when
  both the read and the analysis are raw.
- **No leftovers from Track A.** The collector compiles the pattern it is passed, and the literal
  lives only in the export. "400" survives only in two comments. `sameOrigin` appears nowhere.
- **Checks green.** `pnpm lint` 12/12, `format:check` clean, `test --silent=false` 16/16 (core 153).

**Decisions taken in the session, for the director to overrule.**
- **What the catalogue holds is measured, and the rule is written down.** A product is in the
  catalogue when a corpus finding or summary names it, or when the company's documents name it three
  or more times. It is **graded** when people use it as a website. A graded product has URL matchers,
  and every multi-product analysis grades it. A product with no website of its own (Windows, Chrome,
  Pixel, a watch) is **named only**: a finding can still be tagged with it, which keeps that finding
  out of every other product's view, but no tab resolves to it. The measurement is in the table below.
- **Four companies, and no more.** No other covered company's findings name more than a handful of
  its own products. The highest are Snapchat (4 of 20 terms findings, all features inside one app),
  Zomato (Gold, 2 of 21) and LinkedIn (Premium, 2 of 12).
- **"Multi-product" is decided by site.** A document is multi-product when its `domain` belongs to a
  catalogue company. That is exactly the nine documents below, and a committed-bundle test pins it.
  **Limit:** a single-product document on one of those sites (YouTube's own terms, Instagram's Terms
  of Use) would also be treated as company-wide. None is in the corpus. When Track C captures the
  first one, it adds a per-document marker.
- **Ids are strings in the schema; the closed list is enforced by code.** `validate-analysis.ts`
  enforces it against the document's own company, and `scopeToCatalogue` does the same for runs on
  the reader's key. As an enum, every product added later would make older clients reject whole any
  published object that names it.
- **Every graded product gets a grade, even with no findings of its own.** Someone reading in Gmail
  and someone reading in Maps are hurt by different company-wide findings, and the grade and summary
  are what B3 leads with.
- **`schemaVersion` stays 1.** `products` and `productScopes` are additions with defaults, as
  `readMode` was in S3. An older client strips them and reads the document exactly as it did before.
  This client reads an object from before them as unscoped, which is what it is. The reason is
  written on the field in `schemas.ts`.
- **The prompt for runs on the reader's own key becomes `site-policy-prompt-v2`**, because its output
  contract changed. `adhesion-rubric-v1` is S5's to decide (see *For S5*).
- **An unscoped multi-product analysis fails validation.** It is reported apart from invalid ones and
  exits 1 until S5 scopes it, because B3 cannot scope a document that has not been scoped.

**B1 — the product catalogue.** `packages/unshafted-core/lib/site-policy/products.ts`:
- **`PRODUCT_CATALOGUE`**: each company lists the domains that resolve to it, and its products.
  - A product's matchers compare its host exactly, after `www.` is removed, because `google.com` must
    not claim the root of `accounts.google.com`.
  - A path matches at a segment boundary. `exact` covers the one case that needs it: Google's
    homepage is Search.
- **`resolveProduct(url)`** returns `{ company, product | null }`, or `null` for a site in no company.
  The most specific matcher wins, so `amazon.com/gp/video` is Prime Video and the rest of `amazon.com`
  is shopping.
- **`catalogueCompanyForDomain`** finds a document's company. **`gradedProducts`** lists the products a
  page can resolve to.
- **Left out on purpose:**
  - sister companies with policies of their own: LinkedIn, GitHub, WhatsApp's own site, Twitch,
    Audible;
  - country sites: `google.co.in`, `amazon.in`. The corpus covers neither today, and google.com no
    longer redirects by country;
  - products the documents barely name: Messenger 2, Blogger 2, Google News 1, Threads 0. So
    messenger.com stays uncovered, and `facebook.com/messages` resolves to Facebook.

| Company | Graded (a tab can be on it) | Named only | Findings naming a product |
|---|---|---|---|
| Google (`google.com`, `youtube.com`) | Search, YouTube, Maps, Gmail, Drive, Docs/Sheets/Slides, Photos, Calendar, Meet, Chat, Voice, Play, Gemini, Translate (14) | Chrome, Android, Assistant, Fi, Fitbit, Google Fit, Pixel, Nest | YouTube 3, Search 2, Gmail 2, Android 2, Voice 2, one each for 12 more; Maps 12 and Calendar 4 in the text |
| Microsoft (+ bing, live, office, microsoft365, xbox, msn) | Bing, Copilot, Outlook, Teams, OneDrive, Microsoft 365, Xbox, MSN, Family Safety (9) | Windows, Edge, Store, Surface, SwiftKey, Skype, enterprise and developer products | Windows 11, Bing 5, Edge 5, Xbox 5, Copilot 4, Outlook 3 of 35; MSN 23 in the text |
| Meta (`facebook.com`, `instagram.com`, `meta.ai`) | Facebook, Instagram, Meta AI (3) | WhatsApp | Facebook 4, Instagram 4, WhatsApp 4 of 31 (the Accounts Centre merge) |
| Amazon (`amazon.com`, `primevideo.com`) | Shopping, Prime Video, Amazon Music, Alexa, Kindle (5) | Devices, physical stores, Gift Cards | Prime Video 2, Music 2, Alexa 2, Gift Cards 2, devices 1, stores 1 of 31 |

**B2 — schema, prompt, validator.**
- **Schema** (`schemas.ts`): `products: string[]` (default `[]`) on every exposure and available
  action. Empty means company-wide: anyone using any product the document governs is exposed.
  `productScopes: [{ product, riskLevel, summary }]` (default `[]`) on the analysis; the top-level
  grade and summary still describe the whole document. The response schema is
  `SitePolicyModelResponseSchema`: one definition in core, replacing three copies (the run on the
  reader's key, the calibration script, the tests).
- **Prompt** (`prompt.ts`): `buildProductScopeBrief(company)` is exported, because it is also the
  brief for S5's analysts.
  - It gives the closed list in two parts: the graded products, each to be graded, and the
    named-only ones, to tag only.
  - It asks for tags only where the document confines a clause to a product, and for a grade and a
    two-to-four-sentence summary for each graded product.
  - For every other document it says to leave products empty.
  - `buildSitePolicyAnalysisUserPrompt` takes `company`. The run on the reader's key passes
    `catalogueCompanyForDomain(target.domain)` and pipes the result through `scopeToCatalogue`, which
    drops any id that is not the company's own rather than failing a paid run. A finding whose ids
    all drop becomes company-wide, which shows it on every product and so hides nothing.
- **Validator:** `productScoping(analysis)` in core returns `not_applicable`, `missing`, `complete`
  or `invalid`, with every problem named. `validate-analysis.ts` rejects `invalid` and reports
  `missing` as *unscoped*. It judges ids against the document's company, so `xbox` on a Google
  document fails as surely as an invented id. A grade must exist for every graded product, once, and
  never for a named-only one. `write-analysis.ts` passes the new keys through unchanged.

**Evidence.**
- **Tests first.** Against stub exports, 19 of the 43 tests in the three touched core files failed.
  The ones that passed were the existing tests and a few catalogue invariants that hold vacuously on
  an empty catalogue; a test pinning the four companies now stops that. There are **23 new core
  tests**, 176 in all, plus **2 in `packages/shared`** that drive `runSitePolicyAnalysis` over a
  stubbed `fetch`: without them, removing the scoping from the run would have left every test green.
- **Every guard broken once: 17 mutations, all red.** Host as a suffix; path as a bare prefix; first
  match instead of most specific; a company domain without its dot boundary; ids judged against the
  whole catalogue; a missing grade let through; a named-only product graded; an unscoped document
  called invalid; a local run keeping every id; keeping duplicate grades; `linkedin.com` claimed by
  Microsoft (fails the bundle test and the lookalike test); the prompt offering every company's
  products; the prompt grading named-only products; `products` with no default; `productScopes` left
  out of the response schema; the run skipping `scopeToCatalogue`; the run never telling the prompt
  the company. Each file was restored from a copy and hash-checked, then `tsc -b --force`, and the
  restored lines were confirmed in `dist`.
- **The validator on the real corpus:** 74 valid, 0 invalid, 9 unscoped (exit 1). Tried on Google's
  privacy analysis:
  - with a full scoping (every graded product, the health finding tagged Fitbit, Pixel, Nest,
    Google Fit): valid, 75;
  - with `xbox` on that finding: `exposures[4].products: "xbox" is not a Google product`.
  The file (gitignored) was restored and hash-checked.
- **Checks:** `pnpm lint` 12/12, `format:check` clean, `pnpm test -- --silent=false` 16/16 (core 176,
  shared 14), no console warnings. `tools/corpus` type-checks. `type-check` and `build` are the
  director's.
- **Bench `s4-final`: 40/74 unasked, +13 by opening; the reference scored 41 on the same loads.** S4
  does not touch discovery or reading: `discover.ts`, `read.ts`, `likeness.ts`, shared's
  `policy-capture.ts` and the bench are unchanged from `3e121c6`. The four verdicts that differ from
  `s4-start` are site variance:
  - **Tinder ×2** were not collected on this load, by either collector. Run alone they give
    `s4-start`'s verdicts exactly.
  - **Dyno ×2:** run alone it gave 1/2, then 2/2, and the reference scored identically on each load.
    It fails the same way now and then (one run closed the page mid-read).
- **Not walked in the harness:** the panel does not read products until B3, so nothing visible
  changed.

**S5's re-analysis: the list and the cost.** The nine documents whose `domain` is a catalogue
company's, exactly the set the bundle test pins:

| Document | Text (chars) | Findings to tag | Grades to write |
|---|---|---|---|
| `b7688f54` google.com privacy | 55,133 | 19 | 14 |
| `c60d3001` google.com terms | 29,510 | 17 | 14 |
| `afedc4d1` microsoft.com privacy | 213,097 | 35 | 9 |
| `3fe6bc5d` facebook.com privacy | 50,092 | 12 | 3 |
| `ab642cdd` instagram.com privacy | 48,851 | 12 | 3 |
| `47c4b597` facebook.com cookie | 3,863 | 7 | 3 |
| `993ed512` amazon.com privacy | 24,639 | 12 | 5 |
| `2d74ae32` amazon.com terms | 28,337 | 12 | 5 |
| `f44a02e5` amazon.com cookie | 5,363 | 7 | 5 |
| **Total** | **458,885** | **133** | **61** |

**Recommended: scope the existing analyses; do not redo them.** Each analyst reads the document and
its current analysis, tags each finding, and writes the grades. The findings, disclosures and
top-level grade stay as validated in Part 4, and the section references each finding already carries
(e.g. *XBOX — …*, *Bing — …*) do most of the tagging. Input, reading each document once: about **115k
tokens** of text, 33k of existing analyses and 16k of briefs, so **~165k**. Output: about **15–25k**
(61 grades of two to four sentences, 133 tag lists). Run in-session like Part 4, with three or four
parallel analysts, allow **~250–350k tokens** of session use in all.

A fresh analysis would read the same text, but it would rewrite 133 validated findings and their
disclosure names, the vocabulary C1 has not reconciled yet, to add a field that needs none of that.

**For S5.**
- **The badge cannot show a product grade from the current index.** `policy-index.bin` holds one
  2-bit grade per domain, and `google.com/search` and `google.com/maps` are one domain. B3's "the
  toolbar badge follows the product grade" needs one of two things:
  - a small product-grade table the background reads (host + path → grade, a few hundred bytes);
  - or the badge keeps the domain's worst grade while the panel leads with the product's.
  This is a design decision to take first thing in S5, before the index or seed changes.
- **`domains` for the nine.** The sibling sites come from the catalogue: youtube.com for Google;
  bing.com, live.com, office.com, microsoft365.com, xbox.com and msn.com for Microsoft; meta.ai for
  Meta; primevideo.com for Amazon.
  - The Facebook and Instagram privacy analyses are two captures of **one** Meta policy (50,092 vs
    48,851 characters, the same seven exposures). If both list every Meta site, instagram.com shows
    it twice. Give each its own site, and meta.ai to one of them.
- **`promptVersion` for the nine:** `adhesion-rubric-v2` = v1's reading plus product scoping. The
  object now makes a claim v1 never made. `write-analysis.ts` has one constant, so S5 sets it per body.
- **The brief** is `buildSitePolicyAnalysisSystemPrompt()`'s calibration plus
  `buildProductScopeBrief(company)` for each document. `validate-analysis.ts` must end at 83 valid,
  0 unscoped.

**Found in passing:** nothing new.

**Manual test** (in the loaded extension, after `pnpm build` or with `pnpm dev` running, and the
extension reloaded at `chrome://extensions`). Nothing on screen changes in S4, since the panel reads
products only from S5. Step 1 checks nothing regressed. Steps 2 and 3 run a real model against the
new output contract, which no test can do; **they spend your own key**, so run them only if you are
happy to.

1. Open `https://www.amazon.com/` (covered). The meta line settles on **Current — verified against
   the live page**, and the grade and findings are as before. *Broken:* an error, or an empty list
   of documents.
2. *(Optional, one small document on your key.)* Open `https://dyno.gg/`. Press **Analyse…**,
   untick everything but the privacy policy, and confirm. The run completes, and the analysis renders
   as runs always have. *Broken:* "Analysis failed", above all with a schema or `response_format`
   message. That would mean your provider rejected the new `products` / `productScopes` contract.
3. *(Optional, one long document, Google's privacy policy at about 55,000 characters.)* Open
   `https://www.youtube.com/t/terms` (YouTube's homepage puts no policy links in the page;
   measured). youtube.com is not covered yet; S5 adds it. Press **Analyse…** and keep only the
   **Privacy Policy** row. `youtube.com/t/privacy` redirects to Google's policy at
   `policies.google.com`. Untick the terms: YouTube's own terms are the single-product case the log
   records as a limit. Confirm. When it completes, right-click in the panel, choose **Inspect**, and
   run this in the Console:
   ```js
   Object.entries(await chrome.storage.local.get()).filter(([k]) => k.startsWith('unshafted-local-policy-analysis:')).map(([, v]) => ({ url: v.analysis.sourceUrl, prompt: v.provenance.promptVersion, grades: v.analysis.productScopes.map(s => `${s.product}: ${s.riskLevel}`), tagged: v.analysis.exposures.filter(e => e.products.length).map(e => `${e.title} → ${e.products.join(', ')}`) }))
   ```
   Google's entry should show `prompt: 'site-policy-prompt-v2'`, **14 grades**, one each for
   `google-search`, `youtube`, `google-maps` and the rest, and at least one finding tagged with a
   product. The Fitbit / Pixel health-data finding is the likeliest. *Broken:* the run fails, there
   are no grades, or an id outside Google's list appears. The model's judgement of *which* findings
   to tag is not the test; send it to me either way, because it is the first real output of the
   brief S5's analysts will use.

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
| A5 JS-rendered | Done (S3) | one rule both sides (`readPolicyPage`); capture = panel hashes; stable 29/29 then 27/29 → rendered never claims *changed*; bench +15 by opening |
| B1 catalogue | Done (S4) | 4 companies, 31 graded + 19 named-only products, measured from the corpus; resolver with must-not-match cases; the bundle's multi-product set pinned at 9 |
| B2 schema + prompt | Done (S4) | `products` / `productScopes` (schemaVersion stays 1), `site-policy-prompt-v2`, validator: 74 valid + 9 unscoped; 17 mutations, all red |
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
| s3-start | `6512686` (`--ref`) | 28/74 | 2 | 5 | 6 | 33 | 0 | 26 | |
| s3-start | S2 (`ccf5cfa`, working tree) | **43/74** | 0 | 0 | 8 | 23 | 0 | 38 | S2 verified: 0 verdicts differ from s2-a3 at settled |
| s3-a5 | S2 (`ccf5cfa`, `--ref`) | 42/74 | 0 | 0 | 8 | 24 | 0 | 39 | blinkit terms refused on this load |
| s3-a5 | A5 (working tree) | **41/74 +15 by opening** | 0 | 0 | 8 | 25 | 0 | 38 (+15) | blinkit ×2 refused on this load (2/2 alone, twice); by opening: chatpdf, futuretools, postman, expedia, zepto, practo, blinkit ×2 each, naukri terms |
| s4-start | S2 (`ccf5cfa`, `--ref`) | 43/74 | 0 | 0 | 8 | 23 | 0 | 36 | |
| s4-start | S3 (`3e121c6`, working tree) | **43/74 +13 by opening** | 0 | 0 | 8 | 23 | 0 | 36 (+11) | S3 verified: only blinkit ×2 differ from s3-a5, found unasked (its reads were refused on S3's load) |
| s4-final | S2 (`ccf5cfa`, `--ref`) | 41/74 | 0 | 0 | 7 | 26 | 0 | — | |
| s4-final | S4 (working tree; discovery unchanged) | 40/74 +13 by opening | 0 | 0 | 7 | 27 | 0 | — | tinder ×2 not collected by either collector (alone: s4-start's verdicts); dyno ×2 flaky (alone: 1/2, then 2/2, reference identical on each load) |

Egress IN (Maharashtra), Chrome 153.0.8010.54, playwright-core 1.63.0, concurrency 4.

"+N by opening" (from S3) counts expected documents the panel does not offer unasked but reads when
the reader presses **Read it by opening the page** on the row it lists them under. It is reported
beside the headline and never folded into it.

**Rendered-read record** (`bench-rendered.ts`, 3 loads each, loads of one URL sequential in one
extension profile, so load 1 is cold):

| Run | Reader | Not a document raw | Documents once opened | Stable | Load 1 not a document | Control (rendered = raw) |
|---|---|---|---|---|---|---|
| s3-stability | quiet 1.5s, bound 12s | 40 (21 bench, 8 packaged, 11 F5) | 29 | **29/29** | 3 (postman privacy, adobe offer terms ×2) | 10/12 (chatgpt ×2 differ) |
| s3-final | + thin wait (under 2,000 chars, to 8s) | 40 | 29 | **27/29** (expedia privacy: a chat widget; instagram privacy: text doubled on a cold load at the bound) | 0 | 10/12 |

The five packaged documents among them hash to the corpus on every settled load. Opened and still
not a document: reuters terms, ola ×2, icici terms (hub), adobe privacy (hub), whatsapp ×3, and
tiktok ×3 (does not load from India).

From S2 the read rule's columns mean more than they did: "found" is a document the panel read and
offered, not only one it listed, so `unreadable` and `lower` no longer occur. A ref from before S2
is still scored by its own rule, which is why the reference rows keep them.

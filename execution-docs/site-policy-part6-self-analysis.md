# Site Policy Awareness — Part 6: Analyse It Yourself

**Status:** W1–W5 built and verified 2026-09-07 · **W6 (verification) in progress** — first real
own-key run failed on a JSON Schema dialect mismatch, fixed in S13 · uncommitted in the working tree
**Owner:** @LuDraGa
**Parent:** `execution-docs/site-policy-part5-side-panel.md` (D1–D16; D16 is the state this
milestone fills in)
**Siblings:** `site-policy-part1-client-corpus.md` (AD-1..AD-7, and the orphaned submission path
this replaces) · `site-policy-part2-provisioning-ticket.md` (the server queue, still deferred) ·
`phase2-google-drive-storage.md` (**stale — says "Not started"; Drive is built**)

---

## What this milestone is

**The honest exit from an uncovered site.** D15 widened the panel to every http(s) page and could
offer nothing there but a reader. D16 wrote down that the dead end is real. This is the way out:
the user analyses the site themselves, with their own key, and keeps the result.

The corpus is 37 domains. The web is not. Everything below exists because that gap is permanent
and a per-site panel has to say something useful inside it.

### Why this replaces the design already on the books

Part 1 §9 built `submitPolicyAnalysisRequest` ([policy-cdn.ts:153](../packages/shared/lib/utils/policy-cdn.ts))
and it has **zero call sites**. It POSTs the page's normalized policy text to an Unshafted endpoint
for review and publication, gated on `CEB_POLICY_SUBMIT_URL`, which is unset because that server is
Part 2. Part 5 §D15 recorded the consequence: *"the uncovered path ends after reading."*

That design needed a paragraph of justification — Part 1 called the click *"the only network egress
in the entire feature tied to a specific domain"* and leaned on consent to make it acceptable.

**Bring-your-own-key deletes the justification instead of restating it.** The text goes to the
user's own provider on the user's own key, from the user's own click — the identical egress the
upload flow has made since v0.6 — and nothing about the site they are on reaches Unshafted at all.
It is not a weaker substitute for the review queue. It is the version that needs no apology.

---

## Decided

### S1 — The user's key, not our server

The analysis runs client-side through `callOpenRouterStructured`, on the provider and model already
configured in Options (OpenRouter or OpenAI, per `resolveProvider` in
[analysis-workflow.ts](../packages/shared/lib/utils/analysis-workflow.ts)).

Consequences, all deliberate:

- **AD-2 / D11 is untouched.** The badge path still makes no network call, ever. This one fires
  only from a click inside the panel, on a page the user is already looking at.
- **The `net-export` release gate still passes unchanged.** Browsing 20 covered and 20 uncovered
  sites triggers nothing here.
- **`submitPolicyAnalysisRequest` stays orphaned and stays in the tree.** It is Part 2's client
  half, and Part 2 is a live question — a corpus that grows from contributed captures is still the
  better long-run answer for *coverage*. This milestone is about the user in front of us now.
  Deleting it would foreclose that decision to save 40 lines.

### S2 — A local analysis is a different kind of object, structurally

**`SitePolicyAnalysisSchema` is not extended and its schema version is not bumped.**

That schema describes a *published* object: bundled, CDN-served, content-addressed, carrying
`promptVersion` and `normalizerVersion` as provenance the corpus stands behind. Adding an
`origin: 'corpus' | 'local'` discriminator to it would mean every consumer — bundle loader, seed,
index builder, the panel, AD-6's future public library — has to check a field to know whether it is
looking at something we vouch for. One missed check and the distinction is gone.

Instead, wrap it:

```ts
type LocalPolicyAnalysis = {
  analysis: SitePolicyAnalysis;   // the same shape, so rendering is shared
  provenance: {
    ranAt: string;                // ISO
    provider: 'openrouter' | 'openai';
    model: string;                // whatever the user has configured
    promptVersion: string;        // site-policy-prompt-v1 — NOT adhesion-rubric-v1, see S4
    excerpted: boolean;           // S6
    sourceChars: number;
  };
};
```

Stored under its own key, never in `sitePolicyCacheStorage`. The rendering components take a
`SitePolicyAnalysis`, so the panel reuses `WorstRisk`, `OneThing` and `DocumentCard` unchanged —
but a local object **cannot** reach a corpus code path by accident, because it is not that type.

### S3 — The badge stays corpus-only, and the panel says whose analysis it is

The toolbar badge means *"we have read this site's policies."* D15 refused to widen it even while
widening the panel, and this does not widen it either. A local analysis lights nothing on the
toolbar.

Inside the panel it renders with the full layout — risk level, the one thing, per-document cards —
under an attribution line that is not decoration:

> Analysed by you on 7 Sep 2026 · openai/gpt-5 · not reviewed by Unshafted

The freshness strip does not apply and does not render: "as we read it" is a claim about *us*
reading it, and we did not.

### S4 — The rubric has to become a real prompt, and must not claim the old version string

**This is the actual work of the milestone, not the button.**

`PROMPT_VERSION = 'adhesion-rubric-v1'` and `ANALYST_MODEL = 'claude-opus-5'` in
[write-analysis.ts:31](../tools/corpus/write-analysis.ts) are provenance *labels*. There is no
executable prompt behind them — the 82 corpus analyses were produced by an Opus session reading
full documents out of `corpus/text/` and emitting JSON through `write-analysis.ts`. Nothing in
`prompts.ts` produces a `SitePolicyAnalysis`.

The existing prompts are the wrong shape and deliberately so. `buildQuickScanPrompt` and
`buildDeepAnalysisPrompt` target a document the user is about to sign — roles, priorities,
negotiation. Site policies are contracts of adhesion, which is the entire reason
[schemas.ts:14](../packages/unshafted-core/lib/site-policy/schemas.ts) exists and why the output
verb is *know / opt out / avoid / leave*.

So: a new `buildSitePolicyAnalysisPrompt`, versioned **`site-policy-prompt-v1`**.

**It must not be labelled `adhesion-rubric-v1`.** That string is a claim about a specific process —
an Opus pass over the complete normalized text, hand-validated against the schema. A possibly
truncated excerpt through whatever model the user configured is a different process, and letting
the two share a version string would make the corpus's own provenance field meaningless the first
time a local object was ever compared against a published one.

The prompt inherits the corpus's standing rules verbatim, because they are what make the output
honest rather than merely plausible:

- Never infer a fact the document does not state — not an effective date, not a jurisdiction, not
  a deadline's anchor.
- Where the text is incomplete, `confidence: 'medium'`, and **no disclosure is recorded as
  `absent`** — from a partial read that is a false claim about a real company. Note that
  *"record it as unverified"*, the phrasing this rule carries elsewhere, **is not implementable**:
  `DisclosureStatusSchema` is exactly `present | absent | not_applicable`, and "unverified" lives
  only in prose `note` text (twice in 83 corpus analyses). The operation is to DROP the entry.
  `not_applicable` would be a different and equally false claim.
- Deadlines are windows, never countdowns.
- `peerDeviation` is always `[]`. Peer share requires the corpus and a minimum-N of 10; a single
  local run has no peers and must not invent one.

### S5 — All documents by default, individually on request, always behind a confirm

The panel offers **Analyse this site** as the primary action, which covers every same-origin policy
document discovery found, and **Analyse** on each individual reader row for one at a time.

Neither fires without a confirmation step that states, before a single call is made:

- how many documents, named
- total characters, and which of them will be excerpted (S6)
- the provider and model it will use
- **that it runs on the user's own key and costs their own credits**

Default is all, because a terms document without its privacy policy is half an answer, and the
per-row control exists so that a user who only wants the one they are reading is not forced to buy
the set. Nobody discovers the price after paying it.

Calls run sequentially, not in parallel — a failure partway through leaves completed analyses
saved, and the panel says which ones did not run.

### S6 — Truncation is disclosed, recorded, and reflected in confidence

`DEEP_ANALYSIS_CHAR_LIMIT` is 42,000 characters. Real policy documents blow through it — Part 4
counted one at 213,097. `buildBalancedExcerpt` already handles the cut for the upload flow.

The corpus rule about incomplete captures applies with full force here, because this is exactly the
case it was written for. An excerpted run:

- says so in the confirm, per document, before the user spends anything
- carries `excerpted: true` in provenance
- is capped at `confidence: 'medium'` in the stored analysis regardless of what the model claims
- renders the caveat in the panel next to the attribution line

### S7 — No key is a route, not a refusal

If no API key is configured, the button still renders. Clicking it explains what the analysis needs
and opens Options deep-linked to the key field — the `?provider=` param and the `api-key`
onboarding step already exist and `Options.tsx` already focuses that input.

The panel does not require sign-in. A key alone is enough; Drive (S9) is the thing that needs an
account, and it is additive.

### S8 — Local analyses do not live in the corpus cache

`sitePolicyCacheStorage` budgets 4 MB and evicts LRU on write
([unshafted-policy-storage.ts](../packages/storage/lib/impl/unshafted-policy-storage.ts)). That is
correct for what it holds: published analyses, keyed by content hash, **re-fetchable from the CDN**,
where eviction costs one request.

A local analysis is not re-fetchable. Evicting one destroys something the user paid for. So it gets
its own storage key and its own budget, and pressure surfaces as a prompt to delete rather than a
silent LRU drop. Drive (S9) makes this recoverable; until Drive is connected it is not.

### S9 — Drive is the durable copy, and it already works

`phase2-google-drive-storage.md` says *Not started*. It is wrong.
[drive-sync.ts](../packages/supabase/lib/drive-sync.ts) ships `syncQuickScanToDrive`,
`syncDeepAnalysisToDrive`, `loadHistoryFromDrive` and `deleteFromDrive`, keyed on
`contentHash` + `analysisType` with upsert dedup into a named Unshafted folder.

Adding a third analysis type is a `DriveSitePolicyFile` in `drive-types.ts` and one
`syncSitePolicyToDrive` alongside the other two. It inherits the existing contract exactly:

- local `chrome.storage.local` is the working copy, Drive is the durable backup
- sync returns `false` and never throws; a Drive failure never blocks or fails an analysis
- no token, no account, or no Drive scope → the analysis still runs and still saves locally

**Fix the Phase 2 doc's status as part of this work.** A doc that says a shipped subsystem does not
exist will cost someone a day.

### S10 — Cross-origin documents cannot be analysed, and the UI says why

AD-4: only same-origin documents are fetchable from the page's context. 7 of 36 corpus domains host
their legal text elsewhere. Those rows already list an *Open page* link and no *Read here*; they get
no *Analyse* either, with the same one-line reason. Guessing at a document we cannot read would be
the exact failure the confidence rules exist to prevent.

### S11 — A document we cannot name is one we must not grade *(added 2026-09-07, found in review)*

`discover.ts` leaves `RankedPolicyCandidate.docType` **null** for a link that is plainly legal but
names no type we recognise — a footer reading only "Legal". The first implementation defaulted
those to `terms` when building the analysis target, matching what `DocumentReader` already does for
download filenames.

That fallback is safe for a filename and not safe here, because `docType` does two other jobs:

- it selects the brief and the disclosure checklist the prompt reads the document **against**, so
  an untyped privacy policy would be graded on the terms checklist and marked absent for
  disclosures it was never expected to carry; and
- it is stored on the analysis as a claim about **what the document is**, and syncs to the user's
  Drive saying so.

So untyped candidates are excluded from analysis at the caller, the same way S10 excludes
cross-origin ones, and the reader keeps listing them. **Reading a document we cannot name is fine;
grading one is not.** The cost is that some genuinely analysable documents are not offered — the fix
is better type detection in `discover.ts`, not a guess at the point of use.

### S12 — "We could not look" is not "there is nothing here" *(added 2026-09-07, from use)*

Reported from a real session: the panel was open on one site, the user browsed to
`en.wikipedia.org`, and no documents appeared. They opened the popup, clicked its button, still saw
nothing change, and the documents arrived some time later. Three separate defects, all of them
about the product refusing to say what it was doing.

**1. `activeTab` is revoked by navigation, and the panel said nothing about it.** The permission is
granted when the user invokes the extension and dropped the moment the tab navigates, so a panel
left open while someone browses has no right to look at the new page. `discoverActiveTabPolicies`
correctly returns `{status:'error'}` — and `DocumentReader` rendered that identically to a
successful search that found nothing: *"Nothing on this page links to a policy document."* **That is
a claim about someone else's site made from a page we never read**, which is precisely the class of
statement this corpus exists not to make. The failure states are now distinct, and the error state
carries a **Look again** button, because a click is itself the gesture the failed attempt was
missing. `useLivePolicyCheck` gains `rediscover()` for it — the one deliberate exception to
"once per tab and origin", justified because the automatic attempt is the one most likely to fail.

**2. Progress was invisible.** The only "Looking at the page…" text lived *inside* the reader's
`<details>` body, which is collapsed by default, so a user watching the panel saw a static screen.
The count pill in the summary now reads `Looking…` until discovery resolves.

**3. The popup button named an action it does not perform.** *"Find documents"* opens the side
panel and searches nothing. Clicking it and seeing the popup unchanged left no way to tell whether
a search was running, finished, or never started. It now reads **"Read its policies"** — a
destination, matching its covered sibling *"What you agreed to"*.

The through-line: every one of these was the UI declining to distinguish *we did not look* from
*we looked and found nothing*. The second is a finding; the first is a state the user can fix, and
only if we say so.

### S13 — The OpenAI response schema is generated in a different JSON Schema dialect than OpenAI validates *(added 2026-09-07, found in W6)*

Every own-key run on `chess.com` failed identically, before any tokens were spent:

> `Invalid schema for response_format 'site_policy_analysis': True is not of type 'number'.`

The LLM call is centralized and quick scan and deep analysis were both fine, which pointed away
from `callOpenRouterStructured` and toward the one thing that differs between the three callers —
the response schema itself.

`buildResponseFormat` converts the Zod schema with `zodToJsonSchema(schema, { target: 'openAi' })`.
That target is derived from the **OpenAPI 3** dialect, where an exclusive bound is spelled as the
boolean `exclusiveMinimum: true` alongside `minimum: 0`. OpenAI validates `response_format` as
**draft 2020-12**, where the keyword *is* the number. Nothing in the Zod source hints at this: the
offending declaration is `AvailableActionSchema.deadline.days`, `z.number().int().positive()` —
the only exclusive numeric bound anywhere in a model-response schema, which is exactly why the two
older callers never hit it. Every other openAi-target quirk (`.optional()` becoming nullable and
required, `additionalProperties: false`, `.default([])`) is already strict-mode-correct.

**Fixed at the seam, not in the domain schema.** Rewriting `days` as `.min(1)` would work and would
be wrong: it makes a domain schema say something other than what it means in order to appease a
transport detail, and it holds only until the next `.positive()` is written. `openrouter.ts` now
normalizes draft-4 exclusive bounds into their draft-2020-12 form on the way out, once, for every
caller. `test/openrouter-response-format.test.ts` pins it on the **wire body** rather than on the
Zod schema, because that is the only place the mismatch is visible.

---

---

## Not doing

- **Contributing local results back to the corpus.** Decided 2026-09-07. Results stay in the user's
  storage and their Drive. Nothing reaches Unshafted. Corpus growth remains Part 2's problem.
- **Re-analysis on change.** D6 already detects that a document changed. Offering "re-analyse" on
  top is a natural follow-up and is out of scope until the first version has been used.
- **Peer deviation on local analyses.** See S4 — structurally impossible without the corpus.
- **Analysing a site the corpus already covers.** Arguable (a user may want a second opinion, or a
  newer read), but it collides with S3's attribution in a way worth thinking about separately.
  First cut: the action appears on uncovered sites only.

---

## Open

1. **What happens when a local analysis exists for a site the corpus later covers?** The panel would
   hold two analyses of the same document with different provenance. Corpus wins for the grade;
   whether the local one is kept, shown as history, or dropped is unresolved.
2. **Model quality floor.** Nothing stops a user pointing this at a cheap model that produces
   schema-valid nonsense. The attribution line names the model, which is honest, but honest is not
   the same as useful. A recommended-model hint in the confirm is the cheap half-answer.
3. **Cost estimate, not just character count.** We know characters and can estimate tokens; we do
   not know the user's per-model price. Showing tokens and naming the model may be as far as this
   can honestly go.
4. **`chrome.storage.local` pressure.** 10 MB total, 4 MB already budgeted to the corpus cache.
   S8's separate budget needs a number, and `evictToBudget` has no test today (Part 5 handoff).

---

## Work plan

- [x] **W1 — The prompt.** `buildSitePolicyAnalysisSystemPrompt` and
      `buildSitePolicyAnalysisUserPrompt` in `unshafted-core`, versioned `site-policy-prompt-v1`,
      emitting the analytic half of `SitePolicyAnalysisSchema`. Carries the four standing rules from
      S4. Calibrated against four documents in `corpus/text/` with a hand-written Opus analysis to
      compare against — the only calibration data we have. See **W1 calibration** below.
- [x] **W2 — The runner.** `runSitePolicyAnalysis(capture, settings)` in
      `packages/shared/lib/utils/`, mirroring `runQuickScan`'s shape: resolve provider, excerpt,
      call, parse, force `confidence: 'medium'` when excerpted. Returns `LocalPolicyAnalysis`.
- [x] **W3 — Storage.** `localSitePolicyStorage` in `packages/storage`, own key and budget, with the
      delete-don't-evict behaviour from S8. Tests, including the eviction path.
- [x] **W4 — Panel UI.** The confirm sheet (S5), the primary and per-row actions, progress across
      sequential runs, the attribution line and excerpt caveat (S3/S6), the no-key route (S7).
      Uncovered sites only; `CoveredView` and the toolbar badge are untouched. `WorstRisk` and
      `OneThing` moved to `components/AnalysisView.tsx` so the local view renders the same layout
      under a different signature. Unverified against a live run until W2 lands.
- [x] **W5 — Drive.** `DriveSitePolicyFile` + `syncSitePolicyToDrive`, wired to fire after a
      successful local save and to fail silently. Correct `phase2-google-drive-storage.md`.
- [ ] **W6 — Verify.** Uncovered site with a key; uncovered site without one; a 200k-character
      document (excerpt path); a cross-origin-only site (S10); signed-out and signed-in; and the
      `net-export` gate re-run to confirm nothing fires without a click.

**Sequencing note:** W1 is the risk. Everything else is plumbing against interfaces that already
exist, but a prompt that produces schema-valid output which is *wrong* would ship a false claim
about a real company under the user's own name. W1 gets validated against the hand-written corpus
before W4 puts a button in front of anyone.

---

## W1 calibration

`buildSitePolicyAnalysisSystemPrompt` and `buildSitePolicyAnalysisUserPrompt` are in
[prompt.ts](../packages/unshafted-core/lib/site-policy/prompt.ts). The model is asked for six keys —
`summary`, `riskLevel`, `confidence`, `exposures`, `availableActions`, `requiredDisclosures` — and
nothing else, on the same reasoning `write-analysis.ts` gives for filling provenance from
`curated.json`: a model asked to restate an observed fact rewrites it as a plausible one, and a
wrong `contentHash` validates perfectly while making the object unreachable forever.

### What was compared

Four hand-written analyses and the `corpus/text/` documents they were written from, chosen to span
the risk scale and four document types:

| | | | |
|---|---|---|---|
| `887b98bf` | americanexpress.com | regulatory_disclosure | **Low**, 9,242 chars |
| `f44a02e5` | amazon.com | cookie | **Medium**, 5,370 chars |
| `83d53ffe` | openai.com | privacy | **High**, 22,607 chars |
| `7db58935` | uber.com | terms | **Very High**, 34,809 chars |

The comparison is analytic, not empirical: for each, read the source text, read the hand-written
analysis, and ask whether this prompt asks for the findings that analysis produced. It is a design
review. See weakness 7.

### What changed as a result

- **Page furniture became a rule.** Roughly half of Amazon's normalized cookie text is help-centre
  chrome — a feedback widget, "Quick solutions", the global footer. The hand-written analysis drew
  nothing from it *except* one thing: it cited the footer's link to "Additional State-Specific
  Privacy Disclosures" as evidence that a page exists, while scoping the CCPA finding to this
  document's text. That distinction is now a `HOW TO READ` bullet, because the obvious failure on a
  live capture is treating "Manage Prime · Cancel or view benefits" as an available action.
- **Carve-outs became a rule.** Three of Amex's five exposures come out of one list — *"The
  compensation framework shall not be applicable in the following cases"* — which sits well below
  the commitments it qualifies. Uber's €500 cap is a single sentence inside a 200-word all-caps
  block. Both are now called out: the exclusions are where the cost lives, and all-caps scans as
  noise precisely where it should not.
- **The privacy checklist gained "data received from other sources."** Two of OpenAI's six
  exposures — advertisers reporting purchases back, the address-book upload covering people who
  never signed up — come from inbound data, a section an outbound-shaped checklist walks past.
- **`riskLevel: 'Low'` is now named as reachable and described.** Amex is the proof it exists.
  Without saying so, a rubric written around adhesion grades every document High and the scale
  stops carrying information.
- **The excerpt rule was made stricter than corpus practice.** Flipkart's privacy analysis
  (`263a86c0`, the corpus's `confidence: medium` case) keeps `status: 'absent'` and reconciles it in
  the note — *"Treat as unverified rather than confirmed missing."* This prompt forbids `absent`
  outright when `excerpted` is true. `DocumentCard` renders every absent row in a red box under
  **Missing disclosures**; a note inside that box does not undo the heading, and unlike the corpus
  no one hand-checks a local run. What could not be verified goes in the summary instead.

### Where this will be weaker than the hand-written corpus

Stated plainly, because the button in W4 goes in front of a user on their own key and under their
own name.

1. **No cross-document findings, structurally.** OpenAI's sharpest exposure is that the privacy
   policy promises no notice of changes while the Terms of Use promise thirty days — *"The document
   governing your data is the one with the weaker commitment."* That needs both documents open. S5
   runs a site's documents sequentially and independently, and nothing composes the results. This
   whole class of finding is unavailable and no prompt change recovers it.
2. **No corpus means no norms, and the writing goes flat.** Several of the best corpus lines are
   comparative — "the strongest complaint document in this corpus", "Snap's cookie policy names
   eleven partners individually, so the category-level description is a choice rather than a
   constraint." Standing rule 4 forbids the model doing that, correctly, since it has no peers. The
   cost is real: local summaries will be accurate and duller.
3. **A named checklist is a floor that will be read as a ceiling.** The corpus's disclosure names
   came from an analyst noticing what *should* have been present. Handing that list to a model
   invites checking the list and stopping. The counter-instruction is in the prompt; a weaker model
   will drift to the list anyway, and the drift is invisible in valid output.
4. **`verticals` will usually be empty on this path.** `discover.ts` guesses `docType` and nothing
   guesses vertical, and the prompt forbids the model guessing one. So the vertical half of the
   checklist — GLBA notices, auto-renewal disclosures, DMCA agents, admin access to a user's content
   — is silent on most real runs. Closing this is W2/W4's problem, and it is worth closing: it is
   the half that produces absence findings.
5. **The model floor is untouched.** The corpus is Opus over complete documents. This runs on
   whatever Options is set to. The calibration bullets state targets, not capabilities, and open
   question 2 in this document remains open.
6. **Excerpting bites hardest where documents are worst.** All four comparisons fit inside the 60k
   budget, so none of them exercised the excerpt path. Booking's terms are 172k and Paytm's 295k,
   and length correlates with arbitration, licence and liability sections sitting late.
   `buildBalancedExcerpt` samples across the document rather than truncating, which helps and does
   not fix it. The honest read of weaknesses 4 and 6 together: the longest documents will produce
   the fewest absence findings, which is backwards.
7. **Nothing here has been run against a model.** No output was generated and diffed against a
   hand-written analysis, because that needs a key and W2's runner. The real gate is running this
   over these same four documents and comparing — exposure count, severity distribution, whether
   the same clauses surface. Until then, the claim is that the prompt asks for the right things,
   not that it gets them.
8. **One deliberate divergence in `deadline.kind`.** Uber's sixty-day mediation window is recorded
   in the corpus as `relative_to_signup`; the sixty days actually run from the mediation request,
   not from signup. This prompt would produce `kind: 'none'` with the window in the description. I
   think that is the more honest encoding, and it does mean a local object and a corpus object can
   encode the same clause differently. Anything that later groups by `kind` needs to know.

---

## Status

W1–W5 are built, type-check across all eight affected packages, and pass 74/74 in
`unshafted-core` plus 13/13 in `packages/storage`. **Nothing has been run against a real model or
loaded into Chrome.**

| | |
|---|---|
| Design decisions | S1–S12 settled 2026-09-07 |
| Code | W1 prompt · W2 runner + service-worker handler · W3 storage · W4 panel UI · W5 Drive |
| Tests | `unshafted-core` 74/74 · `packages/storage` 13/13 (new; the package had no harness before) |
| Blocked on | W6 — and specifically on the two gates below, neither of which a code change can close |

### The two gates that remain, both requiring a human

1. **W1 has never met a model.** The calibration above is a design review: it argues the prompt
   asks for the right things, and does not show that it gets them. The real gate is running
   `runSitePolicyAnalysis` over the same four corpus documents it was calibrated against and
   diffing the output — exposure count, severity spread, whether the same clauses surface. That
   needs an API key, so it cannot be done from a build step. **The script is written**:
   `node --import tsx tools/corpus/calibrate-site-policy-prompt.ts` (or `pnpm --filter
   @extension/corpus-tools calibrate`) runs the real prompt over the four documents W1 was
   calibrated against and prints the comparison. It reads the corpus text WHOLE rather than
   excerpting, so a divergence cannot be confused with the prompt having seen less than the
   analyst. It prints a comparison, never a score — see the header for why turning it into a CI
   assertion would measure agreement with one earlier run rather than correctness.
2. **The `net-export` zero-egress gate (open since M1b) now has a second thing to prove.** It must
   still show zero requests while browsing, AND that the only request the analysis path ever makes
   is to the user's configured provider, from a click, after the confirm.

Until both are done, no claim in this milestone about output quality has been tested.

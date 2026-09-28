# Deep report page — how the full report is presented

**Written:** 2026-09-23 · **Branch:** `dev/v0.8.3` · **Status:** R1 done; Q1–Q3 answered, and **§11
supersedes the parts of §4 and §5 it names**. Read §11 before building anything past R1. Implementation is
deliberately left to a fresh session; see [`deep-report-session-handover.md`](deep-report-session-handover.md).
Progress is tracked in [`deep-report-execution.md`](deep-report-execution.md).

---

## 1. Why a page, in the director's words

> there is a ux bug for the deep analysis where the section in a tab if too many or too long become
> unreadable .. im thinking the deep analysis results should be visible in a new tab or page itself
> (not popup or side panel) for its value and readability to be done properly

The popup is 440×600 (`pages/popup/src/index.css`). Walking a real deep result in it turned up these
problems:

| Failure | Where | Status |
|---|---|---|
| Rows **crushed below their own height** once a lens outgrew its 360px cap. The panel never scrolled; flexbox squashed every row through its title. 12 of 12 Asks rows affected. | `.popup-item` in a capped flex column | fixed in the popup (P3) |
| Titles cut to one line, and a question's title **is** its content | `.popup-item-title` | fixed in the popup (P1) |
| Evidence repeated every Blockers finding verbatim | `buildEvidenceLens` | fixed in the popup (P2) |
| Asks puts five different kinds of item in one flat list with no headings | `buildAsksLens` | **the page's job** |
| Only one item open at a time, so findings can't be compared | exclusive `<details name>` | **the page's job**; correct for a popup |
| The deep prompt sets **no count limit** on any section | `buildDeepAnalysisUserPrompt` | why a bounded surface cannot be the fix |

The popup fixes make the popup a readable *preview*. The page is where a deep result gets read,
acted on and kept.

**This revises a v0.10 decision, for deep results only.**
[`v0.10-simplicity-discussion.md`](v0.10-simplicity-discussion.md) (line 326) considered "jump to a new
full page" and chose in-popup lenses instead, on NN/G's grounds that tabs suit *content of similar
nature, of which only one is needed at a time*. That still holds for a quick scan. A deep result is
different: it is a document that gets read end to end, compared against the contract, taken into a
negotiation and printed. "One at a time" is the wrong model for that. Record this so nobody later
"fixes" it back.

## 2. Decisions already made (director, 2026-09-23)

| | Decision |
|---|---|
| D1 | **Popup keeps its lenses as a preview.** Add an *Open full report* button once a deep result exists. The quick scan stays in the popup unchanged. |
| D2 | **The report opens only from the button.** No automatic tab on completion. The run happens in the background, often after the popup has closed, and opening a tab then would take focus from whatever the reader is doing. |
| D3 | **Ships in `dev/v0.8.3`.** It touches no side-panel files. |
| D4 | **Three popup preview fixes shipped first** (P1–P3 in the execution doc). |
| D5 | **History entries open the report tab** instead of the inline popup view, **for deep records only** (narrowed by Q3, see D8). |
| D6 | **Q1 → layered disclosure, not "everything expanded".** The director reopened the no-accordions rule: a whole page should be *designed* for attention, not just unrolled. §11 is the design, approved from a mockup as a base that needs real polish. |
| D7 | **Q2 → checklist ticks are remembered per report.** §11.5. |
| D8 | **Q3 → quick-only History entries stay inline in the popup.** The page renders deep records only; the popup's inline viewer stays for quick scans. |

## 3. What the reader comes to the page to do

In priority order. Every layout choice below answers to one of these.

1. **Decide:** sign, negotiate or walk away. The verdict comes first and fits in one screen.
2. **Act:** take the asks to the other side. Asks are copyable, checkable and printable, with nothing
   hidden behind a click.
3. **Verify:** hold a finding against the contract. The quote shows without any interaction.
4. **Keep:** save as PDF, copy or export. The page prints cleanly.

## 4. Information architecture

The section names and their order match the popup lenses, so going from the preview's *Asks* to the page lands on
*Asks*. Each section opens with one plain-language sentence saying what it holds; that sentence
carries the tone the names cannot.

| # | Section (TOC name) | Holds — schema fields | Presentation |
|---|---|---|---|
| 0 | **Header** | `source.name`, `quickScan.documentType`, `quickScan.parties.length`, `selectedRole`, `createdAt`, `storageState` | Document name as the `h1`, then a meta line. Actions on the right: Copy, Export, Print, Delete. |
| 1 | **Verdict** | `overallRiskLevel`, `getDecisionAction(level)`, `bottomLine`, `plainEnglishSummary`, `rolePerspective` | The only tinted block, dark like the popup's verdict. Risk badge + action on one line, then `bottomLine` in the serif at reading size, then the summary. |
| 2 | **Blockers** | `immediateWorries`, `oneSidedClauses`, `timingAndLockIn`, `couldShaftYouLater` | **One list sorted by severity** (recommended, see Q1), each finding tagged with its origin: *Immediate worry*, *One-sided*, *Timing & lock-in*, *Could shaft you later*. Finding = title, severity, quote, *What this means*, *Why it matters*, reference label. All expanded. |
| 3 | **Asks** | `negotiationIdeas`, `suggestedEdits`, `missingProtections`, `questionsToAsk`, `protectionChecklist` | **Five headed subsections**, which is the popup's worst failure fixed. Negotiation ask: the ask, why, *Fallback*, *Target clause*. Suggested edit: the edit as a quotable clause block with its own copy control, then why. Missing protection: title, why it matters, *Common fix*. Questions: a numbered list, full text, one *Copy all questions* control. Checklist: groups of real checkboxes (see Q2). |
| 4 | **Obligations** | `quickScan.keyObligations` | Plain list. Omitted when empty. |
| 5 | **Evidence** | `topicConcerns` | Grouped by `category` under small headings (Payment, Liability, …). Each item: title, severity, quote, why it matters, reference. |
| 6 | **Wins** | `potentialAdvantages` | Title, why it helps, reference. Omitted when empty. |
| 7 | **Doc** | `quickScan.parties`, `quickScan.topics`, `documentType`, `selectedRole`, `priorities` | Parties as `name · role`, topics as chips, "Reviewed as … against …". |
| 8 | **Caveats** | `quickScan.extractionConcerns`, `source.warnings`, `assumptionsAndUnknowns`, `clauseReferenceNotes` | Extraction problems in the guidance tone first, because they qualify everything above. Then assumptions, then reference notes. |
| — | **Footer** | `deepAnalysis.disclaimer` | One line, always present, and printed. |

**The TOC shows only non-empty sections**, the same rule the popup's lens filter uses. Counts match
what is rendered: one per finding, one per question, **one per checklist group**. The popup gets
that last one wrong ([#89](https://github.com/LuDraGa/unshafted/issues/89)); don't copy it.

**Quick-only records** (History holds them too) render the same page with the quick fields: red
flags in Blockers (`reason` in place of what/why), the derived asks, Obligations, Doc, Caveats. A
short line under the verdict says this is a quick scan and that the detailed analysis runs from the
popup. See Q3.

## 5. Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ UNSHAFTED   service-agreement.pdf · DANGER          Copy  Export  Print  Delete  │ ← slim sticky bar, appears
├──────────────┬───────────────────────────────────────────────────────────────────┤   once the verdict scrolls out
│              │  service-agreement.pdf                                            │
│  Verdict     │  Service Agreement · 2 parties · Reviewed as Contractor · 23 Sep  │
│  Blockers  6 │  ┌─────────────────────────────────────────────────────────────┐  │
│  Asks     12 │  │ DANGER  Pause and get help                                  │  │
│  Obligat.  4 │  │ Yes, this can shaft the contractor later because…  (serif)  │  │
│  Evidence  3 │  │ This agreement is workable only if…                         │  │
│  Wins      1 │  └─────────────────────────────────────────────────────────────┘  │
│  Doc         │                                                                   │
│  Caveats   2 │  Blockers                                                         │
│              │  What could cost you, worst first.                                │
│  (sticky,    │  ▍HIGH  You can lose payment based on vague dissatisfaction       │
│  scroll-spy) │  ▍      Immediate worry · Fees                                    │
│              │  ▍      "withhold payment for any dissatisfaction in its sole…"   │
│              │  ▍      What this means. …   Why it matters. …                    │
│              │  ─────────────────────────────────────────────────────────────    │
│              │  ▍HIGH  Your liability is effectively uncapped                    │
│   220px      │                         main column ≤ 720px (~70ch)               │
└──────────────┴───────────────────────────────────────────────────────────────────┘
```

| Width | Layout |
|---|---|
| ≥ 1024px | TOC rail on the left (sticky, 220px), main column up to 720px, both centred together. |
| 720–1023px | Rail becomes a sticky horizontal section strip under the header bar. |
| < 720px | Single column; the strip scrolls sideways. No horizontal page scroll at any width. |

- **Scroll-spy:** `IntersectionObserver` on the section headings sets `aria-current="location"` on
  the matching TOC entry. Clicking an entry scrolls to it with `scroll-margin-top` equal to the
  sticky bar's height. `scroll-behavior: smooth` only when motion is allowed (see §6).
- **The sticky bar** is invisible while the full header is on screen, then becomes a solid bar with
  a hairline. Use an `IntersectionObserver` on the header, **not** `scroll-state(stuck)`, which the
  side panel found inert in Chrome 152 (`panel-weight-redesign-session-handover.md`).
- ~~No accordions anywhere.~~ **Superseded by D6 / §11.** The job this rule protected still stands
  and §11 keeps it: nothing needed to *verify* a finding (its title, severity and quote) is ever
  behind a control, and print and find-in-page see everything.

## 6. Visual language

Reuse, don't invent. The popup and side panel already settled these.

- **Tokens:** everything from `packages/ui/global.css` (`--unshafted-*`, the severity trio, the risk
  ramp through `RISK_TONE`). Import `@extension/ui/global.css` the way `options` does.
- **Type:** the serif (`Iowan Old Style` stack) for the `bottomLine`, section headings and the `h1`;
  the sans (`Avenir Next` stack) for body text. **Body at 15–16px, line-height 1.6.** The popup's
  12px body is a concession to 440px, and a reading page doesn't need it.
- **Ladders from the side panel** ([`panel-lens-hierarchy-execution.md`](panel-lens-hierarchy-execution.md)
  §3.3), scaled up for a page:
  - *Surfaces:* the verdict is the only tinted block. Sections sit on the ground. Findings are flat
    rows separated by hairlines, with a 3px severity rule on the left, **not nested cards**.
  - *Buttons:* four ranks. A filled button only for a commit (Delete's confirm step). Outlined for Print
    and Export. Text buttons for per-block Copy. Icon-only is not used here.
  - *Space:* 8px inside a finding, 16px between findings, 48px between sections.
  - *Labels:* the amber caps eyebrow is for the brand mark only. Section intros, *What this means*,
    *Fallback* and origin tags are sentence case.
- **Severity** shows twice on purpose: the pill (words, for scanning and screen readers) and the left
  rule (colour, for the eye). Never by colour alone.
- **Light only.** `global.css` has no `prefers-color-scheme` branch, so the extension has no dark
  theme, and this page shouldn't be where one starts.
- **Motion:** honour the existing `prefers-reduced-motion` block in `global.css`; the smooth scroll
  goes behind it.

### Print (`@media print`)

The reader's most likely way to take this into a negotiation, so it gets designed rather than
tolerated.

- Hide the TOC, the sticky bar and every action. Show everything else.
- Black on white. Keep the severity pills; drop the tinted verdict ground to a bordered box.
- `break-inside: avoid` on each finding and each checklist group. `break-after: avoid` on headings.
- Running header: document name, "Unshafted report", date. The disclaimer prints last.
- Checkboxes print as empty boxes, unless ticked.

## 7. Behaviour

### Route and data

- **URL:** `report/index.html?id=<historyRecordId>`. The id is only a lookup key into
  `analysisHistoryStorage` (`chrome.storage.local`). It is never put into a URL that leaves the
  extension, never sent anywhere and never rendered as HTML.
- **Live:** the storage has `liveUpdate: true`. A deep re-run from the popup while the tab is open
  replaces the record under the **same id** (`createHistoryRecord` uses `analysis.id`), and the page
  re-renders in place. Show a quiet *Updated just now* next to the meta line when that happens.
- **Loading:** the popup's button appears when `currentAnalysis.deepAnalysis` lands, and the
  background pushes the history record just after it writes `currentAnalysis`
  (`chrome-extension/src/background/index.ts`, deep handler). So a very fast click can arrive before
  the record exists. Wait on the live storage for a short window, about 3s, before declaring it
  missing. Never flash "not found".
- **Missing record:** history is capped at **6** (`HISTORY_LIMIT`), and `push` removes any record with
  the same `contentHash`. So a record can go three ways: evicted, deleted, or replaced by a fresh
  upload of the same file under a *new* id.
  - Opened cold with a stale id: "This report is no longer in your history", with a note that
    History keeps the latest six.
  - Disappeared while open: the page still holds the record's `contentHash`. If another record with
    that hash appears, offer "A newer report for this document exists → Open it". Otherwise keep the
    content on screen, marked *Removed from history*. The reader was mid-read, so don't blank it.
- **Title:** `document.title = "<source.name> — Unshafted report"` so tabs and PDF filenames make
  sense.

### Actions

- **Copy / Export .md** reuse `createReportMarkdown` (`packages/unshafted-core/lib/runtime.ts`). **It
  truncates today:** top risks `.slice(0, 6)`, asks `.slice(0, 8)`, edits `.slice(0, 5)`, flags
  `.slice(0, 5)`. That is wrong once there is a full page to export. Make it complete. There are no
  installed users to stay compatible with, and the popup's History copy and export use
  the same function and get more complete too.
- **Print** → `window.print()`.
- **Delete** → a text button that turns into an inline confirm, the same pattern as the popup's
  History delete. Then `analysisHistoryStorage.removeReport(record)` and a *Deleted* state that
  offers to close the tab. Don't auto-close it.

### Opening it (popup side)

- **Button:** *Open full report*, outlined, full width, directly under the verdict, shown when
  `deepAnalysis` exists. The filled rank stays with the CTA bar's *Re-run analysis*, which spends
  money.
- **Tab reuse:** if a tab already shows `report/index.html?id=<same id>`, focus it
  (`chrome.tabs.query` + `chrome.tabs.update` + `chrome.windows.update`). `tabs` is already declared,
  so no new permission. Otherwise `chrome.tabs.create`. Keep the existing `openUrlInTab` fallback to
  `window.open`.
- **History (D5):** a History entry opens its report tab. Most of the inline history viewer in
  `Popup.tsx` (`selectedHistory`, `openedHistoryReport`, the inline Copy/Export/Delete row) retires
  with it. **Check the onboarding tour first:** its `results` step targets
  `data-onboarding-target="summary"`/`"flags"` in the popup, and those must keep existing for the
  current analysis.
- **Optional:** a quiet *See it all in the full report →* link at the foot of each deep lens panel.
  Cheap, and it tells the reader the preview is a preview.

## 8. Build, packaging, review

- **New workspace package `pages/report`**, mirroring `pages/options`: `package.json`
  (`@extension/report`, same scripts and deps), `vite.config.mts` (`outDir: dist/report`),
  `index.html` (with `<meta name="viewport">`), `src/index.tsx`, `src/Report.tsx`, `src/Report.css`,
  `vitest.config.ts`, `tsconfig.json`, `test/`.
- **`pnpm-workspace.yaml` lists packages explicitly.** It has no `pages/*` glob, so a new page that
  isn't added there doesn't exist to turbo, lint, test or build. Add it, run `pnpm install`, and
  confirm `dist/report/index.html` appears.
- **ZIP:** `.github/workflows/build-zip.yml` uploads `dist/*`, so the page ships automatically.
  Confirm it's in the artifact anyway.
- **Manifest:** nothing to add. An extension page opened by the extension needs no
  `web_accessible_resources` and no permission.
- **CWS:** no permission change and no data-flow change, so `cws/privacy-policy.md` and the privacy
  form are untouched. (Its line about clearing reports "from the popup" stays true.) The store
  screenshots show the popup and may be worth refreshing later; that's a listing choice, not a
  review risk.

## 9. Units, in order

| Unit | Scope | Done when |
|---|---|---|
| **R1** | Package scaffold, workspace entry, route, data load, loading / missing / removed states | `dist/report` builds; a seeded id renders its name; a bad id shows the missing state |
| **R2** | Sections 1–8 and the footer for deep records, then quick-only records | Every schema field in §4 appears somewhere; nothing is behind a control |
| **R3** | Layout: TOC rail, scroll-spy, responsive strip, sticky bar | No horizontal scroll at 360 / 800 / 1280; `aria-current` follows scrolling |
| **R4** | Actions: complete `createReportMarkdown`, Copy, Export, Print CSS, Delete | Printed PDF has no clipped findings and no split headings |
| **R5** | Popup wiring: *Open full report*, tab reuse, History → tab, retire the inline viewer | Clicking twice focuses one tab; the onboarding tour still resolves its targets |
| **R6** | Tests and walk | See gates |

**Gates:** `eslint`, `test` and `Prettier Check` run in-session. `type-check` and `build` are run by
the director. Walk the harness at three widths and in print preview, then walk the loaded
extension.

**Tests worth writing** (the popup's `test/evidence-lens.test.tsx` is the pattern):
- Every non-empty schema array in `sampleDeepAnalysis` produces its section, and each TOC count
  equals the number of rendered items.
- Empty arrays produce no section and no TOC entry.
- A missing id renders the missing state. A record removed while mounted keeps its content and shows
  *Removed from history*.
- `createReportMarkdown` includes every finding, ask, edit and question: no truncation.

## 10. Open questions for the director

Ask these at the start of R2. Each has a recommendation, so none of them blocks R1.

| | Question | Recommendation |
|---|---|---|
| **Q1** | **Answered → neither; §11.** Blockers: one severity-sorted list with origin tags, or four headed groups (*Immediate worries*, *One-sided*, …)? | **One sorted list.** The reader's question is "what's worst", and the model's four buckets overlap in practice. Tags keep the origin visible without making the reader rank across groups. |
| **Q2** | **Answered → remembered per report.** Checklist ticks: throwaway, or remembered per report? | **Throwaway in v1.** It needs no new storage key and prints fine. Remembering them means a per-record key that `removeReport` also has to clear. |
| **Q3** | **Answered → stay inline in the popup.** Quick-only History entries: open the page too, or stay inline in the popup? | **Open the page.** History then has one behaviour, and the inline viewer can retire entirely. |

## 11. The approved design: layered disclosure (after Q1–Q3)

The director's Q1 answer, in substance: a full page has room to be *designed* — visual hierarchy, a
managed focal point, signal-to-noise, F-pattern scanning, Gestalt proximity and enclosure,
cognitive load, information staging, just-in-time disclosure, disclosure widgets, graceful
degradation. The mockup below was approved **as a base only**: "it needs a lot of polish on the
look", and the interaction "is something I have not tried, so ensure it is polished and seamless".
Both halves are the bar for R2–R3, not extras.

### 11.1 The mockup that was approved (structure, not styling)

```
┌ rail ───────┐  Service Agreement · 2 parties · Reviewed as Contractor · 23 Sep 2026
│ Verdict     │  ┌ verdict (the one focal point) ───────────────────────────────────┐
│ Blockers 3▪6│  │ DANGER  Pause and get help                                        │
│ Asks     12 │  │ Yes, this can shaft the contractor later because…   (serif, large)│
│ Obligat.  4 │  │ ───────────────────────────────────────────────────────────────── │
│ Evidence  3 │  │ 3 deal-breakers · 3 to negotiate · 2 asks · 2 edits · 3 questions │
│ Wins      1 │  │ · Checklist 0 of 5            (each one a jump link)              │
│ Doc         │  └───────────────────────────────────────────────────────────────────┘
│ Caveats   2 │  Blockers — What could cost you, worst first.
└─────────────┘  Deal-breakers ── high · open ──────────────────────────────────────
                 ┃ You can lose payment based on vague dissatisfaction        HIGH
                 ┃ Immediate worry · Fees clause
                 ┃ │ "withhold payment for any dissatisfaction in its sole discretion"
                 ┃ What this means │ Why it matters        (two columns ≥ 900px)
                 ┃ → Your ask: tie withholding to a written acceptance process
                 Worth negotiating ── medium · closed ─────────────── Expand all
                 ▸ One-way confidentiality                                  MEDIUM
                   "Client has no matching confidentiality obligation"  (1 line)
                 ▸ Three-day termination right is too short                 MEDIUM
```

### 11.2 Information staging: three layers per item

| Layer | Holds | Where it shows |
|---|---|---|
| **1 · Scan** | title, severity (pill + left rule), origin tag, clause label | always |
| **2 · Verify** | the quote | always — in full when open, one ellipsised serif line when closed |
| **3 · Understand** | *What this means*, *Why it matters*, fallback, reasoning | open items; behind the disclosure otherwise |

**Default-open rule:** open what the reader must act on, close what supports a decision already
made. Deal-breakers (high) are open cards. Medium (*Worth negotiating*) and low (*Minor*) are closed
rows. Tiers with no items do not render. The origin (*Immediate worry*, *One-sided*, *Timing &
lock-in*, *Could shaft you later*) is a tag, not a grouping, which settles Q1.

Per section:

- **Verdict.** Risk pill + decision action, `bottomLine` in the serif at display size,
  `plainEnglishSummary`, `rolePerspective`. Its bottom edge is the **at-a-glance strip**: tier
  counts, ask / edit / question counts, checklist progress. Each is a jump link.
- **Blockers.** Tiered as above. Enclosure (a card) only for deal-breakers; closed rows are flat,
  separated by hairlines.
- **Asks.** Five headed subsections, as §4, with the payload always visible and the reasoning
  disclosed: *Negotiate* (the ask + target-clause chip; *why* and *Fallback* behind it), *Proposed
  wording* (the edit as a quotable clause block with its own Copy; *why* behind it), *Protections to
  add* (title + *Common fix*; why-missing behind it), *Questions* (numbered, all visible, *Copy
  all*), *Checklist* (real checkboxes, remembered, with "n of m" progress).
- **Evidence** (topic concerns, grouped by category) and **Caveats** are supporting material:
  closed rows by default. **Obligations**, **Wins**, **Doc** are short and stay flat and visible.
- **Footer** disclaimer, always visible, always printed.

### 11.3 Just-in-time pairing: each problem next to its fix

When a finding's `reference.label` matches a `negotiationIdeas[].targetClause` (compare
trimmed and case-insensitive, and allow either to contain the other), the finding carries a
"→ Your ask: …" link that scrolls to that ask and opens it. Suggested edits and missing protections
have no clause field, so pair them only on an obvious title match or not at all. **No match means
no link.** Never invent a pairing. Pure function, unit-tested with the sample (Fees ↔ Fees,
Intellectual Property ↔ Intellectual Property) plus near-misses.

### 11.4 The interaction bar ("polished and seamless")

The director has not used this pattern before. The first impression is the test, so each of
these is required, not optional:

- **Native `<details>`/`<summary>`, never a div with a click handler.** That gets keyboard,
  screen-reader state and Chrome's find-in-page auto-expansion (Chrome 97+) for free. **No `name`
  attribute**: the page is non-exclusive. Several open side by side is the reason it exists.
- **Opening animates its height**, via `::details-content` plus `interpolate-size: allow-keywords`
  (both shipped well before Chrome 152), around 180–220ms ease-out, with a chevron rotating in
  step. Under `prefers-reduced-motion` it is instant. No layout shift anywhere else on the page.
- **The whole closed row is the target**, with hover and `:focus-visible` states from the side
  panel's ladder. The quote preview is part of the summary, so a click anywhere on it opens.
- **Expand all / Collapse all** per tier: the label reflects the tier's *current* state, including
  after the reader opens rows one by one.
- **Jump links** (rail, at-a-glance strip, "→ Your ask") scroll with `scroll-margin-top` equal to
  the sticky bar, **open the target if it is closed**, and give it a brief highlight so the eye
  lands. Smooth scrolling only when motion is allowed.
- **Print:** on `beforeprint`, open everything and remember what was closed; on `afterprint`,
  restore it. A printed report is complete whatever the screen state was.
- **Checklist ticks** save optimistically with no spinner and no flicker, and survive a reload.
- **Nothing jumps on live update.** A re-run that replaces the record in place keeps open/closed
  state for items that still exist (key on content, not index) and shows *Updated just now*.

### 11.5 Look: polish from the base

The mockup rendered in the chat tool's neutral tokens. The page renders in Unshafted's, and should
look like the popup and side panel grown up, not like a new product:

- Warm paper ground (`--unshafted-bg`), the **dark verdict block** as in the popup
  (`.popup-verdict`), serif (`Iowan Old Style` stack) for `h1`, section headings, `bottomLine` and
  quotes; sans for body at 16px/1.6. Severity via the `--unshafted-severity-*` trio and `RISK_TONE`.
  The only amber caps eyebrow is the brand mark.
- Type scale set deliberately: `h1` about 34px, section `h2` about 26px, tier heading about 15px
  semibold with a hairline, card title about 18px serif. Count the levels on screen and keep them
  few.
- Space: 8px inside a finding, 16px between findings, 48px between sections, as in §6. Cards only
  for deal-breakers, with a 3px severity rule on the left, square left corners and no nested
  cards.
- The rail's counts carry a small severity mark for Blockers. The active entry uses
  `aria-current="location"` with a visible, non-colour-only indicator.
- **Walk it at 360 / 800 / 1280 and in print preview, and screenshot each** before calling a unit
  done. Measure with `javascript_tool`; the pane's screenshots can lag a frame.

### 11.6 Checklist ticks: storage (Q2)

- New storage `reportChecklistStorage` in `packages/storage`: key `unshafted-report-ticks`, local,
  `liveUpdate: true`. The value is `Record<historyId, string[]>`, where each string is an item key
  `` `${group.label}\u0000${item}` ``, so ticks for items that survive a deep re-run survive too.
- **Lifecycle has to be leak-proof:** `analysisHistoryStorage.removeReport` / `remove` / `clear`
  also drop the matching ticks, **and** every tick write prunes ids no longer in history. The
  prune covers eviction by the six-record cap and `push`'s `contentHash` dedupe, which remove
  records without any delete call.
- Tests: tick persists across remount; `removeReport` clears it; an evicted id is pruned on the
  next write.
- Privacy: ticks are local, contain nothing new (the item text is already in history), and no data
  leaves the device, so `cws/privacy-policy.md` is untouched. Re-check that claim when it is built.

### 11.7 Quick-only records (Q3)

The page renders **deep records only**. A quick-only id (reachable only by hand) shows a calm state:
"This is a quick scan. Quick scans open in the Unshafted popup's History." R5 changes accordingly:
History entries **with** `deepAnalysis` open the report tab (tab reuse as §7); quick-only entries
keep the inline viewer, so `selectedHistory` / `openedHistoryReport` **do not retire**. They narrow
to quick records. Onboarding targets (`summary`, `flags`) are unaffected either way.

### 11.8 Revised units

| Unit | Scope | Done when |
|---|---|---|
| R1 | Scaffold, workspace, route, data states | **Done** |
| R2a | Pure builders: tiering, counts, JIT pairing, quick-only guard. Unit tests first | Counts in the rail and strip equal rendered items; pairing tests pass |
| R2b | Sections and disclosure: verdict + strip, Blockers tiers, Asks five subsections, Evidence, Wins, Doc, Obligations, Caveats, footer | Every §4 field appears; layer 1–2 never behind a control; §11.4 interactions all work |
| R2c | Checklist ticks storage (§11.6) + UI | Survive reload; cleared on removal and eviction |
| R3 | Rail, scroll-spy, strip at 720–1023, sticky bar via IntersectionObserver, jump-and-open | No horizontal scroll at 360 / 800 / 1280; `aria-current` follows |
| R4 | Complete `createReportMarkdown`, Copy / Export / Print (beforeprint open-all) / Delete | Printed PDF complete, no split headings |
| R5 | Popup: *Open full report*, tab reuse, **deep** History → tab | Double click focuses one tab; quick History still inline |
| R6 | Tests, harness walk at three widths + print, loaded-extension walk | Gates in §9 |

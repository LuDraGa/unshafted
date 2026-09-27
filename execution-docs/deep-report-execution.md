# Deep report — popup preview fixes, then a page of its own

**Started:** 2026-09-23 · **Branch:** `dev/v0.8.3` · **Plan:** [`deep-report-page-plan.md`](deep-report-page-plan.md)
· **Handover:** [`deep-report-session-handover.md`](deep-report-session-handover.md)

**Status (2026-09-27): complete.** Report page R1–R6 done. The director walked the loaded
extension (A–J all ok). Gates are green: `eslint`, `Prettier Check` and `test` (report 68, popup
18, storage 25, core 105) re-run 2026-09-27; the director ran `type-check` and `build`. Committed
on `dev/v0.8.3` and pushed; see *Commit state*.

---

## Status

| | Item | Status |
|---|---|---|
| P1 | Lens item titles wrap to two lines when closed and show in full when open | **Done** · `pages/popup/src/Popup.css` |
| P2 | Evidence stops repeating Blockers: topic concerns only, and their quote is now shown | **Done** · `ResultCards.tsx`, `test/evidence-lens.test.tsx` |
| P3 | Rows are no longer crushed inside a height-capped lens | **Done** · `Popup.css`. Found during the walk; see below. |
| R1–R6 | The report page, per [plan §9](deep-report-page-plan.md#9-units-in-order) | **Done**, see the R-table below |
| [#89](https://github.com/LuDraGa/unshafted/issues/89) | Asks badge counts checklist items while the lens renders checklist groups | Filed, open |
| [#90](https://github.com/LuDraGa/unshafted/issues/90) | Export filename uses the UTC date (pre-existing; found in the R6 walk) | Filed, open |
| [#91](https://github.com/LuDraGa/unshafted/issues/91) | `update_version.sh` rewrites every occurrence of the old version (broke `prettier-plugin-tailwindcss`) | Filed, open |

## P3 was not one of the two approved fixes, and why it went in anyway

The director approved P1 and P2. P3 surfaced while walking them, and it turned out to be the bug
the director reported ("the section in a tab if too many or too long become unreadable") more
literally than either approved fix. `.popup-lens-panel` is a flex column capped at `60vh` (360px).
`.popup-item` clips its overflow, and a flex item that clips gets an automatic minimum height of
zero. So once a lens outgrew the cap, flexbox shrank every row instead of letting the panel scroll.
The fix is one line (`flex-shrink: 0`) that changes nothing else, and leaving it out would have left
the "fixed" preview visibly broken. It is flagged here and in the hand-off so it gets reviewed.

## Evidence: harness at 440×600, `sampleDeepAnalysis` plus one 170-character question

| | Before | After |
|---|---|---|
| Asks rows below their content height | **12 of 12** (e.g. 57→25px, 38→17px) | **0 of 12** |
| Asks panel `scrollHeight` / `clientHeight` | 358 / 358 (never scrolls) | 654 / 358 |
| Blockers panel | squashed too | 477 / 358, scrolls |
| Rows squashed across all seven lenses | — | 0 |
| Asks titles running to two lines | cut to one | 5 of 12 |
| The 170-char question | one line + ellipsis, open or closed | 2 lines closed; open shows all 4 (78px at 19.5px), unclipped |
| Evidence badge | 9 (6 duplicated findings + 3 topics) | 3 |

**The test was checked against the bug.** Swapping `ResultCards.tsx` back to `HEAD` fails all three
tests in `test/evidence-lens.test.tsx`; restoring the fix passes them. P1 and P3 are layout, which
jsdom doesn't compute, so the measurements above are their evidence rather than a test.

## What changed on disk

```
pages/popup/src/Popup.css                     P1 title clamp + baseline-aligned summary, P3 flex-shrink
pages/popup/src/components/ResultCards.tsx    P2 buildEvidenceLens: topic concerns only, quote shown
pages/popup/test/evidence-lens.test.tsx       new, three assertions
execution-docs/deep-report-page-plan.md       new, the presentation plan for the report tab
execution-docs/deep-report-execution.md       new, this file
execution-docs/deep-report-session-handover.md  new, for the next session
```

Local and gitignored (`.claude/`), for walking the popup outside the extension:

```
.claude/launch.json                 + "popup-mock" (python http.server on 8098)
.claude/panel-harness/popup.html    loads dist/popup through the stub
.claude/panel-harness/popup-stub.js chrome.* with seeded session + local storage
.claude/panel-harness/popup-seed.mjs  regenerates popup-seed.json from the real fixtures
.claude/panel-harness/popup         symlink → ../../dist/popup
```

## Commit state

Three commits on `dev/v0.8.3`, pushed 2026-09-27:

1. `7fe363b`: P1–P3, the popup lens fixes (2026-09-24).
2. The `prettier-plugin-tailwindcss` range back to `^0.8.1` (see *R1 — what landed*). The script
   that caused it is [#91](https://github.com/LuDraGa/unshafted/issues/91).
3. The report page (R1–R6), with everything it pulled into `packages/` and the popup, plus these
   three docs.

The side-panel lens pass ([`panel-lens-hierarchy-execution.md`](panel-lens-hierarchy-execution.md))
went in separately, before this work.

## Report page (R1–R6)

Scope, order and gates are in [plan §9](deep-report-page-plan.md#9-units-in-order); the open
questions (Q1–Q3) are in §10. Update this table as units land.

| Unit | Scope | Status |
|---|---|---|
| R1 | Package scaffold, workspace entry, route, data states | **Done** · walked in the harness; `test` 7/7, `eslint`, `Prettier Check` green |
| Q1–Q3 | Director's answers | **Answered 2026-09-23** → layered disclosure (plan §11), ticks remembered, quick-only stays inline |
| R2a | Pure builders: tiering, counts, JIT pairing, quick-only guard | **Done** · `src/report-model.ts`, `test/report-model.test.ts` (33 tests, written first; mutation-checked) |
| R2b | Sections + disclosure interactions (plan §11.2–11.5) | **Done** (screenshots sent 2026-09-23; director: "ok what next") · `src/{disclosure,sections}.tsx`, `Report.css`, `test/report-sections.test.tsx` (7); walked at 1280 / 800 / 360 and printed to PDF |
| R2c | Checklist ticks storage + UI (plan §11.6) | **Done** (2026-09-24) · `reportChecklistStorage` in `packages/storage/lib/impl/unshafted-history-storage.ts`, `src/use-report-ticks.ts`; storage 12 tests, page 5 tests, both written first and mutation-checked; walked at 1280 / 800 / 360, reload and print |
| R3 | Rail, scroll-spy, responsive strip, sticky bar, jump-and-open | **Done** (2026-09-24) · `src/navigation.tsx`, `Report.css`, `test/report-navigation.test.tsx` (10), `test/setup.ts` (observer fakes); walked at 1280 / 800 / 360 and in print |
| R4 | Complete markdown export, Copy/Export/Print/Delete | **Done** (2026-09-24) · `unshafted-core/lib/report-markdown.ts` (4 tests, written first), `src/actions.tsx`, print design in `Report.css`, `test/report-actions.test.tsx` (6); printed to PDF with background graphics on and off, walked at 1280 / 800 / 360 |
| R5 | Popup wiring: Open full report, tab reuse, **deep** History → tab | **Done** (2026-09-24) · P1–P3 committed first (`7fe363b`, local); `pages/popup/src/open-report.ts`, `AnalysisWorkspace.tsx`, `ResultCards.tsx`, `Popup.tsx`, `Popup.css`; `test/open-report.test.ts` (5), `test/open-full-report.test.tsx` (4); walked in the popup harness |
| R6 | Tests, harness walk at three widths + print, loaded-extension walk | **Done** (director, 2026-09-24; `type-check` + `build` green) · A–J ok; findings table under *R6 — loaded-extension findings* |

Units follow [plan §11.8](deep-report-page-plan.md#118-revised-units), which replaces §9's R2 row.

### R1 — what landed

```
pnpm-workspace.yaml                      + pages/report (no pages/* glob; see handover trap 1)
pnpm-lock.yaml                           + the pages/report importer
pages/report/                            new package, mirrors pages/options; no public/ (nothing to serve yet)
  src/use-report-record.ts               the data states: waiting · missing · present · removed
  src/Report.tsx                         route by ?id=, tab title, header, loading / missing / removed views
  src/Report.css                         shell, header, states, outlined button rank
  test/report-states.test.tsx            7 tests against a store written to while mounted
```

- **States.** `waiting` holds for 3s (`ARRIVAL_GRACE_MS`) before `missing`, so a fast click never
  flashes "not found"; no `?id=` at all is `missing` straight away. `removed` keeps the last copy on
  screen and, if a record with the same `contentHash` appears under another id, offers *Open it*. A
  blank hash never matches. `present` carries a `revision` count for in-place re-runs; R2 turns it
  into *Updated just now*.
- **The tests were checked against the bug.** Setting the grace to 0 fails the two grace tests;
  dropping the blank-hash guard fails that one.
- **Walked** in the harness at `report.html?id=harness-deep`: name as `h1`, meta line, tab title
  `service-agreement.pdf — Unshafted report`; `?id=nope` reads *Opening your report…* at 1.2s and the
  missing state at 3.7s; deleting the record from storage while open shows *Removed from history*,
  and writing it back under a new id shows *A newer report… Open it*.

**`dist/report` needs a watch restart.** The running `turbo watch dev` enumerated packages at
startup and doesn't see `pages/report`. This session ran the page's own `pnpm dev` in the
background to produce `dist/report`; restarting `pnpm dev` picks it up for good.

**Found on the way, not part of this work: `package.json` asked for `prettier-plugin-tailwindcss@^0.8.3`,
which doesn't exist**, so `pnpm install` failed outright. The v0.8.3 bump (`6dd8bd2`) ran
`bash-scripts/update_version.sh`, whose `perl -pe s/0.8.1/0.8.3/` rewrites *every* occurrence of the
old version in each `package.json`, and that dependency happened to be at `0.8.1` too. Restored to
`^0.8.1`, which is what the lockfile already pins. It belongs in its own commit, and the script
wants fixing so the next bump can't do it again.

Harness (gitignored): `report.html` (the popup loader pointed at `/report/`, stub cache-busted),
`report` → `../../dist/report`, `popup-seed.mjs` seeds `unshafted-history` with `harness-deep` and
a quick-only `harness-quick`, and `popup-stub.js`'s `storage.onChanged` now fires on `set`, so live
updates can be walked.

### R2a — what landed

`src/report-model.ts`, pure, tests first (`test/report-model.test.ts`, 33 tests, red before the
module existed):

- **Tiering.** The four finding arrays become *Deal-breakers* (high, open), *Worth negotiating*
  (medium) and *Minor* (low); empty tiers do not render; the origin is a tag (`originLabel`).
- **Keys on content** (FNV-1a of title + clause label, `-2` for an exact twin), id-safe, so a row
  keeps its open state across an in-place re-run and every row is a jump target.
- **Counts** come from one place for the rail, the strip and the headings. Asks count one per
  checklist *group* (#89's lesson); the strip's checklist progress counts items.
- **Pairing** (`clauseMatches`) is whole-word containment, not substring: "IP" never pairs with
  "Relationship", nor "Fees" with "Feedback". An exact clause beats a containing one. Swapping to
  substring matching fails exactly the two near-miss tests. **Suggested edits and missing
  protections are not paired at all**: they carry no clause field, and the sample shows why a title
  rule is not worth it ("Your liability is effectively uncapped" / "No liability cap" / "Add a
  liability cap" are one subject in three unrelated titles).
- `getDecisionAction` moved into `unshafted-core` (`runtime.ts`) so the page and popup share it.
  The popup keeps its own copy until R5, so the P1–P3 files stay untouched until they're committed.

### R2b — what landed

```
src/disclosure.tsx   open-state store, <Disclosure> row, ExpandAll, JumpLink, print handling
src/sections.tsx     Verdict + glance strip, Blockers tiers, Asks ×5, Obligations, Evidence, Wins, Doc, Caveats, footer
src/Report.tsx       assembles them; quick-only notice (§11.7); "Updated just now"
src/Report.css       the look (§11.5)
test/report-sections.test.tsx   7 tests
```

**How the interaction works, since it is new to the director.** Every row is a native `<details>`,
no `name`. Its *summary* holds layers 1–2 (title, severity pill + left rule, origin tag, § clause,
the quote on one line), so a closed row is still verifiable and the whole row is the click target;
the *body* holds layer 3. Open state lives in one store that records only what the reader changed,
keyed on content, which is what lets Expand all label itself, print open everything and restore it,
and a re-run keep what was open. A click that ends a text selection does not toggle, so a reader can
select a quote to search the contract with it.

**Measured in the harness** (heavy seed: 16 findings, 11 asks, 5 edits, 8 questions, 3 checklist
groups, 8 topic concerns, a scanned-PDF warning):

| Check | Result |
|---|---|
| Default open | Deal-breakers 6/6 open; medium 0/7, low 0/3, all Asks closed |
| Closed row height | = its summary exactly (105.9 = 105.9); body clipped, not merely hidden |
| Open animation | 251 of 282px at 60ms, ease-out; `interpolate-size: allow-keywords` live |
| Expand all label | stays *Expand all* through 6 of 7 rows opened by hand, flips on the 7th |
| Jump (→ Your ask, strip) | target opens, lands at exactly the 24px scroll margin, summary/heading takes focus, arrival mark set |
| Print (`beforeprint`) | 46/46 rows open synchronously; `afterprint` restores the reader's exact state |
| Printed PDF (headless Chrome) | all 54 layer-3 strings present, 16/16 *What this means* |
| Live re-run (reorder, add, drop) | every open row stays open, nothing new opens, scroll unmoved, *Updated just now* shows |
| Overflow | 0px at 360, 800, 1280 |

The pane's smooth scroll stalls when the pane is hidden (frames throttled, no `scrollend`); the
landing was verified on the instant path, and the flash has a 1.2s fallback for that case.

**Left for R4 on purpose:** the print *design* — the PDF currently shows card shadows as grey
blocks, the tinted ground, the *Collapse all* controls, and rows splitting across pages.

### R2c — what landed

```
packages/storage/lib/impl/unshafted-history-storage.ts   + reportChecklistStorage; every history write prunes ticks
packages/storage/test/report-checklist-storage.test.ts   12 tests, real modules over a fake chrome.storage.local
pages/report/src/use-report-ticks.ts                     optimistic ticks: pending overlay, per-click sequence
pages/report/src/Report.tsx                              ReportBody reads ticks from the hook; `live` flag
pages/report/test/report-checklist.test.tsx              5 tests, storage writes resolved by hand
```

- **One file for history and ticks, on purpose.** Their lifecycles are one lifecycle, and apart
  each module needs the other, which is an import cycle.
- **Leak-proof by construction, not by call sites.** Every write to either store ends by pruning
  ticks down to the ids still in history. `push` counts (it evicts past the cap and drops an older
  record for the same document), and so does the ticks store's own `set`, so no path skips it. That
  is stronger than §11.6 asked (prune on tick writes, drop on deletes): a cap eviction now loses its
  ticks at once, not at the next tick.
- **Optimistic, no flicker.** A click lands in a pending overlay at once. The overlay entry clears
  only when *its own* write resolves (storage emits before `set` returns, so the stored value
  already agrees by then). A per-click sequence number stops an earlier write that finishes late from
  clearing a later click, so on-off-on settles without a blink.
- **The removed copy keeps its ticks.** When a record leaves history, storage prunes its ticks, but
  the page keeps the removed copy on screen, so it keeps the ticks it last saw. New clicks there
  are session-only; nothing is written for a record that is gone.
- **Mutation-checked.** Storage: no history-side prune fails 4, no tick-side prune fails 7. Page:
  no overlay fails 3, no sequence guard fails the on-off-on test, no kept copy fails the removed test.
- **Walked.** Ticks show in the same task as the click; 20 sampled frames after each click never
  disagree; ticks survive a reload (the harness stub now persists `local` to `sessionStorage`, and
  `&fresh` resets it); the removed state keeps 4 of 4 after the prune. 0px overflow at 360 / 800 /
  1280. Printed: ticked boxes print ticked, the rest print empty (§6).
- **Privacy re-checked.** Ticks are local, hold only text already in the history record, and go with
  both clear paths (*Clear local reports* through `clear()`, *Clear all local data* through
  `chrome.storage.local.clear()`). `cws/privacy-policy.md` is untouched.

Harness (gitignored): `popup-seed.mjs` seeds three ticks on `harness-deep`; `report.html` still
loads the page. Screenshots are taken with `playwright-core` (already in the workspace) driving the
installed Chrome, because headless `--screenshot` ignores post-load scrolling.

### R3 — what landed

```
pages/report/src/navigation.tsx          ReportFrame: fixed chrome (bar + strip), rail, column; scroll-spy; bar trigger
pages/report/src/Report.tsx              ReportDocument renders inside ReportFrame; header ref for the bar
pages/report/src/Report.css              frame grid ≥1024, rail, strip, chrome, split mark; print hides chrome + rail
pages/report/test/setup.ts               driveable IntersectionObserver / ResizeObserver fakes, scrollTo, matchMedia
pages/report/test/report-navigation.test.tsx   10 tests
pages/report/vitest.config.ts            + the local setup file
```

- **One fixed chrome, one height.** Bar and strip are one element; a `ResizeObserver` writes its
  height to `--report-sticky-h` (53px at ≥1024, 91px with the strip below), which every jump target
  already clears. The bar is laid out while hidden, so the height is known before it is needed, and
  `inert` keeps it out of the tab order until it shows.
- **The bar appears when the page header slides under it** (an `IntersectionObserver` with the
  bar's height as its top margin), and carries the h1 up as the page scrolls.
- **Rail at ≥1024** in a 220 + 48 + 720 grid, sticky under the bar; the current entry has a left bar
  and heavier weight as well as a colour. **Strip below 1024** as the bar's second row, scrolling
  sideways at 360 with edge fades, the current entry centred as it changes. Blockers carries a
  severity split mark in both, said in words for screen readers.
- **Scroll-spy is a reading line**, 40px under the bar: the current section is the first one that
  has not scrolled up past it. The first version, "last heading in the upper 40%", never showed
  Obligations at 1280 (Evidence's heading was always in the band too); measured and replaced. The
  footer in view selects the last section, except that a section the reader jumped to and that is
  on screen stays current (Doc at 1280 / 800 can't reach the line). A click pins its entry until
  `scrollend`, wheel or touch, so a long smooth scroll doesn't walk the highlight.
- **Measured** (headless Chrome via `playwright-core`, reduced motion): every rail / strip jump lands
  at `--report-sticky-h + 24` ±0.5px and focuses the heading; scrolling each section to the line
  sets the matching `aria-current` at all three widths; 0px horizontal overflow at 360 / 800 / 1280.
  In print, the chrome and rail are gone.
- **Mutation-checked:** reintroducing the hold-clearing bug (reading observer firing before the end
  observer in one frame) fails the foot-of-page test.

### R4 — what landed

```
packages/unshafted-core/lib/report-markdown.ts   createReportMarkdown (complete, page order, ticks), createReportFilename,
                                                 FINDING_ORIGINS, SEVERITY_TIERS, describePerspective — shared with the page
packages/unshafted-core/lib/runtime.ts           old truncating createReportMarkdown removed
packages/unshafted-core/test/core.test.ts        4 markdown tests: section order, nothing left out, ticks, quick scan
pages/report/src/actions.tsx                     Copy / Export .md / Print / Delete (+ inline confirm), closeTab
pages/report/src/Report.tsx                      actions in header and bar; Deleted notice; ticks lifted; print header vars
pages/report/src/report-model.ts                 tier + origin labels now read from core
pages/report/src/Report.css                      actions, confirm, filled danger rank; the print design
pages/report/package.json                        + @extension/supabase (Delete must remove Drive copies, as the popup does)
pages/report/test/report-actions.test.tsx        6 tests
```

- **The export is complete and follows the page.** Verdict, Blockers by tier with origin tags,
  quotes and both explanations, Asks in five subsections (the checklist as `- [x]`/`- [ ]` from the
  page's ticks), Obligations, Evidence by category, Wins, Doc, Caveats, disclaimer. A test with 9
  worries, 12 asks, 7 edits and 10 questions finds every string; re-adding `.slice(0, 8)` fails it.
  Quick records export their flags, obligations, doc and caveats, and say they are a quick scan. The
  popup's History copy and export get the same function, so they are complete now too; its invented
  "Clarify …" asks for quick scans are gone from the export (every flag is there in full).
- **Delete does what the popup's does:** `removeReport` (which now also prunes ticks) and both
  `deleteFromDrive` calls; otherwise a Drive restore could bring back a report deleted here. Inline
  confirm with the popup's own copy, focus on Cancel; then a *Deleted from your history* notice
  (never a flash of *Removed*), the content stays, *Close tab* closes via `chrome.tabs`. Delete is
  not in the sticky bar; Copy / Export / Print are, from 720px.
- **Print, measured on the heavy seed (14 A4 pages):** running header (document name · *Unshafted
  report* · date) and *n of m* page numbers from `@page` margin boxes; verdict as a bordered box on
  white; no card shadows (they were the grey blocks); no controls (0 of *Expand all*, *Collapse
  all*, *Copy all*, *Delete*, *Print* in the PDF text); 16/16 *What this means*; ticked boxes print
  ticked. Severity rules, pills, risk pill and checkboxes are `print-color-adjust: exact`, so they
  survive the dialog's default of background graphics off; everything else prints black on white.
- **Orphaned headings, found and fixed.** Chrome fragments a flex container between its children
  and ignores `break-after: avoid` into or out of one: *Minor*, *Proposed wording*, *Asks* and
  *Wins* each ended a page with their content on the next. In print every container between a
  heading and its first item is now a plain block. Checked with a script pairing each of 12
  headings with its first item's page: 12/12 together, and no page ends on a heading.
- **Trap hit on the way:** the harness Delete left ticks behind because `packages/storage/dist` had
  been built from a mutation-check mutant by the director's running `turbo watch dev`, and `tsc -b`
  then skipped it as up to date. Rebuilt with `tsc -b --force`; now saved as a memory.

### R5 — what landed

```
pages/popup/src/open-report.ts              openReportTab: focus the tab already showing this report (and its window), else
                                            create; in-flight de-dupe; window.open fallback. reportUrl.
pages/popup/src/components/AnalysisWorkspace.tsx   "Open full report ↗" (outlined, full width) directly under the verdict
pages/popup/src/components/ResultCards.tsx  local getDecisionAction removed (core's now); ResultsView takes onOpenFullReport and
                                            says "See all of it in the full report →" where the lens preview ends
pages/popup/src/Popup.tsx                   History: a detailed report opens its tab ("Open report ↗"), a quick scan keeps the
                                            inline viewer; Copy / Export read the ticks and use core's createReportFilename
pages/popup/src/Popup.css                   .popup-outline-button (the outlined rank the popup lacked), the lens-foot link
packages/unshafted-core/lib/report-markdown.ts   + checklistTickKey, the one definition the page, popup and export share
```

- **One tab per report.** Measured in the harness with `chrome.tabs` instrumented: *Open full report*
  twice, then the lens link, gives one `create` and then `update {active}` + `windows.update
  {focused}` twice. A true double click (two opens before the first resolves) opens one tab; the
  test fails without the in-flight de-dupe. The harness stub's `runtime.getURL` returns a relative
  path, which makes a real tab look like no match; Chrome's is absolute, and the walk overrides it.
- **History:** the two detailed records show *Open report ↗* and open their tab without touching
  the inline viewer; the quick record shows *Open* and opens inline, as §11.7 settled.
- **Onboarding** `summary` and `flags` targets still resolve (asserted), and the button sits between
  the verdict and the lens strip, where the tour's `summary` step points.
- `dist/popup` had not been rebuilt since 2026-09-23 15:59: the director's `turbo watch dev` is not
  running a popup build. This session started `pages/popup`'s own `pnpm dev` in the background.

### R6 — the walk

| Check | Result |
|---|---|
| `harness-deep`, `harness-sample`, `harness-quick`, `nope` at 360 / 800 / 1280 | renders as designed; 0px horizontal overflow; no page errors |
| Quick-only and missing | no rail, no bar, no actions; the calm notices from R1 / §11.7 |
| Live re-run (bottom line changed, concerns reversed, an ask added) with two asks open | scroll moved 0px; 8/8 open rows still open; the new ask renders; rail Asks 31 → 32; *Updated just now* |
| Print | 14 A4 pages, see R4 |
| Loaded extension | Walked by the director by hand (branded Chrome 153 ignores `--load-extension`); A–J ok, see *R6 — loaded-extension findings* |

Tests added across R2c–R5: storage 12, core markdown 4 (1 rewritten), report page 21 (checklist 5,
navigation 10, actions 6), popup 9 (open-report 5, open-full-report 4). Each guard was checked by
breaking the thing it guards.

### R6 — the loaded-extension walk (director, manual)

After `type-check` and `build`, reload the unpacked extension in `chrome://extensions`. Stop the
report page's dev watch first (`pages/report`, `vite build --mode development`) so it cannot
overwrite `dist/report` mid-walk. Report back per letter: *ok*, or what you saw (a screenshot for
anything visual).

| | Do | Expect | Look out for |
|---|---|---|---|
| A | Run a detailed analysis; click *Open full report ↗* the moment it appears | The tab opens on the report; at most *Opening your report…* for a moment | *This report is no longer in your history* flashing before the report |
| B | Click it again, then *See all of it in the full report →* | The same tab comes forward each time; no second tab | A duplicate tab |
| C | Scroll the page, wide then narrow (under 1024px, under 720px) | Rail on the left when wide, a tab strip in the bar when narrow; the bar appears once the title scrolls away; the highlighted entry follows the section at the top | Highlight flickering through sections on a click; a heading hidden under the bar after a jump; sideways scrolling at any width |
| D | Tick two checklist items, reload the tab | Both still ticked; the verdict strip says *Checklist 2 of n* | Boxes unticking, or ticking a beat late |
| E | *Copy*, paste into a text editor; *Export .md* | Every finding, ask, edit and question; ticked items as `- [x]`; file named `<document>-<date>.md` | Anything cut short |
| F | Cmd-P, with *Background graphics* off; then cancel | Header with the document name and *Unshafted report · date*; page numbers; every row open; no buttons; no grey boxes; severity colours kept; no heading alone at a page foot. After cancelling, rows you had closed are closed again | Blank or clipped pages; the preview differing from the headless PDF |
| G | Popup History: a detailed entry, then a quick one | *Open report ↗* opens or focuses that report's tab; *Open* on a quick scan stays inline in the popup | A quick scan opening a tab |
| H | On the page: *Delete* → *Delete permanently* | *Deleted from your history*, the report still readable; History no longer lists it; *Close tab* closes the tab; with Drive on, its Drive files go too | *Removed from history* showing instead; the tab closing on its own |
| I | Popup *Guide me* | The tour's verdict and lens steps still land on the verdict and the lens tabs | A step pointing at nothing |
| J | `chrome://extensions` → Unshafted → *Errors*; the report tab's DevTools console | Nothing new | CSP or module errors from the report page |

Optional, costs a run: with the report tab open, re-run the detailed analysis from the popup. The
page should update in place with *Updated just now*, rows you had open staying open.

### R6 — loaded-extension findings (2026-09-24)

Loaded from a production `pnpm build` (02:08:44), the report page's dev watch stopped first;
`type-check` and `build` green (director). `dist/report` and `dist/popup` checked for this work's
strings and for no dev-reload injection before the walk.

| Step | What the director saw | Cause | Fix or issue | Re-checked |
|---|---|---|---|---|
| A | *Open full report ↗* opened the report tab; no *no longer in your history* flash | — | — | ok |
| A | A detailed History entry has no inline popup preview, only *Open report ↗* | Not a bug: plan **D5** (§2) and **D8** / §11.7 chose it; the tab is the complete report, the inline viewer stays for quick scans only | — | n/a |
| B | *Open full report ↗* again and the lens-foot link: the same tab came forward every time | — | — | ok |
| C | Rail (wide) and strip (narrow) both follow the section at the top; jumps land | — | — | ok |
| D | Two checklist ticks survived a reload | — | — | ok |
| E | Copy and Export complete; the file is named `…-2026-09-23.md` inside a report dated 24 Sep (IST, run after local midnight) | Pre-existing: `createReportFilename` slices the UTC date from `createdAt` (`toISOString`); header and Markdown use the local date. In since `c799213` (2026-04-24, popup History export); this work moved it into core unchanged. Reproduced against core's `dist` under `TZ=Asia/Kolkata` | [#90](https://github.com/LuDraGa/unshafted/issues/90) | n/a |
| F | Print preview as expected (running header, page numbers, all open, no controls, no grey boxes); state restored on cancel | — | — | ok |
| G | History: detailed *Open report ↗* focuses or opens its tab; quick *Open* stays inline | — | — | ok |
| H | *Deleted from your history* showed and the report stayed readable; the tab stayed open | Not a bug: *Close tab* had not been clicked (the page keeps a deleted copy until the reader closes it, by design). *Close tab* itself verified in the real `dist` loaded through CDP (`Extensions.loadUnpacked`, throwaway Chrome 153 profile, `ext-walk2.mjs` in the session scratchpad): closed the tab 4 of 4, direct, after opening the popup page, scrolled, and at 360 | — | ok |
| H | After a reload the deleted report reads *This report is no longer in your history* | Not a bug: a cold open cannot tell a delete from eviction or replacement; plan §7 *Missing record* chose this copy | — | n/a |
| I | *Guide me*: the results tour's steps land on the verdict, the lens tabs, the role control and the action bar | — | — | ok |
| J | `chrome://extensions` Errors and the report tab's console: nothing new | — | — | ok |

# Deep report page: session handover

**Written:** 2026-09-24 (third session), **closed 2026-09-27** · **Branch:** `dev/v0.8.3` ·
everything committed and pushed.

> **This work is finished.** R1–R6 are done, the director walked the loaded extension (A–J ok), and
> the work is committed and pushed (see the execution doc's *Commit state*). What follows is kept as
> the record, and for anyone who comes back to change the report page: the decisions and traps
> still apply. Follow-ups are GitHub issues:
> [#89](https://github.com/LuDraGa/unshafted/issues/89),
> [#90](https://github.com/LuDraGa/unshafted/issues/90),
> [#91](https://github.com/LuDraGa/unshafted/issues/91).

## Where it stands in one paragraph

A deep analysis gets its own extension tab at `report/index.html?id=<historyId>`. **R1–R5 are built
and walked in the harness** (fourth session: R2c ticks in storage, R3 rail / strip / sticky bar /
scroll-spy, R4 complete Markdown export + Copy / Export / Print / Delete + the print design, R5 the
popup's *Open full report*, tab reuse and deep History → tab). **R6 is done**: the harness walk
here, and the loaded-extension walk by the director (branded Chrome will not load an unpacked
extension headlessly). `type-check` and `build` are green. The execution doc's *R2c–R6 — what
landed* sections hold what was measured and how.

## Read in this order

| | Doc | For |
|---|---|---|
| 1 | [`deep-report-page-plan.md`](deep-report-page-plan.md) **§11** (the approved design) | §11.4 interaction bar, §11.5 look, **§11.6 ticks storage (R2c)**, §11.7 quick-only, §11.8 units |
| 2 | [`deep-report-execution.md`](deep-report-execution.md) | The R-table, and the *R2a / R2b — what landed* sections: what was measured and how |
| 3 | §5 (layout) and §7 (behaviour) of the plan | R3's rail/strip/sticky bar; R4's actions; R5's popup wiring |

Code: `pages/report/src/{Report.tsx, use-report-record.ts, report-model.ts, disclosure.tsx,
sections.tsx, Report.css}`, tests in `pages/report/test/`. Popup fields:
`pages/popup/src/components/ResultCards.tsx`. Storage: `packages/storage/lib/impl/`.
Markdown export: `createReportMarkdown` in `packages/unshafted-core/lib/runtime.ts`.

## Decisions made; don't reopen them

- D1–D8 as in the plan (§2): lenses stay a preview in the popup, the report opens only from a
  button, layered disclosure per §11, ticks remembered per report, quick-only records stay inline.
- **Pairing is whole-word clause containment**, exact beats containing, first ask wins. **Edits and
  missing protections are not paired** (no clause field; titles too loose). Recorded in the
  execution doc.
- **Disclosure is controlled.** One store (`DisclosureProvider`) records only what the reader
  *changed*, keyed on content. `isOpen = printing || override ?? default`. That one rule gives
  Expand all its label, print its open-all-and-restore, and a live re-run its stability. Don't make
  rows uncontrolled "for simplicity"; three features depend on it.
- **The quote lives in the summary**: clamped to one line when closed, full when open. It's the
  same element either way, so find-in-page and print see it once.
- Buttons that act on a row (Copy on proposed wording) sit **outside** the `<summary>` and are
  absolutely positioned on the title line. A button inside a summary toggles the row.
- `getDecisionAction` now lives in `unshafted-core`. The popup still has its own copy; **R5 switches
  the popup's import** (after P1–P3 are committed).

## What each remaining unit needs to know

- **R2c.** `ReportBody` in `Report.tsx` holds ticks in `useState` with a comment saying R2c
  replaces it. Tick keys already exist (`ChecklistItem.tickKey = label + '\u0000' + item`). Build
  `reportChecklistStorage` per §11.6, and make the cleanup leak-proof: `removeReport` / `remove` /
  `clear` drop ticks, and every tick write prunes ids no longer in history. Tests: persists across
  remount, cleared on removal, evicted id pruned on next write. Re-check the privacy claim
  (local-only, nothing new stored) once it's built.
- **R3.** `--report-sticky-h` is already a CSS variable on `.report-shell`, and every jump target's
  `scroll-margin-top` reads it. Set it from the sticky bar's measured height. Sections have ids
  `verdict, blockers, asks, obligations, evidence, wins, doc, caveats`; `buildSections(record)`
  already returns the rail's entries with counts and a `split` for the Blockers severity mark.
  `jumpTo(id)` in `useDisclosure()` already scrolls, opens, focuses and flashes, so the rail should
  call it rather than reimplement it.
- **R4.** Print today only guarantees completeness (`beforeprint` opens all, plus a CSS fallback on
  `::details-content`). Still to design: card shadows print as **grey blocks**, the tinted ground
  prints, the Expand/Collapse and Copy controls print, and rows split across pages. The plan's print
  bullets (§6) are the spec. `createReportMarkdown` must stop truncating.
- **R5.** Onboarding targets `data-onboarding-target="summary"` / `"flags"` must survive. Only
  deep History entries open the tab; quick ones keep the inline viewer.

## Traps; each one cost or would cost real time

1. **`unshafted-core` resolves to its `dist` and has no watch.** After editing core, run
   `pnpm -F @extension/unshafted-core ready` (`tsc -b`), or the page builds against the old code.
   R4 edits core.
2. **The page's own watch.** `turbo watch dev` doesn't see `pages/report`. Last session left
   `vite build --mode development` running in `pages/report` (check with
   `ps aux | grep vite`). If it's gone, run `cd pages/report && pnpm dev` in the background under
   `nvm use`.
3. **Port 8098 may be held by an older session's `popup-mock`**, and `preview_start {name}` then
   refuses. It serves the same harness directory, so `preview_start {url:
   "http://localhost:8098/report.html?id=harness-deep"}` works.
4. **A hidden browser pane throttles frames.** Smooth scroll stalls part-way and `scrollend` never
   fires, which looks like a jump bug but isn't. Verify landing on the instant path by making
   `matchMedia` report reduced motion in-page. The flash has a 1.2s fallback for this.
5. **Screenshots lag a frame**; take two, and measure with `javascript_tool`.
6. **Print preview can't be driven from the pane.** What works: headless Chrome
   `--headless=new --print-to-pdf=… --virtual-time-budget=6000 "<url>"` (it fires `beforeprint`),
   then rasterise pages with the PDFKit Swift script (poppler isn't installed). Both scripts are in
   the old scratchpad and are 20 lines to rewrite; `pdftext.swift` (PDFKit `doc.string`) checks
   completeness. Headless `--screenshot --window-size=W,H` gives full-height PNGs to send.
7. **Test helper default parameters.** `renderReport(undefined)` silently uses the default record;
   the helper takes `null` for "quick-only". Same trap for any new helper.
8. **jsdom has no `scrollIntoView` or `matchMedia`**; `report-sections.test.tsx` stubs both in
   `beforeEach`. Any test mocking `@extension/ui` must provide `cn` and `RISK_TONE`.
9. **React hooks lint v7 is strict**: no `Date.now()` or ref reads during render, and no sync
   `setState` in effects. That's why *Updated just now* is a CSS fade keyed on `revision`, not a
   timer.
10. **History records vanish or come back under a new id** (cap 6, `contentHash` dedupe). This is
    handled in `use-report-record.ts`, and it's exactly what R2c's prune-on-write must cover.
11. **`update_version.sh` rewrites every occurrence of the old version**, not just the `version`
    field. That's how `prettier-plugin-tailwindcss` became a nonexistent `^0.8.3`. The range is
    fixed; the script is [#91](https://github.com/LuDraGa/unshafted/issues/91). After any bump, diff
    every `package.json`.
12. **Dev commands:** the director runs `type-check` and `build`. Run `eslint`, `test
    --silent=false` and `prettier --check` yourself, under `nvm use`.
13. **`Closes #n` doesn't close issues on `release`.** Close
    [#89](https://github.com/LuDraGa/unshafted/issues/89) by hand if it gets fixed.
14. **Mutation checks can leave a package's `dist` built from the mutant** (the director's `turbo
    watch dev` rebuilds on the src change; `tsc -b` then skips). After mutating anything under
    `packages/`, `npx tsc -b --force` there and grep the dist.
15. **`dist/popup` is not rebuilt by the director's watch.** This session ran `pages/popup`'s own
    `pnpm dev` in the background; check `ps aux | grep vite` before walking the popup.

## Walking it

- **`/report.html?id=harness-deep`** is the heavy deep record (16 findings, 11 asks, 5 edits,
  8 questions, 3 checklist groups, 8 topic concerns, a scanned-PDF warning).
  `?id=harness-sample` is the plain fixture, `?id=harness-quick` is quick-only, `?id=nope` is
  missing. `/popup.html` is the popup.
- Seed: `node .claude/panel-harness/popup-seed.mjs` under `nvm use` (reads core's `dist`).
- The stub's `chrome.storage.onChanged` fires on `set`, so live updates, removal and (R2c) tick
  persistence can be driven from `javascript_tool` with `chrome.storage.local.set(...)`. A reload
  resets storage to the seed.
- Walk every unit at **360 / 800 / 1280 and in print**, and send the director screenshots before
  calling it done.

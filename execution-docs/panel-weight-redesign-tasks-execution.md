# Side panel weight + layout redesign — task execution

**Status:** Units agreed 2026-09-22. **All seven units (A, B, C1, C2, D, E, F) written; local gates
green.** Nothing merged, nothing committed. The built-stylesheet checks still need a fresh
`pnpm build`. D's visual walk passed 2026-09-23 and `pnpm type-check` is confirmed clean (12/12
packages) — see D4. **E and F have not been visually walked in the loaded extension yet** — F
especially, since it is the largest unit and the one with the least available verification (see
F1's `stuck` finding and F4).
**Branch:** `dev/v0.8.3`
**Decisions:** [`panel-weight-redesign-plan.md`](panel-weight-redesign-plan.md) — P1–P18, approved
2026-09-22. This doc tracks *work*; it does not restate a decision, it cites one.
**Evidence:** [`panel-weight-redesign-execution.md`](panel-weight-redesign-execution.md) §1, §4–§9.

---

## The units

Grouped along the plan's §5 dependency tree and §6 surface map, so that each unit occupies as few
files as possible and clears the gates on its own. C was split and G folded into B by the director.

| Unit | Decisions | Surface | Depends on | Status |
|---|---|---|---|---|
| **A** — the weight ladder | P1 | `SidePanel.css` | — | **written — A6/A7 need a build** |
| **B** — honesty | P16, P17, P18 | `SidePanel.tsx`, `BrowseView.tsx` | — | **done** |
| **C1** — disclosure rewrite | P2, P3, P4, P6 | `DocumentCard.tsx`, `SidePanel.css` | A | **done** |
| **C2** — surface + motion | P5, P12, P15 | `DocumentCard.tsx`, `SidePanel.css` | A, C1 | **written — C2.5/C2.6 need a build** |
| **D** — view ownership | P7, P8 | `SidePanel.tsx` + all seven views | A | **done — visually walked 2026-09-23** |
| **E** — per-view placement | P9, P10, P11 | `AnalysisView.tsx`, `LocalAnalysisView.tsx`, `BrowseView.tsx`, `SidePanel.css` | A, D | **written — needs a visual walk** |
| **F** — orientation | P13, P14 | `SidePanel.css`, `SidePanel.tsx`, `BrowseView.tsx`, `DocumentCard.tsx`, `LocalAnalysisView.tsx`, new `BackToTop.tsx` + `useElementHeight.ts` | A, D, E | **written — needs a visual walk** |

**Order.** A first — it is the vocabulary the rest are written in. B is independent of A and of
everything else and can go at any time, including first if A stalls. C1 → C2. D before E and F.

**Why C split.** `DocumentCard.tsx` carried seven decisions in one unit, which is the largest block
of risk in the whole redesign. C1 is the structural rewrite of what discloses what; C2 is the
surface treatment and motion on top of it. Splitting them means a regression in row content can be
bisected away from a regression in row *appearance*.

**Why G folded into B.** P16 is a statement about what may never be hidden; P17 and P18 are
statements about what may never be claimed. All three are honesty rather than layout, they share
`AnalyseConfirm.tsx` and `RunStatus.tsx`, and none of them depends on the ladder landing first.

---

## Gates every unit clears before it is called done

1. The five repository checks: `eslint`, `type-check`, `test`, `build`, `Prettier Check`.
2. No text loss — all finding text present and in order once new control labels are excluded.
3. Risk tones identical — fill, border colour, border width, text colour match before/after
   computed styles, against the **built** stylesheet.
4. No horizontal overflow at 320px or 400px in any of the 21 states.
5. The rules from handoff §4 that the unit touches, rechecked against the real implementation —
   the browser review verified the prototype only.

---

## Unit A — the weight ladder (P1)

Establish the five ranks as the panel's shared vocabulary. Form only: border, radius, shadow,
ground. No hue changes, no component restructuring — later units consume this.

- [x] A1 — Inventory of the current sheet against the ladder:

      | Existing | Behaves as | Verdict |
      |---|---|---|
      | `.panel-shell` | Ground | already correct |
      | `.panel-doc` | Primary — border, 16px, no shadow | already correct, and the reference |
      | `.panel-link` | Tertiary — plain text, no container | already correct |
      | `.panel-verdict` | Primary **plus a resting shadow** | violated P1 |
      | `.panel-one-thing` | Primary **plus a resting shadow**, 20px radius | violated P1 |
      | Secondary | — | did not exist |
      | Floating | — | did not exist |

      Three of the five ranks were already being spoken correctly, which is why the ladder is
      expressed as names for what `.panel-doc` and `.panel-link` already do rather than as a new
      layer on top of them.
- [x] A2 — Five ranks defined, with the panel-scoped custom properties they read from.
- [x] A3 — Exceptions encoded in the ladder comment, with the measured reason attached: fill spans
      1.5x and is non-monotonic, border spans 3.2x and is monotonic, so the border is the only
      channel that works. `.panel-verdict` keeps its risk border and width untouched; only its
      resting shadow was removed.
- [x] A4 — Both non-ranks asserted in the ladder comment.
- [x] A5 — Reconciled without touching the shared sheet. `--unshafted-radius-card` (20px) and
      `--unshafted-shadow-card` are both still read by `Popup.css`, so changing either to suit the
      panel would have re-laid-out a surface this work never looked at. The panel's Primary radius
      is a local 16px instead. **`packages/ui/global.css` is unchanged** — the unit's surface
      turned out to be one file, not two.
- [x] A5a — `@container scroll-state(stuck: top)` confirmed to parse in Chrome 152 as a real
      `CSSContainerRule`, alongside the other four new rules. Not inferred from the capability
      table — re-executed against the live browser.
- [x] A7a — `Prettier Check` passes on the changed file.
- [ ] A6 — Rules 1/6/7/18/19 against computed styles and the **built** stylesheet. **Blocked:** the
      review harness reads `dist/side-panel/assets/index-Czjub3En.css`, which predates this change,
      so this needs a rebuild before it means anything.
- [ ] A7 — The remaining four gates: `eslint`, `type-check`, `test`, `build`.

**Not in this unit.** Demoting Analyse to Secondary and browse entry to Tertiary is the *consequence*
of P1, but it happens in the components — Unit E for browse placement, Unit D for the views that own
the Analyse offer. A only makes those ranks expressible.

**Floating is defined but inert,** and deliberately so. A sticky element inside an `overflow: hidden`
ancestor reads −300px from the scroll port — it scrolls away and sticky silently does nothing, with
no error; `overflow: clip` reads 0. `.panel-doc` still has `overflow: hidden`, and changing it
belongs to C2.2. So the Floating rank exists as vocabulary from A onward, and starts working when
C2 lands. F is what puts markup on it.

**`packages/ui/lib/risk-tone.ts` is not touched, here or anywhere in this redesign.**

## Unit B — honesty (P16, P17, P18)

- [x] B1 — Found at `SidePanel.tsx:337`, as a single footer rendered under every non-browse view.
- [x] B2 — P17. The footer is now conditional. Covered and no-site keep *"Nothing about the site
      you are on leaves this browser"* — both render from the bundle, the live check reads the page
      locally, and neither offers a path that calls anything, so the sentence is true there.
      Uncovered gets the paid-path truth, phrased conditionally because nothing has been sent and
      the confirm is still the only thing that sends. Browse never reaches this footer: it replaces
      the whole surface and already owned a stronger, still-true claim.
- [x] B3 — P18, and **the finding's premise was stale in one detail.** There is no "On a clock"
      eyebrow in the code; the heading read *"Something you can still do"*, which makes a stronger
      claim than the one the finding described — it asserts the window is open, over 19 sites at
      once. Now "Window named in document". The real bug was in `WINDOW_CAVEAT` and the group
      explanation, both of which anchored every window to signup; a refund window runs from the
      purchase and an objection deadline from the notice, so signup was a second invented fact
      standing in for the one D14 already forbids. `describeDeadline` untouched.
- [x] B4 — P16 **needed no change: it is already satisfied.** `AnalyseConfirm` shows own-key cost,
      provider and model, per-document character counts, the excerpt notice and the unreadable
      list, all unconditionally — and there is no info control anywhere in the confirm, run or
      local views to hide them behind. P16 is therefore a constraint on D and E, not work of its
      own. Recorded rather than invented.
- [x] B5 — `eslint`, `type-check`, `test` and `Prettier Check` green locally. Browse suite 8/8,
      including a **new regression guard**: the "never says a window is open" test now also asserts
      the body never matches `/signed up/i`, which is the half of D14 that reads as innocent.

## Unit C1 — disclosure rewrite (P2, P3, P4, P6)

- [x] C1.1 — `FindingReveal`: a button with `aria-expanded`/`aria-controls`, not a nested
      `<details>` — nesting native disclosures gives a screen reader two levels of the same
      affordance and the reader a marker identical to the one that opened the document. The
      revealed content stays in the DOM under `hidden` rather than unmounting, which keeps
      `aria-controls` pointing at something real in both states, keeps find-in-page honest, and
      makes expansion a single attribute flip.
- [x] C1.2 — Three renderers, diverged per P3.
- [x] C1.3 — Absent disclosures get no control, and the schema is why: `RequiredDisclosure` is
      name, regime, status, note, with no optional field. A control could only open onto nothing.
- [x] C1.4 — An action's reference with a quote earns a control; a bare label renders visibly; no
      reference offers nothing. Confirmed against the schema — `reference.quote` is optional,
      `whyItMatters` is not, which is why the exposure needs no "nothing to reveal" branch.
- [x] C1.5 — New `test/document-card.test.tsx`, six tests covering collapsed and revealed content
      per row type, the layer-two floor, and distinguishable accessible names across repeated
      controls.
- [x] C1.6 — `eslint`, `type-check`, `test` (30/30 across 5 files) and `Prettier Check` green
      locally. **The 21-state no-text-loss audit still needs a build** — see A6.

**One thing the test caught that review would not have.** The first fixture gave the opt-out action
a quote reading *"you may opt out within 30 days"*, and the assertion that every mention of the
deadline is visible then failed — correctly, because the quote is evidence and belongs behind the
control. The fixture was wrong, not the component; it now uses a quote that does not repeat the
deadline, and asserts explicitly that the quote is hidden while the deadline is not. Worth keeping
in mind for C2: "the deadline is visible" and "text containing the deadline is visible" are not the
same assertion.

## Unit C2 — surface and motion (P5, P12, P15)

- [x] C2.1 — `.panel-row` dropped its own border, radius and fill; a hairline (`.panel-row +
      .panel-row`) divides consecutive rows within a group instead. Removing the row's 22px of
      left/right padding and 2px of left/right border is the recovery P5 is written against.
      `DocumentCard.tsx` needed no change — the `panel-row` className and row structure are
      untouched, only `SidePanel.css` moved.
- [x] C2.2 — `.panel-doc` moved from `overflow: hidden` to `overflow: clip` and gained
      `flex-shrink: 0`, closing the automatic-minimum-size trap the P-note describes (an
      `overflow` other than `visible` resolves a flex item's auto-min-size to 0, so a
      height-constrained ancestor could silently compress the card). Risk borders live on the
      summary box (`RISK_TONE`) and the severity pill, neither of which is `.panel-row` — neither
      was touched, so nothing to break. **Computed-style confirmation against the built stylesheet
      still pending — see gates below.**
- [x] C2.3 — **Needed no code change: already satisfied**, and pre-existing rather than something
      C1 added. `DocumentCard.tsx` was already omitting the risk pill and the `analysis.summary`
      box on a changed document in favour of the violet earlier-version caveat, before this
      redesign touched the file — confirmed against `git show HEAD:…DocumentCard.tsx`. Same shape
      as B4/P16: recorded rather than invented.
- [x] C2.4 — Finding expansion (layer two) was already instantaneous as of C1 — `FindingReveal`
      toggles the `hidden` attribute with no transition. What C2.4 added: a
      `prefers-reduced-motion: reduce` block on `.panel-doc-chevron` that drops the 200ms rotation
      and jumps straight to whichever orientation the open/closed rule already sets — an explicit
      final state, not a frozen mid-turn one. Mirrors the existing `.panel-busy-dot` reduced-motion
      pattern.
- [ ] C2.5 — Re-measure prose width and document height against the review harness figures.
      **Blocked on a fresh `pnpm build`**, same as A6/C1.6 — the harness reads
      `dist/side-panel/assets/index-Czjub3En.css`, which predates this change.
- [ ] C2.6 — Gates. `eslint`, `test` (30/30, 5 files) and `Prettier Check` green locally on the
      changed files. `type-check` and `build` not run — the user runs those. Risk-tone-identical
      and end-of-document reachability both need the built stylesheet; not yet checked.

## Unit D — view ownership (P7, P8)

- [x] D1 — `SidePanel.tsx` no longer renders a shared `<header>` or footer `<p>`. Each of
      `CoveredView`, `UncoveredView`, `NoSiteView` and the new `LoadingView` now owns its own
      `<header>` and its own trailing footer paragraph, using the exact `panel-shell` flex-child
      shape `BrowseView.tsx` already established (header → content → `mt-auto` footer, all direct
      children of `.panel-shell`, no wrapping element of their own). `SidePanel` itself is now only
      a router: `loading` → `covered` → `site.hostname === null` → uncovered, in that order.
- [x] D2 — `.panel-shell` moved from `min-height: 100vh` (the document itself scrolling) to
      `height: 100vh` with its own `overflow-y: auto`, `overscroll-behavior: contain` and
      `scrollbar-gutter: stable` — handoff §6.3, required for `scroll-state()`, per-view sticky and
      the bottom-fade/back-to-top work still to come in F. The gradient needed no separate change
      (handoff §6.4): default `background-attachment` is already fixed to the element's own box.
      14px horizontal shell inset was already correct pre-D, nothing to change there. Every view's
      footer keeps the same `mt-auto pt-2` it already had, so "in flow on long screens, pinned on
      short ones" is unchanged — confirmed by inspection, not yet confirmed in a real panel.
- [x] D3 — Loading is now its own explicit branch in `SidePanel`, checked *before* `covered` and
      before `site.hostname === null`, so neither of those can be reached mid-resolve. The old
      fallback chain — `domain ?? site.hostname ?? (loading ? 'Reading the current tab…' : 'No
      site here')`, three unrelated meanings through one ternary — is gone. `NoSiteView` and
      `UncoveredView` both lost their `loading` prop and the branches it drove; `LoadingView` is
      new and still prefers the real hostname when the tab has resolved but the domain lookup has
      not, matching what the old fallback chain did in that partial state.
- [x] D4 — Gates. `eslint`, `test` (30/30, 5 files) and `Prettier Check` green locally on the
      changed files. `pnpm build` run by the user and the five states walked in the real loaded
      extension on 2026-09-23 — covered, uncovered-no-saved, no-site, and internal scroll all
      confirmed as expected. **`pnpm type-check` now confirmed clean too** (2026-09-23,
      `turbo type-check` — 12/12 packages successful, `@extension/side-panel` included). D is fully
      closed.

## Unit E — per-view placement (P9, P10, P11)

**Not a clean third case of "record, don't invent."** The handover flagged E as a likely repeat of
C2.3/B4 — needing no code. Two of E's three sub-decisions turned out that way; the third (E3) was
half already true and half a real, unimplemented gap. Recorded precisely below so a future reader
does not round this off to "E needed nothing" the way B4/C2.3 genuinely did.

- [x] E1 — **Needed no change: already satisfied.** `CoveredView`'s header (`SidePanel.tsx`, written
      in D) has only ever carried the domain name and document count — no browse entry, and D never
      added one. Confirmed by reading the current component, not inferred from the handover.
- [x] E2 — **Needed no change: already satisfied.** `LocalAnalysisView` passes `freshness={null}` to
      every `DocumentCard` and renders `AttributionLine` (provenance) directly under each one
      (`LocalAnalysisView.tsx:76`). "Analysis-first" holds in `UncoveredView`: when
      `localAnalyses.length > 0`, `LocalAnalysisView` is the first thing rendered, ahead of the
      confirm/run states and `DocumentReader` (`SidePanel.tsx:182-183`).
- [x] E3 — **Mixed.** Five sub-claims were already true on inspection: browse detail's own
      back/domain header, verdict → one thing → documents ordering, freshness `unconfirmed`, no
      active-tab reader, browse's own privacy/network footer, and typing-dissolves-groups. **Two
      were real gaps, now fixed:**
      - **Search was not sticky and was not "its own header."** It rendered as a bare `<input>`
        below the title header, scrolling away with the rest of the list. Now wrapped in its own
        `<header className="panel-floating top-0 ...">`, using the Floating rank Unit A defined
        for exactly this — `.panel-floating` already carries the ladder's stuck-shadow rule; it has
        no `top` of its own, which is fine here since this is the only sticky element in browse and
        needs no offset math. (The stuck-shadow itself stays inert until F adds
        `container-type: scroll-state` somewhere in `SidePanel.tsx` — browse gets it for free once
        F lands, no further change needed here.)
      - **"Back from detail preserves search and scroll" did not hold.** `BrowseList` held `query`
        in its own `useState`, and it fully unmounts every time a domain opens (`BrowseView`'s
        `opened === null` conditional) — so both search text and scroll position were silently lost
        on every round trip, not just on leaving browse. Fixed by lifting `query` into `BrowseView`
        (discarded for free when browse itself unmounts on `onClose`, since that state then ceases
        to exist) and capturing/restoring `.panel-shell`'s `scrollTop` via a ref on the always-mounted
        footer paragraph's parent element — `.panel-shell` lives one level up in `SidePanel.tsx`, so
        this reaches it without threading a prop through. A freshly opened domain starts scrolled to
        top rather than inheriting wherever the list happened to be.
      - **A third, undocumented gap surfaced during implementation:** "All 37 real destinations
        remain as button rows in **one bordered surface**" did not hold either. Each `.panel-browse-row`
        carried its own individual border, radius and fill — 37 small bordered boxes, the exact
        ladder violation (P1/P5) this whole redesign exists to remove, just never applied to this
        file. Fixed the same way C2.1 flattened finding rows: `.panel-browse-row` dropped its own
        border/radius/fill, and the rows now sit inside `.panel-one-thing` (Primary, one border) with
        `.panel-row`'s existing hairline-between-siblings CSS dividing them — no new CSS needed for
        the hairline since `.panel-browse-row` also carries the `.panel-row` class. This applies in
        both the grouped view and the dissolved-by-search flat list.
- [x] E4 — Gates. `eslint`, `type-check` (12/12 packages, side-panel included), `test` (30/30, 5
      files — `browse-view.test.tsx`'s existing 8 assertions all still pass unmodified) and
      `Prettier Check` all green locally. `pnpm build` not run this session — the user runs that.
      **All 37 real destinations are structurally unaffected** — this unit only changed the wrapping
      container, row styling and state ownership, never the `matches`/`clocked`/`rest` derivation —
      but this has not been walked against the real 37-domain manifest in the loaded extension, only
      against the test suite's 4-domain fixture. Same caveat D carried before its own visual walk:
      worth doing before this unit is called fully closed, especially for the sticky header and the
      scroll-restoration behaviour — `browse-view.test.tsx`'s 8 tests cover content and honesty
      claims, not layout or `scrollTop`, so neither addition has test coverage and neither is
      something a computed-style/DOM-text assertion would catch if it were subtly wrong.

## Unit F — orientation (P13, P14)

The largest unit in the redesign by surface area — six view headers across two files, a new
measurement hook, and `DocumentCard`'s internal structure — and the one with the least available
verification: none of it is exercisable from jsdom, and `scroll-state()` container queries are new
enough that "parses" (A5a) and "actually fires" turned out to be different claims. Tested directly
against a real browser rather than assumed; see F1's finding below.

- [x] F1 — Three levels of sticky, offsets read from actual rendered height via a new
      `useElementHeight` hook (`ResizeObserver`, with a jsdom-safe no-op fallback — no test in this
      workspace asserts on a measured offset, and none should: the real check is a built stylesheet
      in a real browser, same as every other computed-style claim in this redesign).
      - **Level 1** — every view's own header (`CoveredView`, `UncoveredView`, `NoSiteView`,
        `LoadingView` in `SidePanel.tsx`; `BrowseList`'s title header and `BrowseDomain`'s header in
        `BrowseView.tsx`) now carries `.panel-floating` at `top: 0`.
      - **Level 2** — `DocumentCard`'s own `<summary>` now sticks at `top: {headerOffset}`, a new
        prop threaded down from whichever view's header wraps it (`CoveredView` and `BrowseDomain`
        measure their own; `UncoveredView` measures its own and forwards it through
        `LocalAnalysisView`, which gained the same optional prop). Harmless on a collapsed card —
        `.panel-doc`'s total height already equals its summary's when closed, so there is no scroll
        room inside the card for the offset to ever visibly engage.
      - **Level 3** — each document's own section label ("What you gave up", "What you can still
        do", "Missing disclosures") sticks at `top: {headerOffset + summaryHeight}` via a new
        `.panel-doc-section-label` class alongside the existing `.panel-eyebrow`. Normal document
        flow already means only one section label occupies this position at a time, so nothing had
        to be told not to accumulate.
      - **Browse gets an equivalent two-level stack**, not the same three: its title header is
        Level 1, and Unit E's search header — previously hardcoded to `top: 0` with an explicit note
        that this was provisional — now reads the title header's measured height instead. Browse's
        two group headings ("Window named in document" / "Everything else") were deliberately left
        non-sticky: P13's text reads as sections *within a document*, and extending the pattern to
        browse's own groups would be scope beyond what was actually decided.
      - **A genuine finding, not a restated assumption:** built a standalone test page (not the
        product code) and drove it with a real wheel scroll in the built-in browser (Chrome 152) to
        check the `stuck`/`scrollable` container-query features before trusting them in six files.
        `scroll-state(scrollable: top)` and `scrollable: bottom)` both fire correctly. `scroll-state
        (stuck: top)` does **not** — tried physical (`top`) and logical (`block-start`,
        `inset-block-start`) forms, on an element unambiguously clamped by its own stickiness — and
        never matched, despite parsing as a real `CSSContainerRule` with no console error, which is
        all A5a had actually checked. The rule is left in place (harmless, forward-compatible if a
        future Chrome ships it) but the box-shadow-while-stuck polish on every `.panel-floating`
        header does not work today, in this browser. Documented at the CSS rule itself so this is
        not silently rediscovered.
- [x] F2 — Back-to-top (`BackToTop.tsx`, new) reserves its box via `visibility: hidden` rather than
      `display`/`opacity`, appears via the confirmed-working `scroll-state(scrollable: top)`, and
      scrolls the shell to 0 via `event.currentTarget.closest('.panel-shell')` rather than a threaded
      ref. Placed in every header next to the title, grouped with any existing close/back button
      (`flex-1 min-w-0` on the title, not `justify-between`, so the two controls sit together at the
      trailing edge instead of `justify-between` spreading a middle button away from both). The
      bottom fade (`.panel-bottom-fade`) is a single `height: 0` / negative-`margin-top` sentinel
      added once per `<main className="panel-shell">` branch in `SidePanel.tsx` (shell-level chrome,
      not view-specific, so it is not duplicated per view) — confirmed-working
      `scroll-state(scrollable: bottom)`, so it steps aside on its own at the true end of a document,
      which is also where the footer lives.
- [ ] F3 — Re-measure against 69 / 69 / 113 / 113px with no overlap or accumulation. **Not
      applicable as stated, and worth flagging so a future reader does not go looking for those exact
      numbers.** Those four figures came from the review prototype's specific fixture (Microsoft's
      privacy policy, synthetic header text); this implementation reads real rendered height instead
      of assuming a constant, which is the entire point of P13 and self-corrects for whatever a real
      view's header actually measures. The property to re-verify is "no overlap, no accumulation" —
      against the built stylesheet, in a real browser, on real corpus content — not parity with the
      prototype's numbers.
- [x] F4 — Gates. `eslint`, `type-check` (12/12 packages), `test` (30/30, 5 files, unmodified) and
      `Prettier Check` all green locally. `pnpm build` not run this session — the user runs that.
      This is the unit with the largest gap between "gates pass" and "confirmed correct": all four
      gates check syntax and existing behavior, none of them exercise a single sticky offset, the
      back-to-top control, or the bottom fade — that needs the loaded-extension walk this tracker has
      asked for after every unit that touches layout, and needs it more here than anywhere else in
      the redesign.

---

## Carried risks

Inherited from the plan's §8, restated here because they apply to every unit above.

- The two manual QA sets are unwalked, so there is no verified bisect point between `0be40b4` and
  this work.
- The handoff's 2,000px target is unachievable and must not be promised; its ~33 chars/line figure
  is wrong, the real figure is 44.3 at 320px.
- The review bundle lives outside the repo and its server does not survive a reboot.
- P17 and P18 name strings that a quick grep did not find.

# Side panel weight + layout redesign — execution

**Status:** Design phase closed. All eighteen decisions approved by the director on 2026-09-22
and carried into [`panel-weight-redesign-plan.md`](panel-weight-redesign-plan.md) as P1–P18.
**Product code still unchanged; task breakdown pending before any implementation.**
**Started:** 2026-09-22 · **Branch:** `dev/v0.8.3` (see "Branch, and why not `release`")
**Reads from:** [`panel-weight-redesign-handoff.md`](panel-weight-redesign-handoff.md) — the evidence,
the 22 rules (§4), and the five answered questions (§6). This doc does not restate them.

---

## Branch, and why not `release`

The handoff's §7 says to branch from `release` as `dev/v0.9.0`. That is overruled, deliberately and
by the director: the handoff itself is committed only on `dev/v0.8.3`, so a tree cut from `release`
does not contain the document this work is built from. Recorded here so the next reader does not
"fix" it back.

## QA state this is layered on

The two manual QA sets in [`v0.8.3-handoff.md`](v0.8.3-handoff.md) and
[`v0.8.3-browse-view-execution.md`](v0.8.3-browse-view-execution.md) **have not been walked.**
Asked and answered on 2026-09-22: proceed anyway. The cost is recorded rather than hidden — if a
browse-view or popup bug surfaces after this lands, the branch has no verified base to bisect
against, and the first question will be whether it came from `0be40b4` or from here.

---

## 1. Measurements taken here

Run against the real `corpus/analysis/` (83 analyses, 37 domains), not estimated.

| | |
|---|---:|
| Rows in one document — min / median / p90 / max | 8 / **17** / 24 / **40** |
| Exposures / actions / absent disclosures, total | 689 / 524 / 232 |
| Exposure: chars that stay on a collapsed row (title + `whatItMeans`) | 324 |
| Exposure: chars §6.1 hides (`whyItMatters` + quote) | 327 — **50%** |
| Exposures carrying a reference / a quote | 687 / 409 |
| Action: name chars / `howTo` + quote chars | 53 / 241 |
| Actions carrying a real deadline (`kind !== 'none'`) | 49 |
| Absent disclosure: name + regime / note chars | 32 / 235 |
| Documents per domain — max / median | linkedin.com 5 / 2 |

**The one that shapes §6.1's implementation:** the three row types do not split the same way.

- **Exposure** — `title` is the name, `whatItMeans` is the meaning. `whyItMatters` and the quote
  hide. Clean 50/50 cut.
- **Action** — `action` is the name, `howTo` *is* the meaning (it is how you do the thing), so it
  stays. Only the reference quote hides. The deadline stays: it is the one property that splits the
  corpus and browse is built on it.
- **Absent disclosure** — `name (regime)` is the name, `note` is the meaning. **Nothing is left to
  hide, so this row gets no expand affordance at all.** That is D17's rule one level down: a
  disclosure whose whole payload is already on screen must not offer a chevron.

That last line is also most of the answer to the handoff's "must not become 23 chevroned
`<details>`" constraint — 232 of the 1,445 rows are structurally excluded from having one.

## 2. Status

- [x] Read the handoff, D1–D17, `CLAUDE.md`, both QA docs
- [x] Read the full panel source — 9 components, `SidePanel.css`, `global.css`, `risk-tone.ts`
- [x] Corpus measurements above
- [x] Weight ladder fixed (§3) — the shared artifact every agent designs against
- [x] Screen-family proposals — covered, uncovered + no-site, browse; returned 2026-09-22
- [x] Document-card proposal — returned 2026-09-22
- [x] Adversarial pass — agent findings plus local rule audit; corrections in §8
- [x] Before/after visuals at 320px and 400px, measured in a real browser — 21 states / 42 comparisons
- [x] **Director approval** — granted 2026-09-22; all eighteen decisions approved
- [x] Decisions carried into [`panel-weight-redesign-plan.md`](panel-weight-redesign-plan.md) as P1–P18
- [ ] Task breakdown — group P1–P18 into units of work, into a tracking execution doc
- [ ] Implementation
- [ ] Five gates + built-stylesheet colour verification

## 4. Measured "before" — rendered in Chrome, not estimated

The current panel markup, rendered against the **built** stylesheet
(`dist/side-panel/assets/index-Czjub3En.css`) with real corpus data, in an iframe at exactly 320px
and 400px. Harness and fixtures are in the session scratchpad; the generator replicates each
component's markup verbatim.

| screen | height @320 | height @400 | chars/line @320 | @400 |
|---|---:|---:|---:|---:|
| covered, all collapsed (amazon.com, 3 docs) | 800 (viewport floor) | 800 | 44.3 | 59.1 |
| covered, terms card open | **4,690** | 3,815 | 44.3 | 59.1 |
| worst document open (microsoft.com privacy, 40 rows) | **17,243** | 13,458 | 44.3 | 59.1 |
| uncovered, reader open, 6 documents (the bugasura.io screenshot) | 1,109 | 952 | 44.3 | 59.1 |
| browse, 37 rows | 1,991 | 1,972 | — | — |
| no site | 800 | 800 | 48.4 | 63.1 |

### One correction to the handoff's §3.2, and it matters for how the work is justified

The handoff puts the panel at **~33 characters** per line at 320px and **~44** at 400px, and
concludes it "has been below the readable line length at every width". Those numbers assume
**7.0px per character**. Measured, Avenir Next at 12px averages **5.417px** over representative
policy prose — so the real counts are **44.3 and 59.1**, about 30% higher.

What that changes:

- **At 400px and above the line-length problem does not exist.** 59 characters is inside the
  45–75 band, not marginal.
- **At 320px it is real but modest** — 44.3 sits right at the floor rather than well below it.
- **Removing the row box is still right, but not for this reason.** It buys 22px = ~4 characters
  (44.3 → 48.4 at 320px, 59.1 → 63.1 at 400px), which is a genuine improvement and not a rescue.
  The case for it is §3.4's: a card and a row currently look the same, and that is the hierarchy
  problem. The line-length gain is a bonus, and the execution doc should not oversell it.

**The height numbers go the other way — they are worse than the handoff states.** The worst
document at 320px is **17,243px**, against the handoff's 14,939 (measured at 360px). At 320px a
reader who opens microsoft.com's privacy policy is at the top of a column **21.5 viewports** tall,
with no scroll affordance anywhere in the panel. That is the problem this redesign exists for, and
it is the one the measurements strengthen rather than weaken.


## 5. The measurement tools, and what they confirmed

Two claims the design rests on were verified in Chrome 152 rather than taken on trust.

### The `overflow: hidden` sticky trap is real, and measured

A `position: sticky` element inside an `overflow: hidden` ancestor, in a scrolled container: its
offset from the scroll port reads **−300px** — it scrolled away, sticky silently did nothing. The
identical structure with `overflow: clip` reads **0** — it stuck. No error either way. This is why
`.panel-doc { overflow: hidden }` must become `overflow: clip` before a single sticky header goes
inside a card.

### The border really does carry the risk ramp — here are the numbers

The handoff asserts this and shows only the fill side. Both sides, measured against the shell's own
ground (`#efe5d6`, the gradient end) and against the card surface:

| | Low | Medium | High | Very High | range |
|---|---:|---:|---:|---:|---:|
| **fill** vs shell ground | 1.13 | **1.04** | 1.14 | 1.54 | 1.5× |
| **border** vs shell ground | 1.14 | 1.54 | 2.30 | **3.63** | 3.2× |
| **border** vs card surface | 1.34 | 1.81 | 2.70 | **4.28** | 3.2× |

The fill spans a 1.5× range and is *non-monotonic* — Medium (1.04) is **less** visible than Low
(1.13), so as a ramp the fill does not even run the right way. The border spans 3.2× and is
monotonic at every step. Flattening or softening a border on a graded element deletes the only
channel that works. This is hard stop #1 with its evidence attached.

The tool is trustworthy because it reproduces every value already documented in `global.css`
without being told them: text-faint 4.65 / muted 6.13 / soft 8.25 / text 14.03 / strong 15.85 on
`#efe5d6`, and the fill row 1.13 / 1.04 / 1.14 / 1.54. (First attempt returned nonsense — Chrome
152 reports computed colours as `oklch()`, so a naive `rgb()` parser reads the components as RGB.
It goes through a canvas now.)

### Platform capabilities, checked not assumed — Chrome 152

| | |
|---|---|
| `container-type: scroll-state` | yes |
| `@container scroll-state(stuck: top)` parses | yes |
| `@container scroll-state(scrollable: bottom)` parses | yes |
| `overflow: clip` | yes |
| `scrollbar-gutter: stable` | yes |
| `<details name>` exclusive accordion | yes |
| **`interpolate-size: allow-keywords`** | **yes** |
| `transition-behavior: allow-discrete` | yes |

`interpolate-size` is the one the handoff did not know about: it lets `height: auto` animate
natively, so a finding's expand needs no JS measurement and no `max-height` guess. Its
reduced-motion resting state is trivial and correct — the expanded state, arrived at instantly.


## 6. The weight ladder

This is the shared constraint every proposal designs against. It is a hierarchy of *form*, not a
new colour system.

| Weight | Form | Use |
|---|---|---|
| Ground | Fixed viewport gradient; no border, radius or shadow | The shell and plain explanatory copy |
| Primary | One bordered surface with a 16px radius; no resting shadow | The document list/card: the thing the screen exists to offer |
| Secondary | A hairline separator and ordinary page ground | Analyse, retry and other supporting actions |
| Tertiary | Plain text link; no surrounding container | Browse/navigation offers that are not the screen's job |
| Floating | Solid composited ground plus a restrained shadow only while stuck | Per-view sticky headers and active orientation aids |

Two intentional exceptions do not change rank:

- A graded element keeps its tinted fill **and its full 1px risk border**. The border is the working
  ramp; removing it is a data-encoding bug, not visual simplification.
- A destructive/app-failure state stays on the app surface and uses its edge rule. It never borrows
  a risk tint.

Rows are not a sixth weight. They are content inside the primary surface, divided by hairlines.
Buttons remain controls rather than containers and do not confer rank on their surrounding copy.

## 7. Proposed design — pending adversarial review and visual approval

The agents returned proposals; the following is the integrated specification. No product source
has changed. §6 decisions in the handoff remain closed.

- **Shared geometry, separate owners:** 14px shell inset at 320px and 400px. Each view owns its
  header, footer and navigation. Fixed-height shell is the scrollport, with stable gutter and
  contained overscroll. Header heights may grow with text; sticky offsets must use the actual
  rendered height. The footer remains in flow with an auto margin on short screens.
- **Covered:** own header → real freshness state → full bordered/tinted worst verdict → one thing
  on shell ground → individual document cards → secondary document reader. Keep D10 order.
  No browse entry in this header. No resting shadows.
- **Uncovered without saved results:** domain + short neutral coverage line → primary document
  reader → plain browse entry → secondary Analyse line with info → confirm/run state. No per-row
  Analyse. The confirm keeps its existing selected-all semantics and preselected API.
- **Local results:** keep attribution and excerpt limits visible before any grade. Preserve the
  existing analysis-first order for this state, followed by the reader and supporting actions;
  moving already-paid results below a long discovered list is unnecessary. Local cards keep
  `freshness: null`. Every card retains its own provenance visibly associated with it.
- **No-site and loading:** separate explicit states. A resolved no-site state shows the existing
  truthful explanation and a plain browse entry on the ground, with no reader. Loading text is
  rendered by a loading state, not by a fallback title in a shared header.
- **Browse list:** its own sticky header includes search. All 37 real destinations remain, as
  button rows inside one bordered surface. Neutral window markers and document counts remain;
  typing still dissolves groups. Back from detail preserves search/scroll within the session;
  leaving browse discards them. Browse owns its privacy/network claim.
- **Browse detail:** its own back/domain header, existing verdict → one thing → documents order.
  Never a freshness strip or active-tab reader. Document freshness is `unconfirmed`.
- **Documents:** keep each document as the primary bordered surface; flatten finding rows inside
  it, not the risk borders. `overflow: clip`. Native document disclosure is layer one; a quiet
  labelled button revealing finding elaboration is layer two. No collapsibles within that region.
  Exposures retain title, meaning and severity; actions retain action, how-to and window; absent
  disclosures retain name, regime, note and Missing badge, with no empty expand affordance.
  The risk summary keeps its original tone-map fill/border; inner radius is 4px at a 13px inset.
  Changed documents omit summary/pill and keep an explicit earlier-version caveat.
- **Orientation:** per-view sticky header, per-document sticky summary and section-scoped sticky
  labels. Measure actual offsets; never assume a wrapping title is always 44px. A bottom fade and
  back-to-top control derive from the actual shell scroll state. No animation is needed for these.
- **Motion:** initial proposal uses instantaneous finding expansion to keep focus, hidden-state
  semantics and reduced motion simple. Retain existing document chevron transition with an explicit
  final orientation under reduced motion. Native height interpolation remains optional polish,
  not a reason to delay the correct disclosure behavior.
- **Disclosure/payment:** info controls may hide repeated explanation; they must not hide the
  pre-spend notice that a call uses the user's key/credits, the provider/model, excerpt limits,
  or unreviewed attribution. This rejects that part of the uncovered agent's proposal.
- **Repeated controls:** accessible names include the exact document/source. Distinguish same-type
  document summaries with visible source identity as needed; do not invent editions.

### Corrections before visual approval

The first scratch mock abbreviated real findings, invented a sample window and showed fewer rows
than its count. It is **discarded as approval evidence**. Replacements must render the current React
components against the existing built stylesheet with complete corpus text. Synthetic discovery
fixtures are labelled as such and shared exactly between before and after. The 320px and 400px
review must include the same content, expansion state and viewport height on both sides.

Agent height projections are estimates, not measurements. In particular the document agent's
model puts the median near 3,374px at 320px, so the handoff's 2,000px target must not be promised.
Only real-browser after measurements can settle the gain.

## 8. Adversarial findings and resolution

The dedicated reviewer returned three concrete hazards before reaching its usage limit. The
remaining audit was completed locally against the prototype. The baseline-render agent also hit
its limit; its saved harness was repaired and completed locally rather than restarted.

1. **False footer on the paid path (rule 21 / S1 / S9).** The existing “Nothing … leaves this
   browser” line is false when the user starts provider analysis or results sync to Drive. The
   uncovered/local/confirm/run preview now says: “When you analyse, document text goes to your
   chosen provider. Results can sync to your connected Drive.” Browse keeps its separate offline
   statement. This also rejects the uncovered agent's proposed “stay on this device” wording.
2. **Invented signup anchor (rule 9 / D14).** The current browse caveat assumes every named window
   starts at signup. The new caveat refers to the event named by the document and the reader's
   circumstances. The “On a clock” eyebrow becomes “Window named in document”. Actual action
   wording and `describeDeadline` output remain unchanged.
3. **Flex shrink + clip can silently hide content (§6.3).** A fixed-height flex shell can compress
   its direct cards. The prototype uses an unshrinking content column. Verified the last finding
   and footer remain reachable at the end of the longest document.
4. **Pre-spend facts are not optional explanation (S5/S6).** Own-key cost, provider/model,
   per-document excerpt notice, and provenance remain visible. Info reveals only repeated
   explanation at the secondary offer. The confirm is not moved inside a reader disclosure.
5. **No empty evidence controls.** Actions with only a reference label keep that label visible;
   only quoted evidence earns an expand control. Absent disclosures have no expand control.
6. **No header geometry change when Top appears (rule 16).** Top reserves its space and switches
   visibility from actual scroll state, so appearing cannot reflow the domain title.

Rules 1/6/7/18/19 were checked against computed styles and the existing built stylesheet. Rules
8/10/11/12/13/14/20 were checked against unchanged source arrays plus rendered fixture content and
states. Rules 3/4/5/21/22 are explicit in the per-view proposal and fixture ordering. Rule 15 has
an instant expansion state and measured reduced-motion busy state. Rule 17 introduces no tablist.
Rule 16 is measured below. All must be rechecked against the actual implementation after approval.

## 9. Faithful browser review — 2026-09-22

Review URL while the local server runs: `http://127.0.0.1:43873`.

Artifacts live in:
`/Users/abhiroopprasad/.codex/visualizations/2026/09/22/01a0c865-4bbb-7bb3-bf54-84c16c909507/`.

- `baseline/run.mjs` + `baseline/render.tsx`: actual current React components rendered by SSR,
  with controlled hook data and scratch-only exports of private views. No product files patched.
- `baseline/fixtures.json`: 21 complete fixtures; findings and browse rows use the committed bundle.
  Discovery, local provenance, run state and confirm lengths are explicitly labelled synthetic.
- `proposal.css` / `proposal.js`: isolated after prototype, applied to the same rendered content.
- `serve-review.mjs`: local interactive comparison, exact 320px or 400px iframes, 800px height.
- `capture-review.mjs`: screenshots for every state/width, under `screens/`.
- `audit-review.mjs`: content, tone, overflow, expansion, sticky, reachability and contrast checks.
- `measurements.json` / `audit.json`: raw browser evidence. No page errors; all 42 comparisons pass.

To reopen: `node <artifact-directory>/serve-review.mjs`. To regenerate baseline first, run
`node <artifact-directory>/baseline/run.mjs`; then run the capture and audit scripts.

### Actual total scroll heights (800px viewport floor)

| Matched fixture | Before 320 | After 320 | Before 400 | After 400 |
|---|---:|---:|---:|---:|
| Amazon, terms open | 4,690 | **3,577** | 3,815 | **3,056** |
| Microsoft, privacy open | 17,820 | **11,628** | 13,976 | **9,522** |
| Synthetic uncovered, six documents | 1,110 | **854** | 953 | **800** |
| Browse, all 37 sites | 1,991 | **1,714** | 1,972 | **1,696** |

The Microsoft full-view baseline differs from the interrupted session's figure because this
harness renders the complete current view and derived reader state, rather than a replicated
markup sample. Compare within this table; do not subtract across the two fixtures. The 400px
uncovered height reaches the viewport floor, so 800px does not mean its content occupies all 800px.

Prose width is **240 → 264px** at 320 and **320 → 344px** at 400: 22px of row padding plus two
1px row borders recovered. This supports the grouped-inset-list decision. It does not support
claiming a 2,000px median or a universally halved page.

### Verified browser behavior

- All finding text remains present, in order, after removing newly added control labels from the
  comparison. Every real browse row and marker remains. No absent-disclosure tally is introduced.
- Graded fill, border colour/width and text colour match before/after computed styles exactly.
  All four `border-rose-*` and `bg-rose-*` combinations exist in the BUILT stylesheet.
- No horizontal overflow at either width in all 21 states.
- Finding buttons expand and collapse; their revealed content contains no nested disclosure.
- Deep scroll: view header bottom **69px**, document header top **69px**, document header bottom
  **113px**, active section heading top **113px**. No overlap or accumulated section headers.
- Long-document end: remaining scroll **0px**, footer bottom **782.25px** in the 800px viewport.
- Reduced motion: busy indicator is `animation: none`, `opacity: 0.7`, `transform: none`.
- Text contrast on header ground `#f7f2ea`: text **15.69**, muted **6.85**, faint **5.20**.
  On document/section sticky ground `#fffaf3`: **16.84 / 7.35 / 5.58** respectively.

This verifies the review prototype only. Implementation still requires focused behavioral tests,
all five repository gates, a fresh built-stylesheet check, and loaded-extension QA. The earlier
manual QA debt remains explicitly accepted as recorded above; it has not silently become passed.

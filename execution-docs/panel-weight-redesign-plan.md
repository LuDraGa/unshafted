# Side panel weight + layout redesign — plan

**Status:** All eighteen decisions approved by the director on 2026-09-22. This doc is the
approved design substrate. **It is not a task list and nothing here is implemented yet.**
**Branch:** `dev/v0.8.3`
**Reads from:** [`panel-weight-redesign-handoff.md`](panel-weight-redesign-handoff.md) — the 22
rules and D1–D17. [`panel-weight-redesign-execution.md`](panel-weight-redesign-execution.md) — the
corpus measurements, the browser review, and the adversarial findings. Neither is restated here.

---

## What this doc is for

The research produced eighteen design positions. They are *concepts* — each one is true across
several components, and several of them are true about the same component. You cannot implement
them one at a time in the order they are written, because P5 and P2 both rewrite the same file and
P1 changes the vocabulary all the others are stated in.

So this doc does one job: give each decision a **stable ID**, its **evidence**, the **surfaces it
touches**, and what it **depends on** — in a form that can be sliced along any axis. The next step
is to read the surface map in §6 and the dependency order in §5 together, group the decisions into
units of work that share a file and a gate, and write those units into a separate execution doc for
tracking.

Three namespaces are now in play. Keep them apart:

| | means |
|---|---|
| **D1–D17** | closed decisions from the handoff — not reopened here |
| **Rules 1–22** | the constraints in handoff §4 that any implementation is audited against |
| **P1–P18** | the decisions in this doc |

---

## 1. The governing decision

### P1 — Adopt the five-rank weight ladder

A hierarchy of *form*, not a new colour system: rank is carried by border, radius, shadow and
ground, never by hue.

| Rank | Form | Carries |
|---|---|---|
| Ground | Fixed viewport gradient; no border, radius or shadow | The shell, plain explanatory copy |
| Primary | One bordered surface, 16px radius, no resting shadow | The document list/card — what the screen exists to offer |
| Secondary | A hairline separator on ordinary page ground | Analyse, retry, supporting actions |
| Tertiary | Plain text link, no container | Browse and navigation offers that are not this screen's job |
| Floating | Solid composited ground plus a restrained shadow, only while stuck | Sticky headers, active orientation aids |

Two exceptions that do not change rank: a graded element keeps its tinted fill **and its full 1px
risk border**, and a destructive or app-failure state stays on the app surface with its own edge
rule and never borrows a risk tint. Rows are not a sixth rank — they are content inside the primary
surface. Buttons are controls, not containers, and confer no rank on the copy around them.

**Why:** without a fixed ladder every subsequent decision is an aesthetic opinion. With it, "demote
browse" and "flatten the rows" become the same statement applied twice.
**The part that is a product stance, not a layout tidy:** Analyse becomes Secondary and browse entry
becomes Tertiary. They stop being cards. Approving P1 approves that.
**Touches:** `pages/side-panel/src/SidePanel.css`, `packages/ui/global.css`.
**Depends on:** nothing. **Everything else depends on this.**
**Verified by:** computed-style comparison per rank; rules 1/6/7/18/19 rechecked against the built
stylesheet.

---

## 2. The document interior

This is where the height comes from: 17,820 → 11,628px on the worst document at 320px. P2–P6 are
one coherent rewrite of `DocumentCard.tsx` and should be read as a set.

### P2 — Two layers of disclosure, and never a third

Native `<details>` for the document is layer one; a quiet labelled button revealing finding
elaboration is layer two; nothing nests inside that revealed region.

**Why:** handoff constraint — the panel must not become 23 chevroned `<details>`. Two layers with a
hard floor is the only structure that satisfies it without hiding the finding itself.
**Touches:** `components/DocumentCard.tsx`.
**Depends on:** P1 (the button is a control, not a container).
**Verified by:** revealed content contains no nested disclosure, at all 21 states.

### P3 — Split each row type by its own meaning, not by one uniform rule

The three row types do not divide the same way, so they must not share one renderer.

| Row type | Stays collapsed | Hides behind layer two |
|---|---|---|
| Exposure (689) | `title`, `whatItMeans`, severity — 324 chars | `whyItMatters` + quote — 327 chars, **50%** |
| Action (524) | `action`, `howTo`, window — `howTo` *is* the meaning | reference quote only |
| Absent disclosure (232) | name, regime, note, Missing badge | **nothing — see P4** |

**Why:** measured against the real corpus (83 analyses, 37 domains, 1,445 rows). A uniform
"hide the second half" rule would hide `howTo`, which is the whole point of an action row. The
deadline never hides: 49 actions carry a real one and browse is built on that property.
**Touches:** `components/DocumentCard.tsx` — the three renderers diverge.
**Depends on:** P2.
**Verified by:** all finding text present and in order after removing new control labels.

### P4 — Absent disclosures get no expand affordance at all

Name, regime, note and Missing badge are the entire payload, so 232 of 1,445 rows must never render
a chevron.

**Why:** D17 one level down — a row whose whole payload is on screen must not offer to reveal more.
This alone removes 16% of all rows from the chevron count and is most of the answer to the
handoff's constraint.
**Touches:** `components/DocumentCard.tsx`.
**Depends on:** P3.
**Verified by:** zero expand controls in any absent-disclosure row; no absent-disclosure tally
introduced.

### P5 — Flatten the rows, never the risk borders

Findings become hairline-divided content inside one bordered document surface. Every graded element
keeps its tint **and** its full 1px risk border at full strength.

**Why:** recovers 22px of row padding plus two 1px row borders — prose width 240 → 264px at 320 and
320 → 344px at 400. The risk border is the working risk ramp; removing it to "simplify" would be a
data-encoding bug, not a visual improvement.
**Touches:** `components/DocumentCard.tsx`, `SidePanel.css`. **`packages/ui/lib/risk-tone.ts` is not
touched.**
**Depends on:** P1.
**Verified by:** graded fill, border colour, border width and text colour match before/after
computed styles exactly; all four `border-rose-*` and `bg-rose-*` combinations present in the
built stylesheet.

### P6 — An expand control that reveals nothing is worse than none

Actions carrying only a reference label keep that label visible; only quoted evidence earns a
control. 409 of 687 referenced exposures carry a quote.

**Touches:** `components/DocumentCard.tsx`. **Depends on:** P3.

### P-note — `overflow: clip`, and the unshrinking column

Not a decision; a defect P2–P5 must not reintroduce. `overflow: hidden` creates the measured sticky
trap, and a fixed-height flex shell can silently compress its direct cards. The content column does
not shrink. Verified: last finding and footer reachable at the end of the longest document,
remaining scroll 0px, footer bottom 782.25px in an 800px viewport.

---

## 3. Per-view structure

### P7 — Every view owns its own header, footer and navigation

Shared geometry (14px shell inset at both widths), separate owners. The fixed-height shell is the
scrollport with a stable gutter and contained overscroll. The footer stays in flow with an auto
margin on short screens.

**Why:** the shared header is what allowed a fallback title to double as a loading state. The fix is
ownership, not a better fallback.
**Touches:** `SidePanel.tsx` gives up chrome; all seven view components gain their own.
**Depends on:** P1. **Blocks:** P8, P9, P13.
**Verified by:** header heights may grow with text, so sticky offsets read actual rendered height.

### P8 — No-site and loading are two explicit states

A resolved no-site state shows the existing truthful explanation and a plain browse entry on the
ground, with no reader. Loading is rendered by a loading state.

**Touches:** `SidePanel.tsx`. **Depends on:** P7.

### P9 — Browse is offered only from screens that have nothing else to give

No browse entry in the covered header. It appears on uncovered, on no-site, and as its own view.

**Why:** if three analysed documents are already on screen, browse is not the offer. Tertiary rank
(P1) is what makes this expressible without deleting the affordance.
**Touches:** `components/AnalysisView.tsx`, `components/BrowseView.tsx`.
**Depends on:** P1, P7.

### P10 — Local results stay analysis-first

Already-paid results are not pushed below a long discovered list. Local cards keep
`freshness: null`, and every card keeps its provenance visibly associated with it.

**Touches:** `components/LocalAnalysisView.tsx`. **Depends on:** P7.

### P11 — Browse detail never shows a freshness strip or an active-tab reader

Document freshness there is `unconfirmed`. Its own back/domain header, then verdict → one thing →
documents. Browse owns its own privacy/network claim, and search lives in its own sticky header;
typing dissolves groups, back from detail preserves search and scroll within the session, leaving
browse discards them. All 37 real destinations remain as button rows in one bordered surface.

**Why:** you are not on that site. Showing freshness would assert something the app cannot know.
**Touches:** `components/BrowseView.tsx`. **Depends on:** P1, P7.

### P12 — Changed documents drop the summary and the pill

Keep an explicit earlier-version caveat instead.

**Why:** a verdict computed against a superseded version must not be displayed as a current verdict.
**Touches:** `components/DocumentCard.tsx`. **Depends on:** P5.

---

## 4. Orientation, motion, and honesty

### P13 — Three levels of sticky, with measured offsets

Per-view header, per-document summary, section-scoped labels. Offsets read from actual rendered
height — never assume a wrapping title is 44px. A bottom fade and a back-to-top control derive from
real shell scroll state. No animation required.

**Measured:** view header bottom 69px, document header top 69px, document header bottom 113px,
active section heading top 113px. No overlap, no accumulated section headers.
**Touches:** `SidePanel.css` plus live measurement in the view components.
**Depends on:** P1, P7.

### P14 — Back-to-top reserves its space before it appears

It switches visibility from scroll state; appearing must never reflow the domain title (rule 16).
**Touches:** `SidePanel.tsx`. **Depends on:** P13.

### P15 — Finding expansion is instantaneous

Keeps focus behaviour, hidden-state semantics and reduced motion simple. The existing document
chevron transition stays, with an explicit final orientation under reduced motion. Native height
interpolation is optional polish and not a reason to delay correct disclosure behaviour.

**Measured:** reduced motion gives `animation: none`, `opacity: 0.7`, `transform: none`.
**Touches:** `components/DocumentCard.tsx`, `SidePanel.css`. **Depends on:** P2.

### P16 — Pre-spend facts never hide behind an info control

Own-key cost, provider and model, per-document excerpt limits, and unreviewed attribution stay
visible. Info reveals only *repeated* explanation at the secondary offer. The confirm is never moved
inside a reader disclosure and keeps its existing selected-all semantics and preselected API.

**Why:** adversarial finding 4. This explicitly rejects the uncovered agent's proposal.
**Touches:** `components/AnalyseConfirm.tsx`, `components/RunStatus.tsx`.
**Depends on:** P1. **Outranks any layout gain.**

### P17 — The footer tells the truth on the paid path

The uncovered, local, confirm and run states say: *"When you analyse, document text goes to your
chosen provider. Results can sync to your connected Drive."* Browse keeps its separate offline
statement.

**Why:** adversarial finding 1 — the current line is false the moment a provider call runs or
results sync to Drive. This is a correctness fix, not a layout change, and rejects the uncovered
agent's proposed "stay on this device" wording.
**Touches:** the four states above. **First implementation step is locating the current string** —
it did not surface under a quick grep for its quoted wording.
**Depends on:** nothing. **Shippable alone.**

### P18 — The window caveat stops assuming signup

The "On a clock" eyebrow becomes "Window named in document", and the caveat refers to the event the
document names plus the reader's circumstances. Actual action wording and `describeDeadline` output
are unchanged.

**Why:** adversarial finding 2 — the corpus does not support every named window starting at
registration.
**Touches:** `components/BrowseView.tsx` and the document row caveat. Same locating caveat as P17.
**Depends on:** nothing. **Shippable alone.**

---

## 5. Dependency order

```
P1  ladder
├── P5  flatten rows ──────── P12 changed documents
├── P2  two layers ───┬────── P3 row split ──┬── P4 no absent chevron
│                     │                      └── P6 no empty control
│                     └────── P15 instant expansion
├── P7  per-view ownership ─┬─ P8  no-site / loading
│                           ├─ P9  browse placement
│                           ├─ P10 local order
│                           ├─ P11 browse detail
│                           └─ P13 sticky ─── P14 back-to-top
└── P16 pre-spend facts

P17, P18  — independent of everything above
```

**Reading:** P1 lands first or nothing else is expressible. P17 and P18 can ship before, during or
after, on their own branch. P2–P6 + P12 + P15 are one file and should be one unit. P7 must land
before P8–P11 and P13.

## 6. Surface map

The substrate for grouping. A task that touches one row of this table and one gate is a good task.

| Surface | Decisions |
|---|---|
| `SidePanel.css` | P1, P5, P13, P15 |
| `packages/ui/global.css` | P1 |
| `SidePanel.tsx` | P7, P8, P14 |
| `components/DocumentCard.tsx` | P2, P3, P4, P5, P6, P12, P15 |
| `components/AnalysisView.tsx` | P7, P9 |
| `components/BrowseView.tsx` | P7, P9, P11, P18 |
| `components/LocalAnalysisView.tsx` | P7, P10 |
| `components/AnalyseConfirm.tsx` | P7, P16, P17 |
| `components/RunStatus.tsx` | P7, P16, P17 |
| `components/DocumentReader.tsx` | P7 |
| `packages/ui/lib/risk-tone.ts` | **none — deliberately untouched (P5)** |

`DocumentCard.tsx` carries seven decisions and is the largest single unit of risk.

## 7. What every unit of work is verified by

Beyond the five repository gates (`eslint`, `type-check`, `test`, `build`, `Prettier Check`):

- **No text loss.** All finding text present and in order once new control labels are excluded.
- **Risk tones identical.** Graded fill, border colour, border width and text colour match
  before/after computed styles exactly, against the *built* stylesheet — not the source.
- **No horizontal overflow** at 320px and 400px, in all 21 states.
- **Sticky offsets measured,** not assumed, with no overlap or accumulation.
- **Reachability** of the last finding and the footer at the end of the longest document.
- **Contrast holds:** header ground `#f7f2ea` gives 15.69 / 6.85 / 5.20; sticky ground `#fffaf3`
  gives 16.84 / 7.35 / 5.58.
- **Rules 1–22 rechecked against the real implementation.** The review verified the prototype only.

The review harness in `~/.codex/visualizations/2026/09/22/01a0c865-.../` regenerates all of this.
Its "before" is now the thing being replaced, so capture any missing baseline before the first
merge — see the open question below.

## 8. Carried debt and open questions

These are recorded, not resolved. They belong in the execution doc as explicit risks.

- **Manual QA was never walked.** The two sets in [`v0.8.3-handoff.md`](v0.8.3-handoff.md) and
  [`v0.8.3-browse-view-execution.md`](v0.8.3-browse-view-execution.md) are unwalked, so this lands
  on a base with no verified bisect point between `0be40b4` and the redesign.
- **The handoff's 2,000px target is not achievable and must not be promised.** Measured worst case
  is 11,628px; the median estimate is ~3,374px at 320. The handoff's §3.2 also puts the panel at
  ~33 chars/line at 320px, where the real figure is 44.3.
- **The review bundle lives outside the repo** and its server dies with the machine.
- **P17 and P18 name strings that a quick grep did not find.** Locating them is step one of either.
- **Branch.** Work continues on `dev/v0.8.3` rather than a fresh cut from `release`, because the
  handoff this is built from exists only there. Recorded so it is not "fixed" back.

## 9. Next step

Group P1–P18 into units along §5 and §6, then write those units — with owners, order and status —
into `panel-weight-redesign-tasks-execution.md`. **No product file changes before that doc exists.**

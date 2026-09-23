# Side panel — lenses, tools by placement, and a hierarchy that is actually applied

**Started:** 2026-09-23 · **Branch:** `dev/v0.8.3` · **Follows:** the panel weight redesign, committed as
`f41b5a2` ([plan](panel-weight-redesign-plan.md), [tasks](panel-weight-redesign-tasks-execution.md),
[handover](panel-weight-redesign-session-handover.md)).

**Status:** direction approved by the director 2026-09-23 ("doc then implement"). **All six units
written; `eslint`, `test` (41/41, 6 files) and `Prettier Check` green; walked in the harness against
the director's own live `pnpm dev` build.** Not yet run: `type-check` and `build` (the director runs
those), and a walk in the loaded extension. **Committed 2026-09-23 with L7**, at the director's call,
ahead of the review's fixes — those are tracked in [`panel-lens-review-fixes.md`](panel-lens-review-fixes.md).

---

## 1. The direction, in the director's words

After `f41b5a2` the panel looked better, but "visual hierarchy and attention still weren't given
enough weight" — and the ask was not for isolated fixes but for the actual tools of hierarchy:
**progressive disclosure, the use of buttons, placement, and negative space.**

Then, on seeing a first proposal that put tabs *inside* each document:

> i would want to avoid tabs inside tabs, but the user or viewer is not concerned on document
> level, they are concerned about their risk interaction and data privacy interaction and if
> anything time sensitive is there right? the docs can be a separate tab itself

> for the progressive disclosure, we have in quick analysis in popup right: blockers, asks,
> obligation, doc, caveats.... i think that is great progressive disclosure idea. love it. and
> then each has crisp concise expandable blocks that i want again.

> and separated concerns of sign in, guide and actual doc analysis based on placement and
> interaction is good design. the treatment should be similar for fetching docs again, running
> analysis, checking library of all other docs and so on

Three consequences, and they are the whole of this pass:

1. **The unit of reading is the reader's concern, across the whole site — not the document.**
   Lenses aggregate every document's findings by what they mean for the reader. Documents become
   one lens among them.
2. **Findings become crisp expandable blocks**, the popup's `CollapsibleItem` shape: a title you
   can scan, the rest one click away.
3. **Tools get their own place and their own interaction**, the way the popup separates account,
   guide and analysis: the page reader, look-again, the library and running an analysis stop
   being cards in the reading flow.

## 2. What the walk found (why `f41b5a2` still reads flat)

Walked in a harness that renders the **built** panel (`dist/side-panel`, identical hashes to the
user's own build) with a stubbed `chrome.*`, at 400px and 320px, every state. Harness lives in the
session scratchpad, served by the `panel-mock` entry in `.claude/launch.json` (gitignored).

| Finding | Evidence |
|---|---|
| **The ladder is vocabulary, not usage.** | `.panel-primary` and `.panel-secondary` have **zero consumers**. Almost every block is `.panel-one-thing`, a full Primary bordered card. Covered first screen: 7 bordered surfaces. P1's "Analyse → Secondary, browse → Tertiary, they stop being cards" and P8's "browse entry on the ground" were approved and never applied — A defined the ranks, D/E never consumed them. |
| **One button for everything.** | `.panel-button` is the only button. "Analyse 3 documents" (spends money) is identical to "Cancel". Uncovered shows 11 identical pills. |
| **Spacing encodes nothing.** | `.panel-shell { gap: 12px }` between every block; header, freshness, verdict, one-thing, documents, reader all equidistant. |
| **One voice for every label.** | The same amber caps eyebrow names a view section, an in-card label, a document section and a browse group; plus uppercase captions and pills. |
| **Sticky chrome bleeds (F, first real walk).** | Header sticks at y=16 (shell `padding-top`) and spans x 14–386, so content scrolls visibly above and beside it. Grounds are translucent: header `rgba(…,0.96)`, document summary and section labels `rgba(…,0.82)` — text shows through all three sticky levels. Offsets themselves are right (summary top 68 = header bottom 68). |
| **Placement.** | Back `←` sits trailing next to an identical `↑`. "Documents on this page" (a tool about the live page) is a fourth card indistinguishable from the analysed documents. |
| **P18 half-applied.** | The "On a clock" eyebrow still exists at `AnalysisView.tsx:68`. The handover's note #2 ("there is no 'On a clock' eyebrow") is wrong — it was looking at `BrowseView.tsx` only. |

## 3. The model

### 3.1 Lenses — the reader's concerns, across every document on the site

Measured against the corpus (82 analyses, 37 domains): exposures are **60% `Data/Privacy`** (410 of
682); the rest are Disputes 74, Payment 51, IP 44, Termination 43, Liability 41, and a tail. Per
site, the median is 18 exposures, 14 actions and 6 absent disclosures; **19 of 37 sites name at
least one window** (median 1, max 6).

| Lens | Holds | Count badge | Present when |
|---|---|---|---|
| **Windows** | actions whose `deadline.kind !== 'none'` | yes | ≥ 1 (19 of 37 sites) |
| **Data** | exposures, `category === 'Data/Privacy'` | yes | ≥ 1 |
| **Rights** | every other exposure category — disputes, payment, IP, termination, liability, … | yes | ≥ 1 |
| **Can do** | actions with no window | yes | ≥ 1 |
| **Missing** | disclosures with `status === 'absent'` | **no — see below** | ≥ 1 |
| **Documents** | one item per document: grade, summary, freshness, provenance | yes | always |

Order is the strip order. Each lens opens with one sentence saying what it holds; that sentence is
the section heading the old document eyebrows used to be.

**Default lens** — the popup's `pickInitialLens`, stated for this data: Windows if present; else
whichever of Data / Rights holds the higher severity (ties → the larger); else Can do; else
Documents. **The first item of the default lens is open on arrival.** That is the old "one thing"
exactly — a deadline if the site has one, otherwise the highest-severity exposure — delivered as the
first open block instead of a separate card. `OneThing` retires; D10's order becomes verdict →
lenses, with the one thing still second.

**Items are crisp blocks** — native `<details name="lens-…">`, exclusive within a lens exactly as the
popup's `CollapsibleItem` is, so one item is open at a time and a lens cannot grow unbounded. Rows
stay flat inside one bordered surface (P5) — the popup's per-item borders are the nested-card
pattern the ladder removed, so the *interaction* is mirrored and the *surface* is not.

| Item | Collapsed | Expanded |
|---|---|---|
| Exposure (Data, Rights) | title, severity, source document | what it means, why it matters, reference + quote |
| Window | action, **the window itself**, source document | how to, reference + quote |
| Action (Can do) | action, source document | how to, reference + quote |
| Missing | name, regime, note, source document — **flat, no control** | — |
| Document | document type, risk pill, freshness line | graded summary (or the changed caveat), provenance line |

**The window never hides behind a control.** C1's rule — "a deadline the reader has to press a
control to see is a deadline the product has decided not to tell them about" — holds: the window
text is in the collapsed summary, and the Windows lens is first and default whenever one exists.

**Missing carries no count.** BrowseView's constraint 1 — an absent-disclosure tally is a lower
bound, never a measurement, and invites a comparison the data cannot support — applies the moment
the reader moves between two sites' panels. Named findings, no number.

**Findings from a changed document** (D7) keep their provenance: the source tag reads as an earlier
version, and the quote — the checkable part — is in the expanded body.

### 3.2 Tools by placement — the popup's separation of concerns

| Concern | Popup | Panel |
|---|---|---|
| Identity + tools | sticky header: status, History, Upload, account | sticky header: title, meta line, **quiet icon tools** — On this page (count badge, covered only), Library, back-to-top |
| The analysis | verdict → lens strip → lens panel | verdict → lens card (strip sticky inside it) |
| The one next action | sticky CTA bar: scope + Run | sticky CTA bar on uncovered/local: scope + **Analyse…**, which becomes run progress while running |
| Choosing scope | scope sheet above the CTA bar | the **confirm** opens inside the CTA bar — the checklist, the pre-spend facts (P16), a filled commit, a text Cancel |
| Secondary surfaces | History as a full overlay with its own header, Refresh, Close | **On this page** as a full overlay (covered) with its own header, **Look again** as a refresh icon, Close; **Library** as the browse mode |
| Guide / disclaimers | sticky footer | footer line, per view (P17 unchanged) |

On the **uncovered** view the page reader *is* the content — it is the only thing on offer — so it
renders in place as the Primary list, with Look again in its own zone head. Same row design, same
refresh control, different placement because it is a different job there.

### 3.3 The ladders, applied rather than defined

- **Surfaces:** one Primary per screen — the lens card (covered, local, browse detail), the reader
  list (uncovered), the site list (browse). The verdict is a tinted *tag* in the header's meta line (L7), not a
  block — the only graded element above the findings, and sticky with the header. Explanations sit
  on the ground; the reader overlay and CTA bar are Floating.
- **Buttons, four ranks:** *filled* — only a commit (`Analyse N documents`, `Add a key`, the CTA
  bar's `Analyse…`), at most one visible; *outlined* — a real next step (`Look again` in an empty
  state, `See what we've read` on no-site, `Free space`); *text* — row actions and escapes (Read
  here, Open page, Download, per-row Analyse, Cancel, Delete in the danger tone); *icon* — borderless
  tools, `←` leading, `↑`/`✕` and tools trailing.
- **Space, three steps:** 6px inside a unit, 12px between related blocks, 24px between zones.
- **Type:** the amber eyebrow is reserved for zone labels. Lens intros, captions and reference
  labels are sentence case. The freshness strip folds into the header's meta line.
- **Sticky:** two levels, not three — the view header and the lens strip. The header is full-bleed,
  invisible at rest, and becomes a solid bar with hairline and shadow once the shell scrolls, via
  `scroll-state(scrollable: top)`. For the first element in the shell "stuck" is exactly "the shell
  is scrolled", and `scrollable` is the query F confirmed working in Chrome 152 — so the Floating
  shadow F found inert is recovered without `stuck`. The lens strip sticks *inside* the lens card,
  on the floating ground — one step darker than the card (L7), so it reads as chrome over the
  findings scrolling under it — and never has to match the page gradient. Every sticky ground is
  opaque.

## 4. Approved decisions this revises — recorded so they are not "fixed" back

| Was | Now | Why |
|---|---|---|
| **P3** — each row type splits collapsed/revealed its own way (exposure keeps `whatItMeans` visible) | crisp blocks: title + severity collapsed, meaning and evidence expanded | director, 2026-09-23 — "crisp concise expandable blocks" |
| **P2** — document `<details>` is layer one, the finding reveal layer two | lens selection is lateral (siblings at one depth); the item is the only expandable layer; documents no longer wrap findings | lenses replace per-document reading |
| **D10 order** — verdict → one thing → per-document cards | verdict → lenses; the one thing is the default lens's first item, open | same content, one block fewer |
| **P9** — no browse entry on the covered view | Library is a quiet header tool on every view; the in-content offer stays only where nothing else is on offer | director — tools get the popup-History treatment |
| **P13** — three sticky levels | two: header, lens strip | section labels are now lenses |
| **P1's "Analyse becomes Secondary"** | Analyse moves out of the reading flow into the CTA bar | placement, not rank, separates it now |
| **C1, the `howTo` half** — an action's `howTo` never hides | the action's name is the closed block; `howTo` opens with it | crisp blocks, as the popup's Asks lens does. C1's *window* half is kept — see §3.1 |
| **P10's per-card attribution line** | the attribution is the header's meta line for the whole screen, and each document's own line is in its Documents-lens block | a screen only ever shows one author's analyses, so the header line is true of everything on it. The line now names the *latest* run date and *every* model (L7), so it is true of date and model as well |
| **S3's placement** — local attribution renders above the verdict | the grade leads the meta line on every view; on a local result the same line continues "N documents analysed by you · Last analysed on … · model · not reviewed by Unshafted" | director, 2026-09-23 — one shape for the line on every view. What S3 protects is kept: the attribution is on the grade's own line, a phrase after it, never a block away |

**Unchanged and load-bearing:** P4 (missing rows get no control), P5 (flat rows, risk borders at full
strength, `risk-tone.ts` untouched), P16 (pre-spend facts never behind a control), P17 (footer truth
per view), P18 (never say a window is open), D5, D7, D14, S3's substance (a local grade is never
shown apart from who ran it — its placement is revised above), and BrowseView's three constraints.

## 5. Units

| Unit | Scope | Status |
|---|---|---|
| **L1** — ladders in CSS | button ranks, space tokens, header chrome (full-bleed, `scrollable`-driven floating, opaque grounds), icon buttons + badge, eyebrow discipline | ☑ `SidePanel.css` rewritten |
| **L2** — lens model | `lib/lenses.ts`: build lenses from analyses, default lens, ordering, source tags; unit tests | ☑ 9 tests |
| **L3** — lens UI | `LensStrip` (popup keyboard contract), lens card, five item renderers; replaces FreshnessStrip / OneThing / DocumentCard stack on covered, local and browse detail | ☑ `LensCard`, `LensItems`; `DocumentCard` and `OneThing` removed; 8 tests |
| **L4** — tools by placement | shared header with tool slots; On this page overlay (covered, and local results) and in-place reader (uncovered) with Look again as a refresh control; CTA bar with the confirm inside it and run progress; Library in the header | ☑ `PanelHeader`, `Overlay`, `AnalyseBar`, `Icons`, `SiteMeta` |
| **L5** — browse | back leading; search inside the list card; the `window` marker only in flat search results, where the group heading that explains it is gone | ☑ two browse tests updated to the new contract |
| **L6** — verification + records | `eslint`, `test`, `Prettier Check`; harness walk of every state at 320 and 400; tests rewritten for items; handover corrections | ☑ except the loaded-extension walk — see §6 |
| **L7** — verdict and strip, after the director's look at a real local result | the verdict card becomes a risk tag in the header's meta line — "High risk earned by the privacy policy · 2 documents read · Last read on …" — leading it on every view, with a local result's attribution in the same line (S3 revised, §4); the changed-document caveat (Open Q4) is its own line under the header, only when it applies; `unconfirmed` reads "Last read on <date>", which names exactly the latest read it shows; meta dots trail their item so a wrapped line never starts with one. The lens strip moves to the floating ground, and browse's search bar with it | ☑ tag keeps `RISK_TONE` fill and 1px border (checked at High: rose-400 / rose-200); findings start at 104px on a covered site, from ~200 before L7; grade stays in view in the sticky header; no overflow at 320 |

The director runs `pnpm build` and `pnpm type-check`. The harness build here is a watch build into
the scratchpad — it never writes `dist/`.

## 6. Verification

- The five repository gates (director runs `build` and `type-check`).
- **No text loss**: every finding's text present in the DOM for every lens, in the harness, for the
  worst document (40 rows) and a 5-document site.
- **Risk tones identical**: verdict and pills keep `RISK_TONE` classes; computed border/fill checked
  in the harness against `f41b5a2`.
- **No horizontal overflow** at 320 and 400 in every state.
- **Sticky**: nothing visible above or beside the header once scrolled; lens strip sits flush under
  it; no translucent ground anywhere.
- **Keyboard**: arrow keys / Home / End move the lens strip; one tab stop in, one out.
- Every row of §4's "unchanged and load-bearing" list re-read against the new markup.

### What the harness walk established (2026-09-23)

Against `dist/side-panel` as the director's own `pnpm dev` rebuilt it, via a stubbed `chrome.*`:

| Check | Result |
|---|---|
| No text loss | linkedin.com (5 documents) at 320px: 250 finding strings, **0 missing**. microsoft.com (the 40-row document) at 400px: 164 strings, **0 missing**. |
| Horizontal overflow | none at 320 or 400. |
| Risk tones | verdict at High: border `rose-400`, fill `rose-200`, 1px — unchanged; `RISK_TONE` untouched. |
| Sticky | after a real wheel scroll: header top 0, spans the full shell width, ground opaque `#f7f2ea`; lens strip top = header bottom exactly (76.4 = 76.4 at 320). |
| Changed documents | driven by making the stub serve pages that hash differently: header meta turns violet "Changed since we read it", the verdict carries its caveat, every affected finding is tagged "earlier version", and the Documents lens drops that document's pill and summary (D7). |
| Local results | attribution in the header meta above the verdict; excerpt note; per-document provenance in each Documents-lens block; bar offers an outlined "Run again…". |
| Overlay | a real modal (`:modal`), focus moves in, Escape closes it, and focus returns to the tool that opened it (fixed during the walk — unmounting a dialog does not restore focus on its own). |
| Confirm | opens inside the bar with focus on its heading; P16's facts all present; one filled button. |

**A measurement trap worth knowing:** reading computed styles right after setting `scrollTop` from
script, in a browser pane that is not painting frames, reports the header transparent and the strip
19px low. `scroll-state()` is evaluated at frame time. Only measure after a real wheel scroll.

**Not verified, and needs the loaded extension:**
- **Find-in-page switching lens.** Unselected lenses are `hidden="until-found"` with a `beforematch`
  listener, so Cmd+F on a finding in another lens should select that lens. `window.find` does not
  fire `beforematch` — only the browser's own find bar does — so this could not be driven from a
  script. One Cmd+F in the real panel settles it.
- `type-check` and `build`.
- Keyboard walk end to end in the real side panel (tested in jsdom only).

## 7. Log

- 2026-09-23 — walk, first proposal (tabs inside documents) and prototype; director redirected to
  concern-level lenses and tool placement. This doc written.
- 2026-09-23 — L1–L6 implemented; harness walk above. The director started `pnpm dev` mid-session,
  so the harness was pointed at their `dist/side-panel` and the scratch watch build stopped — it had
  been connecting to their dev server's reload socket and sending duplicate reloads.
- 2026-09-23 — reviewed before commit; findings in [`panel-lens-review-fixes.md`](panel-lens-review-fixes.md).
  The director asked for the verdict to give the findings back their space and for the strip to
  separate from what scrolls under it — L7 — then to commit, with the review's fixes to follow.
- 2026-09-23 — L7 second round, on seeing the tag line on google.com: the grade moves into the meta
  line with the document count, and "As we read them on" becomes "Last read on".
- 2026-09-23 — L7 third round: the local line was placed and worded differently from the corpus
  one. It now takes the same shape — grade, "N documents analysed by you", "Last analysed on" — which
  revises S3's placement (§4) and resolves review item 6.

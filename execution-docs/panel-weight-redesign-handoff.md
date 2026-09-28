# Side panel weight + layout redesign — handoff

**Written:** 2026-09-22 · **Branch at time of writing:** `dev/v0.8.3` at `0be40b4`
**Status:** Researched, argued, and **every open question answered** (§6). Nothing built.
The next session implements; it does not re-open the decisions.
**For:** starting the redesign in a fresh session, probably as `dev/v0.9.0` off `release`.

This is not a design doc. It is the evidence, the constraints and the open decisions, gathered so
the next session does not re-derive any of it. The design doc gets written *from* this, after the
open questions at the end are answered.

---

## 1. Where the branch stands

`dev/v0.8.3` carries three commits off `release`:

| | |
|---|---|
| `6dd8bd2` | popup polish — lens tablist, `<details name>`, reduced motion, 25 orphan rules removed |
| `3a4130f` | the browse view design pass |
| `0be40b4` | the browse view, built — manifest, loader, view, two entry points, 8 tests |

Five gates green on `0be40b4`. `dist/` is built and loadable. Two manual QA sets are outstanding and
are listed in [`v0.8.3-handoff.md`](v0.8.3-handoff.md) and
[`v0.8.3-browse-view-execution.md`](v0.8.3-browse-view-execution.md) — **they belong to the branch as
it is and should be walked before this redesign lands on top of it.**

One caveat on the built `dist/`: it was produced before `.prettierignore` gained
`policy-browse.json`, so the manifest inside that ZIP is pretty-printed. Functionally identical, and
a rebuild fixes it. Rebuild before any submission.

---

## 2. How this started

A screenshot of `UncoveredView` on `bugasura.io` and the note: *"isn't it a little too bulky… so many
words every time for a library navigation?"* — with the direction that the API-key verbosity should
go behind an info button, that the documents need their own treatment, and that resizing the panel
should change the layout rather than break it.

The first read was that this is a word-count problem. It is not, and the measurements below are why.

---

## 3. What the evidence actually says

Three parallel research passes: an inventory of every panel surface, an extraction of every
documented rule the redesign could break, and a pattern/CSS survey. The findings that changed the
shape of the work:

### 3.1 The screenshot is one of the shortest states in the panel

| State | Height at 360px |
|---|---:|
| `NoSiteView` | ~205px |
| Covered site, everything collapsed | ~720px |
| **The screenshot** (uncovered, reader open, 6 docs) | **~970px** |
| Browse list, 37 rows | ~2,006px |
| **One document card, opened — median** | **4,630px** |
| One document card, opened — worst | 14,939px |
| `ebay.com`, all four cards open | ~27,000px |

A document opens into up to 23 exposures, 12 actions and 9 absent disclosures, each an unbounded
flat row averaging ~340px. **Opening one card grows the panel by a median 4,588px** — and there is no
scroll handling anywhere in the panel, so the reader is left at the top of something five screens
tall with no indication of where it ends.

`.panel-reader-text` (`max-height: 44vh`) is the **only** element in the panel with a height cap.

**So the bulk in the screenshot is real but small.** The redesign's centre of gravity is inside the
document card, not in the stack of three boxes.

### 3.2 The panel has been below the readable line length at every width

Padding nests three deep: `.panel-shell` 14px → `.panel-doc-body` 13px → `.panel-row` 11px =
**76px of horizontal padding** before a letter is drawn.

| Panel | − scrollbar | − nesting | Characters | |
|---:|---:|---:|---:|---|
| 320 | 305 | 229 | **~33** | below the floor |
| 360 | 345 | 269 | ~38 | below the floor |
| 400 | 385 | 309 | ~44 | marginal |
| 500 | 485 | 409 | ~58 | comfortable |

Consensus floor is ~45 characters, optimal ~66. **This was never measured before and no breakpoint
fixes it** — only removing a nesting level does.

### 3.3 One weight for everything

Four container classes, three of them near-identical:

| Class | Fill | Border | Radius | Shadow |
|---|---|---|---|---|
| `.panel-one-thing` | ✓ | ✓ | 20px | ✓ |
| `.panel-verdict` | tinted at runtime | ✓ | 20px | ✓ |
| `.panel-doc` | ✓ | ✓ | 16px | — |
| `.panel-row` | faint | ✓ | 12px | — |

`UncoveredView` spends `.panel-one-thing` — the heaviest — **three times**: on a state description,
on a paid offer, and on the documents. Three ranks, one look.

There are also **five Tailwind-inline boxes** written in JSX that no class-based audit would find
(`DocumentCard.tsx:50, 65, 123, 174, 190`), and `DocumentCard.tsx:190` is the only place the rose
ramp appears as a large fill.

Nesting runs **three fills deep** — shell gradient → `.panel-doc` → the tinted summary box — with
three competing radii (16 → 12 → 999) inside one card. The nested-radius maths does not hold either:
`.panel-doc`'s 16px with 13px of body padding implies an inner radius of **3px**, not the 12px
`.panel-row` uses, so the corners visibly disagree today.

### 3.4 The fix for 3.2 and 3.3 is the same edit

**Rows stop being cards.** Hairline separators inside one card — Apple's grouped-inset list — instead
of a bordered box per row. That recovers the 22px, which is ~3 characters at every width, *and*
restores a real difference between a card and a row.

Every major system converges here independently, and the sharpest statement of it is Atlassian's:
**a flat card is a border, not a shadow.** Shadow is for things that float — movable or temporary.
Carbon does not use shadow for layering at all; Apple replaced it with materials. Material 3 caps
resting elevation at +3 of 5. Three resting levels is what people can actually distinguish, four if
one of them goes *downward* (a sunken well, which reads as a different kind of thing rather than a
competing card).

### 3.5 Sticky headers work, with one landmine

Give each section its own wrapper and each header its own sticky range — the next section pushes the
last header out rather than accumulating. No JS.

**`.panel-doc { overflow: hidden }` silently kills any `position: sticky` inside it.** No error, no
warning, it just never sticks. `overflow: clip` clips identically without creating a scroll
container. Same trap fires on `transform`, `filter`, `backdrop-filter` and `contain: paint|layout`
on any ancestor.

Chrome 133+ can style the stuck state natively — `@container scroll-state(stuck: top)` — so the
`IntersectionObserver` sentinel trick is obsolete for a Chrome-only target. Do not ship it. Note
container queries style *descendants, not the container*, so the sticky element carries
`container-type` and its child gets styled. Only ever change compositor-safe properties when stuck
(shadow, background, border-*colour*); changing height or padding shifts layout.

`@container scroll-state(scrollable: bottom)` gives the "there is more below" fade for free, as a
sticky zero-height element with a negative margin. `scrollable: top` gives the back-to-top chip its
appear condition. Both need an actual scroll container — **the panel currently has none**, it scrolls
the document, so this requires making the shell a scroll container.

`background-attachment: local` scroll shadows are ruled out here: they need a flat background colour
and `.panel-shell` paints a radial over a linear gradient.

### 3.6 Loose ends worth fixing while in there

- **The gradient breaks at length.** `.panel-shell`'s `linear-gradient` is stretched over the whole
  scroll height, so at 27,000px it is invisible flat colour and at 205px it is compressed into one
  viewport. Its appearance is a function of content length, which is not a design.
- **`Open page` renders 3–8 times per screen** with identical text and no distinguishing accessible
  name. Same for `Read here`, `Analyse`, `Download text`, `Delete`. On domains with two terms
  documents (`x.com`, `snapchat.com`, `ebay.com`) two `<summary>` elements read *identically*.
- **`#ede7dc` is a bare hex** appearing twice as a hover fill (`SidePanel.css:278, 306`) — the only
  colour in that file not drawn from `global.css`.
- **Only one radius is tokenised** (`--unshafted-radius-card: 20px`). 16px, 12px, 9px and 999px are
  all literals. One shadow token, no second tier.
- **The footer is `mt-auto`, not sticky**, and that is deliberate and documented — contrasted
  explicitly with the popup's sticky footer.

---

## 4. Rules the redesign must not break

Full ranked list of 39 is in the research pass; these are the ones a layout-and-weight change breaks
by accident, where the natural instinct is wrong.

### Hard stops

1. **The border carries the risk ramp, not the fill.** Measured against `#efe5d6` the four risk fills
   run **1.13, 1.04, 1.14, 1.54** contrast — at Medium the fill is invisible and the 1px border is
   doing all the work. Flattening borders for a softer look removes the only working channel. (#82,
   `risk-tone.ts:33-37`)
2. **Risk is always a tinted fill; the app speaking about itself never tints.** `--unshafted-danger-*`
   deliberately keeps the page surface and states itself with an inset edge rule, because a tinted
   error banner would be pixel-identical to risk Low. (#84)
3. **No persistent chrome across screens.** Browse is a *mode* that owns the whole surface, header
   included — it cannot render under a header naming a site it is not about. **This kills a single
   shared top bar.** Each view gets its own sticky header instead.
4. **The header has no fallback title.** "No site here" is a finding and waits for the tab to
   resolve; a sticky header built with a constant title re-ships a bug that already shipped once.
   (D16)
5. **The freshness strip may only render where something is being checked.** An empty freshness map
   resolves to `pending` and renders "Checking against the live page…" — false, and a test guards it.
   Do not factor a shared "site header + status strip". (D6/S3)
6. **Colour is never the only channel.** Four steps of one hue are legible *only* because every
   consumer also renders the level in words. A density pass replacing "High risk" with a coloured
   dot or bar breaks it. (#82)
7. **A severity badge must never be lighter than a badge carrying no severity.** Severity sits at
   `-200` because the neutral count badge is `stone-200`; `-100` would invert weight against meaning.
   (#78)
8. **No absent-disclosure tally, anywhere.** `requiredDisclosures` records what each analysis found
   worth recording, not a checklist — a count is a lower bound on findings, never a measurement.
   Nothing leaderboard-shaped. (browse §3)
9. **Nothing may say a window is live, open or expiring** — only that a document *names* one. (D14)
10. **Ordering is data, not presentation.** `worstDocument()` is literally `analyses[0]`. Re-sorting
    the card list in a component makes the headline name the wrong document, silently. (D10/D1)
11. **A changed document loses its risk pill and summary permanently.** Do not make the pill a fixed
    element of every card header for rhythm. (D7)
12. **`freshness: null` means omit the line, never default it.** Do not give the meta row a fallback
    to stop cards jumping. (S3)

### Traps specific to this work

13. **Adding collapse inside `DocumentCard` risks a third nesting layer.** In-place expansion
    currently never exceeds two. The popup spent a release escaping exactly this.
14. **Only the reader's *found-some* state gets a chevron and a count.** A `0` badge once claimed we
    had looked at a page Chrome never let us open. Do not normalise every section into one
    collapsible component with a count. (D17)
15. **Any new animation needs a reduced-motion *resting state*, not a freeze.** A sticky-header shadow
    fade, a height transition, a sheet slide — each needs one chosen for it. `.panel-busy-dot` sets
    the precedent: stops pulsing, rests at `opacity: 0.7`.
16. **A sticky header with its own background changes the composited ground**, so contrast must be
    re-measured, not assumed. `--unshafted-text-faint` is a bespoke `oklch()` value that exists
    precisely because someone trusted a token name instead of measuring. (#61/#80/#81)
17. **If sections gain a tab strip or segmented control, it needs the full keyboard contract.** The
    popup shipped `role="tablist"` with no key handler. An ARIA role that lies is worse than none.
18. **Unlayered component classes beat layered utilities.** A `.panel-*` class setting `background`
    silently defeats any `bg-*` utility on the same element. `.panel-verdict` works *only* because it
    sets `border-width`/`border-style` but deliberately not `border-color` or `background`.
19. **Tone maps must stay where Tailwind's `@source` can see them.** An unscanned class is not an
    error — the classes are simply never emitted and the surface renders with no risk colour.
    **Verify colour changes in the built stylesheet, not the source.**
20. **Uncovered grades nothing, so it colours nothing** (D15); **`NoSiteView` grades nothing,
    discovers nothing and offers no reader** (D16). Do not unify empty states into one component.
21. **Each surface's footer claim must stay true for that surface.** The tab-driven views and browse
    say different things on purpose.
22. **Free things come before things that spend money** — browse sits above the analyse path. *(This
    one is a comment written on 2026-09-22 during the browse work, not settled project law. It is
    revisable; the numbered D- and S-rules are not.)*

---

## 5. What is already decided

Taken during the interview, with the reasoning, so they are not re-opened for free:

- **Documents are primary, analyse secondary, browse tertiary.** The view's own docstring says an
  uncovered site is where finding the documents is the only thing we can offer — and they render
  last today, under two cards that are not it.
- **Rank picks the weight.** Primary gets a container; secondary gets a line; tertiary gets plain
  text. The heaviest style stops being the default.
- **Documents collapse, sections do not.** With five documents closed that section is five rows tall;
  the length problem lives entirely *inside* an opened card. Section collapse would solve nothing
  document collapse does not, and would cost the nesting bug (§4.13).
- **Sticky headers per view, never one shared bar.** Forced by §4.3–4.5; gives the same result on
  screen.
- **Verbosity goes behind an `(i)`,** applied consistently enough to be learnable.
- **Media queries at the shell level; container queries where a component's own width differs from
  the panel's.** The panel is its own document so its viewport is its width — but a row three levels
  deep is not the panel's width, and that is where a container query is the correct tool.

---

## 6. Answered — do not re-open

All five were settled on 2026-09-22. The reasoning is here so it is not re-derived, and so a
proposal that contradicts one is recognised as contradicting it.

### 6.1 — A finding shows its name and meaning; the elaboration is one tap away

**Answered by the director.** Every exposure, action and absent disclosure stays listed. Each renders
its **name** and **what it means**. **Why it matters** and the **quote** are hidden until the reader
taps that finding.

The framing that got there matters, because the first version of this question was wrong. It was
posed as "render the top 5 findings and hide the other 18", which is unacceptable in a product whose
promise is showing people what they agreed to — and would also have put a count of hidden findings on
screen, which §4.8 forbids. The right cut is not *which findings* but *how much of each*: the finding
is its name and meaning; "why it matters" is the essay and the quote is evidence you only want when
you doubt us.

So the list stays complete and countable. Median card drops from **4,630px to roughly 2,000px**.

**This does not breach §4.13.** In-place expansion on this path becomes shell → `.panel-doc`
`<details>` → finding expand = **two** layers, which is exactly today's maximum on the
`DocumentReader` → row path. It does not add a third. Keep it there: nothing collapsible may go
*inside* an expanded finding.

Two constraints the implementation inherits:

- The expand affordance must not become 23 chevroned `<details>`. That is the accordion stack the
  popup spent a release escaping. One quiet in-row affordance, no card chrome per finding.
- The severity badge stays on the collapsed row. It is part of the finding, and §4.6 requires the
  level to be readable in words and not only as colour.

### 6.2 — Per-row `Analyse` goes

Analyse is secondary, so it is one line at the section level, not a control repeated on every row.
The confirm sheet defaults to all candidates and carries checkboxes, so the narrowing the row button
bought costs one uncheck at 2–3 documents. Keeping it rebuilds the three-button strip this work
exists to remove. `AnalyseConfirm`'s `preselected` prop stays — nothing else changes — but the
uncovered view stops passing a URL to it.

### 6.3 — The shell becomes a scroll container

Required, not optional: it is the precondition for sticky headers inside each view, for
`scroll-state()` queries, for the bottom fade and for the back-to-top chip.

`min-height: 100vh` becomes a fixed-height scroll container. Carry `overscroll-behavior: contain` and
`scrollbar-gutter: stable` — the second one fixes an unreported bug, where typing in the browse search
filters 37 rows to 3, the scrollbar vanishes, and the whole column reflows by ~15px mid-keystroke.

**Re-check the `mt-auto` footer against this.** Its current behaviour (pinned to the viewport bottom
on short states, in flow on long ones) is deliberate and must survive.

### 6.4 — The gradient moves onto the scroll container

It currently stretches over the entire scroll height, so it is a different design at 205px than at
27,000px — its appearance is a function of content length, which is not a design. On a fixed-height
scroll container the background paints one viewport and stays put while content scrolls under it.
Falls out of 6.3 at no extra cost.

### 6.5 — No browse entry point in the header on covered sites

On a covered site the reader already has what they came for, and the header's budget is now spent on
the site name and the back-to-top affordance. A permanent control competing for width in a 320px
column fails the same attention test this redesign applies everywhere else. **Close #88 with this
reasoning when the redesign lands** — merged PRs do not auto-close against `release`, so it needs
doing by hand.

## 7. Process

- Branch from `release`, not `main`, not from `dev/v0.8.3` — this is v0.9 work and `v0.8.3` should
  ship on its own. Four-step flow is in `CLAUDE.md`; do not re-derive it.
- Walk the outstanding v0.8.3 manual QA **before** layering this on top.
- The design doc gets written from this handoff once §6.1 is answered, and an execution doc tracks the
  build with status kept current.
- Deferred findings become `gh issue create`, not files.
- Verify every colour change in the **built** stylesheet.

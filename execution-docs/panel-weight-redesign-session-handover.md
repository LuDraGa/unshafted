# Panel weight redesign — session handover

**Written:** 2026-09-22, end of session, **updated 2026-09-23 after D's visual walk passed,
updated again 2026-09-23 after E and F were written** ·
**Branch:** `dev/v0.8.3` · **Nothing committed — deliberately, see below.**

Not to be confused with [`panel-weight-redesign-handoff.md`](panel-weight-redesign-handoff.md),
which is the *research* handoff from before the design phase. This one hands over *work in flight*.

---

## Where it stands in one paragraph

The eighteen design decisions were approved and written up as P1–P18. **All seven units are now
written** — A (the weight ladder), B (honesty), C1 (the document disclosure rewrite), C2 (surface
and motion), D (view ownership), E (per-view placement) and F (orientation: sticky headers, a
document's own sticky summary and section labels, back-to-top, the bottom fade). `eslint`,
`type-check` (12/12 packages), `test` (30/30, 5 files) and `Prettier Check` all pass locally,
repo-wide, as of this update. The user has run `pnpm build` and walked all five of D's states in
the real loaded extension (2026-09-23) — covered, uncovered-no-saved, no-site, loading, and the
internal-scroll behaviour all came back as expected. **E and F have not been visually walked** in
the loaded extension. F in particular is the highest-risk unit to leave unwalked: it is the
largest by surface area (six view headers across two files, a new measurement hook, `DocumentCard`'s
internal structure) and the least verifiable from lint/types/tests alone — none of those gates
exercise a sticky offset, the back-to-top control, or the bottom fade. A genuine platform-capability
finding surfaced while writing it: `scroll-state(stuck: top)` does not fire in Chrome 152 despite
parsing as valid CSS, so the "shadow while stuck" polish on every sticky header is inert today (see
Unit F's F1 entry in the tasks doc for how this was tested and exactly what still works). **Nothing
is committed and nothing is merged**, by choice — the user decided not to commit per-unit given how
interleaved A–D are within the same files, and that reasoning now extends across all seven units,
which touch the same handful of files repeatedly. **Commit strategy is still open — ask before
committing anything.**

## The three documents, and which to read for what

| | |
|---|---|
| [`panel-weight-redesign-plan.md`](panel-weight-redesign-plan.md) | **The decisions.** P1–P18, each with its evidence, the files it touches, what it depends on. §5 is the dependency tree, §6 the surface map. Read this to know *what* is being built and why. |
| [`panel-weight-redesign-tasks-execution.md`](panel-weight-redesign-tasks-execution.md) | **The work.** Seven units, per-task status, the gates each must clear. Read this to know *where we are*. |
| [`panel-weight-redesign-execution.md`](panel-weight-redesign-execution.md) | **The evidence.** Corpus measurements, the browser review, the adversarial findings. Read this before questioning a number. |

Three ID namespaces are in play and they are not interchangeable: **D1–D17** are closed decisions
from the research handoff, **rules 1–22** are the constraints in its §4, and **P1–P18** are this
plan's decisions.

## What changed on disk

Nine files now — two of them new — since E and F both touch more surface than any prior unit:

```
pages/side-panel/src/SidePanel.css                 ladder, flattened rows, overflow: clip +
                                                     flex-shrink, reduced-motion chevron,
                                                     fixed-height scroll shell, sticky/back-to-top/
                                                     bottom-fade mechanics (F)
pages/side-panel/src/SidePanel.tsx                 per-view header/footer ownership, explicit
                                                     loading state, no shared chrome, every header
                                                     now sticky with its own BackToTop (F)
pages/side-panel/src/components/BrowseView.tsx     window caveat/heading, one-bordered-surface
                                                     rows (E), sticky title+search headers with
                                                     measured offsets, search/scroll preserved
                                                     across list↔detail (E), BackToTop in both
                                                     headers, headerOffset threaded to DocumentCard
                                                     (F)
pages/side-panel/src/components/DocumentCard.tsx   two-layer disclosure, three row renderers (C1),
                                                     headerOffset prop, sticky summary + sticky
                                                     section labels (F)
pages/side-panel/src/components/LocalAnalysisView.tsx  headerOffset prop, forwarded to DocumentCard
                                                     (F) — otherwise unchanged; E confirmed its
                                                     analysis-first ordering needed no code
pages/side-panel/src/components/BackToTop.tsx      new (F) — the shared back-to-top control
pages/side-panel/src/hooks/useElementHeight.ts     new (F) — ResizeObserver-based height hook,
                                                     jsdom-safe no-op fallback
pages/side-panel/test/browse-view.test.tsx         heading rename + a new regression guard (B/C1)
pages/side-panel/test/document-card.test.tsx       new, six tests (C1)
```

## Things a new session would otherwise get wrong

1. **P16 needed no code.** It reads like work — "pre-spend facts never hide behind an info control"
   — but `AnalyseConfirm` already shows own-key cost, provider, model, per-document character
   counts and the excerpt notice unconditionally, and there is no info control anywhere in the
   confirm, run or local views. It is a constraint on D and E, not a task. Do not go looking for
   something to change.

2. **Adversarial finding 2's premise was stale in one detail.** There is no "On a clock" eyebrow in
   the code. The heading said *"Something you can still do"* — a stronger claim than the finding
   described, since it asserts the window is open across 19 sites at once. The real bug was the
   signup anchor in `WINDOW_CAVEAT`. Both are fixed. If a future reader greps for "On a clock" and
   finds nothing, this is why.

3. **Floating is no longer inert, and F is the unit that consumed it.** `.panel-doc` uses
   `overflow: clip` (C2.2), and F put `.panel-floating` on every view's own header plus browse's
   search header. **But the shadow-while-stuck half of Floating's own definition does not work.**
   Tested directly (a standalone page, a real wheel scroll, Chrome 152):
   `scroll-state(scrollable: top/bottom)` fire correctly, `scroll-state(stuck: top)` never does, in
   either physical or logical form, despite parsing as a real `CSSContainerRule` with no console
   error — which is all A5a had actually checked. So every sticky header today shows its opaque
   ground correctly (that part does not depend on `stuck`) but never gains the shadow. The CSS rule
   is left in place — harmless, forward-compatible — but do not read its presence as evidence the
   shadow works; it does not, in this browser, as of this writing.

4. **jsdom does not implement the `<details>` toggle.** Clicking a summary changes nothing, so
   `document-card.test.tsx` sets `open` directly. Any new test that asserts on opened-card content
   must do the same or it will silently be measuring a closed card.

5. **`.panel-row` is shared CSS, not DocumentCard's alone.** C2.1 flattened it (no border, radius or
   fill; a hairline divides consecutive rows) for P5's reasons, but `RunStatus.tsx`,
   `AnalyseConfirm.tsx` and `DocumentReader.tsx` all also use `panel-row`, for storage entries,
   candidate checkboxes and reader rows respectively. Checked during D: every one of them sits
   inside a `.panel-one-thing` or `.panel-doc` — i.e. inside a Primary bordered surface — so the
   flattening is consistent everywhere it's used, not a DocumentCard-only assumption that happens
   to also apply elsewhere. Worth re-confirming if a future unit adds a new `.panel-row` consumer
   that is *not* inside a Primary surface — it would render with no border and no container at all.

6. **D changed which prop each view takes.** `NoSiteView` and `UncoveredView` both lost their
   `loading` prop — `SidePanel` now resolves loading before either can be reached. A stale call
   site passing `loading` to either is a leftover from before D, not a merge conflict.

7. **`headerOffset` is a chain, not a constant.** `DocumentCard` takes it as an optional prop
   (default `0`, so the existing `document-card.test.tsx` fixture needed no change) and adds its
   own measured summary height on top for `Group`'s `stickyTop`. Three call sites feed it:
   `CoveredView` and `BrowseDomain` measure their own header and pass it straight through;
   `UncoveredView` measures its own and forwards it one level further, through
   `LocalAnalysisView`, which has no header of its own to measure. Adding a fourth place that
   renders `DocumentCard` means picking the right header to measure, not inventing a new one.

8. **Browse's two sticky levels are not the same shape as a document's three.** E gave browse a
   title header (Level 1) and a search header (Level 2, hardcoded to `top: 0` at the time, with an
   explicit note that F would need to correct it). F did exactly that — the search header now reads
   `titleHeight` via the same `useElementHeight` hook `DocumentCard` uses. Browse's own group
   headings ("Window named in document" / "Everything else") were deliberately left non-sticky; P13
   reads as sections *within a document*, and extending it to browse's groups was judged scope
   beyond what was decided, not an oversight.

## What the local gates do not cover

`build` has not been run this session — the user runs that. `type-check` **has** now been run and
is clean (12/12 packages, confirmed 2026-09-23). Everything that reads the **built** stylesheet is
still unverified, and F adds a category no gate here can reach at all — see below.

- **A6** — rules 1/6/7/18/19 against computed styles.
- **C1.6** — the 21-state no-text-loss and no-horizontal-overflow audit.
- **C2.5/C2.6** — prose width and document height re-measured against the review harness; the
  risk-tone-identical check; end-of-document reachability.
- The risk-tone-identical check generally, which must run against the built sheet, not the source.
- **F3** — "no overlap, no accumulation" across all three sticky levels, re-measured against real
  content. The prototype's 69/69/113/113px figures are not the target — see F3's own entry in the
  tasks doc for why — but the property they were checking still needs a real re-check.
- **F1/F2 generally.** None of the five repository gates exercise a sticky offset, the back-to-top
  control, or the bottom fade — they check that the code is well-formed, not that the browser draws
  it the way this was written expecting. This is the one part of the whole redesign that most needs
  the loaded-extension walk, more than D did before its own.

The review harness that does all of the above lives at
`~/.codex/visualizations/2026/09/22/01a0c865-4bbb-7bb3-bf54-84c16c909507/` and reads
`dist/side-panel/assets/index-Czjub3En.css`. Note that its "before" is now the thing being
replaced — capture any baseline still wanted before the first merge. **The bundle is outside the
repo and its server does not survive a reboot.**

**D and E have no test coverage of their own new behaviour.** No file exercises `SidePanel.tsx`'s
branching, `BrowseView.tsx`'s search/scroll preservation, or (per F, above) any sticky offset —
`browse-view.test.tsx`'s 8 tests cover content and honesty claims, not layout or `scrollTop`. This
was true before D too for the router, so it is not a regression, but it means all of D, E and F's
layout-affecting behaviour is verified by inspection and lint only inside this session.

## What E actually found (not what was expected)

E was expected to be a third case of "record, don't invent," the way C2.3 and B4 both turned out to
need no code. Two of its three sub-decisions were exactly that (no browse entry in the covered
header; local results staying analysis-first). **The third was not.** Reading E3 against the actual
code surfaced three real gaps, one of them not even named in the plan text: search was not sticky
and was not "its own header"; going into a browse domain and back silently lost both the search
query and the scroll position, every time, not just on leaving; and all 37 rows each carried their
own individual border/radius/fill — the exact ladder violation (P1/P5) this whole redesign exists to
remove, just never applied to `BrowseView.tsx`. All three are fixed; full detail is in the tasks doc
under E3. The lesson for whoever reads this next: "the handover expects unit X to need nothing" is a
prior, not a conclusion — check the actual code, the way this session did, rather than the note.

## Everything is written. Nothing is walked in the real extension past D, and nothing is committed.

There is no next unit. What is left is verification and a decision:

1. **Walk E and F in the loaded extension**, the same way D was walked on 2026-09-23 — browse's
   sticky search header and list↔detail search/scroll preservation (E); every view's sticky header,
   a long document's sticky summary and section labels, back-to-top, and the bottom fade (F). F
   especially, given how little of it any local gate can actually exercise.
2. **A fresh `pnpm build`**, to unblock the built-stylesheet checks every unit has been carrying
   forward (A6, C1.6, C2.5/C2.6, F3) — plus the review harness re-measure if it is still reachable
   (see "What the local gates do not cover," above).
3. **Commit strategy**, still explicitly open per the user's own instruction — ask before committing
   anything. All seven units are interleaved across the same handful of files by now, more so than
   A–D alone were; that makes the case for one holistic commit stronger than it was at the C1
   handover, but it is the user's call, not a default to assume.

## Carried risks, unchanged

- The two manual QA sets are unwalked, so there is no verified bisect point between `0be40b4` and
  this work.
- The research handoff's 2,000px target is unachievable and must not be promised; its ~33
  chars/line figure is wrong — the real figure is 44.3 at 320px.

## Open process question, not yet resolved

`panel-weight-redesign-handoff.md` §7 says explicitly: "Branch from `release`, not `main`, not
from `dev/v0.8.3` — this is v0.9 work and `v0.8.3` should ship on its own." A, B and C1 were
already committed against that instruction before this handover's author picked up the work, and
the 2026-09-23 session was explicitly told to continue on `dev/v0.8.3`, so it did — this is a
**flagged discrepancy, not a decision**. Nobody has said out loud whether folding the redesign
into v0.8.3 (rather than cutting v0.9 from `release`) was deliberate. Worth a direct answer before
this reaches a `dev/v0.8.3` → `release` PR, since the branch's own version number is then making a
claim about what shipped in v0.8.3 that this whole redesign was not originally scoped to be.

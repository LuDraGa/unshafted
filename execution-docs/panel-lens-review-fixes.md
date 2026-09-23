# Side panel — fixes from the lens-pass review

**Raised:** 2026-09-23 · **Branch:** `dev/v0.8.3` · **Follows:** the lens / tools-by-placement pass
([execution doc](panel-lens-hierarchy-execution.md)), reviewed in the harness and against the corpus
before it was committed.

**Status:** open — 6 is resolved (by the local meta-line rework); nothing else is started. The pass
was committed as it stood, plus the compact verdict and the darker lens strip; everything below lands
after it. 1–5 are the director's priorities.

---

## Director's priorities

### 1. "Documents" means two different things on one screen

The header's page-documents tool carries a count (6 on `policy.medium.com`) and the lens strip has a
**Documents** tab with its own count (3). The first is the documents this page *links*, found by
looking at the live page; the second is the documents that were *analysed*. Both are drawn and named
as "documents", so a reader sees two numbers for the same word and has no way to tell which is which
without opening both.

### 2. The Library icon does not say what it is

Four vertical strokes do not read as "every site we have read". The name exists only as the button's
`title`, which Chrome shows after a delay of about a second and never on keyboard focus. The header
tools need an immediate tooltip on hover and on focus. The page-documents and refresh icons share
the problem, less badly.

### 3. The confirm sheet collapses to almost nothing

`.panel-cta-bar` is a flex item in the shell's column with the default `flex-shrink: 1`, and in its
sheet state it is `overflow-y: auto`, so its minimum height is 0 and it absorbs all of the column's
overflow. Measured at 400×760: 213px tall around 535px of content on an uncovered site, and **27px**
for "Run again…" on a site with local results, where only "BEFORE IT RUNS" is visible. The
checklist, the P16 facts, the commit button and Cancel all sit inside that sliver.

Direction: size the sheet by intent. Opening it is a decision to spend, so it takes focus and
expands — around 40% of the panel height, or whatever fits each case best (one preselected document
needs less than a full checklist with warnings). The content scrolls; the commit and Cancel stay
pinned at the bottom of the sheet.

### 4. Keyboard focus lands under the sticky chrome

The shell sets no `scroll-padding`, so focus scrolling treats the sticky header, lens strip and
analyse bar as if they were not there. Shift+Tab left a finding focused at y=44–101 entirely under
the header and strip (which end at 126), and the panel did not scroll; Tab forward left one at
685–760 under the bar (top 681). This fails WCAG 2.4.11. The three heights are already measured, so
they can drive `scroll-padding-top` and `scroll-padding-bottom` on the shell.

### 5. Timing on actions with no window is no longer shown

`f41b5a2` rendered `describeDeadline` for every action with a `deadline`. The lens pass renders it
only in the Windows lens, so a `kind: 'none'` deadline's description now appears nowhere. That is 10
actions on 5 sites — among them microsoft.com's "permanently deleted 60 days later; that is the window
to recover it". P18 says the `describeDeadline` output is unchanged; this breaks it. The harness
audit missed it because it skips exactly these strings (see 17), and `lenses.test.ts` checks where the
action is filed, not that its timing renders. It belongs in the Can do block. Whether that text keeps
the "Window:" prefix is a copy decision, since the Windows lens now owns that word.

## Other findings

### 6. The local header states one date and model for every document — **resolved**

Resolved 2026-09-23 when the local meta line took the corpus line's shape: it now reads "Last
analysed on <latest run>" and names every model that produced a document on the site.

`LocalMeta` puts the newest run's date and model on the header line for the whole screen, and the grade now follows it there.
Local analyses can come from separate runs on different models, and the previous version handled
that on purpose — it named the latest and said "each card says when it ran". The P10 revision's
reasoning ("one author, so the header line is true of everything") holds for the author only.

### 7. Excerpted documents are not marked on their findings

Findings from a changed document carry "earlier version"; findings from an excerpted local run carry
nothing. The screen says "each document says which", but only the opened Documents block does (S6).
`Source` could carry an excerpt tag the same way.

### 8. Two documents of one type cannot be told apart

The source tag is the document type alone. robinhood.com has two privacy policies and
americanexpress.com two regulatory disclosures, so their findings — and their two Documents blocks —
are labelled identically. Nesting used to make the source obvious; aggregation lost it. A URL path
where a type repeats would fix it.

### 9. The page-documents overlay opens focused on "Look at this page again"

`showModal()` focuses the first focusable control, which is the refresh tool, so Enter straight after
opening re-runs discovery. Close, or the overlay's heading, is the safer landing.

### 10. Cancel in the confirm drops focus to the page

Verified: focus goes to `body`. The bar's own offer button is right there to return to.

### 11. The Missing lens has nothing focusable

Its rows are flat by design (P4), so Tab from its strip tab skips the whole lens. The tabs pattern
gives such a panel `tabIndex={0}`.

### 12. The analyse bar's count and name collide with the list's

"N documents on this page" counts only the analysable ones (same-origin, typed), while the list and
the tool badge count everything found, so the bar can say 3 beside a list of 5. Its "Analyse…" also
has the same accessible name as each row's "Analyse…", though one runs the site and the others one
document.

## There before the lens pass

### 13. On local results, "earned by" can name the wrong document

`worstDocument` takes the first analysis, but local analyses arrive newest first, not worst first.
The lens model's "worst document first" tie-break assumes the same ordering.

### 14. The confirm never says we do not review the result

P16 lists unreviewed attribution among the facts that stay visible. The offer that says it is
replaced by the confirm when the confirm opens.

### 15. A confirm opened on one site survives a switch to another

`UncoveredView` is not keyed by hostname, so its confirm and overlay state carry across a tab
change onto a different site's candidates.

## Open question

### 16. The Missing lens and BrowseView's first constraint

The constraint says absent disclosures are "not a section and not a number". The lens honours the
number half; it is a section, present on 35 of 37 sites. If that is the accepted cost of mirroring
the popup, BrowseView's comment still says they render "inside the opened document" and needs
updating.

## Housekeeping

### 17. The harness audit hides one bug and reads a moved border

`.claude/panel-harness/audit.js` (gitignored) excludes `kind: 'none'` deadline descriptions from
the no-text-loss check, which is why 5 passed as "0 missing". Its verdict check reads the border off
`.panel-verdict`, which no longer exists; the grade is now `.panel-verdict-tag` inside `.panel-meta`.

### 18. Comments still name retired components

`packages/unshafted-core/lib/site-policy/local-analysis.ts:18` and
`packages/unshafted-core/test/site-policy-prompt.test.ts:84` refer to `DocumentCard` and `OneThing`.

## Still unverified

Find-in-page switching lens (`beforematch` fires only from the browser's own find bar), `type-check`,
`build`, and a keyboard walk in the loaded extension.

# `--unshafted-text-faint` contrast, and splitting the risk-token issue

Version: **0.8.1** (`dev/v0.8.1`). Covers [#61](https://github.com/LuDraGa/unshafted/issues/61),
done here, and [#62](https://github.com/LuDraGa/unshafted/issues/62), split rather than done.

Both were raised by #59, the OKLCH palette adoption, which measured every foreground/background
pair in the app and grepped every consumer of the `--unshafted-*` risk family. Neither is caused by
that change; #59 is just what made them visible.

## Status

| | |
|---|---|
| #61 — faint text below AA | **Done** |
| #62 — dead risk tokens | **Split** into [#78](https://github.com/LuDraGa/unshafted/issues/78) (naming decision) and [#79](https://github.com/LuDraGa/unshafted/issues/79) (deletion); #62 closed |
| `execution-docs/tailwind-4-palette.md` corrected | **Done** |
| [#80](https://github.com/LuDraGa/unshafted/issues/80) — `text-stone-500` hard-coded in 22 places | **Raised, not done** — the token fix does not reach the utility half |
| `pnpm build` / `type-check` / `test` / `lint` / `prettier` | **Run by hand before the version PR** |

---

## #61 — the reported pair was not the failing pair

#61 says `--unshafted-text-faint` (stone-500) is 4.37:1 on `#f8f4ee`, against AA's 4.5:1 for normal
text. That is true, and it is not the worst case.

`#f8f4ee` is `--unshafted-bg`. It is the token, and for most of the palette doc's table it is also
the pixel. It is not the pixel here. Both shells are a gradient:

```css
/* Popup.css:5, SidePanel.css:22 */
linear-gradient(180deg, #f7f2ea 0%, var(--unshafted-bg-warm) 100%)
```

`--unshafted-bg-warm` is `#efe5d6`, and the two most visible faint-text sites are pinned to the
bottom of that gradient, which is exactly where it is darkest:

- `.popup-sticky-footer` — `position: sticky; bottom: 0` over `background: inherit` (`Popup.css:37`)
- the side panel's `mt-auto` privacy line, *"Nothing about the site you are on leaves this
  browser"*, at `text-[10px]` (`SidePanel.tsx:282`)

Neither is large text, so the 4.5:1 threshold applies without relief.

| ground | what it is | stone-500 |
|---|---|---:|
| `#efe5d6` | `--unshafted-bg-warm`, gradient end — **the real ground** | **3.84** |
| `#f8f4ee` | `--unshafted-bg`, the figure #61 quotes | 4.37 |
| `#fefbf5` | `--unshafted-surface` composited on paper | 4.63 |

So the token fails by more than reported, and it fails on the copy that makes the product's central
privacy promise.

### Why not stone-600

The obvious fix is one shade darker, which #61 anticipated and flagged as possibly too dark. It is
worse than too dark — it is a silent deletion. `--unshafted-text-muted` is *already*
`var(--color-stone-600)`. Setting faint to the same value collapses a three-level text ramp into
two, and the places that exist in order to differ stop differing:

```css
.popup-doc-strip-meta      { color: var(--unshafted-text-muted); }  /* Popup.css:655 */
.popup-doc-strip-skeleton  { color: var(--unshafted-text-faint); }  /* Popup.css:661 */
```

Those are adjacent rules on adjacent elements. Tailwind has no stone between 500 and 600, so
clearing AA while keeping three tiers means a value that is not a Tailwind shade.

### What it became

```css
--unshafted-text-faint: oklch(51% 0.013 58.071);  /* #6c645f */
```

stone-500's own chroma and hue, held fixed, at lower lightness — so it still reads as the same
neutral rather than a new colour, just deep enough to land.

| ground | before | after |
|---|---:|---:|
| `#efe5d6` — gradient end | 3.84 ❌ | **4.65** ✅ |
| `#f8f4ee` — `--unshafted-bg` | 4.37 ❌ | **5.29** ✅ |
| `#fefbf5` — card surface | 4.63 ✅ | **5.61** ✅ |
| `#fffcf7` — surface-strong | 4.68 ✅ | **5.66** ✅ |

It sits between muted (stone-600, `#57534d`) and the old faint, so the ramp keeps three visibly
distinct steps.

### The rule it bends, deliberately

`packages/ui/global.css` carries a rule from #59 with no exceptions stated: *a bare hex that names a
Tailwind shade is written as `var(--color-<shade>)`*. The point of that rule is that risk must not
be encoded twice and drift — it is about shades that exist in Tailwind being spelled two ways.

This value is not a Tailwind shade at all, so there is no second spelling to drift from. It takes
the same standing the warm paper already has: *"colours that are not Tailwind shades — `#f8f4ee` and
its neighbours — are the project's own."* The reasoning is written into the token's comment, next to
the value, rather than only here.

### Ruled out

- **stone-600** — collapses faint into muted, above.
- **Shift the whole ramp** (faint→600, muted→700) — stays Tailwind-pure and keeps three tiers, but
  darkens every muted-text site in the app to fix two faint ones. The blast radius is the wrong
  shape for the defect.
- **Lighten the gradient end** — moves the app's signature warm ground to accommodate its faintest
  text. Backwards.

---

## #62 — one issue number, two decisions

#62 reports six dead tokens (`--unshafted-risk-medium-*`, `--unshafted-risk-high-*`) and, as a
secondary note, that the two risk encodings are *offset* — token half one hue step hotter in the
middle, one shade lighter in the text. It suggests resolving the offset before deleting.

Grepping the live consumers says the offset is not a drift to reconcile. It is two different things
that were never the same thing:

| token | what it actually paints |
|---|---|
| `--unshafted-risk-low-*` | `.panel-freshness[data-state='current']` — a snapshot being **fresh** |
| `--unshafted-risk-low-*` | `.popup-status-pill-ready` — an analysis being **ready** |
| `--unshafted-guidance-*` | amber notices in `Popup.css`, `Options.css` |
| `--unshafted-danger-*` | destructive actions and error states in `Popup.css` |

None of that is risk. Meanwhile `RISK_TONE` in `pages/side-panel/src/lib/presentation.ts` is keyed
on `SitePolicyAnalysis['riskLevel']`, the real four-value domain type, and it grades every risk
surface in the product through utilities.

So the token family is a **status palette wearing risk's name** — ok / notice / destructive — and
the "middle of the ramp" was never going to find a consumer, because nothing in the token half
grades anything. That is the finding, and it changes what deleting means: the six tokens are not a
half-finished ramp to complete or abandon, they are levels of a ramp that does not exist here.

Which is why it splits. The naming decision is a judgement about what these tokens are for; the
deletion is mechanical once that is settled, and unsafe before it.

- **[#78](https://github.com/LuDraGa/unshafted/issues/78) — the decision:** name the token family
  for the status palette it is, and leave risk grading solely to `RISK_TONE`.
- **[#79](https://github.com/LuDraGa/unshafted/issues/79) — the cleanup:** delete the six dead
  tokens. Blocked by #78, mechanical after it.

#62 is closed as superseded by the two.

---

## Raised, not done here

**[#80](https://github.com/LuDraGa/unshafted/issues/80) — the utility half.** Fixing the token does
not fix `text-stone-500`, which is written directly in 22 places across the popup and options pages.
`Popup.tsx:1380` is the clearest failure: "Showing latest 5 reports.", last element in
`.popup-history-panel`, whose gradient also ends on `--unshafted-bg-warm` — 3.84:1, exactly the
defect #61 describes, untouched by #61's fix. `.options-shell` is a third unmeasured gradient
(`→ #f0e7da`, stone-500 at 3.91).

This is #59's own warning recurring one surface over: one value, two encodings, only one of which
moves when the value is fixed. Not folded into this change because routing 22 call sites through
tokens is a judgement per site, not a sweep — some may mean `--unshafted-text-muted`.

## Verification

Contrast computed by converting Tailwind v4's OKLCH source values (`node_modules/tailwindcss/theme.css`)
to sRGB and applying WCAG 2.x relative luminance, with `rgba()` surfaces composited over the paper
first. Grounds measured are the four the app paints: both gradient endpoints, `--unshafted-bg`, and
both card surfaces.

The failing sites were found by reading what each `--unshafted-text-faint` consumer actually sits
on, not by trusting the token name — which is the step #61 and the palette doc both skipped, and the
reason the reported figure was 4.37 rather than 3.84.

# One risk ramp

Closes [#82](https://github.com/LuDraGa/unshafted/issues/82). Branch `fix/one-rose-risk-ramp`, off
`release`.

## Status

| | |
|---|---|
| One encoding of risk tone, all call sites routed through it | **Done** |
| The Low and High questions answered explicitly | **Done** — see below |
| No `--unshafted-risk-*` tokens reintroduced (#78/#79) | **Done** — the map stays utilities |
| Badge aligned to the same hue | **Done** — it was the fifth encoding |
| Classes verified in the *built* stylesheets | **Done** — 11 of 11, both pages |
| [#84](https://github.com/LuDraGa/unshafted/issues/84) — danger/risk hue collision | **Raised, not done** |
| `type-check` / `test` / `build` / `eslint` / `format:check` | **All green** |

---

## #82 undercounted: there were five, and two were a pair

The issue lists four maps and calls `SiteStrip`'s the outlier. It is not an outlier — it is a
faithful copy of a fifth encoding the issue does not mention:

```ts
// chrome-extension/src/background/site-policy.ts
const BADGE_COLORS = { Low: '#6b7280', Medium: '#d97706', High: '#dc2626', 'Very High': '#991b1b' };
```

Grey, amber, red, dark red. `SiteStrip`'s comment — *"Matches the badge's four tints in spirit"* —
was accurate, not aspirational. So the split was never three-against-one. It was **two vocabularies**:

| | ambient (badge, strip) | graded (panel, popup history, result cards) |
|---|---|---|
| Low | grey | green |
| High | red / rose | orange |

Which changes what fixing it means. Picking the majority encoding would have silently resolved a
disagreement between two deliberate positions by counting copies.

## The Low question, answered by the thing that assigns the grade

`packages/unshafted-core/lib/site-policy/prompt.ts:272`, which is the rubric the model grades
against:

> `riskLevel "Low"`: the document mostly hands the reader routes, named contacts and commitments,
> and what it costs is small and specific. **This grade is available and should be used when earned.**

That is a positive finding, not an absence of one — so grey, which means "nothing to say", was
describing something the rubric does not produce. Worth noting the dates: the badge's grey landed
`afd0321` (2026-09-04), the rubric wording `6635896` (2026-09-07). The grey predates the definition
it contradicts.

Grey also has a job already. `SiteStrip`'s **uncovered** strip is deliberately uncoloured and its
comment says so — it makes no claim the badge can deny. A Low grade painted grey collides with that
directly: *"we read it and it is fine"* and *"we have not read it"* would look the same.

## What it became, and why it is not green either

Neither of the two existing vocabularies won.

**Risk is one axis, so it grades in one hue and varies in strength.** Green is off the ramp at every
level — green belongs to the status palette (`--unshafted-ok-*`: an analysis being ready, a snapshot
being fresh), which #78 separated out precisely because it was wearing risk's name. Grey is off it
too, reserved for *not analysed*.

```ts
// packages/ui/lib/risk-tone.ts
Low:         'border-rose-200 bg-rose-50  text-rose-800'
Medium:      'border-rose-300 bg-rose-100 text-rose-900'
High:        'border-rose-400 bg-rose-200 text-rose-950'
'Very High': 'border-rose-600 bg-rose-300 text-rose-950'
```

### The objection to a single hue, and what answers it

Four steps of one hue are harder to tell apart than four hues, because these surfaces are seen **one
at a time** — you get one site's strip, one verdict — never side by side. That is exactly the defect
#82 reports for High vs Very High today.

What makes it viable here is that **colour is never the only channel**. Every consumer renders the
level in words: the strip says "High risk", the badge says `DANGER`, the panel pill says the level.
Colour reinforces a word that is already there.

### What the numbers said, which is not what was expected

Text-on-fill contrast is not the constraint — every candidate cleared AA with room (7.21, 8.00,
11.09, 8.19). The constraint is **fill against the warm shell**, `#efe5d6`:

| grade | fill | vs paper |
|---|---|---:|
| Low | rose-50 | 1.13 |
| Medium | rose-100 | **1.04** |
| High | rose-200 | 1.14 |
| Very High | rose-300 | 1.54 |

At 1.04 the Medium fill is effectively invisible against the ground — the 1px border is doing all
the work. This is **not a regression**: the four maps this replaced ran 1.13–1.20, so every tinted
ramp has always been a border ramp on this shell.

**That finding picked the set.** If the border is the channel the reader actually resolves, then the
border is where the steps belong: it moves two shades per grade (200 → 300 → 400 → 600) while the
fill moves one (50 → 100 → 200 → 300). An evenly-stepped alternative and a variant where the worst
grade stopped being a tint and filled in solid (5.15 against paper) were both rendered against the
real shell and rejected — the first spends its range on a channel that cannot carry it, the second
buys separation at the top by making one grade structurally unlike the other three.

## Why the map lives in `packages/ui/lib`

Not taste — build. `global.css` runs `@import 'tailwindcss' source(none)` and then `@source './lib'`,
so `packages/ui/lib` is the one shared directory all three pages scan. A tone map anywhere Tailwind
cannot see produces no error: the classes are simply never emitted and the surface renders with no
risk colour at all. `pages/side-panel/src/index.css` already carries that warning for `.ts` files.

`unshafted-core` would have been the more natural home for a domain-keyed map and is the wrong one
for exactly this reason — nothing sources it.

Verified rather than assumed, in the built stylesheets:

```
dist/popup/assets/index-*.css      11 of 11 classes emitted
dist/side-panel/assets/index-*.css 11 of 11 classes emitted
```

## The five call sites

| file | was | now |
|---|---|---|
| `pages/side-panel/src/lib/presentation.ts` | owned `RISK_TONE` | keeps `SEVERITY_TONE`, `DOC_TYPE_LABELS`, `describeDeadline` |
| `pages/popup/src/Popup.tsx` | `riskToneClasses` | imports |
| `pages/popup/src/components/SiteStrip.tsx` | local `RISK_TONE` | imports |
| `pages/popup/src/components/ResultCards.tsx` | `verdictToneClasses` | imports — see below |
| `chrome-extension/src/background/site-policy.ts` | `BADGE_COLORS` | same hue, saturated |

### `ResultCards` needed a prop change, not an inverse map

`verdictToneClasses` was keyed on `VerdictTone` (`LOW`/`CAUTION`/`HIGH`/`DANGER`), which looks like a
different domain and is not: `toVerdictTone` is a pure rename of the same four risk levels. Keying a
colour map on the renamed value is what forced this file to carry its own copy of the ramp — one
border shade off the panel's, which #82 correctly called drift.

So `RiskBadge` and `CompactVerdict` now take the `RiskLevel` and call `toVerdictTone` for the *word*
only. `AnalysisWorkspace` stops converting a level purely so the component can map it back.

### The badge uses saturated shades, deliberately

It is a filled dot a few pixels wide on browser chrome we do not control, so it needs chroma, not a
wash: rose-300, rose-400, rose-600, rose-800 — the same hue, further down the ramp.

Those are hexes, and `global.css` otherwise requires a Tailwind shade be spelled
`var(--color-<shade>)` so risk cannot be encoded twice and drift. The rule cannot reach a service
worker: `chrome.action.setBadgeBackgroundColor` takes a colour, not a stylesheet. The shade names are
recorded in the comment above the map instead, which is the only cross-check available.

## What this surfaced — #84

`--unshafted-danger-*` is `rose-200 / rose-50 / rose-800`. The new Low is `border-rose-200
bg-rose-50 text-rose-800` — **the same three values**, not merely a near match. An error banner and a
Low verdict are now pixel-identical in tone, and `AnalysisWorkspace` renders its error section
directly above the verdict card, so they co-occur.

The clash is not introduced here: today's Very High is `rose-200 / rose-50 / rose-900`, already all
but identical to danger. Unifying the ramp moves it from the rarest grade to the most common surface.
Fixing it means re-pointing #78's status-danger family off rose, which is wider than this issue —
[#84](https://github.com/LuDraGa/unshafted/issues/84).

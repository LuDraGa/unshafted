# Danger off the risk ramp

Closes [#84](https://github.com/LuDraGa/unshafted/issues/84). Branch `fix/danger-off-the-risk-ramp`,
off `release`. Follows [#82](https://github.com/LuDraGa/unshafted/issues/82), which caused it.

## Status

| | |
|---|---|
| `--unshafted-danger-*` no longer shares a hue with any step of `RISK_TONE` | **Done** |
| An error banner and a Low verdict are tellable apart | **Done** — separated by form, not hue |
| Every danger site routes through the token | **Done** — 1 did, 8 now do |
| `ErrorDisplay`'s red retired | **Done** — it was a sixth encoding |
| Three destructive actions that never rendered their own colour | **Fixed** — see below |
| Dead `.popup-alert*` rules removed | **Done** |
| [#86](https://github.com/LuDraGa/unshafted/issues/86) — absent disclosure reads as Low risk | **Raised, not done** |
| `type-check` / `test` / `build` / `eslint` / `format:check` | **All green** |

---

## The issue understated it: rose meant six things

#84 was filed as a two-way collision between `RISK_TONE` and `--unshafted-danger-*`. Grepping every
rose and red literal says otherwise:

| meaning | where | how it was spelled |
|---|---|---|
| risk grade | `RISK_TONE` | one map, utilities — correct since #82 |
| severity high | `--unshafted-severity-high-*` | token |
| destructive confirm | `Popup.tsx:1359` | `.popup-alert-danger` → **the token** |
| destructive confirm | `Popup.tsx:1178` | hardcoded `border-rose-200 bg-rose-50 text-rose-900` |
| destructive verb ×2 | `Popup.tsx:1186`, `1366` | hardcoded `text-rose-800` |
| sign out | `Popup.tsx:270` | hardcoded `text-rose-700` |
| launch error | `Popup.tsx:1253` | hardcoded rose |
| analysis error | `AnalysisWorkspace.tsx:270` | hardcoded rose |
| options failure | `Options.tsx:509` | hardcoded rose |
| fatal error screen | `ErrorDisplay.tsx` | hardcoded **red** — a different hue for the same meaning |
| absent disclosure | `DocumentCard.tsx:88` | hardcoded rose — and not danger at all (#86) |

**One token consumer out of nine.** The same delete-confirmation dialog is spelled both ways — through
the token at line 1359 and written out in utilities at line 1178, twelve hundred lines apart in one
file. This is #82's shape exactly, one palette over.

## Why the fix could not be another hue

`ok` holds emerald, `changed` violet, `guidance` amber. Red is the obvious remaining candidate and is
the trap: it sits ~11° of hue from rose, so at tint strength `red-50` is `#fef2f2` against `rose-50`'s
`#fff1f2`. That is no separation at all, on exactly the surfaces where the confusion happens —
and `ErrorDisplay` had already made that choice, which is how the app came to render two hues for one
meaning without anyone noticing either.

So the separation is **structural**, and it uses the one property a grade can never imitate:

> **Risk is always a tinted fill. When the app speaks about itself, it never tints.**

Danger keeps the page's own surface and states itself with an edge — a rule down the leading side
carrying the weight a fill would have.

```css
--unshafted-danger-border: var(--color-rose-600);
--unshafted-danger-bg:     var(--unshafted-surface-strong);
--unshafted-danger-text:   var(--color-rose-900);
--unshafted-danger-action: var(--color-rose-700);
```

| | ratio |
|---|---:|
| body text, rose-900 on surface | 9.39 |
| secondary line at 80% | 6.26 |
| destructive verb, rose-700 | 5.89 |
| the rule itself, rose-600 (3:1 applies) | 4.42 |

`--unshafted-danger-action` is a fourth token and not a speculative one — #79 deleted six tokens for
having no consumer, and this has three on the day it lands.

## What this found: three actions that never had their colour

Converting the destructive verbs surfaced a bug that predates all of this.

```
popup-link-button text-rose-800   →  rendered --unshafted-brand (amber)
popup-menu-item   text-rose-700   →  rendered --unshafted-text
```

`.popup-link-button` and `.popup-menu-item` set `color` **unlayered**. `text-rose-800` is emitted
into `@layer utilities`. An unlayered rule beats every layered one regardless of specificity — the
note at the top of `global.css` says exactly this about `@layer base`, and the same mechanic applies
one layer up. So "Delete permanently" rendered in brand amber and "Sign out" in ordinary text, in
both places, for as long as those class lists have existed. Nothing about the markup showed it: the
class list names the colour it is not getting.

**The new class would have inherited the same bug.** Unlayered beats utilities, but at a single class
it does not beat another *unlayered* component rule at equal specificity loaded later — and
`Popup.css` is loaded after `global.css`. So both selectors are written doubled:

```css
.unshafted-danger-tone.unshafted-danger-tone { … }
.unshafted-danger-action.unshafted-danger-action { … }
```

(0,2,0) wins on specificity rather than on source order, so a page stylesheet cannot silently take
the colour back.

Verified mechanically rather than by eye — every unlayered painting rule in the built stylesheet,
intersected against the class list at each of the eight converted sites:

```
Popup sign out              competing: .popup-link-button   → danger wins on (0,2,0)
Popup delete permanently    competing: .popup-menu-item     → danger wins on (0,2,0)
the other six               competing: none
```

## A tone, not a component

Geometry stays at the call site. The eight sites differ in radius, padding and text size, and one
component class fitted none of them. This is the division `RISK_TONE` already uses and the one the
`.popup-alert-*` modifiers used: the class says what something means, the utilities say how big.

`box-shadow: inset` rather than `border-left-width`, so the rule adds no layout and every converted
site keeps the geometry it had.

## Dead rules removed

`.popup-alert-danger` had one consumer and it moved. `.popup-alert-guidance` had **none**, and had
not for some time. `.popup-alert` only ever supplied geometry to those two, so all three went.
`--unshafted-guidance-*` survives through `Options.css:59`, which is its real consumer — checked
before deleting, because the #79 pattern is that a rule's death can orphan a token and that is worth
knowing at the time rather than discovering later.

## Left out deliberately — #86

`AbsentDisclosureRow` is rose, and it is not danger: a missing GLBA or CCPA notice is a finding about
the *document*, so it belongs on the risk side of the wall this change draws. But after #82 its
`border-rose-200 bg-rose-50` is **risk Low** exactly — the grade that means the document treats you
well — so the panel paints a missing statutory disclosure in the colour of the best possible outcome,
often inside a card graded far heavier than the finding it contains. Weight inverted against meaning,
which is what #78 fixed for severity.

It needs a decision about whether an absent disclosure is a severity or a grade, so it is
[#86](https://github.com/LuDraGa/unshafted/issues/86) rather than a nudge here.

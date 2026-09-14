# Tailwind 4's OKLCH palette (#59)

**Status: done.** Landed on `release` via `fix/tailwind-4-palette`.

The follow-up [#43](https://github.com/LuDraGa/unshafted/issues/43) deferred. That migration pinned
the 44 shades in use to v3's values so the build change could be shown to be a visual no-op; this is
the design decision the pin was holding open. It is allowed to change the rendering, and it does —
39 shades move, and the ones that move most are the risk colours.

## The thing that made it more than a deletion

Risk is encoded twice and only one encoding tracked Tailwind.

- `pages/side-panel/src/lib/presentation.ts` — `RISK_TONE` / `SEVERITY_TONE` are utility strings
  (`border-emerald-200 bg-emerald-50 text-emerald-900` for Low).
- `packages/ui/global.css` — `--unshafted-risk-*`, `--unshafted-danger-*`, `--unshafted-guidance-*`,
  consumed by `SidePanel.css`, `Popup.css` and `Options.css`.

Every token value was a v3 shade written out as hex. Deleting the pin alone moves the utility half
and leaves the token half behind, and a product whose job is grading risk starts grading it two
different colours depending on the surface.

### The fix is a reference, not a fresher copy

Re-copying the hexes at v4's values would be the same bug with newer numbers — it survives exactly
until the next palette revision. So a token that means "amber-200" now *says* so:

```css
--unshafted-guidance-border: var(--color-amber-200);
```

v4 emits a theme variable whenever it sees one referenced in a scanned source. Measured, not
assumed: `--color-violet-800` is absent from the v3-pinned build, and appears the moment
`SidePanel.css` references it — so this works from the three page stylesheets, not just from the
Tailwind entry point. The two encodings are now not two values that agree; they are one value.

### The rule, and its one exception

**A bare hex naming a Tailwind shade is written `var(--color-<shade>)`.** No exceptions — including
the neutrals, whose measured Δ is 1/255. Unpinning stone buys nothing visually, but excluding it
would mean carrying a rule with a footnote, and the footnote is what lets the next hand-copy in.
After this change `grep -E '#[0-9a-f]{6}'` across the four stylesheets returns only the warm paper
the app sits on (`#f8f4ee`, `#efe5d6`, `#f7f2ea`, `#ede7dc`, `#f0e7da`) — which is the project's own
colour and not Tailwind's.

**A shade at partial alpha keeps its `rgba()` form and carries v4's channels.** `rgba(180, 83, 9,
0.65)` → `rgba(187, 77, 0, 0.65)`. `color-mix(in oklab, var(--color-amber-700) 65%, transparent)`
would be exactly equivalent and would close the drift hole here too, but it is a legibility change
rather than a palette one, and this commit is supposed to be judgeable as a palette change. Noted as
a thing that could go further, deliberately not done here.

## What moved

53 shades are in play across both encodings. 39 moved; 14 are byte-identical in v4.

| shade | v3 | v4 | Δ | encoded in |
|---|---|---|---:|---|
| `red-600` | `#dc2626` | `#e7000b` | 38 | utilities |
| `amber-400` | `#fbbf24` | `#ffb900` | 36 | hand-written CSS |
| `violet-700` | `#6d28d9` | `#7008e7` | 32 | utilities |
| `amber-300` | `#fcd34d` | `#ffd230` | 29 | utilities |
| `red-700` | `#b91c1c` | `#c10007` | 28 | utilities |
| `red-800` | `#991b1b` | `#9f0712` | 20 | both |
| `violet-800` | `#5b21b6` | `#5d0ec0` | 19 | hand-written CSS |
| `orange-800` | `#9a3412` | `#9f2d00` | 18 | hand-written CSS |
| `rose-700` | `#be123c` | `#c70036` | 18 | utilities |
| `rose-800` | `#9f1239` | `#a50036` | 18 | both |
| `emerald-300` | `#6ee7b7` | `#5ee9b5` | 16 | utilities |
| `amber-800` | `#92400e` | `#973c00` | 14 | hand-written CSS |
| `orange-600` | `#ea580c` | `#f54a00` | 14 | hand-written CSS |
| `amber-500` | `#f59e0b` | `#fe9a00` | 11 | hand-written CSS |
| `rose-900` | `#881337` | `#8b0836` | 11 | utilities |
| `orange-300` | `#fdba74` | `#ffb86a` | 10 | utilities |
| `amber-700` | `#b45309` | `#bb4d00` | 9 | both |
| `amber-900` | `#78350f` | `#7b3306` | 9 | utilities |
| `emerald-800` | `#065f46` | `#006045` | 6 | hand-written CSS |
| `emerald-900` | `#064e3b` | `#004f3b` | 6 | utilities |
| `orange-900` | `#7c2d12` | `#7e2a0c` | 6 | utilities |
| `violet-900` | `#4c1d95` | `#4d179a` | 6 | utilities |
| `amber-200` | `#fde68a` | `#fee685` | 5 | both |
| `red-900` | `#7f1d1d` | `#82181a` | 5 | utilities |
| `emerald-700` | `#047857` | `#007a55` | 4 | utilities |
| `emerald-200` | `#a7f3d0` | `#a4f4cf` | 3 | both |
| `rose-300` | `#fda4af` | `#ffa1ad` | 3 | utilities |
| `rose-950` | `#4c0519` | `#4d0218` | 3 | utilities |
| `stone-400` | `#a8a29e` | `#a6a09b` | 3 | utilities |
| `gray-800` | `#1f2937` | `#1e2939` | 2 | hand-written CSS |
| `orange-200` | `#fed7aa` | `#ffd6a8` | 2 | both |
| `amber-100` | `#fef3c7` | `#fef3c6` | 1 | utilities |
| `red-100` | `#fee2e2` | `#ffe2e2` | 1 | utilities |
| `red-200` | `#fecaca` | `#ffc9c9` | 1 | hand-written CSS |
| `rose-200` | `#fecdd3` | `#ffccd3` | 1 | both |
| `stone-500` | `#78716c` | `#79716b` | 1 | both |
| `stone-600` | `#57534e` | `#57534d` | 1 | both |
| `stone-700` | `#44403c` | `#44403b` | 1 | both |
| `violet-200` | `#ddd6fe` | `#ddd6ff` | 1 | both |

Unchanged in v4: `amber-50`, `emerald-50`, `orange-50`, `red-50`, `rose-50`, `rose-100`,
`stone-50/100/200/300/800/900/950`, `violet-50`.

Δ is the largest single sRGB channel difference, measured by painting each value to a canvas and
reading the pixel back — the same "painted sRGB" the migration used, so these numbers are comparable
to the ones in `tailwind-4-migration.md`.

**The shape of it.** The near-white 50s and the neutrals are unmoved; the movement is concentrated in
the saturated warm ramps, which is exactly where risk and severity live. `red-600` at Δ38 is the
single biggest jump, and it is the warning icon in `ErrorDisplay`. The risk pills themselves move
5–20.

## Contrast

This is a risk-grading product, so a severity chip that stops meeting contrast would be a real
regression rather than a taste question. Every foreground/background pair in the app, computed as a
WCAG 2.1 ratio against the actual painted colours:

| pair | where | v3 | v4 | Δ |
|---|---|---:|---:|---:|
| `red-800` on `red-50` | ErrorDisplay message | 7.60 | 7.64 | +0.04 |
| `red-700` on `red-50` | ErrorDisplay "Stack trace" | 5.91 | 5.87 | −0.04 |
| `red-900` on `red-50` | ErrorDisplay stack trace | 9.16 | 9.16 | +0.01 |
| `emerald-900` on `emerald-50` | `RISK_TONE` Low | 9.23 | 9.14 | −0.09 |
| `amber-900` on `amber-50` | `RISK_TONE` Medium | 8.75 | 8.73 | −0.01 |
| `orange-900` on `orange-50` | `RISK_TONE` High | 8.83 | 8.90 | +0.07 |
| `rose-900` on `rose-50` | `RISK_TONE` Very High | 8.71 | 8.75 | +0.04 |
| `stone-700` on `stone-100` | `SEVERITY_TONE` low | 9.42 | 9.43 | +0.01 |
| `amber-900` on `amber-100` | `SEVERITY_TONE` medium | 8.15 | 8.13 | −0.02 |
| `rose-900` on `rose-100` | `SEVERITY_TONE` high | 7.97 | 8.00 | +0.03 |
| `rose-950` on `rose-100` | panel alert | 13.02 | 13.08 | +0.05 |
| `rose-800` on `rose-50` | `--unshafted-danger-*` | 7.30 | 7.21 | −0.09 |
| `rose-700` on warm paper | popup danger menu item | 5.74 | 5.50 | **−0.23** |
| `emerald-800` on `emerald-50` | `--unshafted-ok-*` (was `risk-low`, #78) | 7.29 | 7.23 | −0.07 |
| `amber-800` on `amber-50` | `--unshafted-guidance-*` | 6.84 | 6.84 | −0.00 |
| `amber-800` on warm paper | `--unshafted-brand` | 6.47 | 6.47 | −0.00 |
| `violet-800` on `violet-50` | panel freshness "changed" | 8.19 | 8.36 | +0.17 |
| `violet-700` / `violet-900` on card | panel "changed" caption / body | 6.94 / 10.70 | 7.13 / 10.77 | +0.19 / +0.07 |
| `amber-700` on warm paper | inline link | 4.58 | 4.59 | +0.01 |
| `stone-600` on warm paper | `--unshafted-text-muted` | 6.96 | 6.97 | +0.01 |
| `stone-900` on warm paper | `--unshafted-text` | 15.96 | 15.96 | ±0.00 |
| `gray-800` on `stone-50` | primary action button | 14.05 | 14.05 | −0.01 |

**Every pair clears AA (4.5:1).** The largest loss is `rose-700` on warm paper at −0.23, landing at
5.50 — the popup's danger menu item, still comfortably clear. `text-red-600` is not in this table as
a text pair because its only site is a 64px `WarningIcon`, a non-text graphic needing 3:1; it goes
4.83 → 4.77 against white.

One pair is below AA both before and after: `--unshafted-text-faint` (stone-500) on warm paper, 4.38
→ 4.37. That is a pre-existing condition this change neither caused nor fixed —
[#61](https://github.com/LuDraGa/unshafted/issues/61).

> **Correction, v0.8.1.** "Warm paper" everywhere in this table means `--unshafted-bg`, `#f8f4ee`.
> That is the token, and for most of these pairs it is also the pixel. It is not the pixel for
> `--unshafted-text-faint`. The popup and panel shells are
> `linear-gradient(180deg, #f7f2ea 0%, var(--unshafted-bg-warm) 100%)`, and faint text's two most
> visible sites — the popup's sticky footer and the panel's `mt-auto` privacy line — are pinned to
> the bottom of that gradient, on `--unshafted-bg-warm` (`#efe5d6`). There stone-500 is **3.84:1**,
> not 4.37. The table measured against the token rather than the painted ground, so it understated
> the one failure it found. Every other row's ground is a card surface or a shade pair and is
> unaffected. Fixed in 0.8.1 — see `execution-docs/text-faint-contrast-and-risk-ramp.md`.

## How it was verified

Same three-layer method as the migration, minus the parts that only mattered for a build change.

### 1. Every colour declaration in the built stylesheets

Both builds' stylesheets parsed, custom properties resolved transitively, every colour token painted
to canvas and diffed. **46 distinct colour moves across the three pages, every one of them a v3→v4
shade move.** Nothing moved that was not a Tailwind shade.

Three selectors reported a "shape" change rather than a value change — `.popup-switch`,
`.spotlight-tour-arrow`, `.spotlight-tour-next`. That is a CSSOM artefact, not a finding: a shorthand
holding a `var()` stops being split into longhands, so the token extractor sees fewer tokens. Checked
against the raw emitted CSS; all three are the intended conversion and nothing else.

The `@theme` block's shape change is the mechanism working: it now carries `red-200`, `orange-800`,
`amber-500`, `amber-800`, `emerald-800`, `gray-800`, `violet-800` and `stone-800`, pulled in by the
`var()` references that previously did not exist.

### 2. Rendered DOM, five states across the three surfaces

Both builds booted in a real browser against a stubbed `chrome` API, every `<details>` expanded, and
every node's bounding rect plus 29 computed properties diffed.

| surface | nodes | geometry Δ | non-colour style Δ | colour Δ |
|---|---:|---:|---:|---|
| popup · americanexpress.com | 48 | **0** | **0** | 134 across 10 moves |
| popup · tiktok.com | 48 | **0** | **0** | 134 across 10 moves |
| options | 58 | **0** | **0** | 143 across 10 moves |
| side panel · americanexpress.com | 465 | **0** | **0** | 1753 across 16 moves |
| side panel · tiktok.com | 391 | **0** | **0** | 1486 across 12 moves |

Zero geometry differences and zero non-colour differences, which is what a palette change should
look like. Every one of the 16 distinct moves in the richest case is a v3→v4 shade.

`americanexpress.com` is the useful fixture: its four documents land on High, High, Medium and Low,
so a single screen exercises three risk tones at once. `tiktok.com` supplies Very High. Both halves
move together on that screen — `#064e3b → #004f3b` is the token half
(`--unshafted-risk-low-text`, since renamed `--unshafted-ok-text` — #78), `#881337 → #8b0836` is
the utility half (`text-rose-900`).

### 3. Rendered UI, before and after

Side-by-side captures of popup, options and side panel, plus the spotlight tour (which owns the two
amber alphas). Layout identical throughout; the risk pills and the brand eyebrow read slightly more
saturated, which is the change.

### Rebuilding the harness

The migration's scratch scripts were gone, so these were rebuilt and are worth keeping findable:

- Serve a directory holding `before/` and `after/` copies of `dist/{popup,options,side-panel}` over
  HTTP — via a `.claude/launch.json` entry, not a backgrounded shell server.
- Copy `dist/policy-index.bin` and `dist/policy-corpus.json` to the server root; without them the
  popup hangs on a spinner and the side panel has no analyses to render.
- Inject a ~40-line `chrome` stub before the module script. It needs `runtime`, `storage.local`
  /`session` (in-memory), `tabs.query`/`get`, `action`, `sidePanel`, `scripting` and `identity`.
  Make `tabs.query` return a URL built from a `?domain=` query param — that is what selects which
  corpus domain, and therefore which risk tones, render.
- Seed `unshafted-onboarding` as dismissed. Otherwise the spotlight tour fires on a timer and the
  two builds get captured on different tour anchors, which reads as a diff and is not one.
- Screenshot with headless Chrome and `--virtual-time-budget=20000`. Shorter budgets catch the tour
  mid-measurement.

## Checks

`pnpm build`, `pnpm type-check` (12 tasks), `pnpm test` (14 tasks), `pnpm lint` (11 tasks) and
`prettier --check` all pass.

## Raised, not done here

- [#61](https://github.com/LuDraGa/unshafted/issues/61) — `--unshafted-text-faint` is 4.37:1 on the
  app's own background, below AA for normal text. Pre-existing; predates this change.
- [#62](https://github.com/LuDraGa/unshafted/issues/62) — `--unshafted-risk-medium-*` and
  `--unshafted-risk-high-*` have no consumers anywhere. Six dead tokens, carried forward here so the
  ramp stays coherent rather than half-migrated, but they should probably go.

> **Note, v0.8.1.** The two `--unshafted-risk-medium-*` / `--unshafted-risk-high-*` rows are gone
> from the table above because the tokens are gone ([#79](https://github.com/LuDraGa/unshafted/issues/79)),
> and `--unshafted-risk-low-*` is now `--unshafted-ok-*`
> ([#78](https://github.com/LuDraGa/unshafted/issues/78)). Severity moved off `guidance`/`danger`
> onto its own tokens at `-200`/`-900`, which raises the badge half from 5.70/5.59 to 7.28/6.78 —
> see `execution-docs/text-faint-contrast-and-risk-ramp.md`.

**Both resolved in 0.8.1.** #61 is fixed: the real worst case was 3.84:1 on `#efe5d6`, not 4.37 on
`#f8f4ee`, and `--unshafted-text-faint` is now `oklch(51% 0.013 58.071)`. #62 turned out to be two
decisions wearing one issue number and was split — the token family is a *status* palette, not a
risk ramp, which is why its middle never found a consumer. See
`execution-docs/text-faint-contrast-and-risk-ramp.md`.

# Tailwind 4 (#43)

**Status: done.** Landed on `release` via `chore/tailwind-4`.

A migration, not a bump. The success criterion was the one the issue set: the three surfaces render
the same afterwards, shown as rendered UI rather than as a green build. They do — verified by
diffing every DOM node's geometry and computed style between the v3 and v4 builds of each page.

## The `withUI` decision

The issue framed this as the real question: `withUI` exists so three pages share one theme, and
under CSS-first config that shared layer probably wants to be a CSS file the pages import.

Looking at what it actually did, the answer is sharper than that. `withUI` was this, entire:

```ts
export const withUI = (tailwindConfig: Config): Config =>
  deepmerge(tailwindConfig, { content: ['../../packages/ui/lib/**/*.tsx'] });
```

It merged **one content glob**. It shared no theme — `packages/ui/tailwind.config.ts` had
`theme: { extend: {} }`, and all three page configs passed nothing but `content`. The theme was
*already* a CSS file: the `--unshafted-*` custom properties in `packages/ui/global.css`, which the
pages already imported.

So the shared layer did not need to become a CSS file. It always was one. `withUI` was a function
wrapped around a single glob, and the glob is the one thing v4 expresses natively:

```css
/* packages/ui/global.css */
@import 'tailwindcss' source(none);
@source './lib';
```

Every page already imports this file, so every page picks up the `@extension/ui` sources by
importing the stylesheet that describes them. `withUI` is deleted, along with the four
`tailwind.config.ts` files and `deepmerge` from `packages/ui`. Each page names its own sources in
its own `index.css`.

`source(none)` is deliberate. v4's automatic detection walks up to the repo root, which here means
every page would scan the whole monorepo and ship every other page's utilities. Explicit `@source`
lines say exactly what v3's `content` arrays said.

The side panel's `.ts` caveat survives the move and keeps its comment: the risk tone maps live in
`src/lib/presentation.ts`, and a class Tailwind cannot see fails silently — the panel renders with
no risk colour at all. `@source './'` covers `.ts`; verified all 16 `RISK_TONE`/`SEVERITY_TONE`
classes are still emitted.

## What actually broke, and how it was found

A green build caught none of the following. Each was found by comparing built stylesheets and then
rendered DOM.

### 1. Cascade layers — the one that changes behaviour silently

v3 stripped its `@layer` directives and emitted utilities as ordinary rules, so utilities and
hand-written CSS competed on normal specificity. v4 emits **real CSS cascade layers**, and an
unlayered rule beats every layered rule no matter how specific.

Every hand-written stylesheet in this repo is unlayered. So they all began beating every utility.

Two live consequences:

- `global.css` had `button, input, textarea, select { font: inherit }`. Unlayered, it beat
  `text-[11px]` **and** `font-semibold` on the header's Sign in button, which rendered at 16px/400
  instead of 11px/600. The wider button then reflowed the title beside it: the `<h1>` text column
  went from 222.71px to 207.70px and "Contract risk, without the fog." wrapped a word earlier.
  Nothing errored.
  **Fix:** these are element defaults — the project's half of Preflight — so they moved into
  `@layer base`, which is where v3 effectively had them.

- `space-y-1` stopped working under `.popup-eyebrow` / `.popup-title` / `.popup-subtitle` and
  `space-y-3` under `.options-eyebrow`, because those classes set `margin: 0`. v3's space-y selector
  (`.space-y-1 > :not([hidden]) ~ :not([hidden])`) scored 0,3,0 and won; v4's uses a
  zero-specificity `:where()` on purpose, so it is easy to override — which is what was happening by
  accident. The options header gap vanished entirely.
  **Fix:** delete the `margin: 0`. Preflight already zeroes `p` and `h1`-`h6` margins in *both*
  versions, so it was redundant in v3 and harmful in v4.

The component classes stay unlayered on purpose. In v3 they came after the utilities in source order
and won ties that way; unlayered-beats-layered reproduces exactly that. Only the element-level
resets moved.

### 2. Preflight: buttons lost `cursor: pointer`

v4 defers to the native default. This app is 60 buttons across three pages; losing the pointer on
all of them is the most visible single thing about the upgrade. Restored in `@layer base`, with
`:not(:disabled)` so a disabled control still reads as unavailable.

### 3. Renamed utilities

Checked by grep across all four source roots, not assumed:

| v3 | v4 | sites |
|---|---|---|
| `shadow-sm` | `shadow-xs` | 1 (`ErrorDisplay.tsx`) |
| `outline-none` | `outline-hidden` | 1 (`Popup.tsx`) |

`shadow-xs` in v4 is byte-identical to v3's `shadow-sm` (`0 1px 2px 0 #0000000d`). `outline-hidden`
is `outline-style: none` plus the transparent 2px outline under `@media (forced-colors: active)` —
strictly better than v3, which paid for that outline unconditionally.

`rounded` and `flex-shrink-0` were also checked and are **unchanged** in v4 — both still emit
exactly what v3 emitted. The other renames (`blur`, `drop-shadow`, `ring`, `*-opacity-*`,
`flex-grow`) have no sites here.

### 4. The palette — pinned, deliberately

v4 re-derived the default palette in OKLCH. Measured as painted sRGB, the neutrals barely move
(stone: Δ1/255) but the saturated warm ramps do: `text-red-600` `#dc2626` → `#e7000b` (Δ38),
`text-red-700` Δ28, `text-rose-700/800` Δ18. Those are the risk and severity colours.

Letting them move would have split the app in half, because **risk is encoded twice**. The side
panel's `presentation.ts` uses utilities (`border-emerald-200 bg-emerald-50 text-emerald-900` for
Low) while `SidePanel.css` paints the same state from `--unshafted-risk-low-*` — and every one of
those token values is a v3 Tailwind shade written out as hex (`#065f46` is emerald-800, `#9f1239`
is rose-800, `#fde68a` is amber-200). Only the utility half tracks Tailwind, so under v4's palette
one surface shifts and the other does not, and a product whose whole job is grading risk starts
grading it two different colours.

So the 44 shades in use are pinned to v3's values in an `@theme` block, generated from what v3
actually shipped rather than hand-copied. This migration changes the build, not the design.

Adopting v4's palette is worth doing — wider gamut, and it is upstream — but as its own decision
that moves both halves together, with its own before/after. **That is [#59](https://github.com/LuDraGa/unshafted/issues/59).**

### 5. Class sort order

`prettier-plugin-tailwindcss` sorts differently for v4 (`font-semibold leading-snug` →
`leading-snug font-semibold`). Applied via `pnpm lint:fix`; class order in an attribute has no
rendering effect. `.prettierrc` now sets `tailwindStylesheet: "./packages/ui/global.css"` so the
plugin reads the CSS entry point instead of hunting for a JS config that no longer exists.

## The surface, as migrated

| Thing | v3 | now |
|---|---|---|
| `packages/ui/global.css` | `@tailwind base/components/utilities` | `@import 'tailwindcss' source(none)` + `@source` + `@theme` pin + `@layer base` resets |
| `pages/{popup,options,side-panel}/package.json` | `postcss.plugins.tailwindcss` + `autoprefixer` | `@tailwindcss/postcss` alone |
| four `tailwind.config.ts` | JS config objects | deleted; sources declared in CSS |
| `packages/ui/lib/with-ui.ts` | `withUI` composes a v3 `Config` | deleted |
| `packages/vite-config/tailwind.d.ts` | declares `tailwindcss/lib/cli/build` | deleted — nothing imported it; already dead |
| `.prettierrc` | auto-discovers `tailwind.config.ts` | `tailwindStylesheet` |
| `turbo.json` `lint` | `dependsOn: ["^ready"]` | removed — see below |

`autoprefixer` is gone as a dependency and from all three postcss blocks: `@tailwindcss/postcss`
runs the whole stylesheet through Lightning CSS, which prefixes.

### `lint` no longer needs `^ready`

`lint` depended on `^ready` for exactly one reason, recorded in `turbo.json`: every
`tailwind.config.ts` under `pages/` imported `withUI` from `@extension/ui`'s built output, so on an
unbuilt tree the config failed to load, prettier-plugin-tailwindcss fell back to a parser that could
not read JSX, and eslint exited 2 with a ParseError (#25).

That coupling no longer exists. Measured, not assumed: with every `dist/` in the repo deleted,
`eslint .` passes in all 11 packages. The dependency is removed and the comment rewritten to say
why. `pnpm lint` now runs 11 tasks instead of 19.

`test` keeps its `^ready` — that one is about `@extension/storage`'s suite importing
`@extension/unshafted-core` through `main: dist/index.mjs` at runtime, and is unaffected.

## How "renders the same" was verified

Three layers, each stricter than the last.

1. **Emitted CSS.** Both builds parsed with postcss into selector → declaration maps and diffed.
2. **Computed styles per utility.** A harness page with 1,045 candidate class tokens scraped from
   source, plus one probe of every relevant element type for Preflight changes. Loaded each page's
   v3 and v4 stylesheet in turn and diffed every computed property against an unstyled reference.
3. **Rendered DOM.** The built pages booted in a real browser against a stubbed `chrome` API, and
   every node's bounding rect plus 16 computed properties diffed between builds.

Final state, all three pages: **zero geometry differences.** What remains, and why each is nothing:

| Residual difference | Why it does not matter |
|---|---|
| `border-*-color: gray-200 → currentColor` on most nodes | v4's Preflight default. Only paints where a border-width is set, and every bordered element in this codebase names its own border colour — checked across all 18 such class strings. |
| `space-y` margin on first child instead of last | v4 applies `margin-block-end` where v3 applied `margin-block-start`. Every bounding rect identical. |
| `rounded-full`: `9999px` → `calc(infinity * 1px)` | Both fully round at these sizes. |
| `bg-*/opacity` now `oklab(...)` | Composited over a ground and read back pixel-by-pixel: Δ0 on all five. |
| `.transition` property list longer | v4 adds `outline-color`, `translate`, `scale`, `rotate`, `display` and others. Superset. |
| `<input>/<select>/<textarea>` background `white → transparent` | Preflight. Both custom input classes (`.options-input`, `.popup-scope-sheet-input`) set their own background; the only other input is a `hidden` file input and a native checkbox. |

`pnpm lint`, `pnpm type-check`, `pnpm test` and `pnpm build` all pass, including from a tree with
every `dist/` deleted. The ZIP builds and contains all three stylesheets.

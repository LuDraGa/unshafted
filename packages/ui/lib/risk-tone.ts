import type { RiskLevel } from '@extension/unshafted-core';

/**
 * The one encoding of risk tone. Every surface that grades a document reads it from here.
 *
 * It lives in `@extension/ui/lib` for a build reason, not a taste one: `global.css` runs
 * `@import 'tailwindcss' source(none)` and then `@source './lib'`, so this directory is the only
 * shared place all three pages scan. A tone map anywhere Tailwind cannot see is not a lint error —
 * the classes are simply never emitted and the surface renders with no risk colour at all. The
 * side panel's `index.css` carries the same warning about `.ts` files for the same reason.
 *
 * WHAT THIS REPLACED, and why it was a correctness problem rather than a tidiness one (#82). Risk
 * was encoded five times: this map's ancestor in the panel's `presentation.ts`, `riskToneClasses`
 * in `Popup.tsx`, `verdictToneClasses` in `ResultCards.tsx`, a local `RISK_TONE` in `SiteStrip.tsx`
 * and `BADGE_COLORS` in the background worker. They did not merely differ in shade. The strip and
 * the badge painted Low grey and High rose; the other three painted Low green and High orange. So
 * a reader who saw a High verdict in the popup strip and then opened the panel saw two different
 * colours for one grade — and in the strip, High and Very High were both rose and nearly
 * indistinguishable, while 49 of the 83 corpus analyses grade High.
 *
 * WHY ONE HUE. Risk is one axis, so it grades along one hue and varies in strength. Green is not on
 * this ramp at any level: it belongs to the status palette (`--unshafted-ok-*`, an analysis being
 * ready, a snapshot being fresh), which #78 separated out precisely because it was wearing risk's
 * name. Grey is not on it either — grey means "not analysed", which is what `SiteStrip`'s uncovered
 * state says, and a grade must never be mistakable for the absence of one.
 *
 * Colour is reinforcement here, never the only channel: every consumer also renders the level in
 * words. That is what makes four steps of one hue legible when you only ever see one at a time.
 *
 * Text-on-fill contrast, against the Tailwind v4 OKLCH values: 7.21, 8.00, 11.09, 8.19 — all clear
 * of AA with room, which the faint-text work in #61 established as the bar.
 *
 * THE BORDER CARRIES THE RAMP, which is why it steps two shades per grade while the fill steps one.
 * Measured against the shell's own ground (`#efe5d6`, the gradient end) the fills run 1.13, 1.04,
 * 1.14, 1.54 — at 1.04 the Medium fill is invisible against the paper and the 1px border is doing
 * all the work. That is true of any light-tint ramp on this background, and was true of the four
 * maps this replaced, so the border is the channel worth spending on.
 */
export const RISK_TONE: Record<RiskLevel, string> = {
  Low: 'border-rose-200 bg-rose-50 text-rose-800',
  Medium: 'border-rose-300 bg-rose-100 text-rose-900',
  High: 'border-rose-400 bg-rose-200 text-rose-950',
  'Very High': 'border-rose-600 bg-rose-300 text-rose-950',
};

/**
 * P14: reserves its own width and height at all times — `.panel-back-to-top` stays `visibility:
 * hidden`, never `display: none`, so the title beside it never reflows when this switches on.
 * The switch itself is a `scroll-state(scrollable: top)` container query in `SidePanel.css`, driven
 * by the shell's real scroll position — no scroll listener, no state here at all.
 *
 * `visibility: hidden` also keeps it out of the tab order while hidden, for free — unlike
 * `opacity: 0`, which would leave a focusable, invisible stop in the header's tab sequence.
 */
export const BackToTop = () => (
  <button
    type="button"
    className="panel-back-to-top panel-icon-button"
    aria-label="Back to top"
    onClick={event => event.currentTarget.closest('.panel-shell')?.scrollTo({ top: 0 })}>
    ↑
  </button>
);

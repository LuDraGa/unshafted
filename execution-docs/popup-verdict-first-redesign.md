# Popup Redesign: Verdict-First Accordion

## Goal
Redesign the Chrome extension popup to reduce scroll, improve information hierarchy, and make the upload action always accessible. The experience should feel like an obvious, smooth, logical next step — not an overwhelming wall of data.

## Problems Solved
1. **Upload hidden behind "Start Fresh"** — upload button moves to sticky header, always 1 click away
2. **File info card always expanded** — becomes collapsible accordion, closed by default
3. **Quick scan = scroll wall** — all sections become collapsible accordions with count badges
4. **No information hierarchy** — verdict strip at top, progressive disclosure for everything else

## Implementation Plan

### 1. Sticky header: persistent upload button
- Add upload icon button (32x32) to sticky header next to status badge
- Move file input ref and upload handler up to Popup.tsx header area
- When clicked with existing analysis: triggers file picker, replaces current analysis on selection
- Remove "Start Fresh" button from AnalysisWorkspace

### 2. Verdict strip (always visible after quick scan)
- Immediately below header in AnalysisWorkspace
- Risk badge (left) + one-line caution sentence (right)
- Compact: ~48px total height
- Shows during quick-ready, deep-running, and complete states

### 3. Accordion sections for quick scan
- **Summary** — open by default (quick scan narrative + document type)
- **Document info** — closed by default (file metadata, text preview)
- **Parties** — closed, shows count: "Parties (N)"
- **Quick flags** — closed, shows count + severity: "Flags (N)"
- **Customize analysis** — closed (combines role selector + priority topics, shows current: "Reviewing as: Signer")
- **Re-run quick scan** — small link on summary section header, not a full button

### 4. Single clear CTA
- "Run detailed analysis" — one primary button at bottom
- Remove separate "Re-run quick scan" full-width button

### 5. Deep analysis results as accordions
- Verdict banner stays always-visible (not collapsible)
- Each of the 11 result sections becomes a collapsible accordion row
- Shows count/severity indicator in header so user can triage without opening
- Empty sections are omitted entirely (no "nothing found" placeholders)

### 6. CSS additions
- Accordion section styles (grouped borders, chevron indicators)
- Compact verdict strip styling

## Files Modified
- `pages/popup/src/Popup.tsx` — upload button in header
- `pages/popup/src/Popup.css` — accordion styles, verdict strip
- `pages/popup/src/components/AnalysisWorkspace.tsx` — major refactor to accordion layout
- `pages/popup/src/components/ResultCards.tsx` — wrap deep analysis sections in accordions

## Status
- [ ] Sticky header upload button
- [ ] Verdict strip
- [ ] Quick scan accordions
- [ ] Single CTA + re-run as link
- [ ] Deep analysis accordions
- [ ] CSS styles

# Execution Doc: UI Simplification + Options Simplification + Template Cleanup + README Update

**Status:** All tasks complete (3, 1, 2, 4)
**Date:** 2026-04-10
**Scope:** Items 1, 2, 5 from roadmap + README rewrite

---

## Project Context

Unshafted is a Chrome Extension (MV3) that analyzes contracts, terms, and licenses from the user's perspective. It does a two-stage analysis: quick scan (document type, parties, risk flags) then deep analysis (full risk breakdown, negotiation ideas, missing protections, etc.).

**Stack:** React 19, TypeScript, Tailwind CSS, Turborepo monorepo, Zod schemas, OpenRouter/OpenAI API for LLM calls, `chrome.storage.local` for persistence.

**Architecture:** Popup-first (no side panel anymore — it was removed in commit `b1b8ed4`). The popup IS the entire product surface now. Everything runs in the popup: launcher view, analysis workspace, and results.

**Key packages:**
- `chrome-extension/` — manifest, background service worker
- `pages/popup/` — the main UI (launcher + AnalysisWorkspace + ResultCards)
- `pages/options/` — settings page (API key, model selection, connection test)
- `pages/content/` — content script for extracting page text
- `packages/unshafted-core/` — reusable analysis logic: prompts, schemas, OpenRouter client, document helpers, fixtures
- `packages/storage/` — chrome.storage.local wrappers for settings, history, usage, current analysis
- `packages/shared/` — hooks (`useStorage`), HOCs, browser utils (`getTabReadability`, `extractCurrentPageDocument`), analysis workflow (`runQuickScan`, `runDeepAnalysis`)
- `packages/ui/` — shared UI components (ErrorDisplay, LoadingSpinner, `cn` utility)
- `packages/env/`, `packages/hmr/`, `packages/vite-config/`, `packages/tsconfig/` — build infrastructure from the scaffold template

---

## Task 1: Simplify Popup UI

### Current State
The popup has two views:

**Launcher view** (`Popup.tsx` lines 140-242):
- Header with "Unshafted" eyebrow, title "Contract risk, without the fog.", subtitle, and a Ready/Setup badge
- "Current page" card showing tab title, URL, and readability status badge (Readable/PDF/Unsupported)
- Two buttons: "Analyze this page" (primary) and "Upload .txt" (secondary)
- Two stat cards side-by-side: "Suggested free quota" (usage counter) and "Last result" (most recent analysis name + risk)
- API key warning banner (if no key set)
- Error banner
- Footer: disclaimer + Options link

**Workspace view** (`AnalysisWorkspace.tsx`):
- Back button + "Start fresh" button
- Error display with retry
- Document info card (source kind badge, quality badge, name, character count, token count, file size, capture time, extraction warnings, expandable text preview)
- Quick scan running state (spinner + loading steps animation)
- Quick scan results (summary, caution line, detected parties, red flags, role selection pills, custom role input, priority topic selection pills, re-run quick scan button, "Run detailed analysis" button)
- Deep analysis running state (spinner + loading steps)
- Deep analysis results via `ResultsView` component

### Target State
Strip the launcher to its essentials:
1. **Remove** the "Current page" card entirely (tab title, URL, readability badge, "Analyze this page" button). Keep only the upload flow as the primary action.
2. **Remove** the two stat cards (usage counter and last result). These are noise for the MVP.
3. The launcher should be: title/subtitle + single prominent upload button + API key warning if needed + Options link.
4. When a file is uploaded, go directly to workspace and auto-run quick scan (this already works).
5. **Keep** the workspace view as-is — it's the product and already functions well. The "re-analyze" button already exists as "Re-run quick scan".

### Files to Modify
- `pages/popup/src/Popup.tsx` — gut the launcher view, remove page analysis flow, remove stat cards
- `pages/popup/src/Popup.css` — remove any now-unused styles (check after changes)
- `packages/shared/lib/utils/unshafted-browser.ts` — the `getCurrentActiveTab`, `getTabReadability`, `extractCurrentPageDocument` functions become unused by the popup. **Do not delete them yet** — they may be useful later. But remove imports from Popup.tsx.
- `packages/storage/lib/impl/unshafted-usage-storage.ts` — the usage snapshot is no longer displayed in the launcher, but it's still used by `AnalysisWorkspace` to increment counts. Keep the storage, just remove the display.

### What to Keep
- The file input and `handleFileChosen` logic
- The workspace view transition (`view === 'workspace'`)
- API key check and warning
- Error display
- Options link
- The "Analyze this page" flow should be **removed from the launcher** but the content script extraction infrastructure should remain intact in packages for future use

### Design Direction
The simplified launcher should feel like one clear action: "Upload your contract." Maintain the existing warm stone/amber design language (see `Popup.css` — warm gradients, amber accents, stone neutrals, rounded cards with backdrop blur). The upload button should be the hero element.

---

## Task 2: Simplify Options Page

### Current State
`pages/options/src/Options.tsx` shows a two-column layout:

**Left column (form):**
- Provider toggle (OpenRouter / OpenAI buttons)
- API key input with show/hide toggle
- Quick model + Deep model inputs (two columns)
- Temperature input (or reasoning effort note for OpenAI)
- Save / Test connection / Reset defaults buttons
- Status message

**Right column (info):**
- "Recommended defaults" panel with model names
- "What the extension stores locally" panel
- "Known MVP constraints" panel

### Target State
1. **Keep:** Provider toggle + API key input + Test connection + Save
2. **Hide model fields behind a `<details>` "Advanced" disclosure.** Models should be editable but not prominent. The defaults work fine for most users.
3. **Remove or collapse:** Temperature field (move into Advanced), "Recommended defaults" info panel (the placeholder text in inputs already shows defaults), "What the extension stores locally" panel, "Known MVP constraints" panel. These are informational clutter.
4. **Keep:** Reset defaults button (move into Advanced section)
5. The Options page should feel like: pick your provider, paste your key, test it, done.

### Files to Modify
- `pages/options/src/Options.tsx` — restructure the form, wrap model/temperature fields in a `<details>` element
- `pages/options/src/Options.css` — remove unused styles if any after the simplification

### Design Direction
Single-column layout is fine for simplicity. Keep the warm Options design language. The `<details>` for advanced settings should use existing card styling.

---

## Task 3: Template Artifact Cleanup

### Identified Artifacts

**1. Icons — `chrome-extension/public/icon-34.png` and `icon-128.png`**
These are generic lightning-bolt-on-browser-window icons from the Chrome extension scaffold template. They have nothing to do with Unshafted's brand. **Action:** Leave them in place for now (the extension needs icons to function), but note in a comment or the README that branded icons are needed. Do NOT delete them — that would break the extension.

**2. `webextension-polyfill` import in `chrome-extension/src/background/index.ts`**
Line 1: `import 'webextension-polyfill';` — This is a MV2 compatibility shim. The extension is MV3-only and uses `chrome.*` APIs directly everywhere. This import is dead weight from the scaffold. **Action:** Remove the import. Check `chrome-extension/package.json` to see if `webextension-polyfill` is a dependency and remove it from there too.

**3. `colorfulLog` / `colorful-logger.ts` in `packages/shared/lib/utils/`**
Only used by `chrome-extension/utils/plugins/make-manifest-plugin.ts` (a build plugin). Not used by any app code. It's scaffold infrastructure. **Action:** Leave it — it's used by the build system. Not worth removing.

**4. `pendingActionStorage` and `PendingActionSchema`**
The `PendingActionSchema` has types `'none' | 'focus-upload' | 'analyze-current-page' | 'open-history'`. With the side panel removed and page analysis removed from the launcher, only `'none'` is ever set. The `pendingActionStorage` is set in `Popup.tsx` (to `{ type: 'none' }`) and in `background/index.ts` (to `{ type: 'none' }`). **Action:** After Task 1 simplification, check if any code still sets pending action to anything other than `'none'`. If not, the entire `pendingActionStorage` could be simplified or removed. Lower priority — leave for now unless it's clearly dead.

**5. `LockedTeaser` component in `ResultCards.tsx`**
Lines 104-114 render "Next layers" teasers ("Regional context", "Follow-up Q&A", "Clause-by-clause redline") in the results view. These are placeholder features that don't exist. **Action:** Consider removing the "Next layers" section from ResultsView or leaving it as forward-looking UX. Owner's call — ask if unsure.

**6. `CONVERTER_LINKS` in `constants.ts`**
Links to external PDF-to-Markdown and Markdown-to-Text converters. These were used in the side panel flow. Check if they're referenced anywhere after the side panel removal. If not referenced, remove. If still used (e.g., in unsupported-page messages), keep.

### Files to Check/Modify
- `chrome-extension/src/background/index.ts` — remove `webextension-polyfill` import
- `chrome-extension/package.json` — remove `webextension-polyfill` dependency if present
- `packages/unshafted-core/lib/constants.ts` — check `CONVERTER_LINKS` usage
- `pages/popup/src/components/ResultCards.tsx` — optionally remove `LockedTeaser` section

---

## Task 4: README Update

### Current State
The README is significantly out of date:
- References `pages/side-panel/src/SidePanel.tsx` and `pages/side-panel/src/lib/analysis-workflow.ts` which no longer exist (side panel removed in commit `b1b8ed4`)
- Says "four live entrypoints: popup, options, side-panel, and content" — there are only three now
- Describes a workflow where "The popup routes you into the side panel" — popup IS the product surface now
- "Upload from the popup or side panel" — there is no side panel
- "Open the side panel and use the Recent history list" — no side panel
- Analysis workflow moved to `packages/shared/lib/utils/analysis-workflow.ts`, not in any side-panel directory
- Project Structure section has dead links

### Target State
Rewrite the README to accurately reflect the current popup-first architecture:
- Update Project Structure: remove side-panel references, add correct paths
- Entrypoints are: popup, options, content (three, not four)
- The popup is the full product surface: launcher + workspace + results all happen in the popup
- Update "How to Use" section for the popup-only flow
- Update "Architecture Notes" to reflect the popup-first model
- Update the analysis-workflow path to `packages/shared/lib/utils/analysis-workflow.ts`
- Remove any mention of side panel throughout
- Keep the overall structure, tone, and useful sections (Stack, MVP Features, OpenRouter Setup, Install and Run, Known Limitations, Verification Checklist, Disclaimer)

### Storage types comment
`packages/storage/lib/base/types.ts` line 24 mentions "side panel" — update that comment too.

---

## Execution Order

1. **Task 3 first** (template cleanup) — small, safe, no UI impact
2. **Task 1** (popup simplification) — biggest UI change
3. **Task 2** (options simplification) — smaller UI change
4. **Task 4 last** (README) — needs to reflect the final state after all changes

---

## Verification After All Changes

```bash
pnpm type-check
pnpm build
pnpm -F @extension/unshafted-core test
```

Then manual verification:
- Load `dist/` in Chrome as unpacked extension
- Click extension icon — should show simplified launcher with upload button
- Upload a `.txt` file — should auto-run quick scan, show results, allow deep analysis
- Open Options — should show provider toggle, API key, test connection, and Advanced disclosure for models
- Check console for errors in popup and background worker
- Verify the built extension zip works

---

## Key Files Reference (current paths and line counts)

| File | What it does |
|---|---|
| `pages/popup/src/Popup.tsx` (245 lines) | Launcher + workspace router |
| `pages/popup/src/Popup.css` (131 lines) | Popup styles |
| `pages/popup/src/components/AnalysisWorkspace.tsx` (384 lines) | Full analysis workspace UI |
| `pages/popup/src/components/ResultCards.tsx` (333 lines) | Deep analysis result rendering |
| `pages/options/src/Options.tsx` (354 lines) | Settings form |
| `pages/options/src/Options.css` (115 lines) | Options styles |
| `chrome-extension/src/background/index.ts` (17 lines) | Service worker |
| `chrome-extension/manifest.ts` (27 lines) | MV3 manifest |
| `packages/unshafted-core/lib/prompts.ts` (149 lines) | Quick + deep prompts |
| `packages/unshafted-core/lib/schemas.ts` (213 lines) | All Zod schemas |
| `packages/unshafted-core/lib/constants.ts` (69 lines) | Constants, defaults, priorities |
| `packages/unshafted-core/lib/openrouter.ts` (249 lines) | LLM API client |
| `packages/unshafted-core/lib/document.ts` (148 lines) | Document parsing, text prep |
| `packages/unshafted-core/lib/runtime.ts` (66 lines) | Factory functions, type helpers |
| `packages/unshafted-core/lib/types.ts` (53 lines) | Type exports |
| `packages/shared/lib/utils/analysis-workflow.ts` (188 lines) | runQuickScan, runDeepAnalysis |
| `packages/shared/lib/utils/unshafted-browser.ts` (174 lines) | Tab readability, page extraction |
| `packages/storage/lib/impl/unshafted-settings-storage.ts` (22 lines) | Settings storage |
| `packages/storage/lib/impl/unshafted-analysis-storage.ts` | Current analysis + pending action storage |
| `packages/storage/lib/impl/unshafted-history-storage.ts` | History storage |
| `packages/storage/lib/impl/unshafted-usage-storage.ts` | Usage counter storage |
| `README.md` (238 lines) | Project documentation (out of date) |

---

## Important Constraints

- **Ask -> Explain -> Approve -> Implement workflow.** Present the plan for each task, get approval, then execute.
- **No Co-Authored-By in commits.** Write holistic commit messages about the why, not the what.
- **Keep the existing design language.** Warm stone/amber palette, rounded cards with backdrop blur, clean typography. Do not redesign — simplify.
- **Do not touch AnalysisWorkspace or ResultCards** beyond removing the LockedTeaser section (if approved). The analysis flow works.
- **Do not delete infrastructure packages** (env, hmr, vite-config, tsconfig). They're scaffold boilerplate but the build depends on them.
- **Run `pnpm type-check` and `pnpm build` after each task** to verify nothing breaks.

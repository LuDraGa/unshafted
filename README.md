# Unshafted

Unshafted is a Chrome extension MVP that reads contracts, licenses, and terms from the user's side of the table. It runs a fast first-pass scan, lets the user confirm the role they care about, and then produces a sharper role-aware analysis with risk, missing protections, negotiation ideas, and plain-English guidance.

This repo builds the extension only. There is no backend, auth, billing, or web app in this MVP. Everything stays local except the OpenRouter API calls used for analysis.

## Working Doctrine

- Local first: the product accepts only local `.txt` files for uploads.
- Browser detection is only for UX: if the current tab is a PDF or browser viewer, the extension explains the limitation and points to external conversion.
- One primary action per screen: analyze the current page, upload a file, or read the result.
- Two-stage analysis: quick scan first, deep analysis second.
- Practical output over legal theater: explain the risk, the missing protection, and the leverage in plain language.
- Keep the surface small: no login, billing, sync, web app, or speculative feature branches in the MVP.

## Success Targets

- The user can tell what the document is, who the parties are, and which role they should analyze from.
- The user can upload a local `.txt` file and get a quick scan immediately.
- The user can confirm role and priorities and receive a structured deep analysis.
- Unsupported inputs fail clearly and tell the user the next move.
- Results stay concise, grounded, and useful enough to make the user act.

## Stack

- Chrome Extension Manifest V3
- React 19
- TypeScript
- Tailwind CSS
- Turborepo-based extension scaffold
- `zod` for schema validation
- `chrome.storage.local` for local settings, history, session state, and usage counters
- OpenRouter for quick and deep model calls

## MVP Features

- Analyze current webpage text through a content script extractor
- Upload local `.txt` files only
- Automatic quick scan:
  - probable document type
  - detected parties
  - likely role options
  - rough risk level
  - quick red flags
- Role-aware deep analysis:
  - plain-English summary
  - overall risk level
  - immediate worries
  - one-sided clauses
  - missing protections
  - deadlines, renewals, and termination traps
  - payment / liability / indemnity / IP / confidentiality / dispute concerns
  - negotiation ideas
  - suggested edits in plain English
  - questions to ask before signing
  - “could shaft you later”
  - “potential advantage for you”
  - clause reference notes
- Local history for the last few completed analyses
- Options page for OpenRouter API key, quick model, deep model, and connection testing
- Demo contract fixture for UI testing without starting from a real contract

## Project Structure

- [chrome-extension/manifest.ts](/Users/abhiroopprasad/code/side-projects/Unshafted/chrome-extension/manifest.ts): MV3 manifest source
- [chrome-extension/src/background/index.ts](/Users/abhiroopprasad/code/side-projects/Unshafted/chrome-extension/src/background/index.ts): service worker startup and usage sync
- [pages/popup/src/Popup.tsx](/Users/abhiroopprasad/code/side-projects/Unshafted/pages/popup/src/Popup.tsx): compact launcher UI
- [pages/side-panel/src/SidePanel.tsx](/Users/abhiroopprasad/code/side-projects/Unshafted/pages/side-panel/src/SidePanel.tsx): main product surface
- [pages/options/src/Options.tsx](/Users/abhiroopprasad/code/side-projects/Unshafted/pages/options/src/Options.tsx): local settings and connection test
- [pages/content/src/matches/all/index.ts](/Users/abhiroopprasad/code/side-projects/Unshafted/pages/content/src/matches/all/index.ts): current-page text extraction
- [pages/side-panel/src/lib/analysis-workflow.ts](/Users/abhiroopprasad/code/side-projects/Unshafted/pages/side-panel/src/lib/analysis-workflow.ts): extension-side orchestration for quick and deep analysis
- [packages/unshafted-core/lib](/Users/abhiroopprasad/code/side-projects/Unshafted/packages/unshafted-core/lib): reusable prompts, schemas, OpenRouter client, fixtures, and helpers intended to be portable to the future web app
- [packages/storage/lib/impl](/Users/abhiroopprasad/code/side-projects/Unshafted/packages/storage/lib/impl): local settings, history, usage, and session stores

## OpenRouter Setup

The extension expects a user-supplied OpenRouter API key.

1. Create or use an OpenRouter account.
2. Generate an API key.
3. Load the extension in Chrome.
4. Open `Options`.
5. Paste the API key and save.
6. Optionally adjust the quick and deep model IDs.

For local seeded defaults in this scaffold, use:

```bash
CEB_OPENROUTER_API_KEY=your_key_here
```

Recommended defaults in this repo:

- Quick model: `google/gemma-4-26b-a4b-it:free`
- Deep model: `stepfun/step-3.5-flash:free`
- Temperature: `0.2`

The options page also includes a `Test connection` action.

## Install and Run

### Prerequisites

- Node `>=22.15.1`
- `pnpm` `>=10`

### Install

```bash
pnpm install
```

### Start development build

```bash
pnpm dev
```

### Production build

```bash
pnpm build
```

### Load unpacked in Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the repo's `dist` directory

## How to Use

### Analyze the current page

1. Open a page containing terms, a contract, a policy, or a license.
2. Click the Unshafted extension icon.
3. Click `Analyze this page`.
4. The popup routes you into the side panel and the quick scan runs automatically.
5. Confirm the role and priorities.
6. Run the detailed analysis.

### Upload a contract file

1. Open the extension.
2. Click `Upload .txt` from the popup or side panel.
3. Choose a local `.txt` file.
4. The quick scan runs automatically.
5. Confirm role and priorities, then run the detailed analysis.

### Reopen local history

Completed analyses are cached in `chrome.storage.local`. Open the side panel and use the `Recent history` list to reopen prior results.

## Prompts and Output Schema

The reusable prompt and schema layer lives in [packages/unshafted-core/lib/prompts.ts](/Users/abhiroopprasad/code/side-projects/Unshafted/packages/unshafted-core/lib/prompts.ts) and [packages/unshafted-core/lib/schemas.ts](/Users/abhiroopprasad/code/side-projects/Unshafted/packages/unshafted-core/lib/schemas.ts).

Highlights:

- Quick scan prompt:
  - classify document type
  - detect parties and likely user roles
  - flag obvious asymmetry and risk
- Deep analysis prompt:
  - reason from the text only
  - avoid hallucinated citations
  - separate explicit text from inference
  - focus on obligations, traps, lock-in, missing protections, and leverage
- Internal responses are JSON and validated with `zod`

## Fixtures and Tests

Sample fixture data is included for development and testing:

- [packages/unshafted-core/lib/fixtures/sample-contract.ts](/Users/abhiroopprasad/code/side-projects/Unshafted/packages/unshafted-core/lib/fixtures/sample-contract.ts)

Basic core tests:

```bash
pnpm -F @extension/unshafted-core test
```

## Verification Checklist

### Automated checks

```bash
pnpm type-check
pnpm build
pnpm -F @extension/unshafted-core test
```

### Manual checks

- Load the unpacked `dist` directory in Chrome.
- Test `Analyze this page` on a normal HTML terms page.
- Test a PDF tab and confirm it explains that only local `.txt` uploads are supported.
- Upload a local `.txt` file and confirm the side panel opens with a quick scan.
- Open `Options` and run `Test connection`.
- If behavior looks wrong, inspect the popup, side panel, or background service worker through `chrome://extensions`.

## Known Limitations

- No PDF parsing
- No DOCX parsing
- No OCR or image support
- No `.md` upload support
- No login, billing, or sync
- Long documents may be analyzed from balanced excerpts instead of the full text
- Current-page extraction is heuristic and can still be noisy on some websites
- Local history stores the analysis output and source metadata, not the full raw contract text

## Architecture Notes

The repo is intentionally kept small now:

- `chrome-extension/` holds the manifest and background worker
- `pages/` only contains the four live entrypoints: `popup`, `options`, `side-panel`, and `content`
- `packages/unshafted-core` contains the reusable analysis logic that a future web app can lift directly
- `packages/storage`, `packages/shared`, and `packages/ui` are thin extension helpers, not a generic component platform

The remaining split exists only where it materially helps reuse:

- `@extension/unshafted-core` contains prompts, schemas, parsing, fixtures, and the OpenRouter client
- extension entrypoints contain Chrome-specific UX and orchestration
- `@extension/storage` isolates the local persistence layer so it can later be swapped or mirrored server-side

This keeps the future migration path straightforward:

1. move the shared core into the web app workspace
2. replace `chrome.storage.local` with backend-backed persistence
3. keep the prompt and schema contract intact across extension and web surfaces

## Disclaimer

Unshafted is informational only and not legal advice. For critical or high-stakes matters, consult a qualified lawyer.

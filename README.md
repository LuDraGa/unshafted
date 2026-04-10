# Unshafted

Unshafted is a Chrome extension MVP that reads contracts, licenses, and terms from the user's side of the table. It runs a fast first-pass scan, lets the user confirm the role they care about, and then produces a sharper role-aware analysis with risk, missing protections, negotiation ideas, and plain-English guidance.

This repo builds the extension only. There is no backend, auth, billing, or web app in this MVP. Everything stays local except the API calls used for analysis.

## Working Doctrine

- Local first: the product accepts only local `.txt` files for uploads.
- One primary action: upload a file, scan it, analyze it.
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
- OpenRouter / OpenAI for quick and deep model calls

## MVP Features

- Upload local `.txt` files
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
  - "could shaft you later"
  - "potential advantage for you"
  - clause reference notes
- Local history for the last few completed analyses
- Options page for API key, provider toggle (OpenRouter / OpenAI), model selection, and connection testing
- Demo contract fixture for UI testing without starting from a real contract

## Project Structure

- `chrome-extension/manifest.ts` — MV3 manifest source
- `chrome-extension/src/background/index.ts` — service worker startup and usage sync
- `pages/popup/src/Popup.tsx` — full product surface: upload, analysis workspace, and results
- `pages/popup/src/components/AnalysisWorkspace.tsx` — analysis workspace UI (quick scan, role selection, deep analysis, results)
- `pages/popup/src/components/ResultCards.tsx` — deep analysis result rendering
- `pages/options/src/Options.tsx` — settings page (provider, API key, model config, connection test)
- `pages/content/src/matches/all/index.ts` — content script for page text extraction
- `packages/shared/lib/utils/analysis-workflow.ts` — orchestration for quick scan and deep analysis
- `packages/unshafted-core/lib/` — reusable prompts, schemas, OpenRouter client, fixtures, and helpers
- `packages/storage/lib/impl/` — local settings, history, usage, and session stores

## OpenRouter Setup

The extension supports OpenRouter and OpenAI as providers. Set your preferred provider and API key in the Options page.

1. Create or use an OpenRouter (or OpenAI) account.
2. Generate an API key.
3. Load the extension in Chrome.
4. Open Options.
5. Select your provider, paste the API key, and save.
6. Optionally open Advanced to adjust model IDs.

For local seeded defaults in this scaffold, use:

```bash
CEB_OPENROUTER_API_KEY=your_key_here
```

Recommended defaults:

- Quick model: `google/gemma-4-26b-a4b-it:free`
- Deep model: `stepfun/step-3.5-flash:free`
- Temperature: `0.2`

The Options page includes a `Test connection` action.

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

1. Click the Unshafted extension icon to open the popup.
2. Click `Upload your contract` and choose a local `.txt` file.
3. The quick scan runs automatically — review document type, parties, and risk flags.
4. Confirm your role and priority topics.
5. Click `Run detailed analysis` for the full breakdown.
6. Use `Start fresh` to clear and upload another contract.

## Prompts and Output Schema

The reusable prompt and schema layer lives in `packages/unshafted-core/lib/prompts.ts` and `packages/unshafted-core/lib/schemas.ts`.

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

- `packages/unshafted-core/lib/fixtures/sample-contract.ts`

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
- Click the extension icon — should show the upload launcher.
- Upload a local `.txt` file — quick scan should run automatically.
- Confirm role and priorities, then run the detailed analysis.
- Open Options and run `Test connection`.
- If behavior looks wrong, inspect the popup or background service worker through `chrome://extensions`.

## Known Limitations

- No PDF parsing
- No DOCX parsing
- No OCR or image support
- No `.md` upload support
- No login, billing, or sync
- Long documents may be analyzed from balanced excerpts instead of the full text
- Local history stores the analysis output and source metadata, not the full raw contract text

## Architecture Notes

The repo is intentionally kept small:

- `chrome-extension/` holds the manifest and background worker
- `pages/` contains the three live entrypoints: `popup`, `options`, and `content`
- The popup is the full product surface — upload, analysis workspace, and results all render inline in the popup
- `packages/unshafted-core` contains the reusable analysis logic that a future web app can lift directly
- `packages/storage`, `packages/shared`, and `packages/ui` are thin extension helpers, not a generic component platform

The remaining split exists only where it materially helps reuse:

- `@extension/unshafted-core` contains prompts, schemas, parsing, fixtures, and the OpenRouter client
- Extension entrypoints contain Chrome-specific UX and orchestration
- `@extension/storage` isolates the local persistence layer so it can later be swapped or mirrored server-side

This keeps the future migration path straightforward:

1. Move the shared core into the web app workspace
2. Replace `chrome.storage.local` with backend-backed persistence
3. Keep the prompt and schema contract intact across extension and web surfaces

## Disclaimer

Unshafted is informational only and not legal advice. For critical or high-stakes matters, consult a qualified lawyer.

# Unshafted

**Reads contracts from your side of the table.**

A Chrome extension that uses AI to analyze contracts, surface risks, and help you understand what you're signing — before you sign it. Bring your own LLM API key, upload a contract, and get instant risk flags followed by deep, section-by-section analysis.

## Features

- **PDF & TXT upload** with client-side text extraction before contract text is sent to your chosen AI provider
- **Quick scan** — instant risk flags, party identification, key obligations, and a rough risk level in seconds
- **Deep analysis** — role-aware review with a decision summary, top risks, negotiation asks, evidence, and secondary details
- **Google Sign-In** via Supabase auth with persistent sessions across popup opens
- **Optional Google Drive backup** — signed-in users can back up report JSON and original uploaded source files to a dedicated "Unshafted" folder in their Drive
- **BYOK LLM** — works with OpenRouter (default) or OpenAI. You provide the API key; contract text is sent directly to the provider you choose
- **Anonymous access** — 3 free quick scans per day without signing in. Sign in for unlimited quick scans and deep analysis
- **Decision-first UI** — signing posture, top risks, top asks, risk badges, coverage indicators, and secondary detail sections

## Supported Formats

| Format | Status | Notes |
|--------|--------|-------|
| PDF (text-based) | Supported | Client-side parsing via pdf.js with structure-aware extraction (headings, bold, indentation) |
| TXT / plain text | Supported | Direct text ingestion |
| Scanned / image-only PDF | Not supported | No OCR — pdf.js only extracts embedded text |
| DOCX | Not yet supported | Planned |

### PDF Extraction Details

The extension uses `pdfjs-dist` to extract text client-side with structural heuristics:
- Font size differences map to heading hierarchy (`##`, `###`)
- Font name changes on short lines detect bold/labels (`**text**`)
- X-position offsets preserve indentation
- Y-gaps detect paragraph breaks

**Known limitations:** Table data comes through as flat text (row/column structure is lost). Font name metadata is often generic, so bold detection is heuristic. Some PDFs with unusual layouts may not format cleanly.

## Architecture

Chrome MV3 extension built as a pnpm monorepo with Turborepo orchestration.

```
Unshafted/
  chrome-extension/     # MV3 manifest, service worker, public assets
  pages/
    popup/              # Main UI — upload, scan results, deep analysis
    content/            # Dormant content-script bundle; upload-first v1 does not expose page analysis
    options/            # Settings page (API keys, model selection)
  packages/
    unshafted-core/     # Analysis engine — schemas, prompts, PDF parsing, document processing
    supabase/           # Auth (Google OAuth), Drive API helpers, sync layer
    storage/            # chrome.storage wrappers with live-update React hooks
    shared/             # Analysis workflow orchestration, LLM API calls
    ui/                 # Shared React components
    env/                # Environment variable injection (build-time)
    hmr/                # Hot module reload for extension dev
    vite-config/        # Shared Vite configuration
    tsconfig/           # Shared TypeScript configs
  supabase/
    migrations/         # Versioned SQL — source of truth for database schema
  execution-docs/       # Implementation plans and design decisions
```

### How Analysis Works

1. **Upload** — User picks a PDF or TXT file. Text is extracted client-side and normalized.
2. **Quick scan** — Text excerpt (up to ~5k tokens) is sent to the LLM with a structured prompt. Response is Zod-validated into typed results (risk level, flags, parties, obligations).
3. **Deep analysis** — Signed-in users select their role and priority topics. A larger excerpt (up to ~10k tokens) goes through a structured prompt focused on top risks, negotiation asks, evidence, and secondary details.
4. **Optional Drive backup** — If the signed-in user enables Drive backup, new scans save the original uploaded PDF/TXT source file plus quick-scan and deep-analysis JSON reports to the user's Google Drive. Content hash prevents duplicates. Backing up an already-visible local report requires confirmation and may only sync report JSON if the source file was not uploaded during the original scan.

LLM calls happen from the **service worker**, not the popup — so closing the popup doesn't kill in-flight analysis.

### Storage Model

- **`chrome.storage.session`:** Current analysis document text and in-progress scan state. This is cleared with the browser session and is not persisted as long-term local history.
- **`chrome.storage.local`:** Provider settings, API keys, local report history, usage counters, Supabase auth session data, Google Drive access token/cache, onboarding state, and the cached Drive backup preference.
- **Supabase:** Google auth profile only: email, display name, avatar URL, and the profile-backed Drive backup preference. Contract text and analysis results are not stored in Supabase.
- **Google Drive:** Only for signed-in users with Drive backup enabled. New backed-up scans store source files plus report JSON in the user's own Drive; Drive history refresh restores local history from report JSON.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict) |
| UI | React 19, Tailwind CSS |
| Build | Vite, Turborepo, pnpm |
| Schemas | Zod (runtime validation of LLM output) |
| PDF | pdfjs-dist (client-side, no worker) |
| Auth | Supabase (Google OAuth via `chrome.identity.launchWebAuthFlow`) |
| Storage | Google Drive API (REST, no SDK), chrome.storage.local, chrome.storage.session |
| LLM | OpenRouter or OpenAI (BYOK) |
| Extension | Chrome Manifest V3 |

## Getting Started

### Prerequisites

- Node.js >= 22.15.1
- pnpm 10.x
- A Google Cloud project with OAuth 2.0 credentials (Web Application type)
- A Supabase project with Google auth provider enabled

### Environment Setup

Copy the `.env.example` or create `.env` in the project root:

```env
CEB_SUPABASE_URL=https://your-project.supabase.co
CEB_SUPABASE_ANON_KEY=your-anon-key
CEB_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### Database Setup

Run the SQL files in `supabase/migrations/` against your Supabase SQL editor, in order:

1. `001_schema_and_profiles.sql` — Creates the `unshafted` schema, profiles table, RLS policies, and auto-profile trigger
2. `002_profile_drive_backup_preference.sql` — Adds `drive_backup_enabled` to profiles and grants authenticated users access to their own preference

See [Database](#database) for more detail.

### Install & Run

Use the pinned Node version:

```bash
nvm use
corepack enable
corepack prepare pnpm@10.11.0 --activate
```

```bash
pnpm install
pnpm dev          # builds + watches all packages, outputs to dist/
```

Load the unpacked extension from `dist/` in `chrome://extensions` (Developer mode).

### Build for Production

```bash
pnpm build        # clean build → dist/ → zipped to unshafted-extension.zip
```

### Standard Verification

Run these before release or meaningful commits:

```bash
pnpm lint
pnpm type-check
pnpm build
pnpm --filter @extension/unshafted-core test
git diff --check
rg -n "CEB_OPENROUTER_API_KEY|CEB_OPENAI_API_KEY|OPENROUTER_API_KEY|OPENAI_API_KEY" dist -g '!**/*.map'
rg -n "sk-proj-[A-Za-z0-9_-]{20,}|sk-or-v1-[A-Za-z0-9_-]{20,}" dist -g '!**/*.map'
```

The two `rg` bundle scans should return no matches.

## Database

Supabase with a custom `unshafted` schema. Row-Level Security is enabled on all tables.

### Current Schema

**`unshafted.profiles`** — Created automatically on Google sign-up via a trigger on `auth.users`.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | References `auth.users(id)` |
| email | text | From Google profile |
| display_name | text | From Google profile |
| avatar_url | text | Google avatar URL |
| drive_backup_enabled | boolean | Profile-backed preference for Drive backup; defaults to `true` for signed-in users |
| created_at | timestamptz | Auto-set |
| updated_at | timestamptz | Auto-set |

RLS policies: users can only read and update their own profile and Drive backup preference.

### Migration Management

SQL migration files live in `supabase/migrations/` and are the source of truth for the database schema. During early development, these were run manually via the Supabase SQL editor as we scoped the schema iteratively. The migration files are now maintained in the repo for reproducibility and onboarding.

**Current approach:** Manual execution against Supabase SQL editor, ordered by filename prefix. No migration runner or Supabase CLI is used yet. Introduce one before adding schema-heavy features such as credits, billing, teams, or shared reports.

## Design Decisions

### Client-Side PDF Parsing
No backend exists yet. `pdfjs-dist` handles the vast majority of text-based contracts (which is what most contracts are). Scanned/image-only PDFs are explicitly unsupported — the extension detects them and shows a clear error. The future web app will use server-side libraries (Marker, PyMuPDF) for full structural fidelity including table extraction.

### `drive.file` Scope (Not `drive.appdata`)
`drive.appdata` has a hard 10MB limit and files are invisible to the user. `drive.file` has no cap, files count against regular Drive quota (15GB+ free), and users can see and manage their analysis files directly in Drive. Risk of user-editing is mitigated by Zod validation on read.

### Chrome Storage Adapter for Supabase
Supabase expects `localStorage`, which doesn't exist in Chrome extension service workers. A custom adapter wraps `chrome.storage.local` with the same `getItem`/`setItem`/`removeItem` interface, enabling persistent auth sessions that survive popup close and extension restart.

### Best-Effort Drive Sync
Drive operations are best-effort. The extension always works locally and local storage remains the working copy. Reports show `Drive backup requested` while sync is pending and `Drive backed up` only after successful report JSON writes. New backed-up scans also upload the original source file before analysis. Failures do not block analysis. Content-hash deduplication prevents file accumulation on reruns.

### No Migration Runner (Yet)
During early development, we ran SQL directly in the Supabase SQL editor while iterating on the schema. Migration files are now tracked in `supabase/migrations/` as the source of truth, but are still applied manually. A proper migration tool should be introduced before the schema expands beyond auth/profile support.

### OAuth: Web Application Client Type
Chrome extensions using `chrome.identity.launchWebAuthFlow` need a **Web Application** OAuth client (not "Chrome App"). The redirect URI is `https://<extension-id>.chromiumapp.org`. A pinned `key` in the manifest keeps the extension ID stable across dev reinstalls.

## Roadmap

Historical implementation plans live in [`execution-docs/`](execution-docs/). The current extension is upload-first, with guided BYOK setup, decision-first results, recent reports, and optional Drive backup already implemented.

### Near-Term Cleanup
- Keep public docs, privacy-policy text, and Chrome Web Store metadata aligned with the current Drive/auth data flow.
- Improve local dev/CI onboarding and migration workflow clarity as the system grows.
- Keep current-page analysis dormant unless it returns as a first-class feature with matching permissions and CWS disclosures.

### Future
- **Tiered subscriptions** — Free, Pro, and team tiers with differentiated analysis depth and volume
- **Ad-based credits** — Free-tier users earn credits through opt-in ad engagement
- **Web app** — Full web experience with enhanced PDF-to-Markdown pipeline (proper table extraction, heading hierarchy), longer analysis runs, downloadable reports
- **Custom analysis templates** — Pre-built profiles for SaaS agreements, employment contracts, NDAs, leases
- **AI-generated edit suggestions** — Move from "here's what's wrong" to "here's what to say instead"
- **Negotiation playbooks** — Context on whether a clause is standard or unusual, with leverage points
- **Jurisdiction-aware analysis** — Flag clauses that behave differently across states/countries
- **Batch analysis** — Upload and analyze multiple contracts at once
- **Multi-document comparison** — Side-by-side version diffs with risk context
- **Current-page analysis** — Possible future feature, but intentionally not positioned as part of upload-first v1.

### Areas of Growth
- **DOCX support** — Currently unsupported; planned for a future release
- **OCR for scanned PDFs** — Low priority (most contracts are digitally created), but would expand coverage
- **Table extraction fidelity** — Current PDF parsing loses table row/column structure; the web app pipeline will address this
- **Offline / degraded mode** — Extension works locally without Drive, but no explicit offline-first UX yet

## Known Limitations

- **Scanned / image-only PDFs** are not supported (no OCR). The extension detects this and shows a clear error.
- **PDF table data** comes through as flat text — row/column structure is lost.
- **Font-based heuristics** for heading/bold detection are best-effort. Some PDFs with unusual layouts may not format cleanly.
- **LLM output quality** depends on the model and API key you provide. Free-tier OpenRouter models may produce lower quality results than paid models.
- **Not legal advice.** This is guidance to help you understand agreements, not a substitute for qualified legal counsel.

## License

MIT

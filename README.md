# Unshafted

**Reads contracts from your side of the table.**

A Chrome extension that uses AI to analyze contracts, surface risks, and help you understand what you're signing — before you sign it. Bring your own LLM API key, upload a contract, and get instant risk flags followed by deep, section-by-section analysis.

## Features

- **PDF & TXT upload** with client-side text extraction (no files leave your browser)
- **Quick scan** — instant risk flags, party identification, key obligations, and a rough risk level in seconds
- **Deep analysis** — multi-pass, prioritized analysis covering liability, payment, termination, IP, confidentiality, and more across 10 concern categories
- **Google Sign-In** via Supabase auth with persistent sessions across popup opens
- **Google Drive sync** — analysis results saved to a dedicated "Unshafted" folder in your Drive, with content-hash deduplication and cross-device hydration
- **BYOK LLM** — works with OpenRouter (default) or OpenAI. You provide the API key; no data touches our servers
- **Anonymous access** — 3 free quick scans per day without signing in. Sign in for unlimited quick scans and deep analysis
- **Verdict-first UI** — accordion-based progressive disclosure with risk badges, count indicators, and a compact verdict strip

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
    content/            # Content script (page text extraction)
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
3. **Deep analysis** — User selects their role and priority topics. A larger excerpt (up to ~10k tokens) goes through a multi-pass prompt covering 10 concern categories. Results are validated and rendered as expandable accordion sections.
4. **Drive sync** — On completion, results are saved as JSON to the user's Google Drive (fire-and-forget, silent on failure). Content hash prevents duplicates.

LLM calls happen from the **service worker**, not the popup — so closing the popup doesn't kill in-flight analysis.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript (strict) |
| UI | React 19, Tailwind CSS |
| Build | Vite, Turborepo, pnpm |
| Schemas | Zod (runtime validation of LLM output) |
| PDF | pdfjs-dist (client-side, no worker) |
| Auth | Supabase (Google OAuth via `chrome.identity.launchWebAuthFlow`) |
| Storage | Google Drive API (REST, no SDK), chrome.storage.local |
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
CEB_OPENROUTER_API_KEY=your-openrouter-key   # optional — user can set in extension options
```

### Database Setup

Run the SQL files in `supabase/migrations/` against your Supabase SQL editor, in order:

1. `001_schema_and_profiles.sql` — Creates the `unshafted` schema, profiles table, RLS policies, and auto-profile trigger

See [Database](#database) for more detail.

### Install & Run

```bash
pnpm install
pnpm dev          # builds + watches all packages, outputs to dist/
```

Load the unpacked extension from `dist/` in `chrome://extensions` (Developer mode).

### Build for Production

```bash
pnpm build        # clean build → dist/ → zipped to unshafted-extension.zip
```

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
| created_at | timestamptz | Auto-set |
| updated_at | timestamptz | Auto-set |

RLS policies: users can only read and update their own profile.

### Migration Management

SQL migration files live in `supabase/migrations/` and are the source of truth for the database schema. During early development, these were run manually via the Supabase SQL editor as we scoped the schema iteratively. The migration files are now maintained in the repo for reproducibility and onboarding.

**Current approach:** Manual execution against Supabase SQL editor, ordered by filename prefix. No migration runner or Supabase CLI is used yet — this is a recognized gap that will be addressed as the schema grows with credits and billing tables.

## Design Decisions

### Client-Side PDF Parsing
No backend exists yet. `pdfjs-dist` handles the vast majority of text-based contracts (which is what most contracts are). Scanned/image-only PDFs are explicitly unsupported — the extension detects them and shows a clear error. The future web app will use server-side libraries (Marker, PyMuPDF) for full structural fidelity including table extraction.

### `drive.file` Scope (Not `drive.appdata`)
`drive.appdata` has a hard 10MB limit and files are invisible to the user. `drive.file` has no cap, files count against regular Drive quota (15GB+ free), and users can see and manage their analysis files directly in Drive. Risk of user-editing is mitigated by Zod validation on read.

### Chrome Storage Adapter for Supabase
Supabase expects `localStorage`, which doesn't exist in Chrome extension service workers. A custom adapter wraps `chrome.storage.local` with the same `getItem`/`setItem`/`removeItem` interface, enabling persistent auth sessions that survive popup close and extension restart.

### Fire-and-Forget Drive Sync
Drive operations are best-effort. The extension always works locally. Drive failures are caught silently — no error toasts, no retries blocking the UI. Local storage is the working copy; Drive is the durable backup. Content-hash deduplication prevents file accumulation on reruns.

### No Migration Runner (Yet)
During early development, we ran SQL directly in the Supabase SQL editor while iterating on the schema. Migration files are now tracked in `supabase/migrations/` as the source of truth, but are still applied manually. A proper migration tool will be introduced alongside the credits/billing schema in Phase 3.

### OAuth: Web Application Client Type
Chrome extensions using `chrome.identity.launchWebAuthFlow` need a **Web Application** OAuth client (not "Chrome App"). The redirect URI is `https://<extension-id>.chromiumapp.org`. A pinned `key` in the manifest keeps the extension ID stable across dev reinstalls.

## Roadmap

### In Progress — Phase 2: Google Drive Storage
- Document name sanitization and content hashing at upload
- Quick scan and deep analysis results saved to Drive as JSON
- Content-hash dedup (same document = same file, updated in place)
- Cross-device history hydration from Drive on new installs
- Silent token refresh for uninterrupted Drive access

### Next — Phase 3: Billing & Credits
- Credit system for deep analysis usage
- Daily free credit allotment
- Server-side LLM calls (move API keys off-client)
- Credit purchase flow

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

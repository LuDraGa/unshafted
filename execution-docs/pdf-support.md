# Execution Doc: PDF Upload Support

**Status:** Complete (v0.6.0)
**Date:** 2026-04-13
**Scope:** Accept `.pdf` files in the upload flow, extract text client-side using `pdf.js` with structure-aware formatting, feed extracted text into the existing analysis pipeline.

---

## What Was Built

- **Client-side PDF parsing** via `pdfjs-dist` legacy build with explicit worker asset for Chrome MV3 compatibility
- **Structure-aware text extraction** using font size, font name, x-position, and y-gap signals to preserve:
  - Heading hierarchy (font size → `##` / `###`)
  - Bold/label detection (alternate font on short lines → `**text**`)
  - Indentation levels (x-offset from detected left margin → leading spaces)
  - Paragraph breaks (y-gap larger than typical line spacing → blank lines)
- **Edge case handling:** password-protected PDFs, corrupted files, scanned/image-only detection, long document warnings
- **Quick scan token limit** set to ~5k tokens (20,000 chars) appropriate for smaller extension models

### Known Limitations (Extension)
- Table data comes through as flat text — row/column structure is lost
- Font name metadata is often generic (`g_d0_f1`), so bold detection relies on font name *differences* rather than explicit bold flags
- Scanned/image-only PDFs are not supported (no OCR)
- Structure heuristics are best-effort — some PDFs with unusual layouts may not format cleanly

### Future: Website PDF→MD Pipeline
Heavy conversion libraries (Marker, PyMuPDF, pdfplumber) are not feasible in a browser extension but will power the web app's PDF processing. This gives the website a core advantage: full structural fidelity including proper table extraction. See `execution-docs/website-vs-extension.md`.

---

## Why This Matters

The extension currently only accepts `.txt` files. Most real contracts arrive as PDFs. This is the single biggest friction barrier to actual usage. Without PDF support, users must manually convert PDF → Markdown → TXT before they can even start — which almost nobody will do.

## Goal

User clicks "Upload your contract", picks a `.pdf` file, the extension extracts the text client-side, and feeds it into the same `IngestedDocument` → quick scan → deep analysis pipeline. No backend needed. No new pages. No new UI beyond accepting the file type.

---

## Architecture Decision: `pdf.js` client-side

Use Mozilla's `pdfjs-dist` package to parse PDFs entirely in the browser/extension context. This is the standard approach — it's what Chrome's built-in PDF viewer uses under the hood.

**Why not a backend PDF service:** No backend exists yet. Adding one just for PDF parsing is premature. `pdf.js` handles the vast majority of text-based PDFs (which is what contracts are).

**Known limitation:** Scanned/image-only PDFs won't yield text — `pdf.js` only extracts embedded text, not OCR. This is acceptable for MVP. The code should detect when extraction yields little/no text and show a clear error.

---

## Implementation Plan

### Step 1: Install `pdfjs-dist`

Add `pdfjs-dist` as a dependency of `@extension/unshafted-core` (since document parsing lives there and the core is meant to be portable to the future web app).

```bash
pnpm -F @extension/unshafted-core add pdfjs-dist
```

**Important — worker setup:** `pdf.js` needs a web worker for parsing. In a Chrome extension context (MV3), the worker file must be bundled and accessible. There are two approaches:

- **Option A (simpler):** Disable the worker and run parsing on the main thread. This works for typical contract PDFs (5-50 pages). Set `GlobalWorkerOptions.workerSrc` to empty string or use the `pdfjs-dist/legacy/build/pdf` entry which has a no-worker fallback.
- **Option B (robust):** Bundle the worker file into the extension's `dist/` and point `GlobalWorkerOptions.workerSrc` at it.

**Recommend Option A for now.** Contract PDFs are small enough. If performance becomes an issue with very large documents, upgrade to Option B later.

### Step 2: Create PDF text extraction utility

Create a new file: `packages/unshafted-core/lib/pdf.ts`

This module should export one function:

```ts
export const extractTextFromPdf = async (fileBuffer: ArrayBuffer): Promise<{
  text: string;
  pageCount: number;
  warnings: string[];
}>;
```

**What it does:**
1. Load the PDF using `pdfjs-dist`'s `getDocument({ data: fileBuffer })`.
2. Iterate over all pages.
3. For each page, call `page.getTextContent()`.
4. Concatenate the text items, preserving line breaks between items that have vertical gaps.
5. Return the full text, page count, and any warnings.

**Warnings to detect:**
- Page count is 0 → "This PDF has no pages."
- Extracted text length < 200 chars for a multi-page PDF → "This PDF appears to be scanned or image-based. Text extraction found very little content. Try converting it to text first."
- Very long PDF (> 80 pages) → "This is a long document. Analysis will use excerpts rather than the full text."

**Text assembly logic:**
- For each page, collect text items from `getTextContent()`.
- Items have `str` (the text) and `transform` (position matrix). Items on the same line (similar Y coordinate) should be joined with spaces. Items on different lines should be joined with newlines.
- Add a double newline (`\n\n`) between pages.
- The simplest working version: just concatenate all `item.str` values separated by spaces, with `\n\n` between pages. This is good enough for most text-based contracts. Refine later if layout fidelity matters.

### Step 3: Update `buildDocumentFromFile` in `document.ts`

Current code (lines 24-30):
```ts
export const buildDocumentFromFile = async (file: File): Promise<IngestedDocument> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'txt') {
    throw new Error(
      'Only local `.txt` files are supported. ...',
    );
  }
  const rawText = await file.text();
  // ...
```

**Change to:**
1. Accept both `.txt` and `.pdf` extensions.
2. For `.txt`: existing flow unchanged (read as text, normalize).
3. For `.pdf`: read as `ArrayBuffer` via `file.arrayBuffer()`, call `extractTextFromPdf`, use the returned text.
4. For anything else: throw an error saying "Only `.txt` and `.pdf` files are supported."

```ts
export const buildDocumentFromFile = async (file: File): Promise<IngestedDocument> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  let rawText: string;
  let extraWarnings: string[] = [];

  if (extension === 'txt') {
    rawText = await file.text();
  } else if (extension === 'pdf') {
    const buffer = await file.arrayBuffer();
    const result = await extractTextFromPdf(buffer);
    rawText = result.text;
    extraWarnings = result.warnings;
  } else {
    throw new Error('Only `.txt` and `.pdf` files are supported.');
  }

  const text = normalizeDocumentText(rawText);
  // ... rest of existing logic, merge extraWarnings into warnings array
```

### Step 4: Update the file input accept attribute

In `pages/popup/src/Popup.tsx`, line 50:

```tsx
// Before:
<input ref={fileInputRef} type="file" accept=".txt,text/plain" className="hidden" onChange={handleFileChosen} />

// After:
<input ref={fileInputRef} type="file" accept=".txt,.pdf,text/plain,application/pdf" className="hidden" onChange={handleFileChosen} />
```

### Step 5: Update the subtitle text

In `pages/popup/src/Popup.tsx`, line 59:

```tsx
// Before:
'Upload a `.txt` contract or agreement to review.'

// After:
'Upload a contract to review (.pdf or .txt).'
```

### Step 6: Update the upload button label

The button says "Upload your contract" which is already format-agnostic. No change needed.

### Step 7: Update quality assessment for PDF

The existing `quality` and `warnings` logic in `buildDocumentFromFile` (lines 39-53 of `document.ts`) works generically on text length. No change needed — it already handles short text and produces "thin" quality. The PDF-specific warnings from `extractTextFromPdf` just get merged in.

### Step 8: Export the new module

Add `export * from './pdf.js';` to `packages/unshafted-core/lib/index.ts`.

---

## Files to Modify

| File | Change |
|---|---|
| `packages/unshafted-core/package.json` | Add `pdfjs-dist` dependency |
| `packages/unshafted-core/lib/pdf.ts` | **New file** — PDF text extraction |
| `packages/unshafted-core/lib/index.ts` | Add export for `pdf.ts` |
| `packages/unshafted-core/lib/document.ts` | Update `buildDocumentFromFile` to accept `.pdf`, call `extractTextFromPdf` |
| `pages/popup/src/Popup.tsx` | Update `accept` attribute (line 50) and subtitle text (line 59) |

## Files NOT to Modify

- `schemas.ts` — `SourceKindSchema` already has `'file'` which covers both PDF and TXT uploads. No schema change needed.
- `AnalysisWorkspace.tsx` — receives an `IngestedDocument` regardless of source format. No change needed.
- `analysis-workflow.ts` — operates on `source.text` string. Format-agnostic. No change needed.
- `prompts.ts` — prompts receive prepared text. No change needed.
- `manifest.ts` — no new permissions needed for client-side PDF parsing.

---

## pdf.js Worker Setup Detail

For the `pdfjs-dist` worker in a Chrome extension MV3 context:

```ts
import * as pdfjsLib from 'pdfjs-dist';

// Disable worker — parse on main thread. Fine for contract-sized PDFs.
pdfjsLib.GlobalWorkerOptions.workerSrc = '';
```

If this doesn't work cleanly (some versions of `pdfjs-dist` require an explicit worker path or throw), the alternative is:

```ts
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
```

The `legacy` build includes an inline fake worker. Test both approaches — the build must compile without errors and the extension must load without CSP violations.

**CSP note:** MV3 extensions have a strict CSP. `pdf.js` should be fine since it doesn't use `eval()` or dynamic code, but if the worker approach causes CSP issues, the no-worker/legacy approach avoids them entirely.

---

## Edge Cases to Handle

1. **Encrypted/password-protected PDF** — `pdfjs-dist` throws when trying to open these. Catch the error and show: "This PDF is password-protected. Remove the password and try again, or paste the text into a `.txt` file."

2. **Scanned/image-only PDF** — `getTextContent()` returns empty or near-empty results. Detect via: if `pageCount > 0` but `text.length < 200`, warn: "This PDF appears to be scanned or image-only. Unshafted needs text-based PDFs. Try running OCR first or paste the text into a `.txt` file."

3. **Corrupted/invalid PDF** — `getDocument` throws. Catch and show: "This file could not be read as a PDF. It may be corrupted or not a valid PDF."

4. **Very large PDF (100+ pages)** — The text extraction will still work, but the resulting text will be truncated by `buildBalancedExcerpt` during analysis (existing behavior, `QUICK_SCAN_CHAR_LIMIT = 18_000`, `DEEP_ANALYSIS_CHAR_LIMIT = 42_000`). Add a warning: "This is a long document (N pages). Analysis will focus on key excerpts rather than the full text."

5. **PDF with forms/annotations** — `getTextContent` extracts rendered text, not form field values. This is fine for contracts. No special handling needed.

---

## Verification

```bash
pnpm type-check
pnpm build
pnpm -F @extension/unshafted-core test
```

Then manual testing:
- Upload a text-based contract PDF → should extract text, run quick scan, show results
- Upload a scanned/image PDF → should show clear error about image-only PDF
- Upload a password-protected PDF → should show password error
- Upload a `.txt` file → should still work exactly as before (regression check)
- Upload a `.docx` or `.jpg` → should show "Only `.txt` and `.pdf` files are supported"
- Upload a large (50+ page) PDF → should work but show truncation warning
- Check Chrome extension console for CSP violations after loading the built extension

---

## README / Known Limitations Update

After implementation, update:

**README.md:**
- Remove "No PDF parsing" from Known Limitations
- Update "Upload local `.txt` files" in MVP Features to "Upload local `.txt` or `.pdf` files"

**Known Limitations** should add:
- "PDF text extraction is client-side only — scanned or image-only PDFs are not supported (no OCR)"

---

## Important Constraints

- **Ask → Explain → Approve → Implement workflow.** Present the plan, get approval, then execute.
- **No Co-Authored-By in commits.** Write holistic commit messages about the why, not the what.
- **Keep changes minimal.** The only new file is `pdf.ts`. The only modified files are `document.ts`, `Popup.tsx`, `index.ts`, and `package.json`. Do not refactor surrounding code.
- **Run `pnpm type-check` and `pnpm build` after implementation** to verify nothing breaks.
- The `pdf.ts` module should be a clean, isolated utility. It should not import anything from `document.ts` — the dependency goes the other direction (`document.ts` imports from `pdf.ts`).

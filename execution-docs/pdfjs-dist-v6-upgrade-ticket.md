# pdfjs-dist 4.10.38 → 6.3.289 — vendored worker must be regenerated

**Status:** Ticket — open, not started
**Date raised:** 2026-09-08
**Owner:** @LuDraGa
**Parent:** `execution-docs/dependency-sweep-2026-09.md`
**Held out of:** dependabot PR #8, and the September dependency sweep
**Blocks:** nothing — but it must not be taken as a bare version bump

---

## The problem, in one sentence

`pages/popup/public/pdf.worker.min.mjs` is a **checked-in copy of the 4.10.38 worker**, and pdf.js
hard-fails when the API and worker versions differ — so bumping the library alone produces a build
that is green in CI and throws on every PDF a user opens.

## Why CI would not catch it

The worker is a static asset, not a module the bundler resolves. It sits in
`pages/popup/public/`, gets copied verbatim into `dist/popup/`, and is loaded at runtime by URL:

```ts
// pages/popup/src/Popup.tsx:47
configurePdfWorker(chrome.runtime.getURL('popup/pdf.worker.min.mjs'));
```

Meanwhile the library is imported normally:

```ts
// packages/unshafted-core/lib/pdf.ts:1
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
```

Bump the dependency and those two drift apart. `pnpm build` succeeds — the asset copies fine.
`pnpm type-check` succeeds — types come from the package, not the asset. The ZIP is the right shape
and the right size. Then pdf.js compares `apiVersion` against `workerVersion` at
`getDocument()` time and throws, and every upload fails.

This is the specific failure mode that makes it unsafe to hand to Dependabot: **every automated
signal we have says yes.** The only thing that says no is opening a PDF.

## What still works, and what changed

Checked against the published package layouts, not from memory:

- **`legacy/build/pdf.mjs` still exists in v6.** The import path does not need to change. Worth
  stating, because the v5 release notes read as though the legacy builds were on the way out.
- **v5 moved JPEG 2000 and ICC decoding into `.wasm`.** `pdfjs-dist@6.3.289` ships new `wasm/` and
  `iccs/` directories, and using those decoders requires setting the `wasmUrl` (and `iccUrl`) API
  options. Text extraction — all this codebase does — should not touch either path, but a PDF with
  JPEG 2000 imagery will now behave differently than under v4, and for a Chrome extension the wasm
  assets would also have to be shipped and allowed by CSP.

## The work

1. Bump `pdfjs-dist` to `^6.3.289` in `packages/unshafted-core/package.json`.
2. Regenerate the vendored worker from the *same* version, legacy build:
   `node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs` → `pages/popup/public/pdf.worker.min.mjs`.
   Confirm the version string inside the copied file matches the installed package.
3. Decide the wasm question explicitly: either confirm text extraction never reaches the JPEG
   2000/ICC path and document that, or ship `wasm/` and set `wasmUrl`.
4. **Smoke-test a real PDF end to end in the loaded extension.** Not a unit test — load the
   unpacked build, upload a PDF, confirm text comes out. This is the only check that would have
   caught the version mismatch.
5. Re-run the corpus tests in `packages/unshafted-core/test/` that touch document ingestion.

## Why not now

`release` is the tree in front of CWS review for v0.8.0. This change rewrites a 1.4 MB binary asset
inside the shipped package and alters PDF-parsing behaviour — exactly the kind of thing review
notices, and exactly the kind of thing that should not land while a submission is open.

## A standing hazard worth fixing separately

The vendored worker has no mechanism keeping it in step with the dependency. Nothing fails, warns,
or even notices when they diverge. Consider either a build step that copies the worker out of
`node_modules` at build time, or a check that compares the two version strings and fails the build.
Until one of those exists, every future `pdfjs-dist` bump carries this same silent trap.

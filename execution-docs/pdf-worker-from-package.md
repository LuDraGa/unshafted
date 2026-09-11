# The pdf.js worker comes out of the package now (#22)

**Worked:** 2026-09-08 · **Base:** `release` at `fce2180` · **Branch:** `fix/pdf-worker-from-package`
**Status:** complete.

#11 fixed the instance — a vendored worker that had fallen four majors behind `pdfjs-dist`. This
fixes the class, which #11 explicitly left open: nothing in the repo could notice the two drifting
apart, so the next unattended Dependabot bump would have reintroduced the same bug.

## What made it invisible

`pages/popup/public/pdf.worker.min.mjs` was a hand-copied 1.3 MB build artefact. Files in
`publicDir` are copied verbatim into `dist/popup/` and never resolved by the bundler, so there was
no step at which anything could compare it to the installed package.

That is not a gap in diligence, it is a gap in *mechanism*. #11 demonstrated it rather than assumed
it: with a mismatched worker in place, `pnpm type-check`, `pnpm lint`, `pnpm build`, the 32-entry
ZIP audit and the entire test suite all passed. Node's runner passes too, and always will — it falls
back to a fake worker and never performs the version handshake, so it is structurally incapable of
catching this. The failure surfaces only at `getDocument()` time, in a real browser, on a real
user's first PDF:

```
The API version "6.3.289" does not match the Worker version "4.10.38".
```

## What was done

**Option 1 from the ticket — copy at build time — because it removes the divergence by removing the
duplicate.** A `unshafted:pdf-worker-asset` plugin in `pages/popup/vite.config.mts` emits the worker
straight out of the installed package, and the tracked binary is gone from `public/`.

The resolution path is the part that carries the guarantee. `pdfjs-dist` is declared by
`@extension/unshafted-core`, not by the popup, and pnpm does not hoist it — so the popup cannot
resolve it directly at all. The plugin resolves *through* `@extension/unshafted-core`, which is the
same package that imports the API half at runtime. One install, both halves, no comparison needed
because there is nothing left to compare.

Option 2 (a version check that fails the build) was the ticket's cheap alternative. It is not
needed once there is only one copy — a check exists to detect divergence between two things, and
there is now one thing. What replaced it are three guards against the ways *this* shape can fail:

| Guard | Catches |
|---|---|
| `buildStart` refuses to run if `public/pdf.worker.min.mjs` exists | someone reintroducing the vendored copy, which would silently win over the emitted asset |
| API and worker must resolve to the same directory | a future `pdfjs-dist` splitting the two builds apart |
| `writeBundle` asserts the file reached `options.dir` | the emit silently not landing, which would ship a ZIP that cannot read PDFs |

The first was verified by putting a copy back: the build fails with a message naming the file and
the reason. The others are structural.

### The `legacy/` coupling

`lib/pdf.ts` imports `pdfjs-dist/legacy/build/pdf.mjs`, and the plugin hardcodes the matching
`legacy/build/` worker path. pdf.js will not run an API against a worker from a different build, so
those two strings are one decision in two files — exactly the shape of coupling that caused #22 in
the first place.

`packages/unshafted-core/test/pdf-worker.test.ts` pins it: three tests assert that `pdf.ts` still
imports the legacy build, that the API and worker resolve to a single install, and that no vendored
copy has reappeared in `public/`. A Node test cannot reproduce the handshake, but it can hold the
ground the build plugin stands on.

## The CWS question

The ticket flagged that this changes what is in the repo versus what is in the ZIP, and the ZIP is a
review surface. Checked, and it does not:

- `dist/popup/pdf.worker.min.mjs` is **byte-identical** to the file that was vendored —
  `a33cfe72…9b84e`, 1,317,034 bytes.
- The ZIP still holds **32 entries**, the same count the audit expects.
- No remote code is introduced. The worker is still bundled, still local, still the same bytes; only
  its provenance in the source tree changed.

So what CWS review receives is unchanged, and what #11 verified in a browser is exactly what this
build now produces. That is the basis for not re-running a browser check here — not an argument that
one is unnecessary in general. Anything that changes the pdf.js *version* still needs a real browser,
because the handshake is the only place a mismatch shows up.

## Incidental: the lint allowance was one file from its ceiling

Adding a ninth test file to `unshafted-core` turned `pnpm lint` red with
`Parsing error: Too many files (>8) have matched the default project` — typescript-eslint caps
`allowDefaultProject` at eight, and the suite was sitting exactly on it. A parse error rather than a
lint error, so it reads as a broken config rather than a full one.

Fixed properly rather than worked around: `packages/unshafted-core/test/` has its own
`tsconfig.json` now, so the suite is a real project and consumes none of the allowance. It needed
`allowImportingTsExtensions` because the tests import `../index.mts` by its real extension under
`tsx` — with that, **the suite type-checks clean**, which it had never been asked to do before.

`packages/storage/test` still uses the allowance. It has one file, so there is room, but the same
treatment is worth applying before anyone adds an eighth. Raised as a note in #15's work rather than
fixed blind here.

## Verification

`pnpm lint` (0 errors, 19/19), `pnpm type-check` (12/12), `npx prettier --check`,
`pnpm --filter @extension/unshafted-core test` (**80 tests**, up from 77), and a full `pnpm build`
producing the byte-identical ZIP described above.

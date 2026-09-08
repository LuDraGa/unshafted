# `pnpm build` ships the previous build's dead bundles

**Status:** Ticket — open, not started. **Pre-existing**, found during the September sweep.
**Date raised:** 2026-09-08
**Owner:** @LuDraGa
**Parent:** `execution-docs/dependency-sweep-2026-09.md`
**Relevance:** Chrome Web Store review reads the package contents

---

## The problem, in one sentence

`pnpm build` zips into the **existing** `unshafted-extension.zip` instead of replacing it, so every
rebuild adds the new content-hashed bundles without removing the old ones — and the package ships
both.

## The mechanism

```json
"clean:bundle": "rimraf dist && turbo clean:bundle",
"build": "pnpm set-global-env && pnpm clean:bundle && turbo build && cd dist && zip -r ../unshafted-extension.zip . -x '*.map' && cd .."
```

`clean:bundle` removes `dist/`. Nothing removes the ZIP. `zip -r` on an existing archive is an
*update* — it replaces entries whose paths match and appends the ones that do not. Stable paths
(`manifest.json`, `background.js`, `popup/index.html`) get replaced correctly. Vite's asset
filenames carry a content hash, so a changed bundle lands at a **new path** and the old one is never
touched.

## Measured, not theorised

Building this sweep on top of the existing 0.8.0 ZIP took it from 32 entries to 38. The six new
bundles were added; the six from the previous build stayed:

```
popup/assets/index-Q8pSysn7.js      1,001,495   ← stale, from the previous build
popup/assets/index-BEK3v_cn.js      1,041,637   ← current
options/assets/index-Dm9vkApK.js      296,575   ← stale
options/assets/index-DBagVG7w.js      306,304   ← current
side-panel/assets/index-CsMTT3WR.js   296,249   ← stale
side-panel/assets/index-AutB1Qaz.js   303,452   ← current
```

That is **~1.67 MB of orphaned JavaScript and CSS** referenced by nothing — no `index.html` points
at it — riding along in the package. `rm -f unshafted-extension.zip && pnpm build` produces the
correct 32 entries.

## Why it matters more here than in most projects

1. **CWS review reads the package.** Unreferenced bundles are dead code in a submission that has
   already been cited once for permissions it did not use (`cws/rejection-history.md`). Shipping
   orphaned executable files is the same category of untidiness.
2. **It compounds silently.** Nothing warns. The archive grows by roughly the size of the changed
   bundles on every build that changes a bundle, and only ever shrinks if someone deletes it by
   hand.
3. **It makes "is the ZIP shape unchanged?" unanswerable** without knowing whether the previous
   build's ZIP was itself clean — which is exactly the check this sweep needed to make.

## The fix

One word, in `package.json`:

```diff
- "build": "... && turbo build && cd dist && zip -r ../unshafted-extension.zip . -x '*.map' && cd .."
+ "build": "... && turbo build && rimraf unshafted-extension.zip && cd dist && zip -r ../unshafted-extension.zip . -x '*.map' && cd .."
```

`rimraf` is already a dependency. Folding it into `clean:bundle` would be equally good and arguably
the more honest home for it, since removing the previous artefact is what "clean the bundle" ought
to mean.

## Worth checking before the next submission

Whether the ZIP currently uploaded for v0.8.0 was built from a clean archive or already carries
stale bundles from an earlier build. If it does, that is a (minor) reason to rebuild before any
resubmission.

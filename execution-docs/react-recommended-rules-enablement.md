# Turning on eslint-plugin-react's recommended set (#55)

**Status: done.** Landed on `release` via `fix/react-recommended-rules`.

## What was wrong

`eslint.config.ts` spread two react configs into one object literal:

```ts
{
  files: ['**/*.{ts,tsx}'],
  ...reactPlugin.configs.flat.recommended,
  ...reactPlugin.configs.flat['jsx-runtime'],
},
```

Both carry a `rules` key, so the second replaced the first. 22 recommended rules collapsed to the
two `jsx-runtime` sets to `off`. `react/jsx-key` has never run in this repo. Plain object-literal
semantics, true since the config was written; not caused by the eslint 10 bump that surfaced it.

The fix is two array entries instead of two spreads, exactly as #55 proposed.

## The crash, and why the issue's framing was wrong

#55 recorded that enabling the set under eslint 10 crashes the lint run in all 11 packages with
`TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a
function`, and framed the decision as *wait for upstream, or enable the set minus `display-name`*.

Reproduced, then probed one rule at a time against the real config and the real tree. The blast
radius is wider than `display-name`:

| Rule | Under `version: 'detect'` |
|---|---|
| `display-name`, `no-direct-mutation-state`, `no-render-return-value`, `no-string-refs`, `no-unsafe`, `require-render-return`, `prop-types` | crash at rule-load time, in every package |
| `no-unknown-property` | crashes too, but *while linting* rather than at load — a different error shape that a `grep "Error while loading rule"` misses entirely |
| the remaining 14 | load and run fine |

So "enable everything except `display-name`" would not have worked: it would have traded one crash
for seven, one of which does not even announce itself the same way.

But the per-rule framing is the wrong axis. The stack says so:

```
resolveBasedir (version.js:31)   ← contextOrFilename.getFilename()
detectReactVersion (version.js:85)
getReactVersionFromContext (version.js:116)
testReactVersion (version.js:181)
```

`version.js:116` only reaches `detectReactVersion` when `settings.react.version === 'detect'`. The
crashing rules are simply the ones that ask what React version they are linting against; nothing is
wrong with the rules. `context.getFilename()` was removed in eslint 10, and
`eslint-plugin-react@7.37.5` still calls it on that one path.

## What was done instead

Pin the version rather than detecting it:

```ts
settings: { react: { version: '19.0' } }
```

The value is only ever fed to `semver.satisfies` range tests, so the major is what carries meaning —
`19.0` is accurate and stays accurate across 19.x. A comment in the config says why it is not
`'detect'` and to keep it in step with the `react` major in the root `package.json`.

This is strictly better than the exclusion path the issue sketched: **no rule is dropped**,
`display-name` included, and nothing needs unwinding when upstream fixes the plugin — the pin is
sound regardless. Neither 7.37.5 (latest) nor `7.8.0-rc.0` (`next`) declares `^10`, so the wait had
no end date worth holding the set hostage to.

## What the 18 live rules actually found

Three sites across the whole repo:

| Site | Rule | Fix |
|---|---|---|
| `packages/shared/lib/hoc/with-suspense.tsx:6` | `display-name` | named the returned component and gave it `withSuspense(Inner)` as its `displayName` |
| `pages/popup/src/components/ResultCards.tsx:187` (×2) | `no-unescaped-entities` | `"` → `“ ”` |

Both are fixed, not silenced.

`QuoteBlock` renders a reference quotation, and the side panel already renders the same thing with
real typographic quotes (`DocumentCard.tsx:56`). The straight ASCII pair in the popup was the
inconsistent one; matching it fixes the finding and the inconsistency in one move.

`withSuspense` returned a bare anonymous arrow, so every suspense-wrapped component showed as
`Anonymous` in React DevTools — on the exact surface where you go looking for which component is
suspended. Both call sites (`Options.tsx:586`, `Popup.tsx:1464`) pass the result straight into
`withErrorBoundary` and are unaffected.

18 of the 22 are enabled. The other four are off on purpose and stay off: `prop-types` and
`react-in-jsx-scope` are explicitly disabled in the config (TypeScript and the new JSX transform do
those jobs), `jsx-uses-react` is zeroed by `jsx-runtime`, and `no-unsafe` ships as `off` inside
`recommended` itself.

`react/jsx-key` — the rule that motivated the issue — finds nothing today. That is the good outcome:
it is a guard going forward, and the neighbouring class of bug to #45 now has one.

## Verified

`pnpm lint`, `pnpm type-check`, `pnpm test`, `pnpm build` all green. `eslint --print-config` on
`pages/options/src/Options.tsx` reports 18 enabled `react/` rules with `react/jsx-key` at `error`,
against 0 before.

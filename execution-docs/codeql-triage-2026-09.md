# CodeQL triage — September 2026 (#27)

**Worked:** 2026-09-08 · **Base:** `release` at `fce2180` · **Branch:** `fix/codeql-triage`
**Status:** complete.

The three high-severity CodeQL alerts standing open against shipped extension code, triaged before
the next CWS submission rather than after — `normalize.ts` is the file that reads other people's
pages, and the ZIP is a review surface.

## Standing context

`v0.8.0` is published and live. `release` is six commits ahead of `main`, two of which change
shipped extension code and have never been in front of a user: the September dependency sweep (#10)
and pdf.js 4→6 (#11). No CWS submission is open and there is no `dev/v0.9.x` branch yet.

That gap matters here more than usual, because **CodeQL scans `main`**. Every alert discussed below
was recorded at `refs/heads/main`, commit `90e5f73` — not at the tree being worked on. Two of the
three findings dissolve once that is taken into account.

## Outcome

| Alert | Rule | Location | Result |
|---|---|---|---|
| 4 | `js/polynomial-redos` | `packages/unshafted-core/lib/json.ts:4` | **real** — demonstrated and fixed |
| 8 | `js/polynomial-redos` | `packages/unshafted-core/lib/site-policy/diff.ts:44` | **stale** — already fixed on `release` by #10; left open |
| 9 | `js/incomplete-multi-character-sanitization` | `packages/unshafted-core/lib/site-policy/normalize.ts:222` | **false positive** — dismissed with reasoning recorded |

Branches from `release` and squash-merges back, per `CLAUDE.md`.

---

## #27 — CodeQL triage

The ticket asked for triage, not assumption: for each alert, either build the input that
demonstrates the problem, or dismiss it with a recorded reason. All three got a proof-of-concept
run against the real module. The three answers turned out to be different.

### Alert 4 — `json.ts:4`, polynomial ReDoS — **real, fixed**

The only one of the three that was a genuine live defect, and it is live on both branches
(`json.ts` is byte-identical between `main` and `release`).

```
/```(?:json)?\s*([\s\S]*?)```/i
                ^^^^ ^^^^^^^
```

`\s` is a subset of `[\s\S]`, so the whitespace run after an opening fence can be divided between
the two quantifiers in as many ways as there are whitespace characters, and each division re-scans
the remainder looking for a closing fence. Clean quadratic, measured on an unterminated fence
followed by N spaces:

| N | before | after |
|---|---|---|
| 20,000 | 33.7 ms | 0.1 ms |
| 40,000 | 131.7 ms | 0.0 ms |
| 80,000 | 531.9 ms | 0.0 ms |
| 160,000 | **2,163.4 ms** | 0.1 ms |
| 2,000,000 | — | 2.3 ms |

Four times the cost for each doubling of the input, which is the signature.

**The fix was to delete `\s*`, not to rewrite it.** It was never doing any work: the capture is
`.trim()`ed on the very next line, so leading whitespace is discarded either way. Checked against
seven fence shapes — `json` tag, no tag, uppercase `JSON`, inline spaces, newlines, empty fence,
fence embedded in prose — and the extracted string is identical in every one. One quantifier
instead of two overlapping ones removes the ambiguity outright rather than narrowing it.

Reachability is honest but not theoretical: this parses **model output**, and the policy text from
the page under analysis reaches the prompt, so a page has influence over what lands here. A
truncated response ending in an unterminated fence gets there without any adversary at all.

Regression test asserts the 160k-space input completes in under 250 ms — roughly a 20× margin over
the fixed path and an 8× margin under the broken one, so it stays meaningful on slow CI.

### Alert 8 — `diff.ts:44`, polynomial ReDoS — **stale, no change**

The ticket flagged this one as suspicious ("#10 already hardened this pattern; either the fix was
incomplete or the alert is stale") and asked for that to be settled first. It is stale, and the
first attempt to prove otherwise is what settled it.

The alert is recorded against `main`, which still carries the pre-#10 pattern `/^#{1,6}\s+(.*)$/`.
`release` has carried `/^#{1,6}\s+(\S.*)?$/` since #10.

Demonstrating the blowup took two attempts, and the failed one is the interesting half. The obvious
evil input — hashes, then a long run of spaces — does not backtrack at all, because `\s` matches
`\n` and `.` does not, so the greedy `\s+` swallows any newline that would have made the match fail
and it succeeds on the first try. The input has to block that rescue by putting a non-space *before*
the newline: `'#' + ' '.repeat(N) + 'a\nb'`.

| N | `main`'s pattern | `release`'s pattern |
|---|---|---|
| 10,000 | 63.5 ms | 0.3 ms |
| 20,000 | 299.4 ms | 0.1 ms |
| 40,000 | 1,049.7 ms | 0.2 ms |
| 80,000 | **3,904.4 ms** | 0.4 ms |
| 1,000,000 | — | 4.6 ms |

So #10's fix is correct and complete, and it is behaviour-preserving — eight heading shapes produce
identical captures after the `.trim()` that was already there.

**But the blowup was never reachable even on `main`.** The call site is
`HEADING_PATTERN.exec(trimmed.split('\n')[0] ?? '')` — it passes the *first line*, so the newline
the evil input depends on is removed before the regex ever sees it, and `(.*)$` therefore always
succeeds without backtracking. Fed through the real call site, `main`'s pattern runs the 80k input
in 0.1 ms. #10 hardened a pattern that was defensible in isolation and unreachable in place, which
is the right instinct and worth recording as such rather than as a near miss.

Left open deliberately, and **not** dismissed. It is genuinely present in the branch CodeQL scans,
and it clears itself the moment `release` reaches `main`. Dismissing it would suppress a true
finding about `main` to make a dashboard tidy.

### Alert 9 — `normalize.ts:222`, incomplete multi-character sanitization — **dismissed**

CodeQL's message is "This string may still contain `<script`, which may cause an HTML element
injection vulnerability." The rule's premise is that `stripByAttribute`'s rewrite-in-a-loop is a
sanitizer whose output is used as HTML again. Neither half holds here.

`stripByAttribute` is a **content selector** — it drops nav landmarks and cookie-consent containers
so the policy text is not polluted by site chrome. Whatever it fails to remove is removed anyway:
`tagsToText` at `normalize.ts:280` runs `out.replace(/<[^>]*>/g, '')` unconditionally afterwards,
dropping every remaining tag. The result goes through `collapseWhitespace` and then to exactly three
places — a SHA-256 hash (AD-1), the model prompt, and block-level diffing. It is never markup again.

And there is no sink to be injected into. `innerHTML`, `dangerouslySetInnerHTML`,
`insertAdjacentHTML`, `outerHTML`, `document.write` and `createContextualFragment` appear **zero
times** in the repo outside `node_modules` and `dist/`. The side panel is React, which escapes text
by default.

Verified against the module rather than argued: nested `cookie-banner` containers, nested
`role="navigation"` containers, a `<script` tag deliberately split across the element being removed,
`<script>` bodies, `onclick` attributes and `<svg onload>` all normalize to plain text with no
surviving element. (`PARA_BREAK` is a NUL sentinel, so the splice can never rejoin two halves of a tag
across the seam either.)

One case does put a literal `<script>` in the output: source markup that was **entity-encoded**,
`&lt;script&gt;`, which `decodeEntities` correctly turns back into visible text. That is a policy
page displaying the characters `<script>` to a reader, and hashing what the reader sees is the
correct behaviour. It would only matter given an HTML sink, and there is none.

Dismissed in GitHub as a **false positive** with the reasoning recorded on the alert. Because a
dismissal is only as durable as the premise behind it, the premise is now pinned by a test —
`normalizer lets no element survive nested-container stripping` in `site-policy.test.ts` — which
fails if a future edit ever lets an element out of that pipeline.

### Not in the ticket: two more high-severity alerts

Alerts **10** and **11**, `js/incomplete-sanitization` on `tools/corpus/report.ts:115` and `:141`,
are also high severity and were filed on 2026-09-07, a day before #27 was written. They are not in
#27 and are out of its scope: `tools/` is corpus tooling and ships in nothing. `mdCell` at
`report.ts:30` escapes backslashes before pipes, which is the correct order, so these look like the
same class of false positive — but that was not verified to the standard above. Raised separately
rather than folded in silently.

### Test count

77 → 80 in `@extension/unshafted-core`.

---

## #28 — alerts 10 and 11, `tools/corpus/report.ts`

**Worked:** 2026-09-09 · **Base:** `release` at `ff0f538` · **Branch:** `chore/codeql-28-triage`
**Status:** complete. No code change.

The two alerts raised above, triaged to the same bar. **The hypothesis recorded above is wrong**, and
the ticket's own caveat is what turned out to matter: the flagged sanitizer is not `mdCell`, and
these are not false positives.

### They point at `main`, where `mdCell` does not exist

CodeQL records every instance at `refs/heads/main`, commit `90e5f73` — the same fact that dissolved
alert 8. Read at that commit, lines 115 and 141 are not `mdCell` call sites. They are the code
`mdCell` replaced:

```
main:115  line(`| ${doc.anchorText.replace(/\|/g, '\\|') || '—'} | \`${doc.chosenUrl.slice(0, 70)}\` |`);
main:141  line(`| \`${term}\` | ${count} | ${(example?.text ?? '').replace(/\|/g, '\\|').slice(0, 50)} (${example?.domain}) |`);
```

Pipes escaped, backslashes not. CodeQL's message — "This does not escape backslash characters in
the input" — is exactly right, and the column positions it reports (17–39 and 42–71) land on those
two `.replace(...)` chains rather than on any helper.

### Demonstrated, not argued

Anchor text is crawled, so a backslash before a pipe is not hypothetical. `Privacy \| Terms`:

| | escaped output | live columns | header declares |
|---|---|---:|---:|
| `main` | `Privacy \\\| Terms` | **3** | 2 |
| `release` | `Privacy \\\\\| Terms` | 2 | 2 |

On `main` the `\\` is read as an escaped backslash and the `|` behind it stays live, so the row
gains a column: `Terms` lands under **URL** and the URL spills into a heading that does not exist.
`release` escapes the backslash first, both characters survive as text, and the row holds its shape.

That is a real defect in the branch CodeQL scans, not a false positive.

### Already fixed, by a commit that was not aiming at it

`fce2180` — the PR-checks fix (#26) — introduced `mdCell` and rewrote **exactly these two lines**,
one for one, on 2026-09-08. The alerts were filed on 2026-09-07. They were a day old and already
dead when the ticket was written; the prettier pass over `tools/` swept them up on its way past.

Both crawled-text cells on `release` now route through `mdCell`, and they are the only two:
`report.ts:139` and `:169`. Every other table interpolation is an enumerated status, a hostname, a
URL or a curated domain, and each is fenced in backticks.

### Outcome

| Alert | Rule | Location | Result |
|---|---|---|---|
| 10 | `js/incomplete-sanitization` | `tools/corpus/report.ts:115` | **stale** — real on `main`, fixed on `release` by `fce2180`; left open |
| 11 | `js/incomplete-sanitization` | `tools/corpus/report.ts:141` | **stale** — same |

**Not dismissed**, for alert 8's reason: the finding is true of the branch it was recorded against,
and dismissing a true finding to tidy a dashboard is how a real one gets waved through later. Both
clear themselves the moment `release` reaches `main`.

So the count of genuinely open high-severity alerts is **zero**. Alerts 4, 8, 10 and 11 are all
either fixed or fixed-pending-publish; 9 is dismissed with its premise pinned by a test.

### Noticed in passing, not changed

`report.ts:169` slices after escaping — `mdCell(example?.text ?? '').slice(0, 50)` — so a 50-character
cut can land inside an escape pair and leave a trailing lone backslash. Traced rather than assumed:
the template always follows the cell with `` ` (` ``, so the stray backslash escapes a space, the
separator pipe stays live, and the column count survives. Cosmetic, in a local report, and
`mdCell(text.slice(0, 50))` would be the tidier order if this file is touched for another reason.
Not worth a commit of its own.

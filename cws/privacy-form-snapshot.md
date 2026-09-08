# CWS Privacy Form — Snapshot

**Item:** Unshafted: AI Contract Risk Analyzer
**Item ID:** `fpjjdlffjfkdiibljglmgfkbpkkibpia`
**Version live:** 0.8.0 — approved and published on or before 2026-09-08
**Snapshot date:** 2026-09-09 — **this form is the published state.** Everything below was
submitted with 0.8.0 and accepted: the rewritten single purpose, `Website content` checked, and
justifications for all seven permissions including `host_permissions: ['<all_urls>']`.

> The 0.8.0 approval date is inferred from the publish merge `90e5f73` (2026-09-08) — under the
> branch model in `CLAUDE.md`, `main` moves only after CWS publishes. Worth replacing with the exact
> dashboard date next time someone is signed in.
**Source:** Chrome Web Store Developer Dashboard → Privacy tab

This file mirrors the values entered in the CWS dashboard's Privacy tab so the source of truth lives in git alongside `privacy-policy.md`. Update this file whenever the dashboard form is changed.

---

## Single purpose

> Show a user the risk in the agreements they are asked to accept. Unshafted analyzes contracts the user uploads, and reads the legal documents a website links to — terms of service, privacy policy, cookie policy — so it can tell the user what that site makes them agree to. Both produce the same structured findings: unfavorable clauses, missing protections, and what the user can still do about them.

This sentence is what the whole `<all_urls>` request rests on. It says reading a site's linked legal
documents **is** the purpose rather than something adjacent to it, which is the only framing under
which standing page access is not scope drift. Anyone editing this field later should read
`cws/rejection-history.md` first.

---

## Permission justification

Every permission in the manifest gets a required box in the dashboard and none may be left blank.
All seven below are written in plain voice, verified against the shipping code, and sized to the
1,000-character field limit.

### `storage`

> We use chrome.storage.local to keep everything the extension needs between sessions. That covers the user's API key for OpenRouter or OpenAI, their model and provider preferences, where they got to in onboarding, their local analysis history, the free tier usage counters, and the session tokens from Google Sign-In and Supabase. If someone turns on Drive backup we cache the Drive token and that preference there too. New in this version, we also store site policy analyses under the content hash of the document they came from, along with the domain and the date the user ran them, so revisiting a site does not mean paying for the same analysis again. Text from a scan in progress goes in chrome.storage.session and is cleared when the browser session ends. None of this is synced to us. Drive backup is a separate Google Drive API flow that only runs after the user signs in and switches it on.

`898 / 1,000` characters. Rewritten 2026-09-07, and not only for voice: the prior text omitted the
Supabase session tokens, the Drive token cache, onboarding state, `chrome.storage.session`, and all
of the site-policy storage this release adds (`unshafted-policy-cache-index`,
`unshafted-policy-domain-cache`, `unshafted-local-policy-index`, `unshafted-site-policy-run`).

### `identity`

> We use chrome.identity for Google Sign-In. Signing in is optional and the extension works without it, but it is what unlocks unlimited quick scans, deep analysis, and backing up someone's own contracts and analysis results to their own Google Drive. From Google we receive the user's email address, display name and profile picture, and we use those to identify the account and keep the session alive. Nothing else is read from the Google account, and Drive access is limited to the drive.file scope, so Unshafted can only see files it created itself.

`551 / 1,000` characters. The `drive.file` sentence volunteers a limit rather than waiting to be
asked about it.

### `host_permissions` (`<all_urls>`)

> Unshafted tells people what the site they are on makes them agree to, so it has to read that site's page to find the legal documents it links to, things like terms of service, privacy policy and cookie policy, and then fetch the text of those documents. activeTab cannot do this. Chrome only grants it when someone clicks the toolbar icon and takes it away again the moment the tab navigates, so a side panel left open while a person browses is refused on every new page. The read is a single one-shot script that runs only while the Unshafted side panel is open on that page. There is no persistent content script and nothing is registered to run in the background. We keep only the links whose text or URL identifies a legal document, and the rest of the page is discarded inside the tab. Documents are fetched with credentials omitted, so the request does not carry the user's cookies or signed-in session. No page content and no record of the sites someone visits is ever sent to us.

`987 / 1,000` characters. **This is the field the review turns on.** Every claim in it is checkable
against the ZIP:

| Claim | Where it is true in the code |
|---|---|
| Only legal-document links are kept, the rest discarded in the tab | `collectPolicyCandidatesInPage`, `packages/unshafted-core/lib/site-policy/discover.ts:239` — filters anchors against a legal-document regex and returns only `href` plus ≤120 chars of anchor text |
| Single one-shot script, no persistent content script | `packages/shared/lib/utils/policy-capture.ts` uses `chrome.scripting.executeScript` per request; no `registerContentScripts` call in source or in the built `background.js`; no `content_scripts` key in the shipped manifest |
| Fetched with credentials omitted | `fetchDocumentInPage`, `discover.ts:275` — `fetch(url, { credentials: 'omit', redirect: 'follow' })` |
| Nothing sent to Unshafted | The only network hosts reachable from the bundles are `accounts.google.com`, `www.googleapis.com`, the Supabase project, `api.openai.com` and `openrouter.ai` |

### `tabs`

> We read the URL and the id of the active tab. The URL tells us whether the site is one of those already in the index that ships inside the extension, so we can show a risk level on the toolbar icon, and it also decides whether the side panel is offered on that tab at all, which keeps it switched off on chrome:// pages and anywhere there is no real site. The tab id is what lets the side panel read the page it is actually open on, rather than whichever tab happens to be active by the time a fetch comes back. All of this stays local. The index is a file bundled with the extension and read through chrome.runtime.getURL, so none of these lookups touch the network.

`667 / 1,000` characters. Widened 2026-09-07. The earlier draft described only the badge lookup,
which was narrower than the actual use and therefore the Purple Potassium failure mode in
miniature. All three real uses are now declared: the badge
(`chrome-extension/src/background/site-policy.ts`), per-tab side panel availability including the
`sweepOpenTabs` query over every tab (`chrome-extension/src/background/side-panel.ts:131`), and
supplying the panel the identity of the page it is open on
(`pages/side-panel/src/hooks/useActiveTabSite.ts:57`).

> [!WARNING]
> **"None of these lookups touch the network" is true of what ships, and it is fragile.**
> `packages/shared/lib/utils/policy-cdn.ts` will issue `fetch(base + '/d/' + sha256(domain) + '.json')`
> on popup open the moment `CEB_POLICY_CDN_URL` is set. That variable is unset, and the string does
> not appear anywhere in the built bundles, so no such request exists in this ZIP. **Setting it and
> rebuilding makes this justification false**, and would additionally need a privacy-policy change
> and a fresh look at the `Web history` checkbox below. Do not wire up the CDN without revisiting
> both.

### `activeTab`

> We declare activeTab alongside host_permissions because it is what still works if someone restricts Unshafted's site access to "on click" from chrome://extensions. It is not a separate feature or a separate code path. The extension makes the same one-shot scripting.executeScript call described under host_permissions, and Chrome satisfies it from whichever grant the user has left in place. Without it, restricting site access would break policy reading altogether instead of just costing the user a click on each page.

`520 / 1,000` characters. Deliberately says there is no separate code path, because there is not:
no `chrome.permissions` call exists anywhere in the source, and `executeScript` is one call served
by whichever grant Chrome finds. The earlier "retained as the fallback path" phrasing implied an
implementation that does not exist, which given Purple Potassium was the cheapest available
citation on the page.

### `scripting`

> scripting runs the one-shot script that looks over the current page for links to legal documents and fetches the text of one of those documents from the page's own context. It runs when the side panel asks for it, while the panel is open on that page, and then it is finished. We never call chrome.scripting.registerContentScripts, and there is no content_scripts entry in the manifest, so none of our scripts are left running on any page.

`439 / 1,000` characters. Both negative claims verified against the shipped ZIP, not just source.

### `sidePanel`

> The policy analysis is shown in Chrome's own side panel next to the page, which means Unshafted never has to inject any UI into the page itself. We also use the API to switch the panel off per tab, so it is only offered where there is actually a site whose documents we can read.

`279 / 1,000` characters.

---

## Remote code

- [x] **No, I am not using remote code**
- [ ] Yes, I am using remote code

(Justification field left blank — not applicable.) Correct as shipped: nothing in the bundles
fetches or evaluates script at runtime.

---

## Data usage — what user data is collected now or in the future

| | Category | Selected |
|---|---|---|
| ✅ | **Personally identifiable information** — name, address, email address, age, or identification number | **Yes** |
| ⬜ | Health information — heart rate, medical history, symptoms, diagnoses, procedures | No |
| ⬜ | Financial and payment information — transactions, credit card numbers, credit ratings, statements, payment history | No |
| ✅ | **Authentication information** — passwords, credentials, security questions, PINs | **Yes** |
| ⬜ | Personal communications — emails, texts, chat messages | No |
| ⬜ | Location — region, IP address, GPS coordinates, nearby-device info | No |
| ⬜ | Web history — pages visited, page titles, visit times | No |
| ⬜ | User activity — network monitoring, clicks, mouse position, scroll, keystrokes | No |
| ✅ | **Website content** — text, images, sounds, videos, hyperlinks | **Yes** |

`Website content` is the only row that changes from the 0.7.1 form.

### Website content — selected

The extension reads the current page's hyperlinks to find the legal documents the site links to,
and fetches the text of those documents. The category explicitly names text and hyperlinks and the
read is real, so it is selected even though the collection is narrow. Claiming otherwise while
requesting `<all_urls>` is exactly the four-surface contradiction that drew both prior rejections.

Scope, identical in the extension and in the privacy policy: a single one-shot script run only
while the side panel is open on that page; no persistent content script; only legal-document links
retained, everything else discarded inside the tab; documents fetched with cookies omitted; policy
text hashed on-device for comparison against the bundled corpus; text leaves the device only to the
AI provider the user configured, on the user's own API key, and only after the user passes the
confirm sheet. Nothing is sent to Unshafted.

### Web history — NOT selected, and this is the row most likely to be questioned

`<all_urls>` together with `tabs` is the shape of a history collector, so expect a reviewer to probe
it. The answer, prepared rather than improvised:

Chrome defines the category as pages visited, page titles and visit times. None of the three is
recorded. The badge lookup reads the active tab's URL, resolves it against a file bundled in the
extension via `chrome.runtime.getURL`, and stores nothing. The only per-domain data that persists is
in `unshafted-local-policy-index` and `unshafted-policy-domain-cache`, and those hold the domain and
timestamp **of an analysis the user explicitly chose to run**, not of a page they happened to visit.
Nothing is transmitted anywhere.

The distinction is real and survives someone opening the ZIP. It is nonetheless the softest claim on
this form, and the `CEB_POLICY_CDN_URL` warning above is the change that would break it.

### Rationale for the other unselected categories

- **Personal communications** — user-uploaded contracts are documents the user supplies for
  analysis, not communications observed or intercepted. The extension does not read email, chat, or
  messaging content.
- **User activity** — the extension stores local rate-limit counters (daily quick-scan count,
  monthly deep-analysis count) on the user's own device. No network monitoring, no click, scroll or
  keystroke logging, no cross-session activity tracking.
- **Financial and payment information** — not collected, despite the bundled corpus visibly
  covering Chase, PayPal, Coinbase, American Express and Robinhood. The category concerns the
  user's own transactions, card numbers or credit ratings; analysing a bank's publicly posted terms
  is not that, and an uploaded contract is user-supplied content rather than payment data.
- **Health, Location** — never collected.

---

## Certified disclosures

All three boxes checked:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

The second box is load-bearing as of this release. It certifies that reading a site's linked legal
documents falls inside the item's single purpose, and it only stands because the single-purpose
field above was rewritten to say so. Editing that field breaks this certification.

---

## Privacy policy URL

```
https://gist.github.com/LuDraGa/782b874f1e7fe0076fb2bf1509937e95
```

`64 / 2,048` characters.

The gist is auto-synced from `privacy-policy.md` on every push to `main` via
`.github/workflows/sync-privacy-policy.yml`. **Review fetches the gist, not the repo** — confirm the
two match before submitting.

---

## Cross-checks against `privacy-policy.md`

| Form field | Mirrored in policy | Section |
|---|---|---|
| Single purpose | Yes (intro paragraph) | Top of file |
| `storage` justification | Yes | §1–§7 + "How we store your data" |
| `identity` justification | Yes | §1, §7, "How we handle and protect your data" |
| `host_permissions` justification | Yes | §5 "Website content (policy documents only)" |
| `tabs` / `activeTab` / `scripting` / `sidePanel` | Yes | §5 |
| PII checkbox | Yes — email, display name, profile picture | §1 |
| Authentication info checkbox | Yes — Google OAuth tokens, Supabase JWT/refresh | §7 |
| Website content checkbox | Yes — page hyperlinks and policy-document text | §5 |
| Web history unchecked | Yes — "does not build, store, or transmit a record of the sites you visit" | §5 |
| No remote code | Implicit (no eval/remote script in source or bundles) | n/a |
| No-sell / single-purpose / no-credit certifications | Yes | "Data sharing and third parties" + Limited Use section |

---

## Change log

- **2026-09-07** — Prepared and entered in the draft for the site-policy release. Single purpose
  rewritten to name reading a site's linked legal documents, because that is the sentence a
  reviewer maps `<all_urls>` against and the old one described uploads only. `Website content`
  selected. All seven justifications rewritten in plain voice and verified line by line against the
  shipping code: `storage` widened to cover Supabase tokens, the Drive cache, onboarding state,
  `chrome.storage.session` and the new site-policy storage; `tabs` widened from the badge lookup
  alone to all three real uses; `activeTab` reworded to stop implying a code path that does not
  exist; `host_permissions` gained the cookie-less fetch. Added the `CEB_POLICY_CDN_URL` warning
  and the prepared answer on `Web history`. **Not yet submitted for review.**
- **2026-05-05** — Initial snapshot at v0.7.0 resubmission. Captures form state after the Purple
  Nickel hardening pass (Limited Use disclosure, handling section, §6 auth-token enumeration in
  policy).

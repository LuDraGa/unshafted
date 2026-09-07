# Site Policy Awareness — Part 7: Standing Page Access

**Status:** Code landed 2026-09-07 · **CWS surfaces prepared but NOT submitted** · uncommitted in
the working tree
**Owner:** @LuDraGa
**Parent:** `execution-docs/site-policy-part6-self-analysis.md`
**Load-bearing sibling:** `cws/rejection-history.md` — read it before touching the manifest again

---

## What forced this

Reported from a real session. Panel open on Google, browsed to `news.ycombinator.com`:

- The panel found no documents and said *"We could not read this page."*
- **Look again** did nothing, then escalated to *"Click the Unshafted icon in your toolbar."*
- Clicking the icon and pressing **Read its policies** did nothing at all.
- Navigating away and back made the documents appear.

Three symptoms, one cause, and the cause is not a bug in any of them.

`activeTab` is granted only when the user INVOKES the extension — toolbar icon, context menu,
keyboard command — and is revoked the instant the tab navigates. So:

- A click inside the panel is a user gesture but not an invocation. **Look again** re-issued the
  identical refused injection every time. It could never work.
- The toolbar click *did* grant access, but `chrome.sidePanel.open()` on an already-open panel is a
  no-op, so nothing told the panel to try again. The grant sat there unused.
- Navigating changed the origin, which re-ran discovery through `useActiveTabSite`'s listeners.

The first instinct was to fix the third bullet — have the popup signal the panel. That is a real
bug and the signal would work, but it leaves the product requiring a toolbar click on **every page
load, forever**, for a feature whose entire premise is that it notices things on its own. Under
`activeTab`, automatic detection is not difficult. It is impossible.

---

## D1 — Standing host permissions, because the alternative is not shipping the feature

`host_permissions: ['<all_urls>']`.

Considered and rejected: per-site `optional_host_permissions` requested from the panel. It trades
one click per page for one dialog per site, which is the same defect wearing a hat — a user who
visits thirty sites answers thirty Chrome permission prompts.

Also considered: a one-time all-sites optional request at onboarding. Identical end state to the
declared permission, no install-time warning, but it needs a decline path, and the decline path is
the broken `activeTab` flow we are removing. Worth revisiting **only** if review pushes back.

---

## D2 — Why this does not re-open what `3657ca0` closed

`3657ca0` deleted a page-scraping content script during the Purple Nickel pass. It is tempting to
read that as "page access was tried and rejected." It was not.

That script was **dead** — unwired in the manifest, never injected — and it was deleted because the
extension was an **upload-only product**. The listing said so. A 60 KB scraper sitting in the ZIP
next to a `storage`+`identity` manifest was, in the words of the commit, the cleanest available
"single-purpose drift" citation. Removing it was correct for the product that existed.

The product is different now. Reading the documents a site links to, in order to tell the user what
they already agreed to, is not drift from that purpose — it **is** the purpose. The single-purpose
argument is stronger today than it was in May, not weaker.

What carries over from that episode is the takeaway `cws/rejection-history.md` ends on:

> the review surface is the *union* of policy + in-product disclosure + listing copy + what's
> actually in the ZIP. Audit all four before assuming the policy text is the gap.

So all four moved together in this change. A manifest line on its own would have recreated the
0.7.0 rejection precisely.

---

## D3 — Standing access, but still no persistent content script

The permission grants the *right* to read any page. The code does not exercise it that way, and
that distinction is what the privacy policy and the permission justification both rest on.

Every read is still a one-shot `chrome.scripting.executeScript` the panel asks for, while the panel
is open on that page. Nothing is registered in `content_scripts`. Nothing runs on a page the user
did not open the panel on, and nothing is left behind on a page after the read.

`activeTab` stays declared alongside. It costs nothing and it is the path that still works if a
user restricts site access from `chrome://extensions`.

---

## D4 — Every failure state in the reader was written for a cause that no longer exists

`DocumentReader`'s escalated copy sent the user to the toolbar. That instruction is now not merely
unnecessary but actively misleading — it would appear to work by coincidence whenever the page
finished loading while the user was off performing the gesture, teaching a superstition.

The remaining failures are genuinely transient: a page mid-load, an SPA that renders its footer
late. So **Look again** is offered in both states now instead of escalating away from itself, and
the second message only says the wait was not long enough.

`useLivePolicyCheck`'s "once per tab and origin" rule survives, but its justification changed. It
was a permission rule — the second attempt was the one without the gesture, so re-running
downgraded a good `current` to `unconfirmed`. That failure mode is gone. The rule now stands on
cost alone: an in-site navigation is the same site's same documents, and re-reading them on every
route change turns the panel into a crawler for no new information.

---

## Changed

**Extension**

- `chrome-extension/manifest.ts` — `host_permissions: ['<all_urls>']`, with D2 recorded inline so
  the next person to read the permission block finds the reasoning, not just the line.
- `pages/side-panel/src/components/DocumentReader.tsx` — failure copy rewritten; retry offered in
  both states.
- `pages/side-panel/src/hooks/useLivePolicyCheck.ts` — comments re-derived; `rediscover` is honest.
- `packages/shared/lib/utils/policy-capture.ts` — module contract restated around standing access
  and the one-shot rule.
- `pages/side-panel/src/SidePanel.tsx`, `chrome-extension/src/background/side-panel.ts` — stale
  `activeTab` references.

**CWS review surface** — none of this is submitted; see below.

- `cws/privacy-policy.md` — new §5 "Website content (policy documents only)"; effective date
  2026-09-07; the "the extension does not read web pages" line in *What we do NOT collect* is gone,
  replaced by what is actually true (no browsing history; no page content beyond policy documents).
- `cws/privacy-form-snapshot.md` — **Website content** now selected, with its rationale;
  justifications written for `host_permissions`, `tabs`, `activeTab`, `scripting`, `sidePanel`.
- `cws/store-listing-snapshot.md` — description now describes site policy reading.

---

## Open — all of it human work, none of it code

1. **Paste the listing description into the dashboard.** The snapshot is git's copy, not the
   store's. Shipping the manifest without this is the 0.7.0 mistake verbatim.
2. **Tick `Website content` in the Privacy tab's data-usage form,** and paste the five permission
   justifications. `host_permissions` is the one a reviewer will actually read.
3. **Push `cws/privacy-policy.md` to `main`** so the gist-sync workflow runs, then confirm the
   public gist matches. Review reads the gist, not the repo.
4. **Bump the version.** `package.json` is `0.7.1`, which is what is live and has no host
   permissions.
5. **Expect a longer review.** `<all_urls>` draws scrutiny that `storage`+`identity` did not, and
   this item has two rejections on its record. Budget for one round of questions.
6. **Decide the fallback posture in advance.** If review rejects `<all_urls>`, the prepared retreat
   is D1's one-time optional all-sites request at onboarding, not per-site prompting.

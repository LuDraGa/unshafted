# CWS Submission Checklist — adding `<all_urls>`

**Prepared:** 2026-09-07 · **Status:** nothing below has been entered in the dashboard
**Applies to:** the site-policy release (adds `host_permissions: ['<all_urls>']`)
**Live item:** `fpjjdlffjfkdiibljglmgfkbpkkibpia`, version `0.7.1`, no host permissions

Everything here is paste-ready. The other files in `cws/` are the standing mirrors; this one is
the working order for a single submission, and can be deleted once it is done.

---

## What review will actually be looking at

`<all_urls>` is the broadest permission Chrome grants, and this item has two rejections on record
(Purple Potassium for unused permissions, Purple Nickel for the privacy policy). The lesson from
that round is in `rejection-history.md`:

> the review surface is the *union* of policy + in-product disclosure + listing copy + what's
> actually in the ZIP.

So a reviewer's question is not "is this permission justified in the abstract." It is **"do these
four surfaces tell the same story."** They currently do not — the live listing describes an
upload-only product, and the live single-purpose sentence says nothing about reading web pages.
Shipping the manifest without §2 and §3 below reproduces the 0.7.0 rejection exactly.

The argument that carries it: reading the documents a site links to is not scope drift from
telling people what they agreed to — it **is** that purpose. That only works if the single-purpose
field says so, which is why §2.1 is the single most important paste on this page.

---

## 1. Before you open the dashboard

- [ ] **Bump the version** in `package.json`. It is `0.7.1`, which is what is live.
- [ ] **Push `cws/privacy-policy.md` to `main`**, then confirm
      `.github/workflows/sync-privacy-policy.yml` ran and the
      [public gist](https://gist.github.com/LuDraGa/782b874f1e7fe0076fb2bf1509937e95) matches the
      file. **Review reads the gist, not the repo.** A stale gist is a Purple Nickel citation
      waiting to happen.
- [ ] **Build the production ZIP and unzip it.** Confirm there is no `refresh.js` and no
      `content_scripts` key in `manifest.json`. That script is dev-only
      (`IS_DEV` in `chrome-extension/utils/plugins/make-manifest-plugin.ts`), and every claim
      below about "no persistent content script" depends on it being absent from what ships.
      A scraper in the ZIP is precisely what `3657ca0` had to remove.

---

## 2. Privacy tab

### 2.1 Single purpose — replace the existing text

```
Show a user the risk in the agreements they are asked to accept. Unshafted analyzes contracts the user uploads, and reads the legal documents a website links to — terms of service, privacy policy, cookie policy — so it can tell the user what that site makes them agree to. Both produce the same structured findings: unfavorable clauses, missing protections, and what the user can still do about them.
```

### 2.2 Permission justifications

`storage` and `identity` are already entered and unchanged. The rest are new fields — `tabs`,
`activeTab` and `scripting` are in the live manifest without justifications because they predate
this file, so fill them in even though they are not new permissions.

**`host_permissions` — the one that decides the review**

```
Unshafted tells a user what the site they are on makes them agree to. To do that it must read that site's own page to find the legal documents it links to — terms of service, privacy policy, cookie policy — and fetch their text. Standing site access is required because Chrome grants activeTab only when the user clicks the toolbar icon and revokes it the moment the tab navigates, which makes automatic detection impossible. The read is a single one-shot script run only while the Unshafted side panel is open on that page. There is no persistent content script. Only links that identify a legal document are kept; all other page content is discarded inside the tab. No page content and no record of visited sites is sent to Unshafted.
```

**`tabs`**

```
Reads the URL of the active tab so the extension can tell whether the site the user is on appears in Unshafted's bundled index of already-analysed policy documents, and show the corresponding risk level. This lookup is local and involves no network request.
```

**`activeTab`**

```
Retained as the fallback path for reading the current page when a user has restricted the extension's site access from chrome://extensions. Used for the same one-shot policy-document read described under host_permissions.
```

**`scripting`**

```
Runs the one-shot script that collects the current page's legal-document links and fetches the text of a policy document, in the page's own session. No script is registered to run persistently on any page.
```

**`sidePanel`**

```
Renders the policy analysis in Chrome's side panel beside the page, so the extension never injects UI into the page itself.
```

### 2.3 Data usage grid — one change

- [ ] **Check `Website content`** — text, images, sounds, videos, hyperlinks.

It is narrow collection, but the category names hyperlinks and text and the read is real. Claiming
otherwise while shipping `<all_urls>` is the contradiction that gets items rejected. Everything
else stays as it is; in particular **leave `Web history` unchecked** — the extension reads the page
in the moment and never records where the user has been.

### 2.4 Unchanged

Remote code (**No**), the three certifications, and the privacy policy URL all stay as they are.

---

## 3. Store listing tab

- [ ] **Description** — paste the block from `store-listing-snapshot.md`. It now opens with the
      site-policy paragraph and adds the page-reading line under *Privacy at a glance*. The live
      copy describes an upload-only product; leaving it is the 0.7.0 mistake verbatim.
- [ ] **Summary** — comes from `chrome-extension/public/_locales/en/messages.json` and ships with
      the build, so it updates itself once the new ZIP is uploaded. Nothing to paste. New text:
      *"Spot risky clauses before you sign — and see what the sites you already use make you agree to."*
- [ ] **Screenshots** — the two live ones show the upload flow only. A reviewer assessing
      `<all_urls>` benefits from seeing the side panel open on a real site with its documents
      listed. Not required; cheap, and it makes the permission self-evident.

---

## 4. After submitting

- [ ] Expect a longer review than 0.7.1's. `<all_urls>` draws scrutiny that `storage`+`identity`
      did not.
- [ ] If it is rejected, **do not** reach for per-site permission prompting — one Chrome dialog
      per site is the same defect wearing a hat. The prepared retreat is a one-time all-sites
      `optional_host_permissions` request at onboarding: same end state, no install-time warning,
      and it needs a decline path. See D1 in
      `execution-docs/site-policy-part7-page-access.md`.
- [ ] Whatever happens, append the outcome to `rejection-history.md` — violation ID, root cause,
      and the diff that resolved it.

---

## 5. Once it is approved

- [ ] Update the **Version live** and **Snapshot date** headers in `privacy-form-snapshot.md` and
      `store-listing-snapshot.md`, and drop their "not yet entered" warnings.
- [ ] Delete this file. It is a work order, not a mirror.

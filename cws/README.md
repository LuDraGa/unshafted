# Chrome Web Store — source of truth

Standing artifacts that mirror the live state of the Unshafted listing on the Chrome Web Store. Kept in git so the dashboard (which is not diffable) has a versioned counterpart we can review, audit, and resubmit against.

| File | What it is |
|---|---|
| [`privacy-policy.md`](./privacy-policy.md) | The published privacy policy. Auto-synced to the public gist by `.github/workflows/sync-privacy-policy.yml` on every push to `main` that touches this file. The gist URL is what's pasted into the dashboard's Privacy tab. |
| [`privacy-form-snapshot.md`](./privacy-form-snapshot.md) | Mirror of the dashboard's **Privacy** tab — single purpose, permission justifications, remote-code answer, the data-usage checkbox grid (with rationale for unchecked categories), and the three certified disclosures. |
| [`store-listing-snapshot.md`](./store-listing-snapshot.md) | Mirror of the dashboard's **Store listing** tab — title, summary, description, category, graphic assets inventory, additional fields. Also flags listing-vs-policy drift. |
| [`rejection-history.md`](./rejection-history.md) | Running log of CWS rejections, root causes, and the fixes applied. The earliest entry covers the v0.6.7 Purple Potassium + Purple Nickel pair; subsequent entries track each resubmission. |

## When to update

- **Code change that affects data flow** → update `privacy-policy.md` first; the gist auto-syncs on push.
- **Dashboard form change** → update the matching snapshot in this directory in the same commit, so the repo stays the source of truth.
- **New rejection** → append to `rejection-history.md` with violation ID, root cause, and the diff that resolved it.

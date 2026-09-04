# Corpus

Capture output for the site-policy feature. Built by `tools/corpus/capture.ts`.

## What is committed, and what is not

| Path | Tracked | Why |
|---|---|---|
| `manifest.json` | **yes** | The map. Facts *about* documents — domains, tags, URLs, hashes, statuses, provenance. Not the documents. |
| `README.md` | yes | This file. |
| `raw/{hash}.html` | no | Third-party policy text, as fetched. |
| `text/{hash}.txt` | no | Normalized text, the thing `contentHash` is taken over. |
| `sites/{domain}.json` | no | Per-site intermediates. Their presence is what makes a re-run resumable — delete one to re-capture that site. |

Committing ~400 full policy documents to a public repository would answer Part 2's open question
on copyright posture by accident, in the most exposed way available, before anyone decided
anything. So the text stays local until it moves to a Supabase object store.

## Layout

Documents are named by `contentHash`, not by domain, for three reasons:

1. It is the same shape as the eventual object-store / CDN path (`/{hash}.txt`), so the move is a
   copy rather than a restructure.
2. Shared documents dedupe for free — `policies.google.com/terms` is one file however many sites
   point at it.
3. The hash IS the version (AD-1), so a filename can never disagree with its contents.

## Re-running

```
node --import tsx tools/corpus/capture.ts [--limit=N] [--only=domain] [--concurrency=N]
```

Sites with an existing `sites/{domain}.json` are skipped. The manifest is reassembled from those
files on every run, so a partial capture still produces a coherent manifest.

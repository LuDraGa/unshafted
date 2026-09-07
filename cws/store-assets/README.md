# CWS store assets

Everything uploaded to the Chrome Web Store listing's **Graphic assets** section.
`../store-listing-snapshot.md` records which slot each file occupies; this directory holds the
files and the reasoning behind the selection.

## Layout

```
raw/            unprocessed captures and design exports
*.jpg           upload-ready
```

`raw/` stays in the repo. Re-cropping from an original is free; re-staging a product state months
later is not.

## Requirements these files were made to

- **Screenshots:** 1280x800 or 640x400, JPEG or 24-bit PNG, **no alpha channel**, at most **five**.
- **Small promo tile:** 440x280. **Marquee promo tile:** 1400x560. Same format rules.
- macOS `screencapture` always writes PNG with an alpha channel, which CWS rejects outright.
  Everything here is JPEG, which cannot represent alpha, so the conversion is what removes it.
- Nothing was resized by forcing exact dimensions, which stretches the picture. Landscape sources
  were cover-cropped; portrait sources were scaled to fit and padded to `#1A1A1C`.

## Inventory

Produced 2026-09-07 from thirteen source images. Three good assets sit outside the five-slot cap as
`alt-*`.

### The five upload slots

| File | Source | Why it earns the slot |
|---|---|---|
| `screenshot-1-site-in-context.jpg` | `raw/window-covered-chesscom-clean.png` | The listing tile, and the only capture that fills 1280x800 with no padding. Shows the panel docked beside a real site it has just read, which is the clearest possible answer to why `<all_urls>` is needed. Also shows the self-analysis path with its provenance visible: "Analysed by you… not reviewed by Unshafted" and "The model read an excerpt of this document, not the whole of it." |
| `screenshot-2-site-verdict-google.jpg` | `raw/panel-covered-google.png` | The verdict in detail, and unlike slot 1 it is backed by Unshafted's own reviewed corpus rather than a user run. Concrete named finding, per-document risk, freshness strip. |
| `screenshot-3-any-site-analyse.jpg` | `raw/panel-uncovered-tricentis.png` | The only capture showing the full uncovered-site affordance set: the consent sentence, **Analyse this site**, and per-document Read / Open / Analyse. |
| `screenshot-4-saved-reports.jpg` | `raw/popup-history-reports-redacted.png` | The only evidence for the upload half of the description. Filenames redacted. |
| `screenshot-5-bring-your-own-key.jpg` | `raw/options-byok.png` | Answers where the key lives. "LOCALLY STORED" and "stays in chrome.storage.local" are both legible. |

### Alternates

| File | Swap it in when |
|---|---|
| `alt-drive-backup-disclosure.jpg` | You want the in-product Drive disclosure and the `drive.file` limitation on screen. That is the evidence class that cleared Purple Nickel. Email redacted. |
| `alt-toolbar-risk-badge.jpg` | You want the toolbar popup tied to the panel: "High risk · 2 documents read · What you agreed to". |
| `alt-documents-found-wikipedia.jpg` | You prefer a household-name site to Tricentis for discovery. Four cleanly identified legal documents, but **no Analyse affordance**, because the panel only offers analysis for documents same-origin with the page and Wikipedia serves its policies from `foundation.wikimedia.org`. |

### One judgement call left open

Slot 1 publishes a **"Very High risk"** verdict about a named company, produced by an unreviewed run
on the user's own key. The panel labels its own provenance on screen, the finding (mandatory
individual arbitration) is accurate and unremarkable, and the documents are publicly posted, so this
is defensible. It is still the most prominent placement in the listing. Swapping slots 1 and 2 puts
Unshafted's own reviewed corpus analysis on the tile instead, at the cost of the full-bleed frame.

### Personal data

Three captures carried personal data. The redacted derivatives are what ship; **the unredacted
originals are gitignored** and exist only on the machine that took them, matching the storage
posture `.gitignore` already applies to `corpus/`.

| Capture | What was removed, and how |
|---|---|
| `window-covered-chesscom` | Another player's handle, pixellated then blurred. The account holder's own username and avatar sat outside the 1.6:1 crop and are absent from the derivative rather than obscured in it. |
| `popup-account-drive-disclosure` | A real email address in the account row |
| `popup-history-reports` | Four document names, including a client PoC and a file naming a specific engineering level |

Obscured regions were pixellated **and** blurred. Pixellation alone leaves stroke-level structure,
and blur alone is reversible in principle for a known font at a known size; together the glyphs are
not recoverable, which is the bar for an email address or a filename naming a real client.

### Not used

| File | Why |
|---|---|
| `raw/panel-uncovered-hackernews.png` | Superseded. Its document list includes a false positive: a GitHub commit whose title merely contains the word "legal". Accurate to what the heuristic does, but it makes discovery look imprecise. |
| `raw/options-byok-advanced.png` | Redundant, and the expanded panel shows a model string that is not a real published model name. |
| `raw/popup-empty-signed-out.png` | The empty state. Nothing is happening in it. |

## Known gaps

**No screenshot shows a finished contract analysis** — the actual findings, clauses and negotiation
points. `screenshot-4-saved-reports.jpg` proves reports exist but never shows one open. The
description gives upload and site policy equal weight and only one column has real evidence.
Capturing one result screen is the single biggest improvement available.

**Slots 2 to 5 carry dark margin.** They come from portrait sources, roughly 0.39:1 for the panel
and 0.75:1 for the popup, against a 1.6:1 canvas. Slot 1 avoided this by being a full browser
window at 1900x935: cropping off-centre to the rightmost 1496x935 hits 1.600 exactly, so it scales
to the canvas with no padding and no distortion. Recapturing the others the same way, site on the
left and panel docked on the right, would remove the remaining margin.

**The promo tiles name features that do not exist.** "Scan This Site", "Corpus Insights" and
"Analyze This Page" appear on the tiles and in no part of the extension, and the marquee uses a
High Risk / Needs Review / Looks Good vocabulary where the product uses Very High / High / Medium /
Low. The artwork is otherwise sound; this is a label-level fix at the source.

## Capture recipe

Load the unpacked extension from `dist/` in Chrome (`chrome://extensions` → Developer mode → Load
unpacked). Capture the whole browser window, which is naturally landscape:

```bash
screencapture -w ~/Desktop/unshafted-capture.png
```

Then click the Chrome window. Get the panel into each state first:

| Want | How |
|---|---|
| Covered site with a verdict | Visit a domain in the corpus, open the panel from the toolbar popup. Rated Very High: `tiktok.com`, `uber.com`, `x.com`, `snapchat.com`, `walmart.com`, `doordash.com`, `zomato.com`, `paytm.com`, `zerodha.com` |
| Uncovered site with documents | Any site outside the corpus. For the **Analyse** affordance to appear, the site must serve its legal pages same-origin |
| The confirm sheet | From an uncovered site, press **Analyse this site** |
| A contract result | Upload a PDF from the popup and let it finish |

## These must be real

Listing screenshots have to show the product as it actually behaves. Promo tiles are marketing art
and get more latitude for styling, but neither may invent functionality: naming a feature that does
not exist, or showing a vocabulary the product does not use, is a listing-versus-reality mismatch,
which is the axis this item has already been cited on twice. See `../rejection-history.md`.

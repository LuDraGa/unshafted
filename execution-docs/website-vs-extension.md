# Website vs Extension: Feature Advantages

**Status:** Planning
**Date:** 2026-04-13
**Purpose:** Document features that make the web app compelling beyond what the extension can offer, organized by release version.

---

## Why a Website

The Chrome extension runs entirely client-side in a constrained popup environment. This means no heavy libraries, no long-running processes, no persistent storage beyond `chrome.storage`, and no server-side compute. The web app removes all of these constraints.

The extension is the hook — quick, lightweight contract scanning. The website is where serious analysis, collaboration, and workflow live.

---

## v2 — Immediate Web Launch

### PDF → Markdown with Full Structure Preservation
The extension extracts text from PDFs but loses structural hierarchy — headings, sections, subsections, indentation, table layouts. For contracts, this structure is meaning: it's how you know which clause governs what, what's nested under which condition, what terms are defined where.

The web app uses server-side conversion libraries (Marker, PyMuPDF, pdfplumber) to produce clean Markdown that preserves:
- Heading hierarchy (section → subsection → clause)
- Table data with proper rows/columns (pricing, obligation matrices, schedules)
- Numbered/lettered list nesting
- Bold/italic emphasis on defined terms and key phrases

**Core user value:** The LLM sees the contract the way a lawyer reads it — with structure intact — producing more accurate, context-aware analysis.

### Deep Analysis
No popup timeout constraints. The web app can run longer, more thorough multi-pass analysis — cross-referencing definitions, checking internal consistency, flagging contradictions between sections.

**Core user value:** Catches issues that quick scans miss — like a termination clause that contradicts the payment terms three pages later.

### Custom Analysis Templates
Pre-built and user-customizable analysis profiles for common contract types: SaaS vendor agreements, employment contracts, NDAs, freelancer SOWs, lease agreements.

**Core user value:** Users get analysis tuned to what actually matters for their specific contract type, not generic risk scanning.

### Downloadable Reports
Export analysis results as PDF or DOCX. Available from the analysis view and from the user's profile/history.

**Core user value:** Users can share findings with stakeholders who don't use Unshafted — attach to emails, include in deal reviews, hand to legal.

---

## v3 — Subscription Tiers & Premium Features

### AI-Generated Suggestions & Recommended Edits
Beyond identifying risks — suggest alternative language. "This liability cap is unusually low. Consider: *'aggregate liability shall not exceed 2x the annual contract value'*."

**Core user value:** Moves from "here's what's wrong" to "here's what to do about it" — actionable output, not just a red flag list.

### Negotiation Playbook Generation
For each flagged risk, generate context: is this clause standard or unusual? What's the typical pushback? What leverage points exist?

**Core user value:** Non-lawyers (founders, freelancers, procurement) can negotiate like they've seen 1,000 contracts.

### Jurisdiction-Aware Analysis
Flag clauses that may not hold up or behave differently in specific states/countries. Non-compete enforceability, arbitration clause validity, data residency requirements.

**Core user value:** A clause that's fine in Delaware might be unenforceable in California. Users know before they sign.

### Subscription Tier Structure
_Tiers and pricing TBD. Features above allocated to tiers based on cost-to-serve and user willingness to pay._

---

## v4 — Batch & Scale

### Batch Analysis
Upload multiple contracts at once. Useful for due diligence, vendor audits, portfolio review.

**Core user value:** Review 20 vendor contracts in an afternoon instead of a week.

---

## v5 — Multi-Document Intelligence

### Multi-Document Comparison
Compare contract versions side-by-side. Track changes between drafts, amendments, renewals. Spot what changed and whether the changes help or hurt.

**Core user value:** "What did they change in the redline?" answered instantly with risk context.

---

## Collaboration & Workflow (Tier-Gated)

### Dashboard & History (All profiles, above hobby tier)
Searchable history of past analyses. Filter by date, contract type, risk level. Persistent user profiles.

**Core user value:** "What did that vendor contract say about auto-renewal?" — findable months later without re-uploading.

### Comments, Sharing & Approval Workflows (Consultant / Startup / Enterprise tiers, with count limits)
- Share analyses with team members
- Comment threads on specific clauses
- Approval workflows — legal review sign-off tracking

**Core user value:** Contracts are team decisions. Analysis shouldn't be siloed in one person's browser.

---

## Integrations (Post v3)

### Google Drive
Import contracts directly from Drive. Save reports back.

### DocuSign
Pull contracts from DocuSign for pre-sign or post-sign analysis.

---

## Benchmarking Against Industry Standards (Post v3, tier TBD)

Score clauses against what's typical in the industry. "This indemnification clause is more aggressive than 80% of similar SaaS agreements."

**Core user value:** Context for whether something is a real concern or just standard boilerplate.

_Depends on implementation cost and data availability. Either a premium tier feature or included for all — decision deferred._

---

## Not Planned

- ~~OCR for scanned PDFs~~ — low priority, most contracts are digitally created
- ~~API access~~ — not planned for foreseeable future
- ~~Clause-by-clause annotation view~~ — concept unclear, revisit later
- ~~Executive summary generation~~ — concept unclear, revisit later

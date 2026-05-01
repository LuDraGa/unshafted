# Competitor Dossier — AI Terms / Privacy Analyzer Chrome Extensions

**Compiled:** 2026-05-01
**Scope:** 12 extensions surfaced as "similar" to Unshafted in the Chrome Web Store, plus adjacent niches (Web3 contract safety, lease analysis, phishing).
**Purpose:** Reference for feature gap-analysis, differentiation planning, and pricing benchmarking. Re-verify install/review/rating numbers before quoting them externally — they drift weekly.

---

## How to read this doc

Each entry has:
- **Links** — Chrome Web Store listing + marketing site (where applicable). Where the extension and website expose *different* feature surfaces, that split is called out.
- **Stats** — rating, review count, install count, last-updated date (snapshot from May 2026).
- **Features** — what the extension actually does on-page.
- **Monetization** — pricing tiers + the *ideology* behind the model (free-forever, freemium-funnel, donation, subscription-as-trust, etc.).
- **AI / privacy posture** — BYOK vs. managed backend; cloud vs. local inference.
- **Review themes** — what users praise / complain about (most have <20 reviews so signal is thin).
- **Standout angle** — their pitch differentiator.

---

## 1. AI Legal Guard: Smart Terms Analyzer

**Links**
- Chrome Web Store: https://chromewebstore.google.com/detail/ai-legal-guard-smart-term/cfpepddfglinfcpbehddoinokcmgphkn
- Marketing site: not surfaced in research — appears to be CWS-only distribution.

**Stats**
- Rating: 5.0 · Reviews: 3 · Installs: 12 · Last updated: 2026-02-02

**Short pitch:** AI-powered ToS analyzer that summarizes risks and highlights dangerous clauses (informational, not legal advice).

**Features**
- One-click side-panel scan with bulleted risk breakdown
- **PDF upload** for offline contracts/leases/employment agreements (rare in this cohort)
- Plain-English summaries
- Daily free scans + Pro tier for unlimited

**Feature split (ext vs. site):** No separate site found.

**Monetization**
- Tier model: Freemium — daily free scans, paid Pro for unlimited + power-user features.
- **Ideology:** *Funnel-style freemium* — free quota is a teaser, real value is gated behind Pro. Daily-quota framing is designed to drive Pro upgrades on heavy-use days.

**AI / privacy:** Managed backend (no BYOK). Cloud processing. "Only analyzes content you choose to scan; no browsing history stored."

**Review themes:** Too few reviews (3) to extract themes.

**Standout angle:** PDF upload for offline contracts — most peers are web-only.

---

## 2. AgreeGuard — AI Terms & Privacy Analyzer

**Links**
- Chrome Web Store: https://chromewebstore.google.com/detail/agreeguard/cafccbjdnlpdicklnamggekbfhhidmon
- Marketing site: https://agreeguard.app

**Stats**
- Rating: 0.0 (no reviews) · Installs: 17 · Last updated: 2026-03-23

**Short pitch:** "Know what you're agreeing to — before you click."

**Features (extension)**
- Auto-detects T&C checkboxes and OAuth consent prompts in real time
- Inline AI summaries
- Risk ratings + red-flag detection (auto-renewals, hidden fees, waived rights, binding arbitration, class-action waivers)
- "Deep crawl" — discovers up to 10 related legal docs across a site
- Real-time alerts, financial-terms analysis, privacy insights dashboard

**Feature split (ext vs. site):** Marketing site (agreeguard.app) is the **billing/account hub** — subscription management, plan comparison, FAQs. The extension is the analysis surface; the site is where you upgrade/cancel. Pro/Ultimate features (unlimited, advanced) are only meaningful once subscribed via the site.

**Monetization**
- Tiers: Free (2 analyses/day) · Pro $7/mo · Ultimate ~$3.25/mo (annual prepaid, ~54% discount).
- **Ideology:** *Aggressive subscription with annual lock-in.* The annual discount is steep enough (54%) that it acts as a near-default — classic SaaS "annual is cheaper" funnel. Most monetized of the cohort.

**AI / privacy:** Managed backend. Permission set is broader than peers (auth info + web history + page content) — worth flagging for trust-conscious users.

**Review themes:** None yet (0 reviews).

**Standout angle:** Real-time **checkbox / OAuth consent interception** — closest thing to "stop the user before they click Agree" in the category.

---

## 3. TERMSinator

**Links**
- Chrome Web Store: https://chromewebstore.google.com/detail/termsinator/nockglhphapodnenfclgelaepiihpfco
- Marketing site: none surfaced.

**Stats**
- Rating: 5.0 · Reviews: 5 · Installs: 22 · Last updated: 2025-04-21 (over a year stale — likely abandoned)

**Short pitch:** AI analyzer for T&Cs and privacy policies with instant insights.

**Features**
- One-click webpage analysis
- High/medium/low risk tier highlighting
- Privacy concerns + user-rights detection
- No-jargon summaries

**Feature split:** No site.

**Monetization**
- No pricing disclosed. Appears free.
- **Ideology:** *Hobby / portfolio project* — no monetization plumbing visible, no marketing site, no recent updates. Treat as functional but unmaintained.

**AI / privacy:** Managed backend, **explicitly powered by OpenAI GPT-4o** (one of the only extensions in this cohort that names its model — small trust win).

**Review themes:** 5 reviews, all positive — too thin to extract themes.

**Standout angle:** Named LLM (transparency), strong branding, but stale.

---

## 4. PrivacyPeek

**Links**
- Chrome Web Store: https://chromewebstore.google.com/detail/PrivacyPeek/apbmhhpmhmeccdjkledaibbekhcfjcmd
- Marketing site: https://privacy-peek.com

**Stats**
- Rating: 0.0 (no reviews) · Installs: 2 · Last updated: 2025-10-05

**Short pitch:** "See through the fine print — plain-English summaries and risk scores for privacy policies."

**Features (extension)**
- 0–100 numeric Privacy Score
- Plain-English summaries
- Smart background detection of privacy policies
- Smart caching for repeat visits
- Analyzes 50+ privacy factors (collection, sharing, rights, security)

**Feature split (ext vs. site):** Marketing site previews **Pro-only features** — retention warnings, real-time monitoring, PDF export — that aren't in the free extension. Site doubles as subscription gate.

**Monetization**
- Free: 10 analyses/month (build-out phase) · Pro: €3.99/mo (unlimited + retention warnings + monitoring + PDF export).
- **Ideology:** *EUR-priced, GDPR-flavored freemium.* Pricing in Euros + privacy-first marketing language signals an EU-conscious target audience. Build-out phase quota suggests a soft-launch / runway-extension play, not a stable price.

**AI / privacy:** Managed backend. "We only analyze the text you're viewing. No browsing history. No personal data stored. No login required." — strongest no-account stance in the cohort.

**Review themes:** None (2 users, 0 reviews).

**Standout angle:** **Numeric 0–100 score** as the headline UX — more glanceable than text summaries. No-login is friction-free.

---

## 5. Terms Summarizer

**Links**
- Chrome Web Store: https://chromewebstore.google.com/detail/terms-summarizer/lcojnohffhdpnhijdbgengkpkmbmienl
- Marketing site: none surfaced.

**Stats**
- Rating: 4.3 · Reviews: 17 · Installs: 43 · Last updated: 2025-07-17
- (Largest review base of the dossier — also the only one not at 5.0, suggesting real friction.)

**Short pitch:** "Summarize long Terms & Conditions instantly with AI."

**Features**
- Instant T&C / privacy-policy summaries
- Privacy risk detection + alerts on hidden clauses
- **Multi-language support with translation** (unique in cohort)
- One-click integration on any site
- Smart highlighting of red flags

**Feature split:** No site.

**Monetization**
- No pricing disclosed. Appears free.
- **Ideology:** *Free utility, no clear business model.* Possibly ad-supported in future, possibly portfolio. The 4.3 rating + 17 reviews suggests it's been around long enough for friction to surface but no monetization has been bolted on.

**AI / privacy:** Managed backend.

**Review themes:** Could not extract individual review text from the listing fetch. The non-perfect 4.3 likely reflects summary-quality complaints or false-positive risk flags — the two most common failure modes in the category.

**Standout angle:** **Multi-language** — only competitor handling non-English ToS. Highest review base = longest in-market.

---

## 6. FairSharky (Beta)

**Links**
- Chrome Web Store: **not confirmed** — listing not located via direct search.
- Directory entry: https://www.phdeck.com/product/fairsharky-beta

**Stats:** Unknown across the board. Beta-stage.

**Short pitch:** Browser extension that simplifies online T&Cs and privacy policies in one click.

**Features (per directory):**
- One-click summaries of T&Cs and privacy policies
- Surfaces data-collection practices, user rights, potential risks

**Feature split:** Cannot assess — extension not located.

**Monetization:** Not disclosed. Beta. **Ideology:** Unknown — too early to tell.

**AI / privacy:** Unknown.

**Standout angle:** None visible. Likely a non-threat competitively at this stage; revisit if/when it ships publicly.

---

## 7. Termzy AI

**Links**
- Chrome Web Store: https://chromewebstore.google.com/detail/termzy-ai/jjldkongdpelbemfpopklkedjbhdnfif
- Marketing site: https://www.termzyai.com

**Stats**
- Rating: 5.0 · Reviews: 7 · Installs: **223** (largest in cohort) · Last updated: 2026-03-29

**Short pitch:** AI tool that auto-detects and summarizes privacy policies and T&Cs.

**Features (extension)**
- Auto-detection of legal docs while browsing
- Bullet-point summarization
- **Four-axis trust score**: data protection · legal compliance · transparency · balance/fairness
- Red-flag identification
- In-app purchase support

**Feature split (ext vs. site):** Marketing site is mostly **brand/PR** — origin story (UAmsterdam students), press coverage (The AI Journal, Sovereign Magazine, MEXC News), waitlists for upcoming features. Extension is the product surface.

**Monetization**
- Freemium with **in-app purchases** (specific pricing not on listing).
- **Ideology:** *Mixed model, leaning consumer-app.* IAP rather than recurring subscription is unusual in the cohort — feels closer to mobile-app monetization than SaaS. Suggests they're testing willingness-to-pay before committing to a subscription.

**AI / privacy:** Managed backend. "Termzy does not save your browsing history or page content. Analyses are not saved against user identity." Stronger no-retention claim than peers.

**Review themes:** 7 reviews, all 5.0 — too thin for themes.

**Standout angle:** **Four named trust dimensions** (rubric, not score) + **founder/origin story** as a marketing anchor. The press-coverage strategy correlates with the highest install base (223) — this matters more than feature parity at this stage of the market.

---

## 8. Safe Terms

**Links**
- Chrome Web Store: **not located** — multiple search variants returned no match.
- Marketing site: none found.

**Status:** Unverified. Could be a misremembered name, recently delisted, or extremely low-distribution. Treat as "does not exist" until a developer name or CWS slug surfaces.

---

## 9. Web3 ASP: Agentic

**Links**
- Chrome Web Store: **exact name not located.** Closest live competitors in the same niche:
  - Web3 Antivirus (W3A): https://chromewebstore.google.com/detail/web3-antivirus-protect-cr/inejiiekmjkmphgjjehhcmkpjncboodn
  - Pocket Universe: https://pocketuniverse.app
  - AI Wallet Defender: https://chromewebstore.google.com/detail/ai-wallet-defender/polbfjlcgpgdipmfdoghckdkhbobaofa
  - AegisWeb3 (PeckShield) — CWS listing exists, slug variable.

**Category notes — Web3 transaction safety**
- Pre-sign transaction simulation
- Smart-contract risk scoring
- Phishing / wallet-drainer detection (W3A claims 60+ scam types)
- Honeypot, fake-token, address-poisoning detection

**Monetization**
- Mostly free or freemium. W3A has paid tiers.
- **Ideology:** *Insurance-style — pay for peace of mind on high-value transactions.* Different psychology than ToS analyzers (where the cost of being wrong is abstract).

**AI / privacy:** Mix. W3A uses ML for transaction simulation server-side. None require seed phrases / private keys.

**Standout angle:** This is an **adjacent category**, not a direct competitor. Most ToS extensions ignore Web3 dApps entirely; Web3 extensions ignore traditional legal text. **Bridging the two is a real differentiation lever.**

---

## 10. SecureAI

**Links**
- Chrome Web Store: **exact name not located.** Closest matches:
  - ProtectAI: https://chromewebstore.google.com/detail/protectai/nfihlgiffmbfpnkbglggmjnifnnjgmjk (phishing + Web3 contract / NFT / approval / airdrop analysis; listing returned a stub on direct fetch — possibly very new or restricted)
  - PlainTOS — AI Contract & TOS Analyzer: https://chromewebstore.google.com/detail/plaintos-%E2%80%93-ai-contract-to/mmdbodhlfdbhpgpchgbdmgogeapjlbbo (3.5 stars, contracts + ToS + NDAs in-browser, free no-account, 10 free daily AI actions)

**Monetization (best guesses)**
- ProtectAI: likely free.
- PlainTOS: free with daily quota.
- **Ideology:** *Hybrid threat-detection.* Phishing + legal + smart-contract is a wide-net pitch — appeals to crypto users but less differentiated for non-crypto users.

**AI / privacy:** Managed backend in both. PlainTOS markets "no browsing data collected, no sensitive permissions."

**Standout angle:** Phishing detection + legal-text analysis + smart-contract scanning in one extension. Crowded surface for crypto users, less compelling for everyone else.

---

## 11. Tenant Lease AI

**Links**
- Chrome Web Store: **not located** as a tenant-side extension.
- Adjacent **web tools** (none are Chrome extensions):
  - LeaseAI: https://leaseai.net (free web upload, instant analysis, no signup)
  - LeaseChat: https://www.getleasechat.com (free, geo-aware via Google Maps, citation-backed explanations, dispute-letter generation)
  - goHeather: https://www.goheather.io/ai-document-review/rental-agreement-ai-review (lawyer-trained, clause-by-clause ranking)
  - TurboTenant Lease Audit (landlord-side, state-specific, 15-second scan, free)
  - Stan AI (landlord/HOA-focused Chrome extension)

**Category features**
- State-law-aware analysis
- Hidden-fee detection
- Security-deposit compliance
- Subletting / right-of-entry / eviction clauses
- Dispute-letter generation

**Monetization**
- Most are free with optional paid tiers.
- **Ideology:** *Legal-aid adjacent — free as user-acquisition for paid lawyer-referral or document-generation upsell.*

**Standout angle / opportunity:** **No Chrome extension owns the renter-side lease niche.** All of it lives on the open web as upload tools. **Strong greenfield for Unshafted** if PDF-upload mode + jurisdiction-aware checks are built in.

---

## 12. Legal AI: Privacy Policy Analyzer

**Links**
- Chrome Web Store: https://chromewebstore.google.com/detail/legal-ai-privacy-policy-a/bfbikphbgajeioohngkogijinikhmehb
- Marketing site: none surfaced.

**Stats**
- Rating: 0.0 (no reviews) · Installs: 15 · Last updated: 2024-12-05 (oldest in cohort, likely abandoned)

**Short pitch:** Real-time AI analysis of website privacy policies across multiple risk dimensions.

**Features**
- Four risk dimensions: Security & Data Protection · Data Collection & Usage · Third-Party Sharing · User Rights & Control
- Color-coded severity levels
- Specific policy excerpts + implications
- Recommended action items

**Feature split:** No site.

**Monetization**
- No pricing disclosed. Appears free.
- **Ideology:** *Static portfolio project.* No update in 17+ months and no monetization plumbing — likely shipped and forgotten.

**AI / privacy:** Marketing claims **fully local / in-browser AI inference** ("all AI processing happens locally within your browser"). **Only competitor in the cohort to claim true on-device inference.** Worth verifying technically — could be transformers.js / WebLLM, could be marketing puffery. Either way, the abandonment status weakens the proof point.

**Review themes:** None.

**Standout angle:** Local-first AI claim + four named privacy dimensions. Stale execution undermines both.

---

## Cross-cutting observations

### Market maturity
- **Tiny, immature category.** Largest extension is Termzy AI at 223 installs. Aggregate confirmed install base across 8 verified extensions is ~335. Max review count is 17 (Terms Summarizer); most have 0–7. **No entrenched leader.**
- Several listings are stale (Legal AI: 2024-12, TERMSinator: 2025-04) or beta (FairSharky, PrivacyPeek). The category is full of weekend-project launches.

### Common features (table stakes)
- One-click webpage scan
- Plain-English summaries
- Risk scoring (color-coded, severity tiers, or 0–100)
- Red-flag detection of canonical clauses (auto-renewal, arbitration, data sale, class-action waiver)

### Differentiating features (sparse)
| Feature                          | Who has it                                    |
|----------------------------------|-----------------------------------------------|
| PDF upload                       | AI Legal Guard                                |
| Multi-language / translation     | Terms Summarizer                              |
| Auto-detect on page load         | AgreeGuard, Termzy AI, PrivacyPeek            |
| Real-time checkbox/OAuth interception | AgreeGuard                              |
| Structured trust rubric (multi-axis) | Termzy AI (4-axis), Legal AI (4 categories) |
| Numeric score (0–100)            | PrivacyPeek                                   |
| Named LLM (transparency)         | TERMSinator (GPT-4o)                          |
| Local-first AI (claimed)         | Legal AI (stale)                              |
| Side panel UX                    | AI Legal Guard, AgreeGuard                    |

### Common gaps (Unshafted opportunities)
- **No BYOK option in any of the 12.** Every confirmed extension is managed-backend. A BYOK mode would meaningfully differentiate for power users / privacy-conscious users.
- **No genuinely working on-device inference.** Legal AI claims it but is stale. Gemini Nano / WebLLM are mature enough in 2026 to make this real.
- **No history / change-tracking.** No one tracks "this site's privacy policy changed since you accepted it."
- **No jurisdiction awareness.** GDPR vs. CCPA vs. state-specific tenant law — wide open.
- **No lease / employment / NDA specificity.** Tenant-lease analysis doesn't exist as a Chrome extension; AI Legal Guard's PDF upload is the closest.
- **No community / shared cache.** "Already analyzed for 100 other users" pattern (ToS;DR has the concept, but isn't AI-powered).
- **No transparent model/cost disclosure.** Only TERMSinator names its LLM.
- **Chrome-only.** Nobody is shipping cross-browser (Firefox, Edge, Safari, Brave).

### Monetization patterns
- **Free / no monetization disclosed:** TERMSinator, Terms Summarizer, Legal AI.
- **Freemium with daily/monthly quota → Pro:** AI Legal Guard, AgreeGuard, PrivacyPeek, Termzy AI.
- **Tiered subscription with annual discount:** AgreeGuard ($7/mo monthly · ~$3.25/mo annual).
- **In-app purchases (one-off):** Termzy AI.
- **Pricing range:** ~€3.99–$7/mo for disclosed Pro tiers. **No one charges premium.** Suggests low price ceiling — or no one has tested premium pricing yet.

### Monetization ideologies (per cluster)
- **Funnel-style freemium** (AI Legal Guard, PrivacyPeek): free quota teases, Pro upgrade unlocks volume + power features.
- **Aggressive subscription with annual lock-in** (AgreeGuard): steep annual discount makes annual the default; closest to traditional SaaS.
- **Hobby / portfolio** (TERMSinator, Terms Summarizer, Legal AI): no monetization, no recent updates.
- **Consumer-app IAP** (Termzy AI): one-off purchases, mobile-app-style — testing willingness to pay without subscription commitment.
- **Insurance-style** (Web3 cluster): pay for safety on high-stakes transactions.
- **Legal-aid adjacency** (Lease tools): free as funnel for document-generation or lawyer-referral upsell.

### Privacy posture
- Standard CWS "data not sold" disclosure across the board.
- **Only Legal AI claims true local AI inference** — and it's stale.
- None lean into "your browsing pattern is private from the AI vendor too" — **most under-served trust dimension.**

### Naming / positioning
- The naming space is saturated with combinations of: AI · Legal · Terms · Privacy · Guard · Analyzer · Summarizer.
- **"Unshafted" stands out as lifestyle-branded rather than category-branded** — keep it.
- **Origin / founder narrative** correlates with traction (Termzy AI's UAmsterdam-students story → 223 installs, by far the most). Worth considering a similar narrative anchor.

### Review-quality signal
- The category has so few reviews that **review themes are essentially unextractable.** No competitor exceeds 17 reviews. This is itself a finding: **users install, scan once or twice, and don't return enough to leave a review.** Implication: the value moment is *occasion-of-use* (the moment before clicking Agree), not daily-active engagement. AgreeGuard's checkbox interception is the only competitor designed around that insight.

### TL;DR positioning for Unshafted
The category is unowned. Naming is generic. No one has crossed 250 users. **No one offers BYOK, no one offers true local-first inference, no one bridges to lease/employment contracts, no one tracks policy changes over time, and no one is multi-browser.** Pick any two of those gaps and Unshafted is more differentiated than 11 of these 12.

---

## Sources

- [AI Legal Guard – CWS](https://chromewebstore.google.com/detail/ai-legal-guard-smart-term/cfpepddfglinfcpbehddoinokcmgphkn)
- [AgreeGuard – CWS](https://chromewebstore.google.com/detail/agreeguard/cafccbjdnlpdicklnamggekbfhhidmon) · [agreeguard.app](https://agreeguard.app)
- [TERMSinator – CWS](https://chromewebstore.google.com/detail/termsinator/nockglhphapodnenfclgelaepiihpfco)
- [PrivacyPeek – CWS](https://chromewebstore.google.com/detail/PrivacyPeek/apbmhhpmhmeccdjkledaibbekhcfjcmd) · [privacy-peek.com](https://privacy-peek.com/)
- [Terms Summarizer – CWS](https://chromewebstore.google.com/detail/terms-summarizer/lcojnohffhdpnhijdbgengkpkmbmienl)
- [FairSharky on phdeck](https://www.phdeck.com/product/fairsharky-beta)
- [Termzy AI – CWS](https://chromewebstore.google.com/detail/termzy-ai/jjldkongdpelbemfpopklkedjbhdnfif) · [termzyai.com](https://www.termzyai.com/)
- [Legal AI: Privacy Policy Analyzer – CWS](https://chromewebstore.google.com/detail/legal-ai-privacy-policy-a/bfbikphbgajeioohngkogijinikhmehb)
- [Web3 Antivirus – CWS](https://chromewebstore.google.com/detail/web3-antivirus-protect-cr/inejiiekmjkmphgjjehhcmkpjncboodn)
- [ProtectAI – CWS](https://chromewebstore.google.com/detail/protectai/nfihlgiffmbfpnkbglggmjnifnnjgmjk)
- [PlainTOS – CWS](https://chromewebstore.google.com/detail/plaintos-%E2%80%93-ai-contract-to/mmdbodhlfdbhpgpchgbdmgogeapjlbbo)
- [AI Wallet Defender – CWS](https://chromewebstore.google.com/detail/ai-wallet-defender/polbfjlcgpgdipmfdoghckdkhbobaofa)
- [LeaseAI](https://leaseai.net/) · [LeaseChat](https://www.getleasechat.com/) · [goHeather](https://www.goheather.io/ai-document-review/rental-agreement-ai-review)
- [Toolify: Legal AI Chrome extension overview](https://www.toolify.ai/ai-news/legal-ai-analyzing-privacy-policies-with-chrome-extension-3434282)

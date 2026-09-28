/**
 * The discovery bench's fixed site list — sites the corpus does NOT cover, each with the documents
 * a person would pick by hand. See `bench-discovery.ts` for how they are scored.
 *
 * SELECTION RULE. Websites (not apps) people use regularly, including AI and developer tools; a
 * US and India mix; no site already in `sites.ts`, because the point is what a reader gets where
 * we hold nothing. Deliberately seeded with the cases discovery is known to find hard, each marked
 * with `hardCase` so a change in the headline number can be traced to the kind of site it moved.
 *
 * EXPECTED URLS were picked by hand on 2026-09-28 by opening each homepage, following its links to
 * the document a reader would actually want, and recording where that document finally lives. The
 * same day three independent reviewers re-picked every site from scratch and audited the list;
 * where they disagreed with the first pick, their evidence is what the entry and its note now say.
 * `urls` lists every address that serves ONE document — the link as the site writes it and the
 * page it redirects to — because a pick is judged on the document, not on the spelling of its URL.
 * The bench follows HTTP redirects itself; a JavaScript redirect it cannot see is listed by hand.
 * Never two different documents in one entry: that would let a wrong pick score as found. Where
 * a site offers several of a kind (consumer and business terms), the consumer one is expected: the
 * extension's reader is a person, not a procurement team.
 *
 * Fixed on purpose. Editing an expectation changes what every earlier number meant; if a site
 * moves its documents, record the move in the plan doc's bench record rather than silently
 * re-pointing the entry.
 */
import type { PolicyDocType } from '../../packages/unshafted-core/lib/site-policy/types.js';

export type BenchHardCase =
  /** The homepage links a hub page listing documents, not the documents themselves. */
  | 'legal_hub'
  /** The documents live on another subdomain of the same site. */
  | 'other_subdomain'
  /** The documents live on another registrable domain the company owns (parent, sibling brand). */
  | 'other_domain'
  /**
   * The documents are served from a domain the company does not own: a policy vendor's (Termly,
   * iubenda, Notion), a hosted help desk's, public cloud storage. A vendor serving on the company's
   * own subdomain is `other_subdomain` (discovery sees only the subdomain), and a company's own
   * other domain — parent, group, CDN — is `other_domain`.
   */
  | 'third_party_host'
  /** The document is a PDF, not a web page. */
  | 'pdf'
  /**
   * The DOCUMENT only exists after JavaScript runs: its raw HTML carries none of its text. About
   * the document, not the homepage — discovery reads the live DOM, so a homepage whose links are
   * rendered by script is not hard in itself.
   */
  | 'js_rendered'
  /** The homepage DOM holds no policy link until the reader clicks something (a menu, a drawer). */
  | 'links_need_interaction'
  /**
   * The page also links something a naive pick would take for the document: another company's
   * policy, a same-word non-policy (a news headline, a product category), or a narrower document of
   * the same type from the same company (a programme's terms, a state supplement, a landing page).
   */
  | 'decoys';

export type BenchExpectation = {
  docType: PolicyDocType;
  urls: string[];
};

export type BenchSite = {
  domain: string;
  genre: string;
  market: 'us' | 'in' | 'global';
  hardCase?: BenchHardCase[];
  expected: BenchExpectation[];
  note?: string;
};

export const BENCH_SITES: BenchSite[] = [
  // ── AI tools ──
  {
    domain: 'chatgpt.com',
    genre: 'ai',
    market: 'global',
    hardCase: ['other_domain'],
    note: "Uncovered by domain, but its documents are the corpus's openai.com ones (whose `domains` list only openai.com). From India openai.com/privacy redirects to /policies/privacy-policy/; OpenAI also serves US and rest-of-world editions, and a US visitor may be redirected to another — unverified.",
    expected: [
      {
        docType: 'privacy',
        urls: [
          'https://openai.com/privacy',
          'https://openai.com/policies/privacy-policy/',
          'https://openai.com/policies/services-communications-privacy-policy/',
        ],
      },
      {
        docType: 'terms',
        urls: [
          'https://openai.com/terms',
          'https://openai.com/policies/terms-of-use/',
          'https://openai.com/policies/row-terms-of-use/',
        ],
      },
    ],
  },
  {
    domain: 'claude.ai',
    genre: 'ai',
    market: 'global',
    hardCase: ['other_domain', 'decoys'],
    note: 'Logged out, the homepage is the login page; its footer links anthropic.com, where Commercial, Consumer and K-12 terms sit side by side and the commercial one sorts first. "Legal" goes to claude.com/solutions/legal, a product page.',
    expected: [
      { docType: 'privacy', urls: ['https://www.anthropic.com/legal/privacy'] },
      { docType: 'terms', urls: ['https://www.anthropic.com/legal/consumer-terms'] },
    ],
  },
  {
    domain: 'perplexity.ai',
    genre: 'ai',
    market: 'global',
    hardCase: ['links_need_interaction'],
    note: 'No policy link in the homepage DOM after load or scrolling (seven anchors, all app routes; the cookie banner names its policy without linking it). The Sign In modal links privacy only, via perplexity.com. Link discovery cannot reach either document, but /privacy redirects to the privacy notice, so a well-known-path fallback could. The documents themselves are server-rendered.',
    expected: [
      {
        docType: 'privacy',
        urls: [
          'https://www.perplexity.ai/hub/legal/privacy-notice',
          'https://www.perplexity.ai/hub/legal/privacy-policy',
        ],
      },
      { docType: 'terms', urls: ['https://www.perplexity.ai/hub/legal/terms-of-service'] },
    ],
  },
  {
    domain: 'huggingface.co',
    genre: 'ai',
    market: 'global',
    expected: [
      { docType: 'privacy', urls: ['https://huggingface.co/privacy'] },
      { docType: 'terms', urls: ['https://huggingface.co/terms-of-service'] },
    ],
  },
  {
    domain: 'mistral.ai',
    genre: 'ai',
    market: 'global',
    hardCase: ['other_subdomain', 'legal_hub'],
    note: 'The footer "Terms of Service" link lands on a legal-centre hub split by consumer / commercial / partner; the consumer terms are one hop further. The hub lists the EEA consumer terms (a different document) before the rest-of-world ones, so a naive hub-follower takes the wrong one for a reader in India or the US.',
    expected: [
      { docType: 'privacy', urls: ['https://legal.mistral.ai/terms/privacy-policy'] },
      { docType: 'terms', urls: ['https://legal.mistral.ai/terms/row-consumer-terms'] },
    ],
  },
  {
    domain: 'deepseek.com',
    genre: 'ai',
    market: 'global',
    hardCase: ['other_subdomain'],
    note: 'The apex serves a zh-CN page that replaces itself with /en/ by script; a read taken before that lands on zh-CN documents, and a read during it fails.',
    expected: [
      { docType: 'privacy', urls: ['https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html'] },
      { docType: 'terms', urls: ['https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html'] },
    ],
  },

  {
    domain: 'chatpdf.com',
    genre: 'ai',
    market: 'global',
    hardCase: ['third_party_host', 'js_rendered'],
    note: 'Both documents are Notion pages on notion.site, linked from the footer "LEGAL" column (which also links an Imprint there); the Notion pages carry no text until JavaScript runs. chatpdf.com 308s to www.chatpdf.com.',
    expected: [
      {
        docType: 'privacy',
        urls: ['https://chat-pdf.notion.site/ChatPDF-Privacy-Policy-45fa3cf8bac8483896eb09b108f0c0f2'],
      },
      {
        docType: 'terms',
        urls: ['https://chat-pdf.notion.site/ChatPDF-Terms-of-Service-6a422751d9b74ad8893dea50fd970270'],
      },
    ],
  },
  {
    domain: 'futuretools.io',
    genre: 'ai',
    market: 'global',
    hardCase: ['third_party_host', 'js_rendered'],
    note: 'Both footer links go to Termly; each 301s to Termly\'s policy viewer, which is JS-rendered and titled "Termly Policy Viewer" for either document.',
    expected: [
      {
        docType: 'privacy',
        urls: [
          'https://app.termly.io/document/privacy-policy/5667009e-9755-48de-ba93-4a0fe61528d7',
          'https://app.termly.io/policy-viewer/policy.html?policyUUID=5667009e-9755-48de-ba93-4a0fe61528d7',
        ],
      },
      {
        docType: 'terms',
        urls: [
          'https://app.termly.io/document/terms-of-use-for-website/e9e30fa0-42fc-4d01-8def-22f74cf7096f',
          'https://app.termly.io/policy-viewer/policy.html?policyUUID=e9e30fa0-42fc-4d01-8def-22f74cf7096f',
        ],
      },
    ],
  },

  // ── Developer tools ──
  {
    domain: 'github.com',
    genre: 'developer',
    market: 'global',
    hardCase: ['other_subdomain'],
    expected: [
      {
        docType: 'privacy',
        urls: [
          'https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement',
          'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
        ],
      },
      {
        docType: 'terms',
        urls: [
          'https://docs.github.com/site-policy/github-terms/github-terms-of-service',
          'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service',
        ],
      },
    ],
  },
  {
    domain: 'vercel.com',
    genre: 'developer',
    market: 'global',
    expected: [
      {
        docType: 'privacy',
        urls: ['https://vercel.com/legal/privacy-policy', 'https://vercel.com/legal/privacy-notice'],
      },
      { docType: 'terms', urls: ['https://vercel.com/legal/terms'] },
    ],
  },
  {
    domain: 'figma.com',
    genre: 'developer',
    market: 'global',
    hardCase: ['legal_hub'],
    note: 'The footer carries one link, "Legal and privacy", to a hub.',
    expected: [
      { docType: 'privacy', urls: ['https://www.figma.com/legal/privacy/'] },
      { docType: 'terms', urls: ['https://www.figma.com/legal/tos/'] },
    ],
  },
  {
    domain: 'jetbrains.com',
    genre: 'developer',
    market: 'global',
    hardCase: ['decoys'],
    note: 'The footer links the Privacy Notice and Terms of Use directly (the cookie banner repeats both). Beside them sit a JS-rendered "Privacy and Security" landing page on a shallower path that types as privacy and outranks the notice, and a "Legal" hub. The Account and User Agreements are separate documents reachable only through the hub.',
    expected: [
      { docType: 'privacy', urls: ['https://www.jetbrains.com/legal/docs/privacy/privacy/'] },
      { docType: 'terms', urls: ['https://www.jetbrains.com/legal/docs/company/useterms/'] },
    ],
  },
  {
    domain: 'postman.com',
    genre: 'developer',
    market: 'global',
    hardCase: ['other_subdomain', 'js_rendered', 'decoys'],
    note: 'The privacy policy lives in a privacy centre Transcend hosts on Postman\'s own subdomain (privacy.postman.com, CNAME to CloudFront), whose raw HTML is an empty app shell; the terms page is JS-rendered too. The footer\'s "Legal Terms Hub" types as terms on a shallower path than the Terms of Service, beside Product Terms and Website Terms of Use.',
    expected: [
      { docType: 'privacy', urls: ['https://privacy.postman.com/policies/'] },
      { docType: 'terms', urls: ['https://www.postman.com/legal/terms/'] },
    ],
  },
  {
    domain: 'dyno.gg',
    genre: 'developer',
    market: 'global',
    hardCase: ['third_party_host', 'legal_hub'],
    note: 'Discord bot dashboard. Footer "Privacy Policy" opens iubenda\'s short-form summary, whose "Show the complete Privacy Policy" leads to the full document — the summary is not expected, by the same rule as a hub. Footer "Terms and Conditions" lands on dyno.gg/terms, a stub whose only content is an iubenda embed link to the terms. The iubenda documents are server-rendered.',
    expected: [
      {
        docType: 'privacy',
        urls: [
          'https://www.iubenda.com/privacy-policy/21925808/legal',
          'https://www.iubenda.com/app/privacy-policy/21925808/legal',
          'https://www.iubenda.com/privacy-policy/21925808/full-legal',
        ],
      },
      { docType: 'terms', urls: ['https://www.iubenda.com/terms-and-conditions/21925808'] },
    ],
  },
  {
    domain: 'cursor.com',
    genre: 'developer',
    market: 'global',
    hardCase: ['decoys'],
    note: 'The footer links /en-US/ paths and the cookie banner plain ones; both serve the same documents. The footer also links "Grok Bot Terms", a product supplement that types as terms.',
    expected: [
      { docType: 'privacy', urls: ['https://cursor.com/privacy', 'https://cursor.com/en-US/privacy'] },
      {
        docType: 'terms',
        urls: ['https://cursor.com/terms-of-service', 'https://cursor.com/en-US/terms-of-service'],
      },
    ],
  },
  {
    domain: 'heroku.com',
    genre: 'developer',
    market: 'global',
    hardCase: ['other_domain'],
    note: 'Documents are the parent company’s, on salesforce.com. The footer "Terms of Service" is Salesforce’s website terms; the Heroku service itself is governed by the Salesforce Main Services Agreement (a PDF), linked only from heroku.com/policy/, which the homepage does not link. There is no Heroku-specific privacy policy.',
    expected: [
      {
        docType: 'privacy',
        urls: [
          'https://www.salesforce.com/company/privacy/',
          'https://www.salesforce.com/company/privacy/full_privacy/',
          'https://www.salesforce.com/company/legal/privacy/',
        ],
      },
      {
        docType: 'terms',
        urls: ['https://www.salesforce.com/company/legal/sfdc-website-terms-of-service/'],
      },
    ],
  },

  // ── Everyday, US-led ──
  {
    domain: 'medium.com',
    genre: 'media',
    market: 'us',
    hardCase: ['other_subdomain'],
    expected: [
      { docType: 'privacy', urls: ['https://policy.medium.com/medium-privacy-policy-f03bf92035c9'] },
      { docType: 'terms', urls: ['https://policy.medium.com/medium-terms-of-service-9db0094a1e0f'] },
    ],
  },
  {
    domain: 'wikipedia.org',
    genre: 'media',
    market: 'global',
    hardCase: ['other_domain'],
    expected: [
      {
        docType: 'privacy',
        urls: [
          'https://foundation.wikimedia.org/wiki/Special:MyLanguage/Policy:Privacy_policy',
          'https://foundation.wikimedia.org/wiki/Policy:Privacy_policy',
        ],
      },
      {
        docType: 'terms',
        urls: [
          'https://foundation.wikimedia.org/wiki/Special:MyLanguage/Policy:Terms_of_Use',
          'https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use',
        ],
      },
    ],
  },
  {
    domain: 'reuters.com',
    genre: 'news',
    market: 'global',
    hardCase: ['other_domain', 'decoys'],
    note: 'The privacy statement is the parent company’s, on thomsonreuters.com. The homepage also links a dozen /legal/ news sections and articles, and any headline containing "privacy" is a same-origin, privacy-typed link — on 2026-09-28 the shipped ranker picked one as the privacy policy, and which article it is changes daily. The terms page answers a headless browser and curl with 401 (DataDome), so its content is unverified; the homepage itself loaded headless 3 of 3 times.',
    expected: [
      {
        docType: 'privacy',
        urls: [
          'https://www.thomsonreuters.com/en/privacy-statement.html',
          'https://www.thomsonreuters.com/en/privacy-statement',
        ],
      },
      { docType: 'terms', urls: ['https://www.reuters.com/info-pages/terms-of-use/'] },
    ],
  },
  {
    domain: 'expedia.com',
    genre: 'travel',
    market: 'us',
    hardCase: ['decoys'],
    note: 'The cookie banner links the privacy statement and terms of service directly. The footer also links One Key and Vrbo terms, but it did not render headless in 0 of 3 loads on 2026-09-28 (a survey earlier that day saw it), and the site answers 429 "Bot or Not?" after a burst of requests — expect this site to vary between runs.',
    expected: [
      {
        docType: 'privacy',
        urls: [
          'https://www.expedia.com/legal/privacy',
          'https://www.expedia.com/lp/lg-privacypolicy',
          'https://www.expedia.com/lp/b/lg-privacypolicy',
        ],
      },
      {
        docType: 'terms',
        urls: ['https://www.expedia.com/lp/b/terms-of-service', 'https://www.expedia.com/lp/lg-legal'],
      },
    ],
  },
  {
    domain: 'webmd.com',
    genre: 'health',
    market: 'us',
    hardCase: ['decoys'],
    note: 'The page also links Google’s privacy policy and terms, and health "Conditions" pages.',
    expected: [
      { docType: 'privacy', urls: ['https://www.webmd.com/about-webmd-policies/about-privacy-policy'] },
      {
        docType: 'terms',
        urls: ['https://www.webmd.com/about-webmd-policies/about-terms-and-conditions-of-use'],
      },
    ],
  },
  {
    domain: 'coursera.org',
    genre: 'education',
    market: 'us',
    expected: [
      { docType: 'privacy', urls: ['https://www.coursera.org/about/privacy'] },
      { docType: 'terms', urls: ['https://www.coursera.org/about/terms'] },
    ],
  },
  {
    domain: 'indeed.com',
    genre: 'jobs',
    market: 'global',
    hardCase: ['other_domain'],
    note: 'The privacy policy is on hrtechprivacy.com, a privacy centre registered to Indeed, Inc. and shared with Glassdoor; privacy and cookie policy are one page told apart by fragment. From India the homepage redirects to in.indeed.com, whose /legal is the same global Terms of Service as www.indeed.com/legal.',
    expected: [
      { docType: 'privacy', urls: ['https://hrtechprivacy.com/brands/indeed'] },
      { docType: 'terms', urls: ['https://www.indeed.com/legal', 'https://in.indeed.com/legal'] },
    ],
  },
  {
    domain: 'tinder.com',
    genre: 'dating',
    market: 'us',
    hardCase: ['decoys'],
    note: 'The footer also links a Consumer Health Data Privacy Policy (a Washington/Nevada supplement) at the same depth as the privacy policy; the shipped ranker ties them and takes it on URL order.',
    expected: [
      { docType: 'privacy', urls: ['https://tinder.com/privacy', 'https://tinder.com/privacy/intl/en/'] },
      { docType: 'terms', urls: ['https://tinder.com/terms', 'https://tinder.com/terms/intl/en/'] },
    ],
  },
  {
    domain: 'pinterest.com',
    genre: 'social',
    market: 'us',
    hardCase: ['other_subdomain'],
    note: 'The homepage links same-origin /_/_/policy/ paths that redirect (302) to policy.pinterest.com, which sends no Access-Control-Allow-Origin — so the panel is offered the document and cannot read it. Both documents announce new versions effective 2026-11-12.',
    expected: [
      {
        docType: 'privacy',
        urls: [
          'https://www.pinterest.com/_/_/policy/privacy-policy/',
          'https://policy.pinterest.com/en/privacy-policy',
        ],
      },
      {
        docType: 'terms',
        urls: [
          'https://www.pinterest.com/_/_/policy/terms-of-service/',
          'https://policy.pinterest.com/en/terms-of-service',
        ],
      },
    ],
  },
  {
    domain: 'twitch.tv',
    genre: 'streaming',
    market: 'us',
    hardCase: ['links_need_interaction', 'js_rendered', 'other_subdomain'],
    note: 'The homepage DOM holds no policy link after load or scrolling; Privacy Notice and Terms appear only once the top-nav "More Options" menu is clicked, which the bench never does, so this site cannot score found. The documents are JS-rendered on legal.twitch.com.',
    expected: [
      {
        docType: 'privacy',
        urls: ['https://legal.twitch.com/legal/privacy-notice/', 'https://legal.twitch.com/en/legal/privacy-notice/'],
      },
      {
        docType: 'terms',
        urls: [
          'https://legal.twitch.com/legal/terms-of-service/',
          'https://legal.twitch.com/en/legal/terms-of-service/',
        ],
      },
    ],
  },
  {
    domain: 'store.steampowered.com',
    genre: 'gaming',
    market: 'global',
    hardCase: ['decoys'],
    note: 'The terms are the "Steam Subscriber Agreement", labelled "Steam SSA" in the footer — neither the label nor /subscriber_agreement/ contains a word the link pattern knows. The page also links "Notices & Policies" (/legal/, a trademark notice), "Legal" (valvesoftware.com/legal.htm, which redirects to Valve\'s homepage), and game titles containing "Illegal".',
    expected: [
      { docType: 'privacy', urls: ['https://store.steampowered.com/privacy_agreement/'] },
      { docType: 'terms', urls: ['https://store.steampowered.com/subscriber_agreement/'] },
    ],
  },
  {
    domain: 'notion.com',
    genre: 'productivity',
    market: 'global',
    hardCase: ['other_domain', 'js_rendered', 'legal_hub'],
    note: 'Footer "Terms & privacy" goes to www.notion.so, which redirects to an app.notion.com "continue to external site" interstitial linking a JS-rendered hub on notion.notion.site; the consumer terms ("Personal Use Terms of Service", not the Master Subscription Agreement) are one hop further and JS-rendered. The privacy policy is server-rendered on www.notion.com; the hub\'s privacy link reaches it by a JavaScript redirect, which the bench does not follow, hence the listed alternate.',
    expected: [
      {
        docType: 'privacy',
        urls: [
          'https://www.notion.com/trust/privacy-policy',
          'https://notion.notion.site/Privacy-Policy-3468d120cf614d4c9014c09f6adc9091',
        ],
      },
      {
        docType: 'terms',
        urls: [
          'https://notion.notion.site/Personal-Use-Terms-of-Service-00e4e5d0f2b9411cbee6493f15779500',
          'https://www.notion.so/Personal-Use-Terms-of-Service-00e4e5d0f2b9411cbee6493f15779500',
          'https://app.notion.com/p/Personal-Use-Terms-of-Service-00e4e5d0f2b9411cbee6493f15779500',
        ],
      },
    ],
  },

  // ── Everyday, India ──
  {
    domain: 'ndtv.com',
    genre: 'news',
    market: 'in',
    expected: [
      { docType: 'privacy', urls: ['https://www.ndtv.com/convergence/ndtv/new/privacy_policy.aspx'] },
      { docType: 'terms', urls: ['https://www.ndtv.com/convergence/ndtv/new/TermsAndConditions.aspx'] },
    ],
  },
  {
    domain: 'goindigo.in',
    genre: 'travel',
    market: 'in',
    hardCase: ['decoys'],
    note: 'The page also links loyalty-programme T&Cs, the Conditions of Carriage (the flight contract, a different document), a Candidate Privacy Policy and several workplace policies. The privacy page is complete but its sections are collapsed: rendered innerText is ~2.3k of ~25k characters.',
    expected: [
      { docType: 'privacy', urls: ['https://www.goindigo.in/information/privacy.html'] },
      { docType: 'terms', urls: ['https://www.goindigo.in/information/terms-and-conditions.html'] },
    ],
  },
  {
    domain: 'blinkit.com',
    genre: 'quick_commerce',
    market: 'in',
    hardCase: ['decoys'],
    note: 'A product category ("Bakery & Biscuits", /cookies/) matches the word cookie.',
    expected: [
      { docType: 'privacy', urls: ['https://blinkit.com/privacy'] },
      { docType: 'terms', urls: ['https://blinkit.com/terms'] },
    ],
  },
  {
    domain: 'zepto.com',
    genre: 'quick_commerce',
    market: 'in',
    note: 'Behind an AWS WAF JavaScript challenge: a cookieless request gets HTTP 202 and an empty challenge page; a browser passes it and reloads within ~5s. Under concurrency the reload can destroy the page mid-read, so this site can fail rather than miss. The documents are server-rendered once the token cookie is set.',
    expected: [
      { docType: 'privacy', urls: ['https://www.zepto.com/s/privacy-policy'] },
      { docType: 'terms', urls: ['https://www.zepto.com/s/terms-of-service'] },
    ],
  },
  {
    domain: 'olacabs.com',
    genre: 'mobility',
    market: 'in',
    hardCase: ['legal_hub', 'other_domain', 'decoys'],
    note: 'The footer links fragments of one FAQ page (/info/faqs#privacyPolicy, #termsAndConditions) holding no policy text; each section only links on to /tnc?doc=…, a wrapper page whose document is an iframe from olawebcdn.com (server HTML). The same sections list AU/NZ/UK policies and product T&Cs; hidden header links point at a dead corp.olacabs.com host. Documents are addressed by query, which the bench matches exactly.',
    expected: [
      {
        docType: 'privacy',
        urls: [
          'https://www.olacabs.com/tnc?doc=india-privacy-policy',
          'https://olawebcdn.com/v1/docs/htmls/india-privacy-policy.html',
        ],
      },
      {
        docType: 'terms',
        urls: [
          'https://www.olacabs.com/tnc?doc=india-tnc-website',
          'https://olawebcdn.com/v1/docs/htmls/india-tnc-website.html',
        ],
      },
    ],
  },
  {
    domain: 'jio.com',
    genre: 'telecom',
    market: 'in',
    hardCase: ['legal_hub', 'js_rendered'],
    note: 'The "Policies" and "Terms & conditions" links (outside any footer landmark) land on hubs: a dozen privacy policies and over a hundred T&Cs, mostly product and offer terms, each led by a General document. The General documents are JS-rendered.',
    expected: [
      { docType: 'privacy', urls: ['https://www.jio.com/jcms/en-in/privacy-policy/'] },
      { docType: 'terms', urls: ['https://www.jio.com/jcms/en-in/general-terms-and-conditions/'] },
    ],
  },
  {
    domain: 'practo.com',
    genre: 'health',
    market: 'in',
    hardCase: ['js_rendered'],
    note: 'Both documents are JS-rendered (raw HTML ~280 characters of script and chrome). The footer also links "PCS T&C", a PDF on practostatic.com.',
    expected: [
      { docType: 'privacy', urls: ['https://www.practo.com/company/privacy'] },
      { docType: 'terms', urls: ['https://www.practo.com/company/terms'] },
    ],
  },
  {
    domain: 'naukri.com',
    genre: 'jobs',
    market: 'in',
    hardCase: ['js_rendered'],
    note: 'The terms page is a client-rendered app with an empty <div id="root"> and an empty title; the privacy policy is server-rendered.',
    expected: [
      { docType: 'privacy', urls: ['https://www.naukri.com/privacypolicy'] },
      { docType: 'terms', urls: ['https://www.naukri.com/termsconditions'] },
    ],
  },
  {
    domain: 'sensibull.com',
    genre: 'finance',
    market: 'in',
    hardCase: ['third_party_host', 'pdf'],
    note: 'The footer "Terms of Use & Privacy Policy" link, and both sign-up "terms and conditions" links, open one 7-page PDF in a public S3 bucket: the terms, then the privacy policy from page 5. It is the only policy the homepage links, so it is expected for both; as one link it gets one type, and the other can only be missed.',
    expected: [
      {
        docType: 'privacy',
        urls: [
          'https://s3.ap-south-1.amazonaws.com/sensibull-public-documents/T%26C.pdf',
          'https://s3.ap-south-1.amazonaws.com/sensibull-public-documents/T&C.pdf',
        ],
      },
      {
        docType: 'terms',
        urls: [
          'https://s3.ap-south-1.amazonaws.com/sensibull-public-documents/T%26C.pdf',
          'https://s3.ap-south-1.amazonaws.com/sensibull-public-documents/T&C.pdf',
        ],
      },
    ],
  },
];

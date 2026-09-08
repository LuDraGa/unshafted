/**
 * HTML → stable policy text.
 *
 * This is the highest-risk module in the site-policy feature. Everything downstream is
 * content-addressed (AD-1: the hash IS the version), so:
 *
 *  - A normalizer that is even slightly UNSTABLE manufactures phantom "the policy changed"
 *    events forever, and burns an analysis run every time.
 *  - A normalizer that is too AGGRESSIVE silently drops clauses, and the resulting analysis is
 *    wrong in a way nobody notices.
 *
 * Both failures are silent, which is why `test/site-policy.test.ts` gates on a fixture corpus
 * in BOTH directions: unchanged pages must hash identically, and genuinely changed pages must
 * hash differently.
 *
 * NO DOM DEPENDENCY, DELIBERATELY. `DOMParser` does not exist in an MV3 service worker and does
 * not exist in Node. Part 2 requires the server to re-derive the hash with the exact same
 * normalizer before publishing a submission, so this must be a pure string→string function that
 * runs identically in Node, a service worker, a popup and a content script. Hand-rolled tag
 * scanning is the price; determinism is what we buy.
 */

/** Elements whose content is never policy text. Stripped wholesale, before anything else. */
const RAW_TEXT_ELEMENTS = ['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe', 'head'] as const;

/** Site chrome. Stripped inside the selected region, conservatively — see `stripChrome`. */
const NAV_ELEMENTS = ['nav', 'aside'] as const;

/** Only stripped when main-content selection FELL BACK to the whole document. */
const EDGE_ELEMENTS = ['header', 'footer'] as const;

const LANDMARK_ROLE_PATTERN = /\brole\s*=\s*["']?(navigation|banner|contentinfo|search|complementary)["']?/i;

/**
 * Server-rendered consent-manager containers only.
 *
 * Deliberately narrow. We normalize RAW fetched HTML, not a rendered DOM, so dynamically
 * injected cookie banners are not present in the first place — the churn risk this guards
 * against is much smaller than it looks, while over-stripping loses real clauses. Widen this
 * only in response to an observed fixture failure, never speculatively.
 */
const CONSENT_CONTAINER_PATTERN =
  /\b(?:id|class)\s*=\s*["'][^"']*(?:onetrust|optanon|truste|cookie-?banner|cookie-?notice|cookie-?consent|consent-?banner|cmpbox|gdpr-?banner)[^"']*["']/i;

const BLOCK_ELEMENTS = [
  'p',
  'div',
  'section',
  'article',
  'main',
  'ul',
  'ol',
  'dl',
  'dt',
  'dd',
  'table',
  'thead',
  'tbody',
  'tr',
  'blockquote',
  'pre',
  'figure',
  'address',
  'fieldset',
] as const;

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  bull: '•',
  middot: '·',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  sect: '§',
  para: '¶',
  laquo: '«',
  raquo: '»',
  times: '×',
  divide: '÷',
  plusmn: '±',
  frac12: '½',
  frac14: '¼',
  frac34: '¾',
  euro: '€',
  pound: '£',
  yen: '¥',
};

/** Guard against a pathological document spinning a strip loop forever. */
const MAX_STRIP_ITERATIONS = 10_000;

/**
 * Structural break sentinels.
 *
 * A newline inside `<p>…</p>` is just whitespace — HTML renders it as a space — but by the time
 * we reach `collapseWhitespace` it is indistinguishable from a break we inserted ourselves. If
 * source newlines survive, re-wrapping the HTML (a Prettier config change, a CMS re-export,
 * minification toggling) churns the hash on every document, which is precisely the phantom
 * "policy changed" failure this module exists to prevent.
 *
 * So structural breaks are emitted as characters that cannot occur in real page text, all raw
 * whitespace is collapsed to single spaces, and only then are the sentinels turned into
 * newlines. Input is scrubbed of both sentinels first so a hostile page cannot forge them.
 */
const PARA_BREAK = '\u0000';
const LINE_BREAK = '\u0001';

type NormalizedPolicy = {
  /** Normalized, hashable policy text. */
  text: string;
  /** Character count — a cheap "did we over-strip?" signal for the capture flow. */
  length: number;
  /**
   * True when an explicit `<main>` / `[role=main]` / `<article>` container was found.
   * False means we fell back to the whole document, which correlates with noisier text —
   * map it onto the existing `SourceQualitySchema` at the call site.
   */
  usedMainContainer: boolean;
};

/**
 * Find the end of an element, accounting for nesting of the same tag.
 * `openTagEnd` is the index just past the element's opening tag.
 */
const findElementEnd = (html: string, tag: string, openTagEnd: number): { contentEnd: number; elementEnd: number } => {
  const pattern = new RegExp(`<(/?)${tag}(?=[\\s/>])[^>]*>`, 'gi');
  pattern.lastIndex = openTagEnd;
  let depth = 1;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    if (match[1] === '/') {
      depth -= 1;
      if (depth === 0) {
        return { contentEnd: match.index, elementEnd: pattern.lastIndex };
      }
    } else if (!match[0].endsWith('/>')) {
      depth += 1;
    }
  }

  // Unclosed element — treat the rest of the document as its content.
  return { contentEnd: html.length, elementEnd: html.length };
};

/** Remove every occurrence of `<tag>…</tag>`, content included. */
const stripByTag = (html: string, tag: string): string => {
  const openPattern = new RegExp(`<${tag}(?=[\\s/>])[^>]*>`, 'i');
  let out = html;

  for (let i = 0; i < MAX_STRIP_ITERATIONS; i += 1) {
    const match = openPattern.exec(out);
    if (!match) return out;

    if (match[0].endsWith('/>')) {
      out = `${out.slice(0, match.index)}${PARA_BREAK}${out.slice(match.index + match[0].length)}`;
      continue;
    }

    const { elementEnd } = findElementEnd(out, tag, match.index + match[0].length);
    // Leave a break behind so neighbouring text does not fuse into one block.
    out = `${out.slice(0, match.index)}${PARA_BREAK}${out.slice(elementEnd)}`;
  }

  return out;
};

/** Remove every element whose opening tag's attributes match `pattern`, content included. */
const stripByAttribute = (html: string, pattern: RegExp): string => {
  let out = html;

  for (let i = 0; i < MAX_STRIP_ITERATIONS; i += 1) {
    const tagPattern = /<([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)>/g;
    let match: RegExpExecArray | null = null;
    let found: { index: number; tag: string; raw: string } | null = null;

    while ((match = tagPattern.exec(out)) !== null) {
      const tag = match[1]!.toLowerCase();
      if (VOID_ELEMENTS.has(tag)) continue;
      if (pattern.test(match[2]!)) {
        found = { index: match.index, tag, raw: match[0] };
        break;
      }
    }

    if (!found) return out;

    if (found.raw.endsWith('/>')) {
      out = `${out.slice(0, found.index)}${PARA_BREAK}${out.slice(found.index + found.raw.length)}`;
      continue;
    }

    const { elementEnd } = findElementEnd(out, found.tag, found.index + found.raw.length);
    out = `${out.slice(0, found.index)}${PARA_BREAK}${out.slice(elementEnd)}`;
  }

  return out;
};

/** Innermost-largest match for a tag, used to pick the main content region. */
const extractLargestElement = (html: string, tag: string, attrPattern?: RegExp): string | null => {
  const openPattern = new RegExp(`<${tag}(?=[\\s/>])[^>]*>`, 'gi');
  let match: RegExpExecArray | null;
  let best: string | null = null;

  while ((match = openPattern.exec(html)) !== null) {
    if (attrPattern && !attrPattern.test(match[0])) continue;
    const { contentEnd } = findElementEnd(html, tag, match.index + match[0].length);
    const inner = html.slice(match.index + match[0].length, contentEnd);
    if (!best || inner.length > best.length) best = inner;
  }

  return best;
};

const decodeEntities = (text: string): string =>
  text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => safeCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]{1,31});/g, (whole, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? whole);

const safeCodePoint = (code: number): string => {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
};

/** Convert structural tags to text markers, then drop every remaining tag. */
const tagsToText = (html: string): string => {
  let out = html;

  out = out.replace(/<h([1-6])(?=[\s/>])[^>]*>/gi, (_, level: string) => `${PARA_BREAK}${'#'.repeat(Number(level))} `);
  out = out.replace(/<\/h[1-6]\s*>/gi, PARA_BREAK);
  out = out.replace(/<li(?=[\s/>])[^>]*>/gi, `${LINE_BREAK}- `);
  out = out.replace(/<br\s*\/?>/gi, LINE_BREAK);
  out = out.replace(/<hr\s*\/?>/gi, PARA_BREAK);
  out = out.replace(/<\/?(?:td|th)(?=[\s/>])[^>]*>/gi, ' │ ');

  for (const tag of BLOCK_ELEMENTS) {
    out = out.replace(new RegExp(`</?${tag}(?=[\\s/>])[^>]*>`, 'gi'), PARA_BREAK);
  }

  // Everything else (span, a, strong, em, …) is inline: drop the tag, keep the text.
  out = out.replace(/<[^>]*>/g, '');

  return out;
};

/**
 * Collapse whitespace to a canonical form.
 *
 * Order matters: every run of real whitespace — source newlines included — becomes a single
 * space BEFORE sentinels become newlines. That is what makes the output independent of how the
 * publisher happened to wrap their HTML.
 *
 * Case is PRESERVED and "Last updated" dates are PRESERVED — both are semantically meaningful
 * and must move the hash when they move.
 */
const collapseWhitespace = (text: string): string =>
  text
    .normalize('NFKC')
    // Zero-width and BOM characters: invisible, and they vary between CMS exports.
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\u00A0\u2007\u202F\u2009\u200A]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(new RegExp(` ?${LINE_BREAK} ?`, 'g'), '\n')
    .replace(new RegExp(` ?${PARA_BREAK} ?`, 'g'), '\n\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Pick the policy body: explicit landmark first, whole document as fallback. */
const selectMainRegion = (html: string): { region: string; usedMainContainer: boolean } => {
  const main = extractLargestElement(html, 'main');
  if (main && main.trim()) return { region: main, usedMainContainer: true };

  const roleMain = extractLargestElement(html, 'div', /\brole\s*=\s*["']?main["']?/i);
  if (roleMain && roleMain.trim()) return { region: roleMain, usedMainContainer: true };

  const article = extractLargestElement(html, 'article');
  if (article && article.trim()) return { region: article, usedMainContainer: true };

  const body = extractLargestElement(html, 'body');
  return { region: body && body.trim() ? body : html, usedMainContainer: false };
};

/**
 * Strip site chrome.
 *
 * `header` / `footer` are only stripped when we fell back to the whole document. Inside an
 * explicit `<main>`, a `<header>` is usually the policy's own title block, and dropping it
 * would lose real content.
 */
const stripChrome = (region: string, usedMainContainer: boolean): string => {
  let out = region;

  for (const tag of NAV_ELEMENTS) out = stripByTag(out, tag);
  if (!usedMainContainer) {
    for (const tag of EDGE_ELEMENTS) out = stripByTag(out, tag);
  }

  out = stripByAttribute(out, LANDMARK_ROLE_PATTERN);
  out = stripByAttribute(out, CONSENT_CONTAINER_PATTERN);

  return out;
};

/** HTML → stable, hashable policy text. */
const normalizePolicyHtml = (html: string): NormalizedPolicy => {
  if (!html || !html.trim()) {
    return { text: '', length: 0, usedMainContainer: false };
  }

  let working = html
    // A page cannot be allowed to forge structural breaks.
    .replace(new RegExp(`[${PARA_BREAK}${LINE_BREAK}]`, 'g'), '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<!doctype[^>]*>/gi, '');
  for (const tag of RAW_TEXT_ELEMENTS) working = stripByTag(working, tag);

  const { region, usedMainContainer } = selectMainRegion(working);
  const text = collapseWhitespace(decodeEntities(tagsToText(stripChrome(region, usedMainContainer))));

  return { text, length: text.length, usedMainContainer };
};

/**
 * Identity of the normalizer itself.
 *
 * IMPORTANT OPERATIONAL CONSEQUENCE. Because the content hash is the version (AD-1) and the
 * hash is taken over normalizer OUTPUT, changing this module changes every hash it produces —
 * which invalidates the entire published corpus at once: every cached entry misses, and every
 * CDN object is keyed to text no client will generate again.
 *
 * So the normalizer version is effectively part of the corpus's identity. Bump it only
 * alongside a plan to re-hash what is already published, and carry it on every submission so
 * the server can tell which normalizer produced a hash before trusting it (Part 2 §Q4).
 */
const POLICY_NORMALIZER_VERSION = 'normalizer-v1';

/** SHA-256 of a string, hex encoded. */
const sha256Hex = async (input: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * SHA-256 of the NORMALIZED text, hex encoded. This value is the document's identity —
 * see AD-1. Never hash raw HTML.
 */
const computePolicyHash = async (html: string): Promise<{ hash: string; normalized: NormalizedPolicy }> => {
  const normalized = normalizePolicyHtml(html);
  return { hash: await sha256Hex(normalized.text), normalized };
};

export { normalizePolicyHtml, POLICY_NORMALIZER_VERSION, sha256Hex, computePolicyHash };
export type { NormalizedPolicy };

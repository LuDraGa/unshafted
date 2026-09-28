/**
 * A real page, reduced to what the policy-likeness check measures and nothing it does not.
 *
 * Run:  node --import tsx tools/corpus/make-likeness-fixture.ts <page.html> <fixture.html>
 *
 * The likeness tests are built from pages the bench actually saw (A3's rule: design against real
 * pages, not in the abstract). But the corpus keeps third-party policy text out of the repository
 * on purpose (`corpus/README.md`), and a fixture is no different. So a fixture keeps the page's
 * STRUCTURE — the region the normalizer reads, its block tags, every text run at its real length,
 * and its policy links verbatim (their text and address are what a hub is followed by) — and
 * replaces every other word with filler of the same length. Attributes are dropped except `href`.
 * What the check measures (prose per block, policy links in the body) is therefore the real page's;
 * what the page said is gone.
 *
 * Verified on creation: the fixture must be judged exactly as the page it came from, or it is not
 * written.
 */
import { POLICY_LINK_PATTERN } from '../../packages/unshafted-core/lib/site-policy/discover.js';
import { judgePolicyPage } from '../../packages/unshafted-core/lib/site-policy/likeness.js';
import { extractPolicyRegion, regionToText } from '../../packages/unshafted-core/lib/site-policy/normalize.js';
import { readFile, writeFile } from 'node:fs/promises';

/** Letters only, and no word the policy-link pattern knows, so filler can never be taken for a link. */
const FILLER = 'loremipsumdolorsitametconsecteturadipiscingelitseddoeiusmodtemporincididuntutlabore';

let cursor = 0;
const fill = (text: string): string =>
  text
    // An entity is one character once decoded; keep it one character so block lengths hold.
    .replace(/&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]{1,31});/gi, 'x')
    .replace(/\S/g, () => FILLER[cursor++ % FILLER.length]!);

const HREF_PATTERN = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

const bareTag = (tag: string): string => {
  const match = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(tag);
  return match ? `<${match[1]}${match[2]!.toLowerCase()}>` : '';
};

/**
 * Tags reduced to their names, text filled — or kept, inside a policy link. A link's inner tags are
 * kept too: flattening them merges blocks the page keeps apart, and the fixture then measures more
 * prose than its page has (Figma's hub read 435 instead of 0 before this).
 */
const digestRun = (html: string, keepText: boolean): string =>
  html.replace(/(<[^>]+>)|([^<]+)/g, (_, tag: string | undefined, text: string | undefined) =>
    tag !== undefined ? bareTag(tag) : keepText ? (text ?? '') : fill(text ?? ''),
  );

const digest = (region: string): string =>
  region.replace(/(<a\b[^>]*>)([\s\S]*?)(<\/a\s*>)|(<[^>]+>)|([^<]+)/gi, (whole, open, inner, _close, tag, text) => {
    if (open !== undefined) {
      const href = (
        HREF_PATTERN.exec(open as string)
          ?.slice(1)
          .find(value => value !== undefined) ?? ''
      ).trim();
      const isPolicyLink = POLICY_LINK_PATTERN.test(regionToText(inner as string)) || POLICY_LINK_PATTERN.test(href);
      const safeHref = isPolicyLink ? href.replace(/"/g, '&quot;') : '#';
      return `<a href="${safeHref}">${digestRun(inner as string, isPolicyLink)}</a>`;
    }
    if (tag !== undefined) return bareTag(tag as string);
    if (text !== undefined) return fill(text as string);
    return whole;
  });

const main = async () => {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: make-likeness-fixture.ts <page.html> <fixture.html>');

  const html = await readFile(input, 'utf8');
  const fixture = `<!doctype html><html><body><main>${digest(extractPolicyRegion(html).region)}</main></body></html>\n`;

  const original = judgePolicyPage(html);
  const reduced = judgePolicyPage(fixture);
  const sameLinks =
    JSON.stringify(original.links.map(link => link.href)) === JSON.stringify(reduced.links.map(link => link.href));
  if (original.kind !== reduced.kind || !sameLinks || Math.abs(original.proseChars - reduced.proseChars) > 50) {
    throw new Error(
      `The fixture is not judged like its page: ${original.kind}/${original.proseChars}/${original.links.length} ` +
        `became ${reduced.kind}/${reduced.proseChars}/${reduced.links.length}. Not written.`,
    );
  }

  await writeFile(output, fixture, 'utf8');
  console.log(`${output}: ${reduced.kind}, ${reduced.proseChars} prose, ${reduced.links.length} policy links`);
};

await main();

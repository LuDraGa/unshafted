import { POLICY_BROWSE_ASSET, parsePolicyBrowseManifest } from '@extension/unshafted-core';
import type { PolicyBrowseManifest } from '@extension/unshafted-core';

/**
 * Loads the bundled browse manifest — the list of every site we have read.
 *
 * Sibling of `policy-corpus-loader.ts`, and split from it for one reason: **the browse view must
 * not pay for the corpus to render a list of names.** The corpus is ~1 MB of verbatim analyses and
 * the manifest is 401 bytes gzipped, so the split is roughly three orders of magnitude on the two
 * surfaces where it matters.
 *
 * WHERE IT ACTUALLY PAYS, precisely, because it is easy to overstate. On a covered site it buys
 * nothing: the panel has already parsed the corpus to render the page you are on, and
 * `corpusPromise` caches it for the life of the document. It pays on `UncoveredView` and
 * `NoSiteView`, where the corpus has never been parsed and — if the reader never opens a domain —
 * never will be. Two of the three entry points live there, which is what makes the split worth
 * having rather than a general-purpose saving.
 *
 * Like the corpus and the index, this reads an extension-local asset through
 * `chrome.runtime.getURL` and makes NO network request. The domains it lists are already shipped
 * in plaintext inside `policy-corpus.json`; a bundled manifest observes nothing and ships
 * identically to everyone. The badge path still makes no network call, and browse adds none.
 *
 * The same rule as the corpus loader applies: **do not import this from the service worker.** It
 * is cheap, but the badge path answers coverage from the binary index and has no business
 * enumerating anything.
 */

/** Parsed once per page context, like the corpus. Its own promise, so neither load waits on the other. */
let manifestPromise: Promise<PolicyBrowseManifest | null> | null = null;

/**
 * Every site in the corpus, alphabetical, plus the true document total — or `null`.
 *
 * `null` is a real answer and the caller renders it as one: the browse view says it has nothing to
 * list rather than showing an empty list, because an empty list is a claim that we have read
 * nothing, and a missing file is a claim about the build.
 *
 * Read `documentTotal` for any "N documents" headline. Do NOT sum `documentCount` across the rows —
 * that gives 85 against a corpus of 82, because three documents govern two domains each.
 */
export const loadBundledPolicyBrowse = (): Promise<PolicyBrowseManifest | null> => {
  manifestPromise ??= (async () => {
    try {
      const response = await fetch(chrome.runtime.getURL(POLICY_BROWSE_ASSET));
      if (!response.ok) {
        console.warn('[Unshafted] browse manifest missing from bundle');
        return null;
      }
      return parsePolicyBrowseManifest(await response.json());
    } catch (error) {
      console.warn('[Unshafted] browse manifest failed to load:', error);
      return null;
    }
  })();

  return manifestPromise;
};

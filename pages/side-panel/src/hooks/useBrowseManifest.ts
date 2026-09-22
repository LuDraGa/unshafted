import { loadBundledPolicyBrowse } from '@extension/shared';
import { useEffect, useState } from 'react';
import type { PolicyBrowseManifest } from '@extension/unshafted-core';

/**
 * The browse manifest — 414 bytes gzipped, and the only artifact that can list what we have read.
 *
 * Deliberately NOT `useDomainAnalyses`'s shape, because the failure modes differ. That hook resolves
 * a hostname and `null` means "we have not read this site", which is a finding. Here `null` means
 * the manifest did not load, which is a claim about the build and not about any site. The view has
 * to be able to tell those apart, so the state does too.
 */

type BrowseManifest =
  | { status: 'loading' }
  /** The file is missing or malformed. Not the same as an empty corpus, and not rendered as one. */
  | { status: 'unavailable' }
  | { status: 'ready'; manifest: PolicyBrowseManifest };

const LOADING: BrowseManifest = { status: 'loading' };
const UNAVAILABLE: BrowseManifest = { status: 'unavailable' };

const useBrowseManifest = (): BrowseManifest => {
  const [state, setState] = useState<BrowseManifest>(LOADING);

  useEffect(() => {
    let disposed = false;

    loadBundledPolicyBrowse()
      .then(manifest => {
        if (disposed) return;
        setState(manifest ? { status: 'ready', manifest } : UNAVAILABLE);
      })
      .catch(() => {
        if (!disposed) setState(UNAVAILABLE);
      });

    return () => {
      disposed = true;
    };
  }, []);

  return state;
};

export { useBrowseManifest };
export type { BrowseManifest };

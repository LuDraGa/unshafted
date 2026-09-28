/**
 * The lens strip's keyboard contract, and the bound on how far one lens can grow.
 *
 * Both were promises the markup made and the code did not keep. The strip declared `role="tablist"`
 * with `aria-selected` and `aria-controls` on every tab from the day the lens architecture shipped,
 * and nothing listened for a key — so a screen reader announced a tab list that did not behave like
 * one, and Tab walked through every lens before reaching the panel. Separately, each finding inside
 * a lens was an independent `<details>`, so opening six of them grew the panel six bodies tall:
 * the accordion stack the lens pattern replaced, one level down.
 *
 * These assertions exist because neither failure is visible in a screenshot, and the first one in
 * particular reads as correct in the JSX — the roles are all there.
 */
import { sampleQuickScan } from '@extension/unshafted-core';
import { ResultsView } from '@src/components/ResultCards';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { CurrentAnalysis } from '@extension/unshafted-core';

type Record_ = Pick<CurrentAnalysis, 'quickScan' | 'deepAnalysis' | 'selectedRole' | 'customRole' | 'source'>;

const record: Record_ = {
  quickScan: sampleQuickScan,
  deepAnalysis: null,
  selectedRole: 'Contractor',
  customRole: '',
  source: {
    kind: 'file',
    name: 'service-agreement.pdf',
    slug: 'service-agreement',
    contentHash: 'hash',
    charCount: 1200,
    estimatedTokens: 300,
    preview: 'A client-friendly service agreement.',
    quality: 'good',
    warnings: [],
  },
};

const tabs = () => screen.getAllByRole('tab');
const selected = () => tabs().find(tab => tab.getAttribute('aria-selected') === 'true');

describe('lens strip', () => {
  it('keeps exactly one tab in the page tab order', () => {
    render(<ResultsView record={record} />);

    // A roving tabindex is the half of the pattern that stops Tab walking the whole strip. Without
    // it the arrow keys can work perfectly and the strip is still wrong.
    const reachable = tabs().filter(tab => tab.getAttribute('tabindex') === '0');
    expect(reachable).toHaveLength(1);
    expect(reachable[0]).toBe(selected());
  });

  it('moves selection and focus with the arrow keys, wrapping at both ends', () => {
    render(<ResultsView record={record} />);

    const all = tabs();
    const first = all[0]!;
    const last = all[all.length - 1]!;
    expect(selected()).toBe(first);

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(selected()).toBe(tabs()[1]);
    // Selection following focus is the point: arrowing past a lens opens it, because switching
    // costs nothing. If focus did not follow, the reader would be arrowing blind.
    expect(document.activeElement).toBe(tabs()[1]);

    fireEvent.keyDown(tabs()[1]!, { key: 'ArrowLeft' });
    expect(selected()).toBe(tabs()[0]);

    fireEvent.keyDown(tabs()[0]!, { key: 'ArrowLeft' });
    expect(selected()).toBe(last);

    fireEvent.keyDown(last, { key: 'ArrowRight' });
    expect(selected()).toBe(first);
  });

  it('jumps to the ends with Home and End', () => {
    render(<ResultsView record={record} />);
    const all = tabs();

    fireEvent.keyDown(all[0]!, { key: 'End' });
    expect(selected()).toBe(tabs()[tabs().length - 1]);

    fireEvent.keyDown(tabs()[tabs().length - 1]!, { key: 'Home' });
    expect(selected()).toBe(tabs()[0]);
  });

  it('leaves other keys alone', () => {
    render(<ResultsView record={record} />);
    const first = tabs()[0]!;

    // `preventDefault` is called only on the four keys above; anything else has to fall through,
    // or typing in the popup starts depending on where focus happens to be.
    const handled = fireEvent.keyDown(first, { key: 'a' });
    expect(handled).toBe(true);
    expect(selected()).toBe(first);
  });

  it('points each tab at the panel it controls', () => {
    render(<ResultsView record={record} />);

    const active = selected()!;
    const panel = screen.getByRole('tabpanel');
    expect(active.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.getAttribute('aria-labelledby')).toBe(active.id);
  });
});

describe('lens panel items', () => {
  /**
   * jsdom does not implement the exclusive-accordion behaviour of `<details name>` — that is the
   * browser's, and Chrome has had it since 120. So this asserts the MECHANISM is in place and
   * correctly scoped, which is the part that can regress in this repo; the closing itself is
   * Chrome's to get right and is checked by hand.
   */
  it('groups every item in a lens under one details name', () => {
    render(<ResultsView record={record} />);

    const panel = screen.getByRole('tabpanel');
    const items = within(panel).getAllByRole('group');
    expect(items.length).toBeGreaterThan(1);

    const names = new Set(items.map(item => item.getAttribute('name')));
    expect(names).toEqual(new Set(['lens-blockers']));
  });
});

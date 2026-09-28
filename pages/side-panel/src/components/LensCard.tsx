import { LensItemView } from '@src/components/LensItems';
import { buildLenses, pickInitialLens } from '@src/lib/lenses';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SitePolicyAnalysis } from '@extension/unshafted-core';
import type { ItemContext } from '@src/components/LensItems';
import type { Lens, LensId } from '@src/lib/lenses';
import type { KeyboardEvent } from 'react';

/**
 * The site's findings, one concern at a time — the screen's Primary surface.
 *
 * The strip sticks INSIDE this card, on the card's own solid ground, directly under the view header
 * (P13's second level, now the last one). Inside rather than above on purpose: the page ground is a
 * gradient, and a sticky strip on it would need a fill that matches the gradient at every scroll
 * position, which no solid colour can. The card's surface is one colour everywhere.
 */

/**
 * The popup's `LensStrip` contract, in full, because either half alone is still broken (see the
 * comment on it in `ResultCards.tsx`): ROVING TABINDEX — the selected tab is the strip's single tab
 * stop — and SELECTION FOLLOWS FOCUS, which is right here for the same reason it is right there:
 * switching costs nothing, no request and no lost state.
 *
 * Mirrored rather than imported. Sharing it through `@extension/ui` would re-lay-out the popup,
 * a surface this pass never looked at — the same reason the panel's ladder is scoped to its own
 * sheet (A5).
 */
const LensStrip = ({
  lenses,
  openId,
  baseId,
  top,
  onChange,
}: {
  lenses: Lens[];
  openId: LensId;
  baseId: string;
  top: number;
  onChange: (id: LensId) => void;
}) => {
  const tabRefs = useRef<Partial<Record<LensId, HTMLButtonElement | null>>>({});

  const activate = (lens: Lens | undefined) => {
    if (!lens) return;
    onChange(lens.id);
    tabRefs.current[lens.id]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = lenses.findIndex(lens => lens.id === openId);
    if (index < 0) return;

    switch (event.key) {
      case 'ArrowRight':
        activate(lenses[(index + 1) % lenses.length]);
        break;
      case 'ArrowLeft':
        activate(lenses[(index - 1 + lenses.length) % lenses.length]);
        break;
      case 'Home':
        activate(lenses[0]);
        break;
      case 'End':
        activate(lenses[lenses.length - 1]);
        break;
      default:
        return;
    }

    // Only reached when a key above matched — Home/End would otherwise scroll the panel.
    event.preventDefault();
  };

  return (
    <div
      className="panel-lens-strip"
      role="tablist"
      aria-label="What this site's documents mean for you"
      style={{ top }}>
      {lenses.map(lens => {
        const active = lens.id === openId;
        return (
          <button
            key={lens.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${lens.id}`}
            ref={node => {
              tabRefs.current[lens.id] = node;
            }}
            tabIndex={active ? 0 : -1}
            aria-selected={active}
            aria-controls={`${baseId}-panel-${lens.id}`}
            // The label and count are two spans, which an accessible name runs together: "Data9".
            aria-label={`${lens.label}, ${lens.count}`}
            className="panel-lens-tab"
            onClick={() => onChange(lens.id)}
            onKeyDown={handleKeyDown}>
            <span>{lens.label}</span>
            <span className="panel-lens-count">{lens.count}</span>
          </button>
        );
      })}
    </div>
  );
};

/**
 * Every lens stays mounted; only the selected one is shown. Two reasons, both about not losing
 * text. An opened block survives a trip to another lens and back. And the hidden ones are
 * `hidden="until-found"`, not `display: none`, so find-in-page still searches every finding on the
 * site — and when it hits one in another lens, `beforematch` fires and that lens is selected. A
 * reader who types "arbitration" lands on Rights without knowing Rights existed.
 *
 * Set through the DOM rather than as a prop: React models `hidden` as a boolean and would write
 * `hidden=""`, which is plain hidden and unsearchable.
 */
const LensPanel = ({
  lens,
  active,
  baseId,
  openKey,
  context,
  onReveal,
}: {
  lens: Lens;
  active: boolean;
  baseId: string;
  openKey: string | null;
  context: ItemContext;
  onReveal: (id: LensId) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (active) node.removeAttribute('hidden');
    else node.setAttribute('hidden', 'until-found');
  }, [active]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const reveal = () => onReveal(lens.id);
    node.addEventListener('beforematch', reveal);
    return () => node.removeEventListener('beforematch', reveal);
  }, [lens.id, onReveal]);

  const group = `${baseId}-${lens.id}`;

  return (
    <div
      ref={ref}
      className="panel-lens-panel"
      role="tabpanel"
      id={`${baseId}-panel-${lens.id}`}
      aria-labelledby={`${baseId}-tab-${lens.id}`}>
      <p className="panel-lens-intro">{lens.intro}</p>
      {lens.items.map(item => (
        <LensItemView key={item.key} item={item} group={group} open={item.key === openKey} context={context} />
      ))}
    </div>
  );
};

export const LensCard = ({
  analyses,
  headerOffset,
  readBy = 'unshafted',
  freshnessOf,
  provenance,
}: {
  analyses: readonly SitePolicyAnalysis[];
  /** The view header's measured height — the strip sticks directly beneath it (P13). */
  headerOffset: number;
  readBy?: 'unshafted' | 'you';
} & Pick<ItemContext, 'freshnessOf' | 'provenance'>) => {
  const baseId = useId();
  const cardRef = useRef<HTMLElement>(null);
  const lenses = useMemo(() => buildLenses(analyses, { readBy }), [analyses, readBy]);

  /*
   * The first lens, and its first block already open, are fixed at arrival: that block is the
   * "one thing" (D10), and it should be what the reader sees first — not something that re-opens
   * itself every time they come back to the lens after closing it.
   */
  const [initial] = useState(() => {
    const id = pickInitialLens(lenses);
    return { id, openKey: lenses.find(lens => lens.id === id)?.items[0]?.key ?? null };
  });
  const [openId, setOpenId] = useState<LensId>(initial.id);
  const active = lenses.find(lens => lens.id === openId) ?? lenses[0];

  /*
   * Switching lens while the strip is stuck would otherwise leave the reader wherever the previous
   * lens had scrolled them to — often past the end of a shorter one, looking at the footer. Pull
   * the card back so the new lens starts right under the strip. A strip that is not stuck yet needs
   * nothing, and moving the page under a reader who did not scroll would be worse than the problem.
   */
  const select = useCallback(
    (id: LensId) => {
      setOpenId(id);
      const card = cardRef.current;
      const shell = card?.closest('.panel-shell');
      if (!card || !shell) return;
      const overshoot = card.getBoundingClientRect().top - shell.getBoundingClientRect().top - headerOffset;
      if (overshoot < 0) shell.scrollTop += overshoot;
    },
    [headerOffset],
  );

  const context: ItemContext = { freshnessOf, provenance, showSource: analyses.length > 1 };

  if (!active) return null;

  return (
    <section ref={cardRef} className="panel-lens-card panel-zone" aria-label="Findings">
      <LensStrip lenses={lenses} openId={active.id} baseId={baseId} top={headerOffset} onChange={select} />
      {lenses.map(lens => (
        <LensPanel
          key={lens.id}
          lens={lens}
          active={lens.id === active.id}
          baseId={baseId}
          openKey={lens.id === initial.id ? initial.openKey : null}
          context={context}
          onReveal={setOpenId}
        />
      ))}
    </section>
  );
};

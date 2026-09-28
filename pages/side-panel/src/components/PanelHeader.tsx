import { BackToTop } from '@src/components/BackToTop';
import type { ReactNode, Ref } from 'react';

/**
 * The one shape every view's header takes. Each view still renders its own (P7) — this fixes the
 * geometry, not the ownership.
 *
 * PLACEMENT IS THE HIERARCHY HERE, and it follows the popup's header rather than inventing a second
 * convention: navigation back leads, the title takes the room, and TOOLS sit at the trailing edge
 * as quiet icons — the page reader, the library, back-to-top, close. They are tools, not content,
 * so they live in the chrome and stay out of the reading order entirely. A tool that renders as a
 * card in the flow competes with the finding above it; one in the header does not.
 *
 * The meta line carries what used to be separate blocks — the document count and the freshness
 * state (D6) — because they describe the title, and a line under the title is where a reader looks
 * for that.
 */
export const PanelHeader = ({
  ref,
  title,
  meta,
  leading,
  tools,
  end,
}: {
  ref?: Ref<HTMLElement>;
  title: ReactNode;
  meta?: ReactNode;
  /** Back, when there is somewhere to go back to. Leads, where navigation is read first. */
  leading?: ReactNode;
  /** Icon tools, before back-to-top. */
  tools?: ReactNode;
  /** After back-to-top — the one control that leaves the surface entirely (close). */
  end?: ReactNode;
}) => (
  <header ref={ref} className="panel-header">
    <div className="panel-header-row">
      {leading}
      <h1 className="panel-title">{title}</h1>
      <div className="panel-header-tools">
        {tools}
        <BackToTop />
        {end}
      </div>
    </div>
    {meta ? <p className="panel-meta">{meta}</p> : null}
  </header>
);

/**
 * An icon tool. `label` is the whole accessible name — the drawing is `aria-hidden` — and it also
 * becomes the tooltip, since an icon alone is a guess for anyone who has not used it before.
 */
export const ToolButton = ({
  label,
  onClick,
  badge,
  children,
}: {
  label: string;
  onClick: () => void;
  /** A count the tool is holding. Omitted, not zero, when there is nothing to count. */
  badge?: number;
  children: ReactNode;
}) => (
  <button type="button" className="panel-icon-button" aria-label={label} title={label} onClick={onClick}>
    {children}
    {badge ? (
      <span className="panel-icon-badge" aria-hidden="true">
        {badge}
      </span>
    ) : null}
  </button>
);

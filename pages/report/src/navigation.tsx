/**
 * Getting around the report (plan §5, §11.4–11.5): the rail at 1024px and up, the section strip
 * that replaces it below that, the sticky bar, and which section the reader is in.
 *
 * The bar and the strip are one fixed element, so the page has exactly one thing on top of it and
 * one height to clear. That height is measured, not assumed, and written to `--report-sticky-h`,
 * which every jump target's `scroll-margin-top` already reads. Nothing here scrolls anything
 * itself: every entry goes through `jumpTo`, which already scrolls, opens, focuses and flashes.
 */
import { RISK_TONE, cn } from '@extension/ui';
import { APP_NAME, toVerdictTone } from '@extension/unshafted-core';
import { useDisclosure } from '@src/disclosure';
import { useEffect, useRef, useState } from 'react';
import type { RiskLevel, Severity } from '@extension/unshafted-core';
import type { Section, SectionId } from '@src/report-model';

// ── Hooks ───────────────────────────────────────────────────────────────

/** The rendered height of an element, kept current as it wraps, reflows or changes breakpoint. */
const useHeight = (ref: React.RefObject<HTMLElement | null>) => {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setHeight(Math.round(entry.borderBoxSize[0].blockSize)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return height;
};

/**
 * True once the element has gone up under the top `offset` pixels of the viewport — which, with
 * `offset` the bar's own height, is the moment it would have slid behind the bar. An
 * `IntersectionObserver`, not `scroll-state(stuck)`: the side panel found that inert in Chrome 152.
 */
const useScrolledPast = (ref: React.RefObject<HTMLElement | null>, offset: number) => {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setPast(!entry.isIntersecting && entry.boundingClientRect.top < offset),
      { rootMargin: `-${offset}px 0px 0px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, offset]);
  return past;
};

/** How long a clicked entry holds the highlight if the scroll never reports that it ended. */
const PIN_MS = 1500;

/**
 * How far under the bar the reading line sits. A jump lands a section 24px under the bar
 * (`--report-landing`), so the line has to be below that for a landed section to count as current.
 */
const READING_LINE = 40;

/**
 * Which section the reader is in, and a way to go to one.
 *
 * The current section is the one at the reading line, just under the sticky bar: the first
 * section, in page order, that has not yet scrolled up past it. In the gap between two sections
 * that is the one coming up. A wider band that let any heading in the upper part of the screen win
 * got short sections wrong: at 1280px Obligations was never current, because Evidence's heading
 * was already in the band whenever Obligations' was. The last sections are often too short to
 * reach the line at all, so reaching the footer selects the last one — unless the reader jumped to a
 * section that the page bottomed out before it could bring to the line. That one stays current
 * until they scroll away from the end, because it is the one they asked for and it is on screen.
 *
 * A click pins its target until the scroll lands. Otherwise a smooth scroll from Verdict to
 * Caveats would walk the highlight through every section in between.
 */
const useScrollSpy = (ids: SectionId[], stickyHeight: number) => {
  const [spied, setSpied] = useState<SectionId | null>(null);
  const [pinned, setPinned] = useState<SectionId | null>(null);
  /** The last jump's target, held only for as long as the page stays at its foot. */
  const held = useRef<SectionId | null>(null);
  const { jumpTo } = useDisclosure();
  const idsKey = ids.join(' ');

  useEffect(() => {
    const order = idsKey.split(' ') as SectionId[];
    const below = new Set<string>();
    let atEnd = false;

    const decide = () => {
      if (atEnd && window.scrollY > 0) {
        const jumped = held.current ? document.getElementById(held.current)?.getBoundingClientRect() : null;
        const onScreen = jumped && jumped.bottom > stickyHeight && jumped.top < window.innerHeight;
        setSpied(onScreen ? held.current! : order[order.length - 1]);
        return;
      }
      const current = order.find(id => below.has(id));
      if (current) setSpied(current);
    };

    // Everything from the reading line down: a section is in it until its bottom passes the line.
    const reading = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) below.add(entry.target.id);
          else below.delete(entry.target.id);
        }
        decide();
      },
      { rootMargin: `-${stickyHeight + READING_LINE}px 0px 0px 0px` },
    );
    for (const id of order) {
      const el = document.getElementById(id);
      if (el) reading.observe(el);
    }

    const end = new IntersectionObserver(([entry]) => {
      // Leaving the foot of the page ends the hold; the next time there, the last section wins.
      if (atEnd && !entry.isIntersecting) held.current = null;
      atEnd = entry.isIntersecting;
      decide();
    });
    const footer = document.querySelector('.report-footer');
    if (footer) end.observe(footer);

    return () => {
      reading.disconnect();
      end.disconnect();
    };
  }, [idsKey, stickyHeight]);

  useEffect(() => {
    if (!pinned) return;
    const release = () => setPinned(null);
    const timer = window.setTimeout(release, PIN_MS);
    const once = { once: true, passive: true } as const;
    window.addEventListener('scrollend', release, once);
    // The reader taking over the scroll ends the pin as surely as the scroll ending does.
    window.addEventListener('wheel', release, once);
    window.addEventListener('touchstart', release, once);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scrollend', release);
      window.removeEventListener('wheel', release);
      window.removeEventListener('touchstart', release);
    };
  }, [pinned]);

  const navigate = (id: SectionId) => {
    held.current = id;
    // If the jump moves nothing past the line, no observer fires; this is then the answer.
    setSpied(id);
    setPinned(id);
    jumpTo(id);
  };

  return { active: pinned ?? spied ?? ids[0], navigate };
};

// ── Pieces ──────────────────────────────────────────────────────────────

const SEVERITIES: Severity[] = ['high', 'medium', 'low'];

/**
 * Blockers' count, split by severity: one segment per tier, in proportion. Beside the number, not
 * instead of it, and the split is also said in words for a screen reader.
 */
const SplitMark = ({ split }: { split: Record<Severity, number> }) => (
  <>
    <span className="report-split" aria-hidden="true">
      {SEVERITIES.filter(s => split[s] > 0).map(s => (
        <span key={s} data-severity={s} style={{ flexGrow: split[s] }} />
      ))}
    </span>
    <span className="sr-only">
      {`, ${SEVERITIES.filter(s => split[s] > 0)
        .map(s => `${split[s]} ${s}`)
        .join(', ')}`}
    </span>
  </>
);

type NavProps = { sections: Section[]; active: SectionId; onNavigate: (id: SectionId) => void };

const NavLinks = ({ sections, active, onNavigate, className }: NavProps & { className: string }) => (
  <ol className={className}>
    {sections.map(section => (
      <li key={section.id}>
        <a
          href={`#${section.id}`}
          className="report-nav-link"
          aria-current={section.id === active ? 'location' : undefined}
          onClick={event => {
            event.preventDefault();
            onNavigate(section.id);
          }}>
          <span className="report-nav-name">{section.label}</span>
          {section.split ? <SplitMark split={section.split} /> : null}
          {section.count !== undefined ? <span className="report-nav-count">{section.count}</span> : null}
        </a>
      </li>
    ))}
  </ol>
);

const Rail = (props: NavProps) => (
  <nav className="report-rail" aria-label="Sections">
    <p className="report-rail-label">In this report</p>
    <NavLinks {...props} className="report-rail-list" />
  </nav>
);

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Below 1024px. Scrolls sideways when it has to, and brings the current entry to the middle when
 * it changes and is not comfortably in view, so what comes before it shows as well as what follows.
 */
const Strip = (props: NavProps) => {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const strip = ref.current;
    const current = strip?.querySelector<HTMLElement>('[aria-current]');
    if (!strip || !current) return;
    const left = current.offsetLeft;
    const right = left + current.offsetWidth;
    const pad = 24;
    if (left - pad < strip.scrollLeft || right + pad > strip.scrollLeft + strip.clientWidth) {
      const centred = left - (strip.clientWidth - current.offsetWidth) / 2;
      strip.scrollTo({ left: Math.max(0, centred), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  }, [props.active]);
  return (
    <nav ref={ref} className="report-strip" aria-label="Sections">
      <NavLinks {...props} className="report-strip-list" />
    </nav>
  );
};

// ── The frame ───────────────────────────────────────────────────────────

/**
 * The page around the report: the fixed chrome (bar, and the strip below 1024px), the rail, and
 * the column. A quick-only record gets the column alone — it has no sections to go between.
 */
const ReportFrame = ({
  name,
  risk,
  sections,
  headerRef,
  actions,
  children,
}: {
  name: string;
  risk: RiskLevel | null;
  sections: Section[];
  /** The page header. The bar shows once this has gone up under it. */
  headerRef: React.RefObject<HTMLElement | null>;
  /** Filled by R4 (Copy / Export / Print / Delete). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const chrome = useRef<HTMLDivElement>(null);
  const stickyHeight = useHeight(chrome);
  const shown = useScrolledPast(headerRef, stickyHeight);
  const { active, navigate } = useScrollSpy(
    sections.map(s => s.id),
    stickyHeight,
  );
  const hasNav = sections.length > 0;

  return (
    <div className="report-shell" style={{ '--report-sticky-h': `${stickyHeight}px` } as React.CSSProperties}>
      {risk ? (
        // Kept laid out while hidden, so its height is known before it is first needed; `inert`
        // keeps it out of the tab order and the accessibility tree until then.
        <div ref={chrome} className="report-chrome" data-shown={shown || undefined} inert={!shown}>
          <div className="report-bar">
            <p className="report-brand report-bar-brand">{APP_NAME}</p>
            <p className="report-bar-name">{name}</p>
            <span className={cn('report-risk report-bar-risk', RISK_TONE[risk])}>{toVerdictTone(risk)}</span>
            {actions ? <div className="report-bar-actions">{actions}</div> : null}
          </div>
          {hasNav ? <Strip sections={sections} active={active} onNavigate={navigate} /> : null}
        </div>
      ) : null}
      <div className={cn('report-layout', hasNav && 'report-layout-rail')}>
        {hasNav ? <Rail sections={sections} active={active} onNavigate={navigate} /> : null}
        <main className="report-column">{children}</main>
      </div>
    </div>
  );
};

export { ReportFrame };

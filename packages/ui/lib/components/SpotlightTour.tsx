import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

export type SpotlightTourStep = {
  target: string;
  text: string;
  final?: boolean;
  previousLabel?: string;
  skipLabel?: string;
  nextLabel?: string;
};

export const SpotlightTour = ({
  onPrevious,
  onNext,
  onSkip,
  step,
}: {
  onPrevious?: () => void;
  onNext: () => void;
  onSkip: () => void;
  step: SpotlightTourStep;
}) => {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    const target = document.querySelector<HTMLElement>(`[data-onboarding-target="${step.target}"]`);
    if (!target) {
      setRect(null);
      return;
    }

    target.scrollIntoView({ block: 'center', inline: 'nearest' });
    window.requestAnimationFrame(() => {
      setRect(target.getBoundingClientRect());
    });
  }, [step.target]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const timer = window.setTimeout(measure, 120);
    const retry = window.setInterval(measure, 240);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      window.clearTimeout(timer);
      window.clearInterval(retry);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  if (!rect) {
    return null;
  }

  const padding = 8;
  const hole = {
    top: Math.max(6, rect.top - padding),
    left: Math.max(6, rect.left - padding),
    width: Math.min(window.innerWidth - 12, rect.width + padding * 2),
    height: rect.height + padding * 2,
  };
  const tooltipBelow = hole.top + hole.height < window.innerHeight - 126;
  const tooltipTop = tooltipBelow ? hole.top + hole.height + 18 : Math.max(12, hole.top - 112);
  const tooltipLeft = Math.min(Math.max(12, hole.left), window.innerWidth - 240);
  const arrowStyle = tooltipBelow
    ? { top: hole.top + hole.height + 2, left: hole.left + hole.width / 2 - 8 }
    : { top: hole.top - 18, left: hole.left + hole.width / 2 - 8 };

  return (
    <div className="spotlight-tour" aria-live="polite">
      <div className="spotlight-tour-panel" style={{ top: 0, left: 0, right: 0, height: hole.top }} />
      <div className="spotlight-tour-panel" style={{ top: hole.top + hole.height, left: 0, right: 0, bottom: 0 }} />
      <div className="spotlight-tour-panel" style={{ top: hole.top, left: 0, width: hole.left, height: hole.height }} />
      <div
        className="spotlight-tour-panel"
        style={{ top: hole.top, left: hole.left + hole.width, right: 0, height: hole.height }}
      />
      <div className="spotlight-tour-ring" style={hole} />
      <div className={`spotlight-tour-arrow ${tooltipBelow ? '' : 'spotlight-tour-arrow-above'}`} style={arrowStyle} />
      <div className="spotlight-tour-tip" style={{ top: tooltipTop, left: tooltipLeft }}>
        <p>{step.text}</p>
        <div className="spotlight-tour-actions">
          <div className="spotlight-tour-secondary-actions">
            {onPrevious ? (
              <button className="spotlight-tour-skip" onClick={onPrevious} type="button">
                {step.previousLabel ?? 'Previous'}
              </button>
            ) : null}
            <button className="spotlight-tour-skip" onClick={onSkip} type="button">
              {step.skipLabel ?? 'Skip tour'}
            </button>
          </div>
          <button className="spotlight-tour-next" onClick={onNext} type="button">
            {step.nextLabel ?? (step.final ? 'Done' : 'Next')}
          </button>
        </div>
      </div>
    </div>
  );
};

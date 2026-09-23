import { CloseIcon } from '@src/components/Icons';
import { PanelHeader } from '@src/components/PanelHeader';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * A tool's own surface, over the view it was opened from — the popup's History panel, carried over.
 *
 * Why an overlay and not another card in the flow: a tool rendered inline is read as content, in
 * the same voice and at the same weight as the findings around it. The page reader on a covered
 * site was exactly that — a fourth card, indistinguishable from the analysed documents above it.
 * Placement is what tells a reader "this is a different job", before any styling does.
 *
 * A native modal `<dialog>`, because every part of the contract is then the browser's rather than
 * ours: the top layer, focus moving in and trapped there, Escape to close, the view behind made
 * inert, and focus returned to the tool that opened it. The view underneath stays mounted, so
 * closing lands the reader exactly where they were — scroll position included.
 *
 * It is its own `.panel-shell`, so its header floats and its back-to-top works exactly as a view's
 * do, with no second implementation of either.
 */
export const Overlay = ({
  title,
  meta,
  tools,
  onClose,
  children,
}: {
  title: string;
  meta?: ReactNode;
  tools?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;

    /*
     * The browser returns focus to the opener only when a dialog is CLOSED. This one is unmounted
     * by React state instead, which removes it without closing it — so without this, Escape left
     * focus on the document body and a keyboard user started again from the top of the panel.
     */
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // jsdom has no `showModal`; `open` gives the same content in tests without the top layer.
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');

    return () => opener?.focus();
  }, []);

  return (
    <dialog
      ref={ref}
      className="panel-overlay"
      aria-label={title}
      // Escape arrives as `cancel`. Let React state close it, so there is one way out, not two.
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}>
      <div className="panel-shell panel-sticky-scope">
        <PanelHeader
          title={title}
          meta={meta}
          tools={tools}
          end={
            <button type="button" className="panel-icon-button" aria-label="Close" title="Close" onClick={onClose}>
              <CloseIcon />
            </button>
          }
        />
        {children}
      </div>
    </dialog>
  );
};

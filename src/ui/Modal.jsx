import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

export function Modal({ title, open, onClose, children, footer, size = "default", className = "", initialFocusRef }) {
  const titleId = useId();
  const sheetRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKeyDown = event => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "Tab") {
        const focusable = [...(sheetRef.current?.querySelectorAll(focusableSelector) || [])]
          .filter(element => !element.hasAttribute("hidden"));
        if (!focusable.length) {
          event.preventDefault();
          sheetRef.current?.focus();
        } else if (event.shiftKey && document.activeElement === focusable[0]) {
          event.preventDefault();
          focusable.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
          event.preventDefault();
          focusable[0]?.focus();
        }
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(() => {
      const target = initialFocusRef?.current
        || sheetRef.current?.querySelector("[data-autofocus]")
        || sheetRef.current?.querySelector("input:not([disabled]), button:not([disabled])");
      (target || sheetRef.current)?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      window.requestAnimationFrame(() => previousFocusRef.current?.focus());
    };
  }, [initialFocusRef, open]);

  if (!open) return null;
  return createPortal(
    <div className="modal-layer" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section ref={sheetRef} tabIndex={-1} className={`modal-sheet ${size} ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="modal-close" type="button" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body
  );
}

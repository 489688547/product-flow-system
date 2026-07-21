import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Module-level stack of open modals. Only the topmost entry responds to
// Escape / focus trap, and body overflow is locked while the stack is non-empty.
const modalStack = [];
let savedBodyOverflow = null;

function pushModal(entry) {
  if (modalStack.length === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  modalStack.push(entry);
}

function removeModal(entry) {
  const index = modalStack.indexOf(entry);
  if (index !== -1) modalStack.splice(index, 1);
  if (modalStack.length === 0 && savedBodyOverflow !== null) {
    document.body.style.overflow = savedBodyOverflow;
    savedBodyOverflow = null;
  }
}

function isTopModal(entry) {
  return modalStack[modalStack.length - 1] === entry;
}

function visibleFocusables(panel) {
  return Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR)).filter(element => !element.hasAttribute("hidden") && element.getClientRects().length > 0);
}

export function Modal({ title, open, onClose, children, footer, size = "default", className = "", initialFocusRef }) {
  const titleId = useId();
  const panelRef = useRef(null);
  // Keep the latest onClose without re-running the open/close effect when the
  // caller passes an inline function (which would re-record the trigger element).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const entry = { panel: null, trigger: document.activeElement };
    pushModal(entry);

    // Move focus into the dialog on open. React `autoFocus` inside children has
    // already run by this point, so only take over when nothing inside is focused.
    const panel = panelRef.current;
    if (panel) {
      entry.panel = panel;
      if (!panel.contains(document.activeElement)) {
        const target = initialFocusRef?.current || panel.querySelector("[data-autofocus]") || visibleFocusables(panel)[0] || panel;
        target.focus();
      }
    }

    const onKeyDown = event => {
      if (!isTopModal(entry)) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab") return;
      const currentPanel = panelRef.current;
      if (!currentPanel) return;
      const focusables = visibleFocusables(currentPanel);
      if (focusables.length === 0) {
        event.preventDefault();
        currentPanel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || !currentPanel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !currentPanel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const wasTop = isTopModal(entry);
      removeModal(entry);
      if (!wasTop) return;
      // Return focus: to the newly exposed modal if one is still open,
      // otherwise to the element that triggered this modal.
      const underlying = modalStack[modalStack.length - 1];
      if (underlying?.panel?.isConnected) {
        underlying.panel.focus();
        return;
      }
      const trigger = entry.trigger;
      if (trigger && trigger.isConnected && typeof trigger.focus === "function" && trigger !== document.body) {
        trigger.focus();
      }
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      className="modal-layer"
      role="presentation"
      onMouseDown={event => {
        const top = modalStack[modalStack.length - 1];
        if (event.target === event.currentTarget && top?.panel === panelRef.current) onCloseRef.current?.();
      }}
    >
      <section ref={panelRef} className={`modal-sheet ${size} ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="modal-close" type="button" onClick={() => onCloseRef.current?.()} aria-label="关闭"><X size={20} /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body
  );
}

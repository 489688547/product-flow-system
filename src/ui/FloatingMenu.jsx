import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_PADDING = 8;
const MENU_GAP = 6;

export function FloatingMenu({
  anchorRef,
  open,
  onClose,
  children,
  className = "",
  minWidth = 0,
  maxHeight = 280,
  role,
  ariaLabel
}) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight, visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open) return undefined;

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;

      const anchorRect = anchor.getBoundingClientRect();
      const anchorOutsideViewport = anchorRect.bottom <= VIEWPORT_PADDING
        || anchorRect.top >= window.innerHeight - VIEWPORT_PADDING
        || anchorRect.right <= VIEWPORT_PADDING
        || anchorRect.left >= window.innerWidth - VIEWPORT_PADDING;
      if (anchorOutsideViewport) {
        setPosition(current => ({ ...current, visibility: "hidden" }));
        return;
      }
      const availableBelow = window.innerHeight - anchorRect.bottom - VIEWPORT_PADDING - MENU_GAP;
      const availableAbove = anchorRect.top - VIEWPORT_PADDING - MENU_GAP;
      const desiredHeight = Math.min(menu.scrollHeight, maxHeight);
      const placeAbove = availableBelow < Math.min(desiredHeight, 160) && availableAbove > availableBelow;
      const availableHeight = Math.max(96, placeAbove ? availableAbove : availableBelow);
      const resolvedMaxHeight = Math.min(maxHeight, availableHeight);
      const width = Math.min(
        Math.max(anchorRect.width, minWidth),
        window.innerWidth - VIEWPORT_PADDING * 2
      );
      const left = Math.min(
        Math.max(VIEWPORT_PADDING, anchorRect.left),
        window.innerWidth - VIEWPORT_PADDING - width
      );
      const top = placeAbove
        ? Math.max(VIEWPORT_PADDING, anchorRect.top - MENU_GAP - Math.min(desiredHeight, resolvedMaxHeight))
        : Math.min(
          window.innerHeight - VIEWPORT_PADDING - Math.min(desiredHeight, resolvedMaxHeight),
          anchorRect.bottom + MENU_GAP
        );

      setPosition({ top, left, width, maxHeight: resolvedMaxHeight, visibility: "visible" });
    };

    const handlePointerDown = event => {
      if (menuRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return;
      onClose?.();
    };
    const handleKeyDown = event => {
      if (event.key === "Escape") onClose?.();
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, maxHeight, minWidth, onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      className={`floating-menu-layer ${className}`.trim()}
      style={{ ...position, position: "fixed" }}
      role={role}
      aria-label={ariaLabel}
    >
      {children}
    </div>,
    document.body
  );
}

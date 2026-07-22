import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_PADDING = 8;
const MENU_GAP = 6;
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "[role=\"option\"]:not([aria-disabled=\"true\"])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])"
].join(",");

function focusableItems(menu) {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(el => el.getAttribute("aria-hidden") !== "true");
}

export function FloatingMenu({
  anchorRef,
  open,
  onClose,
  children,
  className = "",
  minWidth = 0,
  maxHeight = 280,
  role,
  ariaLabel,
  focusOnOpen = false,
  enableArrowNavigation = false
}) {
  const menuRef = useRef(null);
  const frameRef = useRef(null);
  const focusInsideRef = useRef(false);
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

    // 合帧：滚动/resize 高频触发时，每帧最多重算并 setState 一次，
    // 避免每个滚动事件同步 getBoundingClientRect + setState 造成的布局抖动。
    const schedulePositionUpdate = () => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        updatePosition();
      });
    };

    const handlePointerDown = event => {
      if (menuRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return;
      // 用户点击菜单外部关闭：焦点应落到被点击的元素，不要归还触发按钮。
      focusInsideRef.current = false;
      onClose?.();
    };
    const handleKeyDown = event => {
      if (event.key === "Escape") onClose?.();
    };

    updatePosition();
    window.addEventListener("scroll", schedulePositionUpdate, true);
    window.addEventListener("resize", schedulePositionUpdate);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      window.removeEventListener("scroll", schedulePositionUpdate, true);
      window.removeEventListener("resize", schedulePositionUpdate);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, maxHeight, minWidth, onClose, open]);

  // 可选焦点管理：打开时把焦点移入菜单第一个可选项，关闭时归还触发按钮。
  useEffect(() => {
    if (!open || !focusOnOpen) return undefined;
    const focusTimer = requestAnimationFrame(() => {
      const menu = menuRef.current;
      if (!menu) return;
      const target = focusableItems(menu)[0] || menu;
      target.focus();
      focusInsideRef.current = true;
    });
    return () => {
      cancelAnimationFrame(focusTimer);
      if (focusInsideRef.current) {
        focusInsideRef.current = false;
        anchorRef.current?.focus?.();
      }
    };
  }, [anchorRef, focusOnOpen, open]);

  // 可选键盘导航：上下方向键在可选项间循环移动焦点，Enter 激活当前项。
  const handleMenuKeyDown = event => {
    if (!enableArrowNavigation) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const items = focusableItems(menuRef.current);
      if (items.length === 0) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      let next;
      if (index === -1) {
        next = event.key === "ArrowDown" ? items[0] : items[items.length - 1];
      } else {
        const step = event.key === "ArrowDown" ? 1 : -1;
        next = items[(index + step + items.length) % items.length];
      }
      next.focus();
      return;
    }
    if (event.key === "Enter") {
      const active = document.activeElement;
      // button 原生支持 Enter 触发 click；其余角色（如纯 role="option" 元素）需要手动激活。
      if (active && active !== menuRef.current && menuRef.current?.contains(active) && active.tagName !== "BUTTON") {
        event.preventDefault();
        active.click();
      }
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      ref={menuRef}
      className={`floating-menu-layer ${className}`.trim()}
      style={{ ...position, position: "fixed" }}
      role={role}
      aria-label={ariaLabel}
      tabIndex={focusOnOpen ? -1 : undefined}
      onKeyDown={enableArrowNavigation ? handleMenuKeyDown : undefined}
    >
      {children}
    </div>,
    document.body
  );
}

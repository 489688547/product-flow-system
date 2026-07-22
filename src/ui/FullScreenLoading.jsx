import { createPortal } from "react-dom";

// Shared full-screen loading overlay. Rendered through a portal so it can sit
// above open modals while a slow external sync (DingTalk todo/schedule) runs.
export function FullScreenLoading({ visible, message }) {
  if (!visible) return null;
  return createPortal(
    <div className="meeting-loading-layer" role="status" aria-live="assertive">
      <div className="meeting-loading-card"><span className="loading-spinner" />{message}</div>
    </div>,
    document.body
  );
}

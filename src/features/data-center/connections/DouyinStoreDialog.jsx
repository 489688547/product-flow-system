import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "../../../ui/Button.jsx";

export function DouyinStoreDialog({ onSave, onClose }) {
  const [storeName, setStoreName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef(null);
  const titleId = "douyin-store-dialog-title";

  useEffect(() => {
    const sheet = sheetRef.current;
    sheet?.querySelector("input")?.focus();
    const keydown = event => {
      if (event.key === "Escape" && !saving) onClose();
      if (event.key !== "Tab" || !sheet) return;
      const focusable = [...sheet.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [onClose, saving]);

  const submit = async event => {
    event.preventDefault();
    if (!/^[-_a-zA-Z0-9]{1,128}$/.test(storeId.trim())) {
      setError("店铺 ID 格式不正确。");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ storeName: storeName.trim(), storeId: storeId.trim() });
      onClose();
    } catch (saveError) {
      setError(saveError.message || "店铺添加失败。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-layer" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !saving) onClose();
    }}>
      <form
        className="modal-sheet douyin-store-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={sheetRef}
        onSubmit={submit}
      >
        <header className="modal-header">
          <h2 id={titleId}>添加抖音店铺</h2>
          <button className="modal-close" type="button" onClick={onClose} disabled={saving} aria-label="关闭">
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="modal-body">
          {error ? <div className="connector-form-error" role="alert">{error}</div> : null}
          <div className="connector-form-grid">
            <label>店铺名称
              <input
                required
                maxLength={120}
                value={storeName}
                onChange={event => setStoreName(event.target.value)}
              />
            </label>
            <label>店铺 ID
              <input
                required
                maxLength={128}
                inputMode="numeric"
                value={storeId}
                onChange={event => setStoreId(event.target.value)}
              />
            </label>
          </div>
        </div>
        <footer className="modal-footer">
          <Button type="button" onClick={onClose} disabled={saving}>取消</Button>
          <Button type="submit" variant="primary" disabled={saving}>{saving ? "正在添加…" : "添加"}</Button>
        </footer>
      </form>
    </div>
  );
}

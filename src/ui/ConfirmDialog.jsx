import { Trash2 } from "lucide-react";
import { Button } from "./Button.jsx";
import { Modal } from "./Modal.jsx";

export function ConfirmDialog({ open, title, message, description, confirmLabel = "删除", confirmLoading = false, confirmLoadingLabel = "处理中…", onClose, onConfirm }) {
  return (
    <Modal
      title={title}
      open={open}
      onClose={onClose}
      size="confirm"
      footer={(
        <>
          <Button autoFocus onClick={onClose}>取消</Button>
          <Button variant="danger" disabled={confirmLoading} onClick={onConfirm}><Trash2 size={16} />{confirmLoading ? confirmLoadingLabel : confirmLabel}</Button>
        </>
      )}
    >
      <div className="confirm-dialog-content">
        <span className="confirm-dialog-icon" aria-hidden="true"><Trash2 size={20} /></span>
        <div>
          <strong>{message}</strong>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
    </Modal>
  );
}

import { Button } from "./Button.jsx";
import { Modal } from "./Modal.jsx";

export function DeliverablePreviewModal({ file, onClose }) {
  return (
    <Modal
      open={Boolean(file)}
      title={file?.name || "交付物"}
      onClose={onClose}
      footer={<Button onClick={onClose}>关闭</Button>}
    >
      {file?.type === "richtext" ? (
        <iframe className="deliverable-rich-preview" title={file.name} sandbox="" srcDoc={`<!doctype html><meta charset="utf-8"><style>body{font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;margin:24px}img{max-width:100%;height:auto}a{color:#1769e0}</style>${file.content || ""}`} />
      ) : null}
    </Modal>
  );
}

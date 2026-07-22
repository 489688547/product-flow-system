import { Download, ExternalLink, FileWarning, Pencil, Trash2 } from "lucide-react";
import { canDownloadDeliverable, deliverableKind, isBrokenDeliverable } from "../domain/deliverables.js";
import { Button } from "./Button.jsx";
import { Modal } from "./Modal.jsx";

export function DeliverablePreviewModal({ file, onClose, onEdit, onDelete }) {
  const kind = deliverableKind(file);
  const broken = isBrokenDeliverable(file);
  const canDownload = canDownloadDeliverable(file);
  const footer = (
    <>
      {onEdit ? <Button onClick={onEdit}><Pencil size={16} />编辑交付物</Button> : null}
      {onDelete ? <Button className="danger" onClick={onDelete}><Trash2 size={16} />删除交付物</Button> : null}
      {!broken && file?.url ? <a className="btn secondary" href={file.url} target="_blank" rel="noreferrer"><ExternalLink size={16} />新窗口打开</a> : null}
      {!broken && canDownload ? <a className="btn primary" href={file.url} download={file.name}><Download size={16} />下载</a> : null}
      <Button onClick={onClose}>关闭</Button>
    </>
  );

  return (
    <Modal open={Boolean(file)} title={file?.name || "交付物"} onClose={onClose} footer={footer} size="large">
      {broken ? (
        <div className="deliverable-broken-preview"><FileWarning size={38} /><strong>文件为空或已损坏</strong><span>该记录无法预览，可以关闭后删除或重新上传。</span></div>
      ) : kind === "richtext" ? (
        <iframe className="deliverable-rich-preview" title={file.name} sandbox="" srcDoc={`<!doctype html><meta charset="utf-8"><style>body{font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#2b2620;margin:24px}img{max-width:100%;height:auto}a{color:#8a4b1f}</style>${file.content || ""}`} />
      ) : kind === "image" ? (
        <img className="deliverable-image-preview" src={file.url} alt={file.name} />
      ) : kind === "video" ? (
        <video className="deliverable-video-preview" src={file.url} controls />
      ) : kind === "pdf" || kind === "link" ? (
        <iframe className="deliverable-file-frame" src={file.url} title={file.name} />
      ) : (
        <div className="deliverable-generic-preview"><strong>当前浏览器不能直接预览这个文件</strong><span>可使用下方按钮下载，或在新窗口中打开。</span></div>
      )}
    </Modal>
  );
}

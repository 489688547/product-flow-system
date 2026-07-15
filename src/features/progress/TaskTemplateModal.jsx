import { ExternalLink, FileText } from "lucide-react";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";

export function TaskTemplateModal({ open, task, onClose }) {
  const documents = task?.deliverableTemplates || [];

  return (
    <Modal open={open} title={`${task?.title || "任务"} · 钉钉文档模板`} onClose={onClose}>
      <div className="task-template-documents">
        {documents.map(document => (
          <article key={document.id || document.url} className="task-template-document">
            <span className="task-template-document-icon"><FileText size={18} /></span>
            <div><strong>{document.name}</strong><small>钉钉文档</small></div>
            <Button className="compact" onClick={() => window.open(document.url, "_blank", "noopener,noreferrer")}><ExternalLink size={15} />打开</Button>
          </article>
        ))}
        {!documents.length ? <div className="empty-state compact-empty">当前任务没有配置交付物模板</div> : null}
      </div>
    </Modal>
  );
}

import { Link2, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, IconAction } from "../../ui/Button.jsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.jsx";
import { Modal } from "../../ui/Modal.jsx";

function isDingTalkDocument(url) {
  try {
    return new URL(url).hostname === "alidocs.dingtalk.com";
  } catch {
    return false;
  }
}

export function DeliverableTemplateEditorModal({ open, task, onClose, onSave }) {
  const [documents, setDocuments] = useState([]);
  const [documentToDelete, setDocumentToDelete] = useState(null);

  useEffect(() => {
    if (!open) return;
    setDocuments((task?.deliverableTemplates || []).map(document => ({ ...document })));
    setDocumentToDelete(null);
  }, [open, task]);

  const valid = useMemo(() => documents.every(document => document.name.trim() && isDingTalkDocument(document.url.trim())), [documents]);
  const updateDocument = (id, patch) => setDocuments(current => current.map(document => document.id === id ? { ...document, ...patch } : document));
  const addDocument = () => setDocuments(current => [...current, { id: `doc-template-${Date.now()}`, name: "", url: "" }]);
  const deleteDocument = id => {
    setDocumentToDelete(documents.find(document => document.id === id) || null);
  };

  return (
    <>
    <Modal
      open={open}
      title={`${task?.title || "任务"} · 交付物模板`}
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={!valid} disabledReason="请补全模板名称和有效的钉钉文档链接" onClick={() => onSave(documents.map(document => ({ ...document, name: document.name.trim(), url: document.url.trim() })))}>保存模板</Button></>}
    >
      <div className="deliverable-template-editor">
        <div className="template-modal-intro"><Link2 size={17} /><span>配置完成后，产品任务可直接打开这些钉钉文档模板。</span></div>
        <div className="deliverable-template-rows">
          {documents.map(document => (
            <div key={document.id} className="deliverable-template-row">
              <label>钉钉文档名称<input value={document.name} onChange={event => updateDocument(document.id, { name: event.target.value })} placeholder="例如：样品评审纪要模板" /></label>
              <label>钉钉文档链接<input value={document.url} onChange={event => updateDocument(document.id, { url: event.target.value })} placeholder="https://alidocs.dingtalk.com/i/nodes/..." /></label>
              <IconAction label="删除交付物模板" className="danger" onClick={() => deleteDocument(document.id)}><Trash2 size={16} /></IconAction>
            </div>
          ))}
          {!documents.length ? <div className="empty-state compact-empty">还没有配置钉钉文档模板</div> : null}
        </div>
        <Button className="compact" onClick={addDocument}><Plus size={16} />添加钉钉文档模板</Button>
      </div>
    </Modal>
    <ConfirmDialog
      open={Boolean(documentToDelete)}
      title="删除交付物模板"
      message={documentToDelete ? `确认删除“${documentToDelete.name.trim() || "未命名模板"}”？` : ""}
      description="保存模板后生效，删除后不可恢复。"
      onClose={() => setDocumentToDelete(null)}
      onConfirm={() => {
        setDocuments(current => current.filter(document => document.id !== documentToDelete.id));
        setDocumentToDelete(null);
      }}
    />
    </>
  );
}

import { FileText, Link2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { stripHtml } from "../../domain/productFlow.js";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { RichTextEditor } from "../../ui/RichTextEditor.jsx";

function isDingTalkDocument(url) {
  try {
    return new URL(url).hostname === "alidocs.dingtalk.com";
  } catch {
    return false;
  }
}

export function TaskDeliverableModal({ open, task, product, file, onClose, onSave }) {
  const [type, setType] = useState("dingtalk-doc");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!open) return;
    setType(file?.type === "richtext" ? "richtext" : "dingtalk-doc");
    setName(file?.name || (task?.deliverable && task.deliverable !== "待补充" ? task.deliverable : ""));
    setUrl(file?.url || "");
    setContent(file?.content || "");
  }, [file?.content, file?.id, file?.name, file?.type, file?.url, open, task?.deliverable, task?.id]);

  const valid = useMemo(() => Boolean(
    name.trim() && (type === "dingtalk-doc" ? isDingTalkDocument(url.trim()) : stripHtml(content))
  ), [content, name, type, url]);

  function save() {
    if (!valid) return;
    onSave({
      productId: file?.productId || product.id,
      taskId: file?.taskId || task.id,
      name: name.trim(),
      type,
      url: type === "dingtalk-doc" ? url.trim() : "",
      content: type === "richtext" ? content : "",
      source: file?.source || "task"
    });
  }

  return (
    <Modal
      open={open}
      title={file?.id ? "编辑交付物" : "添加交付物"}
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={!valid} disabledReason="请填写名称和有效的钉钉文档链接或富文本内容" onClick={save}>{file?.id ? "保存" : "添加"}</Button></>}
    >
      <div className="deliverable-type-tabs" role="tablist" aria-label="交付物类型">
        <button type="button" className={type === "dingtalk-doc" ? "active" : ""} onClick={() => setType("dingtalk-doc")}><Link2 size={16} />钉钉文档</button>
        <button type="button" className={type === "richtext" ? "active" : ""} onClick={() => setType("richtext")}><FileText size={16} />富文本</button>
      </div>
      <div className="deliverable-form">
        <label>名称<input value={name} onChange={event => setName(event.target.value)} placeholder="例如：立项评审纪要" /></label>
        {type === "dingtalk-doc" ? (
          <label>钉钉文档链接<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://alidocs.dingtalk.com/i/nodes/..." /></label>
        ) : (
          <label>文档内容<RichTextEditor value={content} onChange={setContent} placeholder="记录结论、交付说明、图片和链接…" /></label>
        )}
      </div>
    </Modal>
  );
}

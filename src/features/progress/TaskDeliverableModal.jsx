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

export function TaskDeliverableModal({ open, task, product, onClose, onSave }) {
  const [type, setType] = useState("dingtalk-doc");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!open) return;
    setType("dingtalk-doc");
    setName(task?.deliverable && task.deliverable !== "待补充" ? task.deliverable : "");
    setUrl("");
    setContent("");
  }, [open, task?.id, task?.deliverable]);

  const valid = useMemo(() => Boolean(
    name.trim() && (type === "dingtalk-doc" ? isDingTalkDocument(url.trim()) : stripHtml(content))
  ), [content, name, type, url]);

  function save() {
    if (!valid) return;
    onSave({
      productId: product.id,
      taskId: task.id,
      name: name.trim(),
      type,
      url: type === "dingtalk-doc" ? url.trim() : "",
      content: type === "richtext" ? content : "",
      source: "task"
    });
  }

  return (
    <Modal
      open={open}
      title="添加交付物"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={!valid} onClick={save}>添加</Button></>}
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

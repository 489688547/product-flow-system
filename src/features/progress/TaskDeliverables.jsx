import { FileText, Link2, Plus } from "lucide-react";

function DeliverableIcon({ file }) {
  if (file.type === "dingtalk-doc") return <Link2 size={15} />;
  if ((file.type || "").startsWith("image") && file.url) return <img src={file.url} alt="" />;
  return <FileText size={15} />;
}

export function TaskDeliverables({ files = [], deliverableTemplates = [], onAdd, onOpen, onOpenTemplates }) {
  const visible = files.slice(0, 3);
  const remaining = Math.max(0, files.length - visible.length);

  return (
    <div className="task-deliverables" aria-label="任务交付物">
      {visible.map(file => (
        <button key={file.id} type="button" className="task-deliverable-thumb" title={file.name} aria-label={`打开 ${file.name}`} onClick={() => onOpen(file)}>
          <DeliverableIcon file={file} />
        </button>
      ))}
      {remaining ? <span className="task-deliverable-more" title={`还有 ${remaining} 个文件`}>+{remaining}</span> : null}
      <button type="button" className="task-deliverable-add" data-testid="task-deliverable-add" aria-label="添加交付物" title="添加交付物" onClick={onAdd}>
        <Plus size={15} />
      </button>
      <button type="button" className="task-template-open" disabled={!deliverableTemplates.length} title={deliverableTemplates.length ? `查看 ${deliverableTemplates.length} 个交付物模板` : "未配置交付物模板"} onClick={onOpenTemplates}>模板</button>
    </div>
  );
}

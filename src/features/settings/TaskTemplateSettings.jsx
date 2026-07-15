import { FileText, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PRODUCT_LEVELS, STAGES } from "../../domain/productFlow.js";
import { Button, IconAction } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";
import { TaskCategorySelect } from "../progress/TaskCategorySelect.jsx";
import { DeliverableTemplateEditorModal } from "./DeliverableTemplateEditorModal.jsx";

const workflowStages = STAGES.filter(stage => stage.index > 0);

function cloneTemplates(templates) {
  return templates.map(template => ({ ...template, deliverableTemplates: (template.deliverableTemplates || []).map(document => ({ ...document })) }));
}

export function TaskTemplateSettings({ templates, orgCache, onSave, canEdit = false }) {
  const [draft, setDraft] = useState(() => cloneTemplates(templates));
  const [level, setLevel] = useState(PRODUCT_LEVELS[0]);
  const [stage, setStage] = useState(1);
  const [documentTaskId, setDocumentTaskId] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => setDraft(cloneTemplates(templates)), [templates]);

  const rows = useMemo(() => draft.filter(template => template.level === level && Number(template.stage) === stage), [draft, level, stage]);
  const documentTask = draft.find(template => template.id === documentTaskId);
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(cloneTemplates(templates));
  const updateDraft = updater => {
    setSavedNotice(false);
    setDraft(updater);
  };
  const updateTemplate = (id, patch) => updateDraft(current => current.map(template => template.id === id ? { ...template, ...patch } : template));
  const addTemplate = () => {
    const id = `task-template-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    updateDraft(current => [...current, { id, level, stage, category: "会前准备", title: "新任务", ownerDept: "产品部", deliverable: "待补充", required: false, deliverableTemplates: [] }]);
  };
  const deleteTemplate = id => {
    if (!window.confirm("确认删除这个默认任务模板？对应产品里的系统任务也会移除。")) return;
    updateDraft(current => current.filter(template => template.id !== id));
    if (documentTaskId === id) setDocumentTaskId("");
  };
  const handleSave = () => {
    onSave(cloneTemplates(draft));
    setSavedNotice(true);
  };

  const columns = [
    { key: "category", header: "类别", render: template => <TaskCategorySelect disabled={!canEdit} value={template.category} onChange={category => updateTemplate(template.id, { category })} label={`${template.title}默认类别`} /> },
    { key: "title", header: "任务内容", render: template => <input disabled={!canEdit} aria-label={`${template.title}默认任务内容`} value={template.title} onChange={event => updateTemplate(template.id, { title: event.target.value })} /> },
    { key: "ownerDept", header: "责任部门", render: template => <OrgSelect disabled={!canEdit} type="department" value={template.ownerDept} onChange={ownerDept => updateTemplate(template.id, { ownerDept })} orgCache={orgCache} searchInMenu multiple placeholder="选择责任部门" /> },
    { key: "deliverable", header: "交付物", render: template => <input disabled={!canEdit} aria-label={`${template.title}默认交付物`} value={template.deliverable} onChange={event => updateTemplate(template.id, { deliverable: event.target.value })} /> },
    { key: "required", header: "是否必需", render: template => <label className="template-required-check"><input disabled={!canEdit} type="checkbox" aria-label={`${template.title}是否必需`} checked={Boolean(template.required)} onChange={event => updateTemplate(template.id, { required: event.target.checked })} /><span>{template.required ? "必需" : "可选"}</span></label> },
    { key: "documents", header: "交付物模板", render: template => <Button disabled={!canEdit} disabledReason="当前账号没有编辑任务模板的权限" className="compact" onClick={() => setDocumentTaskId(template.id)}><FileText size={15} />模板 {template.deliverableTemplates?.length || 0}</Button> },
    { key: "actions", header: "操作", render: template => canEdit ? <TableActions><IconAction label="删除默认任务" className="danger" onClick={() => deleteTemplate(template.id)}><Trash2 size={16} /></IconAction></TableActions> : <span className="muted">—</span> }
  ];

  return (
    <section className="section-panel settings-task-templates">
      <div className="section-head settings-template-head">
        <div><h2>产品任务模板</h2><p>按产品等级和阶段维护默认任务，保存后同步到对应产品。</p></div>
        <div className="settings-save-actions">
          <span className={`settings-save-status ${hasChanges ? "dirty" : savedNotice ? "success" : ""}`}>
            {!canEdit ? "只读" : hasChanges ? "有未保存修改" : savedNotice ? "已保存并同步到对应产品" : "当前配置已保存"}
          </span>
          {canEdit ? <Button variant="primary" disabled={!hasChanges} disabledReason="任务配置没有未保存的修改" onClick={handleSave}><Save size={16} />保存任务配置</Button> : null}
        </div>
      </div>
      <div className="template-filter-group" aria-label="产品等级">
        {PRODUCT_LEVELS.map(item => <button type="button" key={item} className={item === level ? "active" : ""} onClick={() => setLevel(item)}>{item}</button>)}
      </div>
      <div className="template-filter-group stage" aria-label="产品阶段">
        {workflowStages.map(item => <button type="button" key={item.index} className={item.index === stage ? "active" : ""} onClick={() => setStage(item.index)}><span>{item.index}</span>{item.short}</button>)}
      </div>
      <DataTable className="template-task-table" minWidth={940} columns={columns} rows={rows} empty={<div className="empty-state compact-empty">当前等级和阶段没有默认任务</div>} />
      {canEdit ? <Button className="compact template-add-task" onClick={addTemplate}><Plus size={16} />添加默认任务</Button> : null}
      <DeliverableTemplateEditorModal
        open={canEdit && Boolean(documentTask)}
        task={documentTask}
        onClose={() => setDocumentTaskId("")}
        onSave={deliverableTemplates => {
          updateTemplate(documentTask.id, { deliverableTemplates });
          setDocumentTaskId("");
        }}
      />
    </section>
  );
}

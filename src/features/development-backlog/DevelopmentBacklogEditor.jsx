import { Bot, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { BACKLOG_MODULES } from "../../domain/developmentBacklog.js";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";

const EMPTY_DRAFT = {
  title: "",
  background: "",
  moduleId: "company-platform",
  priority: "p2",
  acceptanceCriteriaText: "",
  scopePathsText: "",
  dependencyIdsText: "",
  sourceType: "manual"
};

function editorDraft(value) {
  if (!value) return EMPTY_DRAFT;
  return {
    title: value.title || "",
    background: value.background || "",
    moduleId: value.moduleId || "company-platform",
    priority: value.priority || "p2",
    acceptanceCriteriaText: (value.acceptanceCriteria || []).join("\n"),
    scopePathsText: (value.scopePaths || []).join("\n"),
    dependencyIdsText: (value.dependencyIds || []).join("\n"),
    sourceType: value.sourceType || "manual"
  };
}

function lineValues(value) {
  return String(value || "").split("\n").map(line => line.trim()).filter(Boolean);
}

export function DevelopmentBacklogEditor({
  open,
  mode = "manual",
  initialItem,
  initialDescription = "",
  aiDraft,
  aiLoading,
  aiError,
  canManage,
  saving,
  onGenerate,
  onSubmit,
  onClose
}) {
  const [description, setDescription] = useState(initialDescription);
  const [draft, setDraft] = useState(() => editorDraft(initialItem || aiDraft));

  useEffect(() => {
    if (!open) return;
    setDescription(initialDescription);
    setDraft(editorDraft(initialItem || aiDraft));
  }, [aiDraft, initialDescription, initialItem, open]);

  function update(key, value) {
    setDraft(current => ({ ...current, [key]: value }));
  }

  function submit() {
    onSubmit({
      title: draft.title,
      background: draft.background,
      moduleId: draft.moduleId,
      priority: draft.priority,
      acceptanceCriteria: lineValues(draft.acceptanceCriteriaText),
      scopePaths: lineValues(draft.scopePathsText),
      dependencyIds: lineValues(draft.dependencyIdsText),
      sourceType: mode === "ai" ? "ai_assistant" : initialItem?.sourceType || "manual"
    });
  }

  const draftReady = Boolean(draft.title.trim() && draft.moduleId);
  return (
    <Modal
      title={initialItem ? `编辑 ${initialItem.displayId}` : mode === "ai" ? "和 AI 总助讨论新增" : "手工新增研发待办"}
      open={open}
      onClose={onClose}
      size="large"
      className="development-backlog-editor"
      footer={(
        <>
          <Button onClick={onClose}>取消</Button>
          {mode === "ai" && !aiDraft ? <Button variant="primary" disabled={aiLoading || description.trim().length < 2} onClick={() => onGenerate(description)}>{aiLoading ? "正在整理…" : aiError ? "重新生成" : "生成结构化草稿"}</Button> : null}
          {(mode !== "ai" || aiDraft) ? <Button variant="primary" disabled={!canManage || saving || !draftReady} disabledReason={!canManage ? "仅总经办可确认写入研发待办" : ""} onClick={submit}>{saving ? "正在保存…" : initialItem ? "保存修改" : "确认写入研发待办"}</Button> : null}
        </>
      )}
    >
      {mode === "ai" && !aiDraft ? (
        <section className="backlog-ai-intake">
          <div className="backlog-ai-note"><Bot size={18} aria-hidden="true" /><span><strong>先说需求，不用填写表格</strong><small>AI 只生成草稿；确认前不会写入 D1，也不会保存完整讨论。</small></span></div>
          <label>需求描述<textarea data-autofocus value={description} onChange={event => setDescription(event.target.value)} placeholder="例如：Chrome 扩展重载后，自动恢复身份并接收抖店采集任务…" rows="8" /></label>
          {aiError ? <div className="backlog-inline-error" role="alert"><strong>AI 草稿生成失败</strong><span>{aiError.message}</span><small>可重新生成；总经办也可以关闭后使用“手工新增”。</small></div> : null}
        </section>
      ) : (
        <div className="backlog-editor-grid">
          {mode === "ai" ? <div className="backlog-ai-note full-field"><Sparkles size={18} aria-hidden="true" /><span><strong>AI 建议草稿</strong><small>请核对并修改，点击确认后才写入研发待办。</small></span></div> : null}
          <label className="full-field">标题<input data-autofocus value={draft.title} onChange={event => update("title", event.target.value)} maxLength="120" /></label>
          <label>模块<select value={draft.moduleId} onChange={event => update("moduleId", event.target.value)}>{BACKLOG_MODULES.map(module => <option key={module.id} value={module.id}>{module.name}</option>)}</select></label>
          <label>优先级<select value={draft.priority} onChange={event => update("priority", event.target.value)}><option value="p0">P0 紧急</option><option value="p1">P1 高</option><option value="p2">P2 常规</option><option value="p3">P3 低</option></select></label>
          <label className="full-field">背景与目标<textarea value={draft.background} onChange={event => update("background", event.target.value)} rows="4" /></label>
          <label>验收标准<small>每行一条</small><textarea value={draft.acceptanceCriteriaText} onChange={event => update("acceptanceCriteriaText", event.target.value)} rows="6" /></label>
          <label>受影响路径<small>仓库相对路径，每行一条</small><textarea value={draft.scopePathsText} onChange={event => update("scopePathsText", event.target.value)} rows="6" placeholder="src/features/…" /></label>
          <label className="full-field">依赖待办编号<small>每行一个内部 ID；没有可留空</small><textarea value={draft.dependencyIdsText} onChange={event => update("dependencyIdsText", event.target.value)} rows="3" /></label>
        </div>
      )}
    </Modal>
  );
}

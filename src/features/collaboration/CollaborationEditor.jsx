import { useEffect, useMemo, useState } from "react";
import { Archive } from "lucide-react";
import { orgUsers } from "../../domain/productFlow.js";
import { useCollaboration } from "../../state/CollaborationProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DatePickerField } from "../../ui/DatePickerField.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";

const EMPTY = {
  kind: "handoff",
  title: "",
  description: "",
  requestedAction: "",
  businessImpact: "",
  impactLevel: "medium",
  ownerDepartment: "",
  ownerUser: "",
  partnerDepartments: "",
  dueDate: ""
};

function formFor(item) {
  if (!item) return EMPTY;
  return {
    kind: item.kind,
    title: item.title,
    description: item.description,
    requestedAction: item.requestedAction,
    businessImpact: item.businessImpact,
    impactLevel: item.impactLevel,
    ownerDepartment: item.ownerDepartment?.name || "",
    ownerUser: item.ownerUser?.name || "",
    partnerDepartments: (item.partnerDepartments || []).map(department => department.name).join(" / "),
    dueDate: item.dueAt?.slice(0, 10) || ""
  };
}

function identityFor(name, orgCache) {
  const user = orgUsers(orgCache).find(candidate => candidate.name === name);
  return name ? { userId: user?.userId || user?.userid || "", unionId: user?.unionId || user?.unionid || "", name } : null;
}

function payloadFor(form, orgCache) {
  const ownerUser = identityFor(form.ownerUser, orgCache);
  return {
    kind: form.kind,
    title: form.title.trim(),
    description: form.description.trim(),
    requestedAction: form.requestedAction.trim(),
    businessImpact: form.businessImpact.trim(),
    impactLevel: form.impactLevel,
    ownerDepartment: { name: form.ownerDepartment },
    ownerUser,
    decisionOwner: form.kind === "decision" ? ownerUser : null,
    partnerDepartments: form.partnerDepartments.split(" / ").filter(name => name && name !== form.ownerDepartment).map(name => ({ name })),
    dueAt: form.dueDate ? `${form.dueDate}T18:00:00+08:00` : ""
  };
}

export function CollaborationEditor({ open, onClose, item = null, draft = null, orgCache }) {
  const { createItem, updateItem, saving } = useCollaboration();
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState("");
  const [archiveReason, setArchiveReason] = useState("");
  useEffect(() => {
    if (open) {
      setForm(formFor(item || draft));
      setFormError("");
      setArchiveReason("");
    }
  }, [draft, item, open]);
  const title = item ? "编辑协同事项" : "发起部门协同";
  const valid = useMemo(() => form.title.trim() && form.requestedAction.trim() && form.businessImpact.trim() && form.ownerDepartment && form.dueDate && (form.kind !== "decision" || form.ownerUser), [form]);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));

  async function save() {
    if (!valid) {
      setFormError("请完整填写事项、下一步、业务影响、主责部门和截止日期；待决策事项还需指定决策人。");
      return;
    }
    try {
      const payload = payloadFor(form, orgCache);
      if (item) {
        const editable = { ...payload };
        delete editable.kind;
        await updateItem(item.id, { version: item.version, patch: editable, reason: "维护协同责任和执行信息" });
      } else {
        await createItem({
          ...payload,
          idempotencyKey: draft?.idempotencyKey || `collaboration-ui:${Date.now()}:${payload.title}`,
          source: draft?.source || { appId: "collaboration", entityType: "manual", entityId: "", sourceRecordId: "", sourceRoute: "#/collaboration", sourceLabel: "协同工作台" },
          strategyLinks: draft?.strategyLinks || {},
          evidence: draft?.evidence || []
        });
      }
      onClose();
    } catch (error) {
      setFormError(error.message || "协同事项保存失败。");
    }
  }

  async function archive() {
    if (!archiveReason.trim()) {
      setFormError("归档不会删除历史，请先填写归档原因。");
      return;
    }
    try {
      await updateItem(item.id, { version: item.version, patch: { archived: true }, reason: archiveReason.trim() });
      onClose();
    } catch (error) {
      setFormError(error.message || "协同事项归档失败。");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="large"
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={!valid || saving} onClick={save}>{saving ? "正在保存…" : "保存协同事项"}</Button></>}
    >
      <div className="collaboration-editor form-grid">
        {formError ? <div className="collaboration-alert danger" role="alert">{formError}</div> : null}
        {draft?.source?.sourceLabel ? <div className="collaboration-source-note"><span>业务来源</span><strong>{draft.source.sourceLabel}</strong></div> : null}
        <label><span>事项类型</span><select value={form.kind} onChange={event => update("kind", event.target.value)}><option value="handoff">部门交接</option><option value="risk">经营风险</option><option value="decision">待决策</option><option value="data_issue">数据问题</option><option value="task">协同任务</option></select></label>
        <label className="span-2"><span>事项标题</span><input value={form.title} maxLength={160} onChange={event => update("title", event.target.value)} placeholder="用一句话说明需要接住的责任" /></label>
        <label className="span-2"><span>背景说明</span><textarea value={form.description} maxLength={2000} onChange={event => update("description", event.target.value)} placeholder="补充业务背景和当前事实" /></label>
        <label className="span-2"><span>明确下一步</span><textarea value={form.requestedAction} maxLength={1000} onChange={event => update("requestedAction", event.target.value)} placeholder="主责部门接收后要完成什么" /></label>
        <label className="span-2"><span>业务影响</span><textarea name="businessImpact" value={form.businessImpact} maxLength={1000} onChange={event => update("businessImpact", event.target.value)} placeholder="不处理会影响什么结果" /></label>
        <label><span>影响等级</span><select value={form.impactLevel} onChange={event => update("impactLevel", event.target.value)}><option value="high">高影响</option><option value="medium">中影响</option><option value="low">低影响</option></select></label>
        <label><span>截止日期</span><DatePickerField value={form.dueDate} onChange={value => update("dueDate", value)} ariaLabel="选择协同截止日期" /></label>
        <OrgSelect type="department" label="主责部门" value={form.ownerDepartment} onChange={value => update("ownerDepartment", value)} orgCache={orgCache} searchInMenu />
        <OrgSelect label={form.kind === "decision" ? "决策人（必填）" : "主负责人（可接收时指定）"} value={form.ownerUser} onChange={value => update("ownerUser", value)} orgCache={orgCache} departmentFilter={form.ownerDepartment} searchInMenu />
        <div className="span-2"><OrgSelect type="department" label="协同部门" value={form.partnerDepartments} onChange={value => update("partnerDepartments", value)} orgCache={orgCache} multiple searchInMenu /></div>
        {item ? <section className="collaboration-archive-box span-2"><div><strong>归档事项</strong><p>归档后从默认列表隐藏，但不会删除责任和活动历史。</p></div><textarea value={archiveReason} onChange={event => setArchiveReason(event.target.value)} placeholder="填写归档原因" /><Button variant="quiet-danger" disabled={saving} onClick={archive}><Archive size={15} />归档</Button></section> : null}
      </div>
    </Modal>
  );
}

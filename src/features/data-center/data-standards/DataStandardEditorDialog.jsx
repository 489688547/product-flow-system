import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { FACT_FIELD_REGISTRY } from "../../../domain/dataStandards.js";
import { useDataStandards } from "../../../state/DataStandardsProvider.jsx";
import { Button } from "../../../ui/Button.jsx";
import { Modal } from "../../../ui/Modal.jsx";
import { FormulaBuilder } from "./FormulaBuilder.jsx";

const STEPS = ["基本信息", "数据范围", "公式", "样本预览", "发布确认"];
const UNIT_OPTIONS = ["CNY", "COUNT", "DAY", "PERCENT", "RATIO"];

function dateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function draftFrom(definition, ownerDepartments) {
  const current = definition?.versions?.find(version => version.version === definition.currentVersion) || definition?.versions?.[0];
  return {
    metricCode: definition?.metricCode || "",
    name: definition?.name || "",
    category: definition?.category || "sales",
    ownerDepartment: definition?.ownerDepartment || ownerDepartments[0] || "",
    unit: definition?.unit || "CNY",
    period: definition?.period || "day",
    effectiveFrom: definition ? dateOffset(1) : dateOffset(1),
    displayFormula: current?.displayFormula || "",
    formulaAst: current?.formulaAst || { type: "aggregate", operation: "sum", input: { type: "field", field: "sales.net_sales" }, filters: [] },
    sourceFields: current?.sourceFields || ["sales.net_sales"]
  };
}

function previewRange() {
  return { from: dateOffset(-7), to: dateOffset(-1) };
}

function factFields(formulaAst) {
  const fields = new Set();
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "field" && FACT_FIELD_REGISTRY[node.field]) fields.add(node.field);
    if (node.field && FACT_FIELD_REGISTRY[node.field]) fields.add(node.field);
    Object.values(node).forEach(value => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    });
  }
  visit(formulaAst);
  return [...fields];
}

export function DataStandardEditorDialog({ open, definition = null, onClose }) {
  const {
    definitions, ownerDepartments, canTransferOwner, saving, error, clearError, createDefinition,
    publishVersion, previewDefinition, loadDefinition
  } = useDataStandards();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(() => draftFrom(definition, ownerDepartments));
  const [range, setRange] = useState(previewRange);
  const [preview, setPreview] = useState(null);
  const [dirty, setDirty] = useState(false);
  const firstInputRef = useRef(null);
  const currentVersion = definition?.currentVersion || 0;
  const fieldErrors = new Set(error?.details?.fields || []);
  const title = definition ? `发布新版本 · ${definition.name}` : "新增数据口径";
  const publishedDefinitions = useMemo(() => definitions.filter(item => item.id !== definition?.id && item.status === "active"), [definition?.id, definitions]);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDraft(draftFrom(definition, ownerDepartments));
    setRange(previewRange());
    setPreview(null);
    setDirty(false);
    clearError();
  }, [definition, open]);

  const update = patch => {
    setDraft(current => ({ ...current, ...patch }));
    setDirty(true);
  };
  const attemptClose = () => {
    if (dirty && !saving && !window.confirm("还有未保存的数据口径草稿，确认关闭吗？")) return;
    onClose();
  };
  const canContinue = step === 0 ? Boolean(draft.name.trim() && draft.metricCode.trim())
    : step === 1 ? Boolean(draft.category && draft.ownerDepartment && draft.unit && draft.period && draft.effectiveFrom)
      : step === 2 ? Boolean(draft.displayFormula.trim() && (draft.formulaAst || draft.category === "goods_flow")) : true;
  const runPreview = async () => {
    try {
      const payload = await previewDefinition({ ...draft, ...range, ...(definition ? { expectedVersion: currentVersion } : {}) });
      setPreview(payload.result || null);
    } catch {
      // Provider exposes the structured error inline and keeps the draft open.
    }
  };
  const save = async () => {
    try {
      if (definition) await publishVersion(definition.id, { ...draft, expectedVersion: currentVersion });
      else await createDefinition(draft);
      setDirty(false);
      onClose();
    } catch {
      // Provider exposes the structured error inline and keeps the draft open.
    }
  };
  const refreshConflict = async () => {
    if (!definition?.id) return;
    try {
      await loadDefinition(definition.id);
    } catch {
      // Provider exposes the refresh failure inline.
    }
  };
  const updateFormula = formulaAst => {
    const sourceFields = factFields(formulaAst);
    const referenced = formulaAst?.type === "metric" ? publishedDefinitions.find(item => item.metricCode === formulaAst.metricCode) : null;
    const unit = formulaAst?.type === "arithmetic"
      ? "PERCENT"
      : referenced?.unit || FACT_FIELD_REGISTRY[sourceFields[0]]?.unit || draft.unit;
    update({ formulaAst, sourceFields, unit });
  };
  return <Modal title={title} open={open} onClose={attemptClose} size="large" className="data-standard-dialog" initialFocusRef={firstInputRef} footer={<>
    <Button type="button" onClick={attemptClose} disabled={saving}>取消</Button>
    {step > 0 ? <Button type="button" onClick={() => setStep(value => value - 1)} disabled={saving}><ChevronLeft size={15} />上一步</Button> : null}
    {step < STEPS.length - 1 ? <Button type="button" variant="primary" onClick={() => setStep(value => value + 1)} disabled={!canContinue || saving}>下一步<ChevronRight size={15} /></Button> : <Button type="button" variant="primary" onClick={save} disabled={saving}>{saving ? "正在发布…" : definition ? "发布新版本" : "发布口径"}</Button>}
  </>}>
    <ol className="data-standard-steps" aria-label="数据口径发布步骤">{STEPS.map((label, index) => <li key={label} className={index === step ? "active" : index < step ? "complete" : ""} aria-current={index === step ? "step" : undefined}><span>{index < step ? <Check size={13} /> : index + 1}</span><b>{label}</b></li>)}</ol>
    {error ? <div className="data-standard-error" role="alert"><AlertCircle size={16} /><span><strong>{error.message}</strong><small>{error.code}</small></span>{error.code === "DATA_STANDARD_VERSION_CONFLICT" ? <button type="button" onClick={refreshConflict}>刷新最新版本</button> : null}</div> : null}
    <div className="data-standard-editor-body">
      {step === 0 ? <div className="data-standard-form-grid">
        <label>口径名称<input ref={firstInputRef} value={draft.name} aria-invalid={fieldErrors.has("name")} onChange={event => update({ name: event.target.value })} placeholder="例如：有效支付金额" />{fieldErrors.has("name") ? <small>请检查口径名称。</small> : null}</label>
        <label>metricCode<input value={draft.metricCode} readOnly={Boolean(definition)} aria-invalid={fieldErrors.has("metricCode")} onChange={event => update({ metricCode: event.target.value })} placeholder="sales.paid_amount" /><small>{definition ? "发布后永久不变" : "小写英文分段，发布后不可修改"}</small></label>
        <p className="data-standard-guidance">名称服务于阅读，metricCode 服务于各业务 App 的稳定读取。两者不应包含店铺或月份。</p>
      </div> : null}
      {step === 1 ? <div className="data-standard-form-grid two-column">
        <label>分类<select value={draft.category} onChange={event => update({ category: event.target.value, formulaAst: event.target.value === "goods_flow" ? null : draft.formulaAst, sourceFields: event.target.value === "goods_flow" ? [] : draft.sourceFields })}><option value="sales">销售经营</option><option value="goods_flow">货流与资金</option></select></label>
        <label>责任部门<select value={draft.ownerDepartment} disabled={!canTransferOwner} onChange={event => update({ ownerDepartment: event.target.value })}>{[...new Set([...ownerDepartments, draft.ownerDepartment].filter(Boolean))].map(department => <option key={department}>{department}</option>)}</select><small>{canTransferOwner ? "总经办可调整" : "按当前组织身份锁定"}</small></label>
        <label>单位<select value={draft.unit} onChange={event => update({ unit: event.target.value })}>{UNIT_OPTIONS.map(unit => <option key={unit}>{unit}</option>)}</select></label>
        <label>统计周期<select value={draft.period} onChange={event => update({ period: event.target.value })}><option value="day">日</option><option value="month">月</option></select></label>
        <label>生效日期<input type="date" value={draft.effectiveFrom} onChange={event => update({ effectiveFrom: event.target.value })} /></label>
        <div className="data-standard-fixed-rules"><strong>固定经营规则</strong><span>订单创建时间</span><span>Asia/Shanghai</span><span>排除其它 / 未知平台</span></div>
      </div> : null}
      {step === 2 ? <div className="data-standard-form-grid">
        <label>展示公式<input value={draft.displayFormula} onChange={event => update({ displayFormula: event.target.value })} placeholder="用业务语言说明这项口径如何计算" /></label>
        {draft.category === "goods_flow" && draft.formulaAst == null ? <div className="data-standard-uncovered"><AlertCircle size={18} /><div><strong>当前数据未覆盖</strong><p>可以先发布定义和责任部门，结果会明确显示 DATA_NOT_COVERED，不生成模拟值。</p></div><Button type="button" onClick={() => updateFormula({ type: "metric", metricCode: publishedDefinitions[0]?.metricCode || "" })} disabled={!publishedDefinitions.length}>改为引用已发布口径</Button></div> : <FormulaBuilder value={draft.formulaAst} onChange={updateFormula} publishedDefinitions={publishedDefinitions} disabled={saving} />}
      </div> : null}
      {step === 3 ? <div className="data-standard-preview-step">
        <div className="data-standard-range"><label>样本开始<input type="date" value={range.from} onChange={event => setRange(current => ({ ...current, from: event.target.value }))} /></label><label>样本结束<input type="date" value={range.to} onChange={event => setRange(current => ({ ...current, to: event.target.value }))} /></label><Button type="button" onClick={runPreview} disabled={saving}><Eye size={15} />运行样本预览</Button></div>
        {preview ? <div className="data-standard-preview-result"><span>预览结果</span><strong>{preview.value == null ? "暂无结果" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(preview.value)}</strong><dl><div><dt>状态</dt><dd>{preview.status}</dd></div><div><dt>版本</dt><dd>v{preview.version}</dd></div><div><dt>覆盖率</dt><dd>{Math.round((preview.coverageRate || 0) * 100)}%</dd></div><div><dt>数据截止</dt><dd>{preview.dataCutoffAt || "—"}</dd></div></dl>{preview.reasonCode ? <p>{preview.reasonCode}</p> : null}</div> : <div className="data-standard-preview-empty">预览只读取最多 31 天样本，不写正式结果。运行后再进入发布确认。</div>}
      </div> : null}
      {step === 4 ? <div className="data-standard-confirmation"><h3>发布确认</h3><dl><div><dt>名称</dt><dd>{draft.name}</dd></div><div><dt>稳定代码</dt><dd><code>{draft.metricCode}</code></dd></div><div><dt>责任部门</dt><dd>{draft.ownerDepartment}</dd></div><div><dt>生效日期</dt><dd>{draft.effectiveFrom}</dd></div><div><dt>版本</dt><dd>v{definition ? currentVersion + 1 : 1}</dd></div><div><dt>展示公式</dt><dd>{draft.displayFormula}</dd></div></dl><p>发布后保留历史版本；既有历史结果不会静默重算。</p></div> : null}
    </div>
  </Modal>;
}

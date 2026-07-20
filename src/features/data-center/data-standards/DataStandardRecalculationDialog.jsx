import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useDataStandards } from "../../../state/DataStandardsProvider.jsx";
import { Button } from "../../../ui/Button.jsx";
import { Modal } from "../../../ui/Modal.jsx";

function defaults() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const to = yesterday.toISOString().slice(0, 10);
  return { from: `${to.slice(0, 7)}-01`, to };
}

export function DataStandardRecalculationDialog({ open, definition, onClose }) {
  const { saving, run, error, clearError, recalculate } = useDataStandards();
  const [range, setRange] = useState(defaults);
  const [version, setVersion] = useState(definition?.currentVersion || 1);
  const firstInputRef = useRef(null);
  useEffect(() => {
    if (!open || !definition) return;
    setRange(defaults());
    setVersion(definition.currentVersion);
    clearError();
  }, [definition, open]);
  const days = useMemo(() => {
    const from = Date.parse(`${range.from}T00:00:00Z`);
    const to = Date.parse(`${range.to}T00:00:00Z`);
    return Number.isFinite(from) && Number.isFinite(to) && to >= from ? Math.floor((to - from) / 86400000) + 1 : 0;
  }, [range]);
  if (!definition) return null;
  const submit = async () => {
    try {
      await recalculate({ metricCodes: [definition.metricCode], ...range, targetVersions: { [definition.metricCode]: Number(version) } });
      onClose();
    } catch {
      // Provider exposes the structured error while the confirmation stays open.
    }
  };
  return <Modal title={`历史重算 · ${definition.name}`} open={open} onClose={onClose} size="small" className="data-standard-dialog" initialFocusRef={firstInputRef} footer={<><Button type="button" onClick={onClose} disabled={saving}>取消</Button><Button type="button" variant="primary" onClick={submit} disabled={saving || !days || days > 370}>{saving ? "正在重算…" : <><RefreshCw size={15} />确认重算</>}</Button></>}>
    <div className="data-standard-recalculation-note"><strong>重算不会直接覆盖旧结果</strong><p>只有完整批次成功后才切换为当前结果；失败时原结果继续可读。</p></div>
    {error ? <div className="data-standard-error" role="alert"><span><strong>{error.message}</strong><small>{error.code}</small></span></div> : null}
    <div className="data-standard-form-grid">
      <label>开始日期<input ref={firstInputRef} type="date" value={range.from} onChange={event => setRange(current => ({ ...current, from: event.target.value }))} /></label>
      <label>结束日期<input type="date" value={range.to} onChange={event => setRange(current => ({ ...current, to: event.target.value }))} /></label>
      <label>目标版本<select value={version} onChange={event => setVersion(Number(event.target.value))}>{(definition.versions || []).map(item => <option key={item.version} value={item.version}>v{item.version} · {item.effectiveFrom}</option>)}</select></label>
    </div>
    <dl className="data-standard-impact"><div><dt>影响周期</dt><dd>{days ? `${days} 天` : "日期范围无效"}</dd></div><div><dt>依赖指标</dt><dd>{definition.dependencies?.length || 0} 项</dd></div><div><dt>当前任务</dt><dd>{run?.status || "尚未提交"}</dd></div></dl>
  </Modal>;
}

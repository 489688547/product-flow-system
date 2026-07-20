import { Archive, History, Pencil, RefreshCw } from "lucide-react";
import { useDataStandards } from "../../../state/DataStandardsProvider.jsx";
import { Button } from "../../../ui/Button.jsx";
import { Modal } from "../../../ui/Modal.jsx";

export function DataStandardDetailDialog({ open, definition, onClose, onEdit, onRecalculate }) {
  const { saving, archiveDefinition, canManageDefinition } = useDataStandards();
  if (!definition) return null;
  const current = definition.versions?.find(version => version.version === definition.currentVersion) || definition.versions?.[0];
  const canManage = canManageDefinition(definition);
  const archive = async () => {
    const impact = definition.dependencies?.length ? `该口径依赖 ${definition.dependencies.length} 项已发布口径。` : "当前没有依赖口径。";
    if (!window.confirm(`归档影响：${impact} 历史版本和结果会保留，确认归档吗？`)) return;
    try {
      await archiveDefinition(definition.id, { expectedVersion: definition.currentVersion });
      onClose();
    } catch {
      // Provider exposes the structured error while the detail stays open.
    }
  };
  return <Modal title={definition.name} open={open} onClose={onClose} size="large" className="data-standard-dialog" footer={<>
    <Button type="button" onClick={onClose}>关闭</Button>
    {canManage && definition.status === "active" ? <><Button type="button" onClick={onRecalculate} disabled={saving}><RefreshCw size={15} />历史重算</Button><Button type="button" onClick={onEdit} disabled={saving}><Pencil size={15} />发布新版本</Button></> : null}
  </>}>
    <div className="data-standard-detail-head"><div><code>{definition.metricCode}</code><p>{current?.displayFormula || "未填写展示公式"}</p></div><span className={`status-badge ${current?.coverageStatus === "DATA_NOT_COVERED" ? "warning" : "success"}`}>{current?.coverageStatus === "DATA_NOT_COVERED" ? "数据未覆盖" : "已覆盖"}</span></div>
    <dl className="data-standard-detail-meta"><div><dt>责任部门</dt><dd>{definition.ownerDepartment}</dd></div><div><dt>当前版本</dt><dd>v{definition.currentVersion}</dd></div><div><dt>生效日期</dt><dd>{current?.effectiveFrom || "—"}</dd></div><div><dt>单位 / 周期</dt><dd>{definition.unit} / {definition.period === "day" ? "日" : "月"}</dd></div></dl>
    <section className="data-standard-detail-section"><h3>依赖口径</h3>{definition.dependencies?.length ? <ul>{definition.dependencies.map(code => <li key={code}><code>{code}</code></li>)}</ul> : <p>当前口径不依赖其他已发布口径。</p>}</section>
    <section className="data-standard-detail-section"><h3><History size={15} />版本历史</h3><div className="data-standard-version-list">{(definition.versions || []).map(version => <article key={version.version}><div><strong>v{version.version}</strong><span>{version.effectiveFrom} 生效</span></div><p>{version.displayFormula}</p><small>{version.ownerDepartment} · {version.unit} · {version.coverageStatus === "DATA_NOT_COVERED" ? "数据未覆盖" : "可计算"}</small></article>)}</div></section>
    <section className="data-standard-detail-section"><h3>归档影响</h3><p>归档只停止后续发布和默认选择，不删除历史版本、计算批次或审计记录。</p>{canManage && definition.status === "active" ? <Button type="button" variant="danger" onClick={archive} disabled={saving}><Archive size={15} />归档该口径</Button> : <span className="status-badge neutral">只读查看</span>}</section>
  </Modal>;
}

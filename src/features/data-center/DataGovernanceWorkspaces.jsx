import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useDataCenter } from "../../state/DataCenterProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { loadErpArchives } from "../../state/erpCollectionApi.js";
import { collaborationDraftFromDataIssue } from "../../domain/collaborationAdapters.js";
import { AppCollaborationButton } from "../collaboration/AppCollaborationButton.jsx";
import { DataConnectionsWorkspace } from "./connections/DataConnectionsWorkspace.jsx";

const STATUS_LABELS = { healthy: "正常", success: "成功", pending_validation: "待验证", waiting_verification: "等待人工验证", running: "同步中", stale: "已过期", login_required: "需要登录", schema_changed: "页面结构变化", failed: "失败", manual_required: "需要人工处理", disabled: "未启用" };

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "未启用";
}

export function DataSourcesWorkspace({ canEdit, canManage, canManagePlatform, initialCategory }) {
  return <DataConnectionsWorkspace canEdit={canEdit} canManage={canManage} canManagePlatform={canManagePlatform} initialCategory={initialCategory} />;
}

export function SyncRunsWorkspace({ quality }) {
  const { state, refresh } = useDataCenter();
  const [archives, setArchives] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [archiveError, setArchiveError] = useState("");
  useEffect(() => {
    let active = true;
    setArchiveLoading(true);
    loadErpArchives().then(payload => {
      if (!active) return;
      setArchives(Array.isArray(payload.archives) ? payload.archives : []);
      setArchiveError("");
    }).catch(error => active && setArchiveError(error.message || "快麦归档状态读取失败。"))
      .finally(() => active && setArchiveLoading(false));
    return () => { active = false; };
  }, []);
  const cards = [["待处理问题", quality.openIssues], ["待确认商品映射", quality.unmappedProducts], ["本期口径排除", quality.excludedRows]];
  const salesAnomaly = quality.latestSalesAnomaly;
  const repairRun = quality.repairRun;
  const salesRepairMessage = repairRun?.status === "running"
    ? `系统正在自动补拉，已开始第 ${repairRun.attempts || 1} 次尝试。`
    : repairRun?.status === "manual_required"
      ? "当天已有更完整的退款明细，请重新导入快麦官方文件。"
      : Number(repairRun?.attempts) >= 2
        ? "自动补拉已连续失败，请检查快麦连接或重新导入快麦官方文件。"
        : "系统将先自动补拉；补拉失败后再转人工处理。";
  return <div className="data-workspace data-sync-workspace">
    <div className="data-sync-status-bar">
      <div className="data-quality-summary" aria-label="数据质量摘要">{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <Button onClick={refresh}><RefreshCw size={16} />刷新状态</Button>
    </div>
    {salesAnomaly?.status === "anomaly" ? <section className="section-panel" role="alert"><div className="section-head"><div><h2>{salesAnomaly.date} 销售数据疑似不完整</h2><p>GMV 为近 7 个有效日中位数的 {(salesAnomaly.salesRatio * 100).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%，销量为 {(salesAnomaly.qtyRatio * 100).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%，均低于 25% 警戒线。</p></div><span className={`status-badge ${repairRun?.status === "running" ? "warning" : "danger"}`}>{statusLabel(repairRun?.status || "pending_validation")}</span></div><p className="sales-service-message danger">{salesRepairMessage}</p></section> : null}
    <section className="section-panel"><div className="section-head"><div><h2>快麦原始归档</h2><p>公司 Mac 保存原文件，线上只显示安全清单和入库状态；归档成功不等于已经入库。</p></div><span className={`status-badge ${archiveError ? "danger" : archives.length ? "success" : "neutral"}`}>{archiveLoading ? "读取中" : archiveError ? "读取失败" : archives.length ? `${archives.length} 个归档文件` : "等待导出"}</span></div>
      {archiveError ? <div className="sales-service-message danger" role="alert">{archiveError}</div> : null}
      {!archiveLoading && !archiveError ? <DataTable minWidth={760} columns={[
        { key: "file", header: "归档文件", render: row => row.fileName || "未命名文件" },
        { key: "resource", header: "资源", render: row => row.resourceType || "—" },
        { key: "size", header: "大小", render: row => `${(Number(row.sizeBytes || 0) / 1024 / 1024).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} MB` },
        { key: "hash", header: "哈希", render: row => String(row.contentHash || "").slice(0, 12) || "—" },
        { key: "time", header: "归档时间", render: row => row.archivedAt ? new Date(row.archivedAt).toLocaleString("zh-CN", { hour12: false }) : "—" },
        { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "processed" ? "success" : row.status === "failed" ? "danger" : "warning"}`}>{row.status === "processed" ? "已入库" : row.status === "failed" ? "处理失败" : row.status === "processing" ? "入库中" : "已归档"}</span> }
      ]} rows={archives} empty={<div className="empty-state compact-empty">等待导出：把快麦官方文件放入桌面“公司数据中心/快麦ERP/待导入”。</div>} /> : null}
    </section>
    <section className="section-panel"><div className="section-head"><div><h2>执行记录</h2><p>每次采集和导入的范围、行数与结果；失败不会覆盖上次成功数据。</p></div></div><DataTable minWidth={760} columns={[
      { key: "time", header: "执行时间", render: row => row.completedAt || row.startedAt || "—" },
      { key: "source", header: "数据源", render: row => row.sourceName || row.sourceId || "未知来源" },
      { key: "range", header: "数据范围", render: row => [row.from, row.to].filter(Boolean).join(" 至 ") || "—" },
      { key: "rows", header: "行数", className: "num", render: row => row.rowCount || 0 },
      { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "success" ? "success" : row.status === "running" ? "warning" : "danger"}`}>{statusLabel(row.status)}</span> },
      { key: "message", header: "结果", render: row => row.message || "—" }
    ]} rows={state.syncRuns} empty={<div className="empty-state compact-empty">还没有数据中心同步记录。</div>} /></section>
    <section className="section-panel"><div className="section-head"><div><h2>待处理数据问题</h2><p>同步产生的缺失、重复、延迟和映射异常在这里闭环。</p></div></div><DataTable minWidth={680} columns={[
      { key: "title", header: "问题", render: row => row.title || row.message || "未命名问题" },
      { key: "type", header: "类型", render: row => row.type || "数据校验" },
      { key: "owner", header: "负责人", render: row => row.owner || "待认领" },
      { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "resolved" ? "success" : "warning"}`}>{row.status === "resolved" ? "已解决" : "待处理"}</span> },
      { key: "actions", header: "操作", render: row => <TableActions><AppCollaborationButton draft={collaborationDraftFromDataIssue(row)} disabled={row.status === "resolved"} disabledReason="已解决的数据问题无需再发起协同" /></TableActions> }
    ]} rows={state.qualityIssues} empty={<div className="empty-state compact-empty">当前没有待处理的数据质量问题。</div>} /></section>
  </div>;
}

export function DataCenterSettingsWorkspace({ canEdit }) {
  const { state, dispatch } = useDataCenter();
  const [draft, setDraft] = useState(state.settings);
  useEffect(() => setDraft(state.settings), [state.settings]);
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(state.settings), [draft, state.settings]);
  return <section className="data-settings-workspace"><div className="data-settings-toolbar"><div><h2>采集与保留策略</h2><p>统一使用上海时区；正常报表只统计截止昨天的数据。</p></div>{canEdit ? <Button variant="primary" disabled={!changed} onClick={() => dispatch({ type: "settings", settings: draft })}>保存设置</Button> : <span className="status-badge neutral">只读</span>}</div><fieldset disabled={!canEdit}><label>业务时区<input value={draft.timezone || "Asia/Shanghai"} readOnly /></label><label>每日完成截止时间<input type="time" value={draft.cutoff || "07:30"} onChange={event => setDraft(current => ({ ...current, cutoff: event.target.value }))} /></label><label>原始数据保留天数<input type="number" min="30" max="1095" value={draft.rawRetentionDays || 365} onChange={event => setDraft(current => ({ ...current, rawRetentionDays: Number(event.target.value) }))} /></label><label>超过多少小时标记过期<input type="number" min="1" max="168" value={draft.staleAfterHours || 32} onChange={event => setDraft(current => ({ ...current, staleAfterHours: Number(event.target.value) }))} /></label></fieldset><p className="data-security-note">敏感信息加密保存；验证码不会被保存；查看与采集取用全程留痕。需要重新登录时由授权人员在指定公司电脑完成。</p></section>;
}

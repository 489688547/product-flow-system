import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useDataCenter } from "../../state/DataCenterProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { collaborationDraftFromDataIssue } from "../../domain/collaborationAdapters.js";
import { AppCollaborationButton } from "../collaboration/AppCollaborationButton.jsx";
import { AiProviderSettings } from "./AiProviderSettings.jsx";
import { DataConnectionsWorkspace as ConnectorCatalogWorkspace } from "./connections/DataConnectionsWorkspace.jsx";
import { DataConnectionsWorkspace as AutomatedConnectionsWorkspace } from "./data-connections/DataConnectionsWorkspace.jsx";

const STATUS_LABELS = { healthy: "正常", pending_validation: "待验证", waiting_verification: "等待人工验证", running: "同步中", stale: "已过期", login_required: "需要登录", schema_changed: "页面结构变化", failed: "失败", disabled: "未启用" };

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "未启用";
}

export function DataSourcesWorkspace({ canEdit, canManage }) {
  return <div className="data-workspace"><AutomatedConnectionsWorkspace canEdit={canEdit} /><ConnectorCatalogWorkspace canEdit={canEdit} canManage={canManage} excludedConnectorIds={["douyin-ecommerce"]} /></div>;
}

export function SyncRunsWorkspace({ quality }) {
  const { state, refresh } = useDataCenter();
  const cards = [["待处理问题", quality.openIssues], ["待确认商品映射", quality.unmappedProducts], ["本期口径排除", quality.excludedRows]];
  return <div className="data-workspace data-sync-workspace">
    <div className="data-sync-status-bar">
      <div className="data-quality-summary" aria-label="数据质量摘要">{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <Button onClick={refresh}><RefreshCw size={16} />刷新状态</Button>
    </div>
    <section className="section-panel"><div className="section-head"><div><h2>执行记录</h2><p>每次采集和导入的范围、行数与结果；失败不会覆盖上次成功数据。</p></div></div><DataTable minWidth={760} columns={[
      { key: "time", header: "执行时间", render: row => row.completedAt || row.startedAt || "—" },
      { key: "source", header: "数据源", render: row => row.sourceName || row.sourceId || "未知来源" },
      { key: "range", header: "数据范围", render: row => [row.from, row.to].filter(Boolean).join(" 至 ") || "—" },
      { key: "rows", header: "行数", render: row => row.rowCount || 0 },
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

export function DataServicesWorkspace() {
  const { state } = useDataCenter();
  return <div className="data-workspace"><AiProviderSettings /><section className="data-service-intro"><div><span>DATA SERVICE</span><h2>应用订阅</h2><p>业务 App 只读取数据库，不重复登录店铺后台，也不各自维护指标口径。</p></div><strong>{state.subscriptions.filter(item => item.enabled).length}</strong><small>个启用订阅</small></section><section className="section-panel"><DataTable minWidth={680} columns={[
    { key: "app", header: "消费 App", render: row => row.appId },
    { key: "dataset", header: "数据集", render: row => row.dataset },
    { key: "version", header: "接口版本", render: row => row.apiVersion },
    { key: "freshness", header: "新鲜度要求", render: row => `${row.freshnessHours || 24} 小时` },
    { key: "status", header: "状态", render: row => <span className={`status-badge ${row.enabled ? "success" : "neutral"}`}>{row.enabled ? "已启用" : "已停用"}</span> }
  ]} rows={state.subscriptions} empty={<div className="empty-state compact-empty">还没有业务 App 订阅数据。</div>} /></section></div>;
}

export function DataCenterSettingsWorkspace({ canEdit }) {
  const { state, dispatch } = useDataCenter();
  const [draft, setDraft] = useState(state.settings);
  useEffect(() => setDraft(state.settings), [state.settings]);
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(state.settings), [draft, state.settings]);
  return <section className="data-settings-workspace"><div className="data-settings-toolbar"><div><h2>采集与保留策略</h2><p>统一使用上海时区；正常报表只统计截止昨天的数据。</p></div>{canEdit ? <Button variant="primary" disabled={!changed} onClick={() => dispatch({ type: "settings", settings: draft })}>保存设置</Button> : <span className="status-badge neutral">只读</span>}</div><fieldset disabled={!canEdit}><label>业务时区<input value={draft.timezone || "Asia/Shanghai"} readOnly /></label><label>每日完成截止时间<input type="time" value={draft.cutoff || "07:30"} onChange={event => setDraft(current => ({ ...current, cutoff: event.target.value }))} /></label><label>原始数据保留天数<input type="number" min="30" max="1095" value={draft.rawRetentionDays || 365} onChange={event => setDraft(current => ({ ...current, rawRetentionDays: Number(event.target.value) }))} /></label><label>超过多少小时标记过期<input type="number" min="1" max="168" value={draft.staleAfterHours || 32} onChange={event => setDraft(current => ({ ...current, staleAfterHours: Number(event.target.value) }))} /></label></fieldset><p className="data-security-note">敏感信息加密保存；验证码不会被保存；查看与采集取用全程留痕。需要重新登录时由授权人员在指定公司电脑完成。</p></section>;
}

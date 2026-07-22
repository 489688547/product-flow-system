import { useEffect, useMemo, useState } from "react";
import { Database, RefreshCw, Search } from "lucide-react";
import { useDataCenter } from "../../state/DataCenterProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { DateRangeControls } from "../../ui/DateRangeControls.jsx";
import { loadSalesDataAvailability, querySalesDataService, rangeForSalesMonth } from "../../state/dataServicesApi.js";
import { loadErpArchives } from "../../state/erpCollectionApi.js";
import { collaborationDraftFromDataIssue } from "../../domain/collaborationAdapters.js";
import { AppCollaborationButton } from "../collaboration/AppCollaborationButton.jsx";
import { AiProviderSettings } from "./AiProviderSettings.jsx";
import { DataConnectionsWorkspace } from "./connections/DataConnectionsWorkspace.jsx";

const STATUS_LABELS = { healthy: "正常", pending_validation: "待验证", waiting_verification: "等待人工验证", running: "同步中", stale: "已过期", login_required: "需要登录", schema_changed: "页面结构变化", failed: "失败", disabled: "未启用" };

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
  return <div className="data-workspace data-sync-workspace">
    <div className="data-sync-status-bar">
      <div className="data-quality-summary" aria-label="数据质量摘要">{cards.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
      <Button onClick={refresh}><RefreshCw size={16} />刷新状态</Button>
    </div>
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

export function DataServicesWorkspace() {
  const { state } = useDataCenter();
  const [availability, setAvailability] = useState(null);
  const [draftRange, setDraftRange] = useState({ from: "", to: "" });
  const [selectedMonth, setSelectedMonth] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadSalesDataAvailability().then(payload => {
      if (!active) return;
      const next = payload.availability || { availableMonths: [] };
      const month = next.availableMonths?.[0]?.month || "";
      setAvailability({ ...next, lastSuccessfulSyncAt: payload.lastSuccessfulSyncAt || "" });
      setSelectedMonth(month);
      setDraftRange(rangeForSalesMonth(month, next.latestDate));
      setError("");
    }).catch(cause => active && setError(cause.message || "销售数据可用范围加载失败。"))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  function changeMonth(event) {
    const month = event.target.value;
    setSelectedMonth(month);
    setDraftRange(rangeForSalesMonth(month, availability?.latestDate));
    setResult(null);
    setError("");
  }

  async function querySales(event) {
    event.preventDefault();
    if (!draftRange.from || !draftRange.to || draftRange.from > draftRange.to) {
      setError("请完整选择有效的开始和截止日期。");
      return;
    }
    setQuerying(true);
    setError("");
    try {
      const payload = await querySalesDataService(draftRange);
      setResult({ query: payload.query, summary: payload.summary });
    } catch (cause) {
      setResult(null);
      setError(cause.message || "销售数据查询失败。");
    } finally {
      setQuerying(false);
    }
  }

  const number = value => Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  const money = value => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return <div className="data-workspace"><AiProviderSettings /><section className="section-panel sales-data-service" aria-labelledby="sales-data-service-title"><div className="section-head"><div><span className="data-service-eyebrow">SALES.DAILY</span><h2 id="sales-data-service-title">销售数据服务</h2><p>按订单创建时间读取线上数据库；选择条件后点击查询，不会在修改日期时自动请求。</p></div><span className={`status-badge ${error ? "danger" : availability?.totalRows ? "success" : "neutral"}`}><Database size={13} />{loading ? "读取覆盖范围" : error ? "服务异常" : availability?.totalRows ? "D1 已连接" : "暂无数据"}</span></div>
    {availability ? <div className="sales-service-coverage"><div><span>数据覆盖</span><strong>{availability.earliestDate || "—"} 至 {availability.latestDate || "—"}</strong></div><div><span>可用月份</span><strong>{availability.availableMonths?.length || 0} 个月</strong></div><div><span>事实记录</span><strong>{number(availability.totalRows)} 条</strong></div><div><span>最近同步</span><strong>{availability.lastSuccessfulSyncAt ? new Date(availability.lastSuccessfulSyncAt).toLocaleString("zh-CN", { hour12: false }) : "—"}</strong></div></div> : null}
    <form className="sales-service-query" onSubmit={querySales}><label htmlFor="sales-service-month">数据月份<select id="sales-service-month" value={selectedMonth} disabled={loading || !availability?.availableMonths?.length} onChange={changeMonth}><option value="">自定义日期</option>{availability?.availableMonths?.map(item => <option key={item.month} value={item.month}>{item.month}（{number(item.rowCount)} 条）</option>)}</select></label><DateRangeControls range={draftRange} setRange={next => { setSelectedMonth(""); setResult(null); setDraftRange(next); }} idPrefix="sales-service-range" disabled={loading} /><Button type="submit" variant="primary" disabled={loading || querying || !draftRange.from || !draftRange.to}><Search size={16} />{querying ? "查询中…" : "查询数据"}</Button></form>
    {error ? <div className="sales-service-message danger" role="alert">{error}</div> : null}
    {result ? result.summary.rowCount ? <div className="sales-service-result" role="status"><div><span>查询范围</span><strong>{result.query.from} 至 {result.query.to}</strong><small>实际有数据 {result.summary.earliestDate} 至 {result.summary.latestDate}</small></div><div><span>事实记录</span><strong>{number(result.summary.rowCount)}</strong></div><div><span>净销量</span><strong>{number(result.summary.quantity)}</strong></div><div><span>净销售额</span><strong>{money(result.summary.netSales)}</strong></div><div><span>平台数</span><strong>{number(result.summary.platformCount)}</strong></div></div> : <div className="sales-service-message" role="status">该日期范围没有销售数据。</div> : <div className="sales-service-message" role="status">选择月份或日期范围后，点击“查询数据”查看汇总。</div>}
  </section><section className="data-service-intro"><div><span>DATA SERVICE</span><h2>应用订阅</h2><p>业务 App 只读取数据库，不重复登录店铺后台，也不各自维护指标口径。</p></div><strong>{state.subscriptions.filter(item => item.enabled).length}</strong><small>个启用订阅</small></section><section className="section-panel"><DataTable minWidth={680} columns={[
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

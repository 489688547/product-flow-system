import { useEffect, useMemo, useState } from "react";
import { Layers, Plus, RefreshCw, Rss, ShieldCheck } from "lucide-react";
import { useDataCenter } from "../../state/DataCenterProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { collaborationDraftFromDataIssue } from "../../domain/collaborationAdapters.js";
import { AppCollaborationButton } from "../collaboration/AppCollaborationButton.jsx";
import { AiProviderSettings } from "./AiProviderSettings.jsx";

const SOURCE_CATALOG = [
  ["douyin-shop", "抖音店铺", "店铺订单与商品经营数据", "文件导出 / 浏览器辅助", "可配置"],
  ["kuaishou-shop", "快手店铺", "店铺订单与商品经营数据", "文件导出 / 浏览器辅助", "可配置"],
  ["tmall-shop", "天猫店铺", "店铺订单与商品经营数据", "文件导出 / 浏览器辅助", "可配置"],
  ["kuaimai-erp", "快麦 ERP", "订单、商品与库存文件", "每日导出", "已具备销售导入"],
  ["ocean-engine", "巨量引擎", "广告消耗、计划与素材数据", "浏览器辅助", "待验证"]
];
const STATUS_LABELS = { healthy: "正常", running: "同步中", stale: "已过期", login_required: "需要登录", schema_changed: "页面结构变化", failed: "失败", disabled: "未启用" };

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "未启用";
}

function SourceForm({ canEdit, onSubmit }) {
  const [draft, setDraft] = useState({ platformKey: "douyin-shop", name: "", consoleUrl: "", captureMethod: "export", owner: "运营部", enabled: true });
  const submit = event => {
    event.preventDefault();
    const catalog = SOURCE_CATALOG.find(item => item[0] === draft.platformKey);
    onSubmit({
      ...draft,
      id: `${draft.platformKey}-${Date.now()}`,
      name: draft.name.trim() || catalog?.[1] || "未命名数据源",
      status: draft.enabled ? "stale" : "disabled",
      timeBasis: "create_time",
      timezone: "Asia/Shanghai"
    });
    setDraft(current => ({ ...current, name: "", consoleUrl: "" }));
  };
  return (
    <form className="data-source-form" onSubmit={submit}>
      <div><h2>新增数据源</h2><p>这里只登记网页地址、采集方式和责任人，不保存账号密码、Cookie、验证码或 Token。</p></div>
      <fieldset disabled={!canEdit}>
        <label>平台<select value={draft.platformKey} onChange={event => setDraft(current => ({ ...current, platformKey: event.target.value }))}>{SOURCE_CATALOG.map(item => <option key={item[0]} value={item[0]}>{item[1]}</option>)}</select></label>
        <label>店铺 / 账户名称<input value={draft.name} maxLength={80} placeholder="例如：抖音官方旗舰店" onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
        <label>后台网页地址<input type="url" value={draft.consoleUrl} placeholder="https://" onChange={event => setDraft(current => ({ ...current, consoleUrl: event.target.value }))} /></label>
        <label>采集方式<select value={draft.captureMethod} onChange={event => setDraft(current => ({ ...current, captureMethod: event.target.value }))}><option value="export">文件导出</option><option value="browser-assisted">浏览器辅助</option><option value="api">已验证 API</option></select></label>
        <label>数据负责人<input value={draft.owner} onChange={event => setDraft(current => ({ ...current, owner: event.target.value }))} /></label>
        <Button type="submit" variant="primary"><Plus size={16} />登记数据源</Button>
      </fieldset>
    </form>
  );
}

export function DataSourcesWorkspace({ canEdit }) {
  const { state, dispatch } = useDataCenter();
  return <div className="data-workspace"><section className="section-panel data-source-catalog"><div className="section-head"><div><h2>接入能力地图</h2><p>先登记来源并验证稳定性；浏览器自动采集在验证前不标记为已接入。</p></div><span className="status-badge neutral">安全元数据</span></div><div className="data-source-grid">{SOURCE_CATALOG.map(([key, name, scope, method, phase]) => { const configured = state.sources.filter(source => source.platformKey === key); return <article key={key}><div><strong>{name}</strong><span className={`status-badge ${configured.length ? "success" : "neutral"}`}>{configured.length ? `${configured.length} 个来源` : phase}</span></div><p>{scope}</p><small>{method}</small></article>; })}</div></section><section className="section-panel"><SourceForm canEdit={canEdit} onSubmit={record => dispatch({ type: "upsert_source", record })} /></section><section className="section-panel"><div className="section-head"><div><h2>已登记来源</h2><p>状态只反映最近一次实际采集结果。</p></div></div><DataTable minWidth={760} columns={[
    { key: "name", header: "来源", render: row => <span className="data-product-cell"><strong>{row.name}</strong><small>{row.consoleUrl || "未填写后台地址"}</small></span> },
    { key: "method", header: "采集方式", render: row => row.captureMethod || "文件导出" },
    { key: "basis", header: "时间口径", render: () => "订单创建时间" },
    { key: "owner", header: "负责人", render: row => row.owner || "待指定" },
    { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "healthy" ? "success" : "neutral"}`}>{statusLabel(row.status)}</span> }
  ]} rows={state.sources} empty={<div className="empty-state compact-empty">尚未登记店铺或平台来源。</div>} /></section></div>;
}

export function MetricDefinitionsWorkspace() {
  const { state } = useDataCenter();
  return <section className="section-panel"><div className="section-head"><div><h2>指标口径</h2><p>所有业务 App 读取同一份定义，变更需要版本化并保留审计。</p></div><span className="status-badge success">订单创建时间 · Asia/Shanghai</span></div><DataTable minWidth={760} columns={[
    { key: "name", header: "指标", render: row => <span className="data-product-cell"><strong>{row.name}</strong><small>{row.metricCode}</small></span> },
    { key: "formula", header: "定义", render: row => row.formula },
    { key: "basis", header: "时间口径", render: row => row.timeBasis === "create_time" ? "订单创建时间" : row.timeBasis },
    { key: "scope", header: "日常排除", render: row => row.excludeOther ? "其它 / 未知" : "不排除" },
    { key: "owner", header: "负责人", render: row => row.owner || "待指定" },
    { key: "version", header: "版本", render: row => `v${row.version || 1}` }
  ]} rows={state.metricDefinitions} empty={<div className="empty-state compact-empty">暂无指标定义。</div>} /></section>;
}

export function DataQualityWorkspace({ quality }) {
  const { state } = useDataCenter();
  const cards = [["待处理问题", quality.openIssues], ["待确认商品映射", quality.unmappedProducts], ["本期口径排除", quality.excludedRows]];
  return <div className="data-workspace"><div className="data-quality-summary">{cards.map(([label, value]) => <article key={label}><ShieldCheck size={18} /><span>{label}</span><strong>{value}</strong></article>)}</div><section className="section-panel"><div className="section-head"><div><h2>质量问题队列</h2><p>缺失、重复、延迟和页面结构变化都在这里闭环。</p></div></div><DataTable minWidth={680} columns={[
    { key: "title", header: "问题", render: row => row.title || row.message || "未命名问题" },
    { key: "type", header: "类型", render: row => row.type || "数据校验" },
    { key: "owner", header: "负责人", render: row => row.owner || "待认领" },
    { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "resolved" ? "success" : "warning"}`}>{row.status === "resolved" ? "已解决" : "待处理"}</span> },
    { key: "actions", header: "操作", render: row => <TableActions><AppCollaborationButton draft={collaborationDraftFromDataIssue(row)} disabled={row.status === "resolved"} disabledReason="已解决的数据问题无需再发起协同" /></TableActions> }
  ]} rows={state.qualityIssues} empty={<div className="empty-state compact-empty">当前没有待处理的数据质量问题。</div>} /></section></div>;
}

export function SyncRunsWorkspace() {
  const { state, refresh } = useDataCenter();
  return <section className="section-panel"><div className="section-head"><div><h2>同步记录</h2><p>记录每次采集的来源、范围、行数和失败原因；失败不会覆盖上次成功数据。</p></div><Button onClick={refresh}><RefreshCw size={16} />刷新状态</Button></div><DataTable minWidth={760} columns={[
    { key: "time", header: "执行时间", render: row => row.completedAt || row.startedAt || "—" },
    { key: "source", header: "数据源", render: row => row.sourceName || row.sourceId || "未知来源" },
    { key: "range", header: "数据范围", render: row => [row.from, row.to].filter(Boolean).join(" 至 ") || "—" },
    { key: "rows", header: "行数", className: "num", render: row => row.rowCount || 0 },
    { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "success" ? "success" : row.status === "running" ? "warning" : "danger"}`}>{statusLabel(row.status)}</span> },
    { key: "message", header: "结果", render: row => row.message || "—" }
  ]} rows={state.syncRuns} empty={<div className="empty-state compact-empty">还没有数据中心同步记录。</div>} /></section>;
}

export function DataServicesWorkspace() {
  const { state } = useDataCenter();
  const enabledCount = state.subscriptions.filter(item => item.enabled).length;
  const cards = [["启用订阅", enabledCount, Rss], ["订阅总数", state.subscriptions.length, Layers]];
  return <div className="data-workspace"><AiProviderSettings /><div className="data-quality-summary">{cards.map(([label, value, Icon]) => <article key={label}><Icon size={18} /><span>{label}</span><strong>{value}</strong></article>)}</div><section className="section-panel"><div className="section-head"><div><h2>应用订阅</h2><p>业务 App 只读取数据库，不重复登录店铺后台，也不各自维护指标口径。</p></div></div><DataTable minWidth={680} columns={[
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
  return <section className="data-settings-workspace"><div className="data-settings-toolbar"><div><h2>采集与保留策略</h2><p>统一使用上海时区；正常报表只统计截止昨天的数据。</p></div>{canEdit ? <Button variant="primary" disabled={!changed} onClick={() => dispatch({ type: "settings", settings: draft })}>保存设置</Button> : <span className="status-badge neutral">只读</span>}</div><fieldset disabled={!canEdit}><label>业务时区<input value={draft.timezone || "Asia/Shanghai"} readOnly /></label><label>每日完成截止时间<input type="time" value={draft.cutoff || "07:30"} onChange={event => setDraft(current => ({ ...current, cutoff: event.target.value }))} /></label><label>原始数据保留天数<input type="number" min="30" max="1095" value={draft.rawRetentionDays || 365} onChange={event => setDraft(current => ({ ...current, rawRetentionDays: Number(event.target.value) }))} /></label><label>超过多少小时标记过期<input type="number" min="1" max="168" value={draft.staleAfterHours || 32} onChange={event => setDraft(current => ({ ...current, staleAfterHours: Number(event.target.value) }))} /></label></fieldset><p className="data-security-note">凭据策略：系统不保存店铺账号密码、Cookie、验证码或 Token；需要重新登录时标记为“需要登录”，由授权人员在浏览器完成。</p></section>;
}

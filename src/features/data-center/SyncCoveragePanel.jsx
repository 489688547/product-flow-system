import { useMemo, useState } from "react";
import { AlertTriangle, MonitorCheck, RefreshCw } from "lucide-react";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { buildBackfillPreflight } from "../../domain/dataSyncCoverage.js";
import { collaborationDraftFromDataIssue } from "../../domain/collaborationAdapters.js";
import { AppCollaborationButton } from "../collaboration/AppCollaborationButton.jsx";

const STATUS_META = {
  missing: { label: "整日断档", tone: "danger" },
  incomplete: { label: "残缺", tone: "danger" },
  failed: { label: "采集失败", tone: "danger" },
  waiting_human: { label: "等待人工", tone: "danger" },
  queued: { label: "排队中", tone: "warning" },
  running: { label: "正在补齐", tone: "warning" },
  synced: { label: "已同步", tone: "success" }
};

const HEADLINE = {
  missing: caliber => `${caliber}数据缺失`,
  incomplete: caliber => `${caliber}数据不完整`,
  failed: caliber => `${caliber}采集失败`,
  waiting_human: caliber => `${caliber}需要人工处理`,
  queued: caliber => `${caliber}正在补齐`,
  running: caliber => `${caliber}正在补齐`,
  synced: caliber => `${caliber}已同步`
};

function money(value) {
  return `¥${Math.round(Number(value) || 0).toLocaleString("zh-CN")}`;
}

function CoverageRow({ row, checked, onToggle, onBackfill, canTrigger, busy }) {
  const meta = STATUS_META[row.status] || STATUS_META.missing;
  const headline = (HEADLINE[row.status] || HEADLINE.missing)(row.caliberLabel);
  const label = `${row.businessDate} ${headline}`;
  return <div className="data-sync-coverage-row">
    <div className="data-sync-coverage-select">
      {canTrigger ? <input
        type="checkbox"
        checked={checked}
        disabled={!row.selectable}
        aria-label={row.selectable ? `选择 ${label}` : `${label}，当前不可选择`}
        onChange={() => onToggle(row.key)}
      /> : null}
    </div>
    <div className="data-sync-coverage-date">{row.businessDate}</div>
    <div className="data-sync-coverage-body">
      <p className="data-sync-coverage-headline">
        <strong>{headline}</strong>
        <span className={`status-badge ${meta.tone}`}>
          {row.status === "queued" && row.queuePosition ? `队列第 ${row.queuePosition} 个` : meta.label}
        </span>
      </p>
      {row.impacts.length ? <p className="data-sync-coverage-impact">影响 {row.impacts.join(" · ")}</p> : null}
      {row.evidence ? <p className="data-sync-coverage-evidence">
        当日 {money(row.evidence.sales)}，同期中位数 {money(row.evidence.median)}，约为 {Math.round(row.evidence.ratio * 100)}%
      </p> : null}
      {row.note && row.status === "synced" ? <p className="data-sync-coverage-note">{row.note}，但当天销售事实完整</p> : null}
      <p className="data-sync-coverage-detail">
        {row.caliber === "platform" && row.storeNames.length ? `${row.storeNames.join("、")} · ` : ""}
        {row.resourceLabels.join(" / ")}
      </p>
    </div>
    <div className="data-sync-coverage-action">
      {canTrigger && row.selectable ? <Button disabled={busy} onClick={() => onBackfill(row)}>
        <RefreshCw size={14} aria-hidden="true" />补这天
      </Button> : null}
      {row.selectable ? <AppCollaborationButton label="发起协同" draft={collaborationDraftFromDataIssue({
        id: row.key,
        title: `${row.businessDate} ${headline}`,
        message: `${row.businessDate} 的${row.caliberLabel}数据存在缺口，影响 ${row.impacts.join("、")}。`,
        severity: row.caliber === "unified" ? "high" : "medium"
      })} /> : null}
    </div>
  </div>;
}

function PreflightBody({ preflight }) {
  return <div className="data-sync-preflight">
    <p className="data-sync-preflight-summary">
      将采集 {preflight.total} 个目标，覆盖 {preflight.businessDayCount} 个业务日。
      采集器一次只处理一个，任务会依次执行。
    </p>
    {preflight.groups.map(group => <div key={group.caliber} className="data-sync-preflight-group">
      <p className="data-sync-preflight-caliber"><strong>{group.caliberLabel}</strong><small>影响 {group.impacts.join(" · ")}</small></p>
      {group.providers.map(provider => <div key={provider.providerId} className="data-sync-preflight-provider">
        <p>
          <strong>{provider.providerName}</strong>
          <span className={`status-badge ${!provider.connectionKnown ? "neutral" : provider.needsLogin ? "warning" : "success"}`}>
            {provider.connectionLabel}
          </span>
        </p>
        <small>{provider.items.map(item => `${item.businessDate}`).join("、")}</small>
        {provider.needsLogin && provider.loginUrl ? <a className="btn" href={provider.loginUrl} target="_blank" rel="noreferrer">
          <MonitorCheck size={14} aria-hidden="true" />打开{provider.providerName}登录页
        </a> : null}
      </div>)}
    </div>)}
    {preflight.blockingReason ? <p className="data-sync-preflight-blocking" role="alert">
      <AlertTriangle size={15} aria-hidden="true" />{preflight.blockingReason}{preflight.queueWarning}
    </p> : null}
    {preflight.limitReason ? <p className="data-sync-preflight-blocking" role="alert">{preflight.limitReason}</p> : null}
    <p className="data-sync-preflight-runner">
      {preflight.runnerName} 采集器：{preflight.runnerOnline ? "在线" : `离线${preflight.lastSeenAt ? ` · 最近上报 ${preflight.lastSeenAt}` : ""}`}
    </p>
  </div>;
}

export function SyncCoveragePanel({
  coverage = [],
  runners = [],
  stores = [],
  jobs = [],
  windowDays = 14,
  canTrigger = false,
  loading = false,
  error = "",
  includeHealthy = false,
  onToggleHealthy,
  onSubmit,
  onRecheck,
  submitting = false,
  resultMessage = "",
  resultError = ""
}) {
  const [selected, setSelected] = useState(() => new Set());
  const [pending, setPending] = useState(null);
  const [caliberFilter, setCaliberFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  // 筛选只收窄可见范围；「全部补齐」也只作用于筛选结果，避免勾到看不见的行。
  const visible = useMemo(() => coverage.filter(row => (
    (caliberFilter === "all" || row.caliber === caliberFilter)
    && (statusFilter === "all" || row.status === statusFilter)
  )), [caliberFilter, coverage, statusFilter]);
  const selectableKeys = useMemo(() => visible.filter(row => row.selectable).map(row => row.key), [visible]);
  const toggle = key => setSelected(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const openPreflight = rows => {
    const targets = rows.flatMap(row => row.resourceLabels.map(() => ({
      businessDate: row.businessDate,
      caliber: row.caliber,
      providerId: row.caliber === "unified" ? "kuaimai" : "douyin-ecommerce",
      resourceType: row.caliber === "unified" ? "order_items" : "store_daily",
      storeName: row.storeNames[0] || ""
    })));
    setPending({ rows, preflight: buildBackfillPreflight(targets, { runners, stores, jobs }) });
  };
  const confirm = async () => {
    const rows = pending?.rows || [];
    setPending(null);
    setSelected(new Set());
    await onSubmit(rows);
  };

  if (loading) {
    return <section className="section-panel" aria-busy="true">
      <div className="section-head"><div><h2>同步覆盖</h2><p>哪几天的数据不能信，怎么补。</p></div></div>
      <div className="empty-state compact-empty">正在读取覆盖情况…</div>
    </section>;
  }
  if (error) {
    return <section className="section-panel" role="alert">
      <div className="section-head"><div><h2>同步覆盖</h2><p>哪几天的数据不能信，怎么补。</p></div></div>
      <div className="empty-state compact-empty">{error}</div>
    </section>;
  }
  const selectedRows = visible.filter(row => selected.has(row.key));
  return <section className="section-panel" id="sync-coverage">
    <div className="section-head">
      <div><h2>同步覆盖</h2><p>哪几天的数据不能信，怎么补。</p></div>
      <div className="data-sync-coverage-toolbar">
        <span className="data-sync-coverage-window">最近 {windowDays} 天{includeHealthy ? "" : " · 只显示有问题的天"}</span>
        <label className="data-sync-coverage-filter">
          <span>口径</span>
          <select value={caliberFilter} onChange={event => setCaliberFilter(event.target.value)}>
            <option value="all">全部</option>
            <option value="unified">统一口径</option>
            <option value="platform">平台官方口径</option>
          </select>
        </label>
        <label className="data-sync-coverage-filter">
          <span>状态</span>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="all">全部</option>
            <option value="missing">整日断档</option>
            <option value="incomplete">残缺</option>
            <option value="failed">采集失败</option>
            <option value="waiting_human">等待人工</option>
            <option value="queued">排队中</option>
          </select>
        </label>
        <Button onClick={onToggleHealthy}>{includeHealthy ? "只看有问题的" : "显示全部"}</Button>
        {canTrigger && selectableKeys.length ? <Button
          variant="primary"
          disabled={submitting}
          onClick={() => openPreflight(visible.filter(row => row.selectable))}
        >全部补齐（{selectableKeys.length}）</Button> : null}
        {canTrigger && selected.size ? <Button disabled={submitting} onClick={() => openPreflight(selectedRows)}>
          补选中的 {selected.size} 天
        </Button> : null}
      </div>
    </div>
    {resultMessage ? <p className="data-sync-trigger-message" role="status">{resultMessage}</p> : null}
    {resultError ? <p className="data-sync-trigger-message danger" role="alert">{resultError}</p> : null}
    {visible.length ? <div className="data-sync-coverage-list">
      {visible.map(row => <CoverageRow
        key={row.key}
        row={row}
        checked={selected.has(row.key)}
        onToggle={toggle}
        onBackfill={target => openPreflight([target])}
        canTrigger={canTrigger}
        busy={submitting}
      />)}
    </div> : <div className="empty-state compact-empty">最近 {windowDays} 天数据完整，没有需要补的业务日。</div>}
    <Modal
      title="补数确认"
      open={Boolean(pending)}
      onClose={() => setPending(null)}
      footer={pending ? <>
        <Button onClick={() => setPending(null)}>取消</Button>
        {pending.preflight.primaryAction === "recheck" ? <>
          {pending.preflight.canQueueAnyway ? <Button disabled={submitting} onClick={confirm}>仍然排队</Button> : null}
          <Button variant="primary" onClick={() => { setPending(null); onRecheck(); }}>
            <RefreshCw size={16} aria-hidden="true" />重新检测采集器
          </Button>
        </> : <Button variant="primary" disabled={submitting || pending.preflight.exceedsLimit} onClick={confirm}>
          确认排队
        </Button>}
      </> : null}
    >
      {pending ? <PreflightBody preflight={pending.preflight} /> : null}
    </Modal>
  </section>;
}

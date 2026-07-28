import { useMemo, useState } from "react";
import { AlertTriangle, Copy, RefreshCw } from "lucide-react";
import { Button } from "../../ui/Button.jsx";
import { ARCHIVE_STATE, groupLocalArchives } from "../../domain/localArchive.js";

const STATE_TONE = {
  [ARCHIVE_STATE.ingested]: "success",
  [ARCHIVE_STATE.pending]: "warning",
  [ARCHIVE_STATE.processing]: "neutral",
  [ARCHIVE_STATE.skipped]: "neutral",
  [ARCHIVE_STATE.failed]: "danger"
};

const REASON_OPTIONS = [
  ["TIME_BASIS_MISSING", "缺少业务时间字段"],
  ["DETAIL_STORAGE_DEFERRED", "原始明细已归档，逐行索引暂缓"],
  ["UNSUPPORTED_REPORT_GRAIN", "当前标准事实暂不支持该报表粒度"]
];

function size(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ArchiveItem({
  item,
  onCopy,
  copiedId,
  action = null
}) {
  return <li className="local-archive-item">
    <div>
      <p className="local-archive-name">
        <span>{item.fileName}</span>
        <span className={`status-badge ${STATE_TONE[item.state]}`}>{item.stateLabel}</span>
      </p>
      <p className="local-archive-path">{item.relativePath}</p>
      {item.reasonLabel ? <p className="local-archive-reason-note">
        原因：{item.reasonLabel}{item.decisionBy ? ` · ${item.decisionBy}` : ""}
      </p> : null}
    </div>
    <div className="local-archive-meta">
      <span>{size(item.sizeBytes)}</span>
      <Button className="compact" onClick={() => onCopy(item)}>
        <Copy size={13} aria-hidden="true" />{copiedId === item.id ? "已复制" : "复制路径"}
      </Button>
      {action}
    </div>
  </li>;
}

function ArchiveDecisionControl({ item, saving, onDecision }) {
  const [reason, setReason] = useState("");
  return <div className="local-archive-decision">
    <label htmlFor={`archive-reason-${item.id}`}>记录不入库原因</label>
    <select
      id={`archive-reason-${item.id}`}
      value={reason}
      disabled={saving}
      onChange={event => setReason(event.target.value)}
    >
      <option value="">请选择原因</option>
      {REASON_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
    <Button
      className="compact"
      disabled={saving || !reason}
      onClick={() => onDecision(item, "skipped", reason)}
    >
      {saving ? "保存中" : "确认原因"}
    </Button>
  </div>;
}

export function LocalArchivePanel({
  archives = [],
  loading = false,
  error = "",
  retentionDays = 365,
  canManage = false,
  savingId = "",
  decisionError = "",
  onDecision = async () => {},
  onOpenRecovery = () => {}
}) {
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [copiedId, setCopiedId] = useState("");
  const grouped = useMemo(() => groupLocalArchives(archives), [archives]);
  const copyPath = async item => {
    try {
      await navigator.clipboard.writeText(item.relativePath);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(current => (current === item.id ? "" : current)), 2000);
    } catch {
      setCopiedId("");
    }
  };
  const toggle = key => setOpenGroups(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return <section className="section-panel">
    <div className="section-head">
      <div><h2>本机原始归档</h2><p>需要你决定是否入库的文件，以及可追溯的原始档案。</p></div>
      <span className={`status-badge ${error ? "danger" : grouped.totalCount ? "success" : "neutral"}`}>
        {loading ? "读取中" : error ? "读取失败"
          : grouped.actionable.count ? `${grouped.actionable.count} 个待处理 · 共 ${grouped.totalCount} 个`
          : grouped.totalCount ? `无待处理 · ${grouped.totalCount} 个 · ${size(grouped.totalBytes)}` : "等待导出"}
      </span>
    </div>

    {error ? <div className="empty-state compact-empty">{error}</div> : null}

    {!error && grouped.actionable.count ? <div className="local-archive-pending" role="alert">
      <p><AlertTriangle size={15} aria-hidden="true" /><strong>需要你处理 · {grouped.actionable.count} 个</strong></p>
      <p>{grouped.actionable.warning}</p>
      {decisionError ? <p className="form-error">{decisionError}</p> : null}
      <ul className="local-archive-list">
        {grouped.actionable.items.map(item => <ArchiveItem
          key={item.id}
          item={item}
          onCopy={copyPath}
          copiedId={copiedId}
          action={item.state === ARCHIVE_STATE.failed
            ? <Button className="compact" onClick={onOpenRecovery}>
              <RefreshCw size={13} aria-hidden="true" />前往同步任务重试
            </Button>
            : canManage
              ? <ArchiveDecisionControl
                item={item}
                saving={savingId === item.id}
                onDecision={onDecision}
              />
              : null}
        />)}
      </ul>
    </div> : null}

    {!error && !grouped.actionable.count && grouped.totalCount ? <p className="local-archive-settled" role="status">
      全部文件都已了结：{grouped.settled.summary}，共 {size(grouped.settled.bytes)}，无需处理。
    </p> : null}

    {!error && grouped.totalCount ? <>
      {grouped.processing.count ? <p className="local-archive-processing">
        {grouped.processing.count} 个文件正在处理，24 小时内保持中性状态。
      </p> : null}
      {grouped.skipped.count ? <details className="local-archive-skipped">
        <summary>已归档，未纳入标准事实 · {grouped.skipped.count} 个 · {size(grouped.skipped.bytes)}</summary>
        <p>这些记录已有明确决策，不计入同步告警；原始文件仍保留。</p>
        <ul className="local-archive-list">
          {grouped.skipped.items.map(item => <ArchiveItem
            key={item.id}
            item={item}
            onCopy={copyPath}
            copiedId={copiedId}
            action={canManage ? <Button
              className="compact"
              disabled={savingId === item.id}
              onClick={() => onDecision(item, "pending", null)}
            >
              {savingId === item.id ? "保存中" : "撤销决定"}
            </Button> : null}
          />)}
        </ul>
      </details> : null}
      <p className="local-archive-hint">
        文件保存在公司 Mac 的采集目录下，线上只保存索引，无法在浏览器中打开。
        复制相对路径后可在 Finder 中定位。原始文件保留 {retentionDays} 天。
      </p>
      <div className="local-archive-groups">
        {grouped.groups.map(group => {
          const open = openGroups.has(group.resourceType);
          return <div key={group.resourceType} className="local-archive-group">
            <button type="button" className="local-archive-group-head" aria-expanded={open} onClick={() => toggle(group.resourceType)}>
              <strong>{group.label}</strong>
              <span>{group.count} 个 · {size(group.bytes)}</span>
              {group.failedCount ? <span className="status-badge danger">{group.failedCount} 个失败</span> : null}
              {group.pendingCount ? <span className="status-badge warning">{group.pendingCount} 个待决策</span> : null}
              {group.skippedCount ? <span className="status-badge neutral">{group.skippedCount} 个已跳过</span> : null}
            </button>
            {open ? group.months.map(month => <div key={month.month} className="local-archive-month">
              <p>{month.month} · {month.count} 个 · {size(month.bytes)}</p>
              <ul className="local-archive-list">
                {month.items.map(item => <ArchiveItem key={item.id} item={item} onCopy={copyPath} copiedId={copiedId} />)}
              </ul>
            </div>) : null}
          </div>;
        })}
      </div>
    </> : null}

    {!error && !loading && !grouped.totalCount
      ? <div className="empty-state compact-empty">公司 Mac 上还没有原始归档文件。</div>
      : null}
  </section>;
}

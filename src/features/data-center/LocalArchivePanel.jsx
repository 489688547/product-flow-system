import { useMemo, useState } from "react";
import { AlertTriangle, Copy } from "lucide-react";
import { Button } from "../../ui/Button.jsx";
import { ARCHIVE_STATE, groupLocalArchives } from "../../domain/localArchive.js";

const STATE_TONE = {
  [ARCHIVE_STATE.ingested]: "success",
  [ARCHIVE_STATE.pending]: "warning",
  [ARCHIVE_STATE.processing]: "neutral",
  [ARCHIVE_STATE.failed]: "danger"
};

function size(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function ArchiveItem({ item, onCopy, copiedId }) {
  return <li className="local-archive-item">
    <div>
      <p className="local-archive-name">
        <span>{item.fileName}</span>
        <span className={`status-badge ${STATE_TONE[item.state]}`}>{item.stateLabel}</span>
      </p>
      <p className="local-archive-path">{item.relativePath}</p>
    </div>
    <div className="local-archive-meta">
      <span>{size(item.sizeBytes)}</span>
      <Button className="compact" onClick={() => onCopy(item)}>
        <Copy size={13} aria-hidden="true" />{copiedId === item.id ? "已复制" : "复制路径"}
      </Button>
    </div>
  </li>;
}

export function LocalArchivePanel({ archives = [], loading = false, error = "", retentionDays = 365 }) {
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
      <div><h2>本机原始归档</h2><p>公司 Mac 上有哪些原始文件。</p></div>
      <span className={`status-badge ${error ? "danger" : grouped.totalCount ? "success" : "neutral"}`}>
        {loading ? "读取中" : error ? "读取失败" : grouped.totalCount ? `${grouped.totalCount} 个文件 · ${size(grouped.totalBytes)}` : "等待导出"}
      </span>
    </div>

    {error ? <div className="empty-state compact-empty">{error}</div> : null}

    {!error && grouped.pending.count ? <div className="local-archive-pending" role="alert">
      <p><AlertTriangle size={15} aria-hidden="true" /><strong>{grouped.pending.count} 个文件已下载未入库</strong></p>
      <p>{grouped.pending.warning}</p>
      <ul className="local-archive-list">
        {grouped.pending.items.map(item => <ArchiveItem key={item.id} item={item} onCopy={copyPath} copiedId={copiedId} />)}
      </ul>
    </div> : null}

    {!error && grouped.totalCount ? <>
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
              {group.pendingCount ? <span className="status-badge warning">{group.pendingCount} 个未入库</span> : null}
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

import { AlertTriangle, CheckCircle2, FileUp, MonitorCheck, RefreshCw } from "lucide-react";
import { Button } from "../../ui/Button.jsx";

const TONE_ICON = { danger: AlertTriangle, warning: AlertTriangle, success: CheckCircle2, neutral: MonitorCheck };

function connectionText(progress) {
  if (!progress.runnerName) return "尚未读取到公司 Mac 采集设备";
  if (progress.runnerOnline) return `${progress.runnerName} 采集器：在线`;
  // 离线时把最近一次上报时间说出来，让用户自己判断这个状态有多旧。
  return progress.lastSeenAt
    ? `${progress.runnerName} 采集器：离线 · 最近上报 ${progress.lastSeenAt}`
    : `${progress.runnerName} 采集器：离线`;
}

export function SyncConclusionBar({
  conclusion,
  progress,
  loading = false,
  error = "",
  onRecheck,
  rechecking = false
}) {
  if (loading) {
    return <section className="section-panel data-sync-conclusion neutral" aria-busy="true">
      <div><strong>正在读取采集状态</strong><p>读取完成后会显示数据是否完整。</p></div>
    </section>;
  }
  if (error) {
    return <section className="section-panel data-sync-conclusion danger" role="alert">
      <div><strong>暂时无法读取采集状态</strong><p>{error}</p></div>
      <div className="data-sync-conclusion-actions">
        <Button variant="primary" disabled={rechecking} onClick={onRecheck}>
          <RefreshCw size={16} aria-hidden="true" />{rechecking ? "正在重试…" : "重试"}
        </Button>
      </div>
    </section>;
  }
  const Icon = TONE_ICON[conclusion.tone] || MonitorCheck;
  const offline = progress.runnerOnline === false;
  return <section className={`section-panel data-sync-conclusion ${conclusion.tone}`} role={conclusion.tone === "success" ? "status" : "alert"}>
    <div>
      <strong><Icon size={18} aria-hidden="true" />{conclusion.text}</strong>
      <p role="status">
        <span>{connectionText(progress)}</span>
        <span>{progress.label}</span>
        {progress.queueRemaining > 0 ? <span>队列还剩 {progress.queueRemaining} 个</span> : null}
      </p>
    </div>
    <div className="data-sync-conclusion-actions">
      {offline ? <Button variant="primary" disabled={rechecking} onClick={onRecheck}>
        <RefreshCw size={16} aria-hidden="true" />{rechecking ? "正在检测…" : "重新检测采集器"}
      </Button> : <Button disabled={rechecking} onClick={onRecheck}>
        <RefreshCw size={16} aria-hidden="true" />{rechecking ? "正在刷新…" : "刷新状态"}
      </Button>}
      <a className="btn" href="#settings/sales-data"><FileUp size={16} aria-hidden="true" />导入官方销售报表</a>
    </div>
  </section>;
}

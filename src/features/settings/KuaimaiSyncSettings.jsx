import { CircleOff, MonitorCheck } from "lucide-react";

export function KuaimaiSyncSettings() {
  return (
    <section className="section-panel settings-kuaimai" aria-labelledby="kuaimai-api-status-title">
      <div className="section-head settings-template-head">
        <div>
          <h2 id="kuaimai-api-status-title">快麦开放平台 API</h2>
          <p>当前接口尚未打通，不参与销售补拉、商品同步或数据完整性修复。</p>
          <p className="kuaimai-status bad"><CircleOff size={14} aria-hidden="true" />未打通</p>
        </div>
        <span className="status-badge neutral"><MonitorCheck size={14} aria-hidden="true" />使用 Chrome 插件 / 官方文件</span>
      </div>
    </section>
  );
}

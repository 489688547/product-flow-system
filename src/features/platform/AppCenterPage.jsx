import { ArrowUpRight, Boxes, CheckCircle2, Clock3, PlugZap, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { buildAppHealth } from "../../domain/strategyExecution.js";
import { usePlatform } from "../../state/PlatformProvider.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { Button } from "../../ui/Button.jsx";

const FRESHNESS = {
  healthy: { label: "数据正常", Icon: CheckCircle2, tone: "success" },
  stale: { label: "数据已过期", Icon: Clock3, tone: "warning" },
  failed: { label: "连接失败", Icon: TriangleAlert, tone: "danger" },
  unknown: { label: "等待首次同步", Icon: PlugZap, tone: "neutral" }
};

export function AppCenterPage({ onNavigate }) {
  const { state } = usePlatform();
  const apps = useMemo(() => buildAppHealth(state.appRegistry, state.appEvents, new Date()), [state.appEvents, state.appRegistry]);
  return (
    <section className="page app-center-page">
      <PageHeader title="业务 Apps" description="业务系统通过统一协议向战略与重点项目上报事实数据。" />
      <section className="app-registry-list" aria-label="已接入应用">
        {apps.map(app => {
          const freshness = FRESHNESS[app.freshness] || FRESHNESS.unknown;
          const Icon = freshness.Icon;
          return (
            <article className="app-registry-row" key={app.id}>
              <span className="app-registry-icon"><Boxes size={21} aria-hidden="true" /></span>
              <span className="app-registry-copy"><strong>{app.name}</strong><small>{app.description || "业务 App"}</small></span>
              <span className={`app-freshness ${freshness.tone}`}><Icon size={15} aria-hidden="true" /><span><strong>{freshness.label}</strong><small>数据新鲜度 · {app.lastSyncedAt ? app.lastSyncedAt.slice(0, 16).replace("T", " ") : "暂无同步记录"}</small></span></span>
              <Button onClick={() => onNavigate(app.route || "dashboard")}>打开 App <ArrowUpRight size={15} /></Button>
            </article>
          );
        })}
      </section>
      <section className="app-protocol-note">
        <h2>标准接入能力</h2>
        <p>产品全周期作为首个接入 App，可以上报进度、里程碑、延期、风险、指标、决策请求和负责人变化。单个 App 暂时不可用时，不影响其他战略数据和老板驾驶舱。</p>
      </section>
    </section>
  );
}

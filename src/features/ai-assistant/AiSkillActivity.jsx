import { AlertTriangle, CheckCircle2, CircleDashed, Database } from "lucide-react";

function statusLabel(status) {
  if (status === "completed") return "查询完成";
  if (status === "failed") return "查询失败";
  return "正在查询";
}

function StatusIcon({ status }) {
  if (status === "completed") return <CheckCircle2 size={13} aria-hidden="true" />;
  if (status === "failed") return <AlertTriangle size={13} aria-hidden="true" />;
  return <CircleDashed size={13} aria-hidden="true" />;
}

export function AiSkillActivity({ activity = [] }) {
  if (!activity.length) return null;
  const running = activity.find(item => item.status === "running");
  if (running) {
    return (
      <div className="ai-skill-running" role="status">
        <CircleDashed size={14} aria-hidden="true" />
        <span>正在查询 {running.displayName || running.skillId}</span>
      </div>
    );
  }
  return (
    <details className="ai-skill-activity">
      <summary><Database size={13} aria-hidden="true" />已查询 {activity.length} 个公司能力</summary>
      <ul>
        {activity.map(item => (
          <li className={item.status} key={item.callId}>
            <StatusIcon status={item.status} />
            <span><strong>{item.displayName || item.skillId}</strong><small>{item.appId}</small></span>
            <span>{statusLabel(item.status)}{item.status === "completed" ? ` · ${item.recordCount} 条` : ""}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

import { Database, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/Button.jsx";

function formatDueTime(value) {
  const date = new Date(Number(value));
  if (!Number(value) || Number.isNaN(date.getTime())) return "未设置截止时间";
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export function DwsTodoPreview() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  if (!import.meta.env.DEV) return null;

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dev/dws/todos?status=false");
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.readonly !== true) throw new Error(data.message || "真实待办读取失败。");
      setPayload(data);
    } catch (loadError) {
      setError(loadError.message || "真实待办读取失败。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <details className="dws-preview-panel">
      <summary>
        <span className="dws-preview-icon"><Database size={17} aria-hidden="true" /></span>
        <span><strong>线上钉钉待办（只读测试）</strong><small>开发环境 · 当前 DWS 登录账号</small></span>
        <ShieldCheck size={17} aria-label="只读保护" />
      </summary>
      <div className="dws-preview-body">
        <div className="dws-preview-note">
          <ShieldCheck size={16} aria-hidden="true" />
          <p>真实线上数据，仅用于核对展示字段；不会导入平台，也不会修改钉钉。</p>
        </div>
        <div className="dws-preview-actions">
          <Button className="compact" onClick={load} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" className={loading ? "is-spinning" : ""} />
            {payload ? "重新读取" : "读取当前账号"}
          </Button>
          {payload ? <span>读取到 {payload.todos.length} 条未完成待办</span> : null}
        </div>
        {error ? <div className="inline-alert" role="alert">{error}</div> : null}
        {payload ? (
          <div className="dws-preview-list" aria-label="真实线上钉钉待办只读列表">
            {payload.todos.map(todo => (
              <div className="dws-preview-row" key={todo.taskId}>
                <span className="dws-preview-state" aria-hidden="true" />
                <span><strong>{todo.subject}</strong><small>截止 {formatDueTime(todo.dueTime)} · 优先级 {todo.priority || "普通"}</small></span>
                <em>只读</em>
              </div>
            ))}
            {!payload.todos.length ? <div className="empty-state">当前 DWS 账号没有未完成的线上待办。</div> : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

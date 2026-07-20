import { AlertCircle, Check, Circle, ExternalLink, Inbox, RefreshCw, RotateCcw, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { groupPersonalTodos } from "../../domain/personalTodos.js";
import { usePlatform } from "../../state/PlatformProvider.jsx";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button, IconAction } from "../../ui/Button.jsx";
import { HeaderFilter } from "../../ui/HeaderFilter.jsx";
import { DwsTodoPreview } from "./DwsTodoPreview.jsx";

// 钉钉待办状态轮询间隔：5 分钟一次，避免高频调用钉钉接口。
const PERSONAL_TODO_STATUS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

// priority 数值小于等于该阈值视为高优先级，用左侧色条表达。
const HIGH_PRIORITY_THRESHOLD = 10;

const GROUPS = [
  { key: "overdue", label: "已逾期", tone: "danger" },
  { key: "today", label: "今日截止", tone: "warning" },
  { key: "nextSevenDays", label: "未来 7 天", tone: "info" },
  { key: "later", label: "稍后处理", tone: "neutral" },
  { key: "completed", label: "已完成", tone: "success" }
];

const SOURCE_META = {
  milestone: { label: "项目里程碑", route: "projects" },
  decision: { label: "管理决策", route: "projects" },
  risk: { label: "风险整改", route: "projects" },
  review: { label: "经营复盘", route: "reviews" },
  commitment: { label: "部门承诺审批", route: "strategy" },
  commitment_milestone: { label: "部门承诺里程碑", route: "strategy" },
  incentive_project: { label: "激励项目", route: "incentives" },
  monthly_report: { label: "部门月报", route: "reviews" },
  reward_payout: { label: "奖金发放", route: "incentives" },
  product_task: { label: "产品任务", route: "progress" }
};

function unionId(user = {}) {
  return String(user.unionid || user.unionId || "");
}

function syncState(todo) {
  if (todo.dingTodo?.lastError) return { label: "同步失败", tone: "danger" };
  if (!todo.assigneeUnionId) return { label: "缺少钉钉身份", tone: "warning" };
  if (todo.dingTodo?.id && todo.status === "done") return { label: "钉钉已完成", tone: "success" };
  if (todo.dingTodo?.id) return { label: "已同步钉钉", tone: "info" };
  return { label: "未同步", tone: "neutral" };
}

// 同步态与平台确认态合并为单一状态徽章；待确认结论/关闭优先于普通同步态。
function statusBadge(todo) {
  const done = todo.status === "done";
  if (done && todo.completedFrom === "dingtalk" && todo.sourceType === "decision") {
    return { label: "待平台确认结论", tone: "warning", prominent: true };
  }
  if (done && todo.completedFrom === "dingtalk" && todo.sourceType === "risk") {
    return { label: "待平台确认关闭", tone: "warning", prominent: true };
  }
  return { ...syncState(todo), prominent: false };
}

function TodoRow({ todo, busy, onOpen, onToggle, onSync }) {
  const source = SOURCE_META[todo.sourceType] || { label: "平台待办", route: "home" };
  const status = statusBadge(todo);
  const done = todo.status === "done";
  const highPriority = Number(todo.priority) <= HIGH_PRIORITY_THRESHOLD;
  const syncLabel = todo.dingTodo?.lastError ? "重新同步" : todo.dingTodo?.id ? "同步更新" : "同步钉钉";
  const syncDisabledReason = !todo.dueDate
    ? "请先在原事项设置截止日期"
    : !todo.assigneeUnionId
      ? "缺少钉钉身份，无法同步"
      : "";
  return (
    <article
      className={`personal-todo-row ${done ? "is-done" : ""}`}
      style={{ borderLeft: `3px solid ${highPriority ? "var(--danger)" : "transparent"}` }}
    >
      <button className="personal-todo-check" type="button" onClick={onToggle} disabled={busy} aria-label={done ? `重新打开：${todo.title}` : `标记完成：${todo.title}`}>
        {done ? <Check size={15} aria-hidden="true" /> : <Circle size={16} aria-hidden="true" />}
      </button>
      <div className="personal-todo-copy">
        <div className="personal-todo-title-line">
          <strong>{todo.title}</strong>
          <span className="personal-todo-source">{source.label}</span>
        </div>
        <div className="personal-todo-meta">
          <span>{todo.projectName || "公司级事项"}</span>
          <span>截止 {todo.dueDate || "待排期"}</span>
          <span className={status.prominent ? "personal-todo-confirmation" : `personal-todo-sync ${status.tone}`}>{status.label}</span>
        </div>
        {todo.dingTodo?.lastError ? <p className="personal-todo-error"><AlertCircle size={13} aria-hidden="true" />{todo.dingTodo.lastError}</p> : null}
      </div>
      <div className="personal-todo-actions">
        <IconAction label="打开来源" onClick={onOpen}><ExternalLink size={16} aria-hidden="true" /></IconAction>
        <IconAction label={done ? "重新打开" : "标记完成"} onClick={onToggle} disabled={busy}>
          {done ? <RotateCcw size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
        </IconAction>
        <IconAction label={syncLabel} onClick={onSync} disabled={busy || !todo.dueDate || !todo.assigneeUnionId} disabledReason={syncDisabledReason}>
          {busy ? <RefreshCw size={16} className="is-spinning" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
        </IconAction>
      </div>
    </article>
  );
}

export function PersonalTodoWorkbench({ todos, onNavigate }) {
  const { refreshPersonalTodoStatuses, setPersonalTodoDone, syncPersonalTodo } = usePlatform();
  const { currentUser } = useProductFlow();
  const [sourceFilter, setSourceFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const refreshRef = useRef(refreshPersonalTodoStatuses);
  refreshRef.current = refreshPersonalTodoStatuses;
  const linkedCount = todos.filter(todo => todo.dingTodo?.id).length;
  const currentUnionId = unionId(currentUser);

  useEffect(() => {
    if (!currentUnionId || !linkedCount) return undefined;
    refreshRef.current().catch(() => {});
    const timer = window.setInterval(() => refreshRef.current().catch(() => {}), PERSONAL_TODO_STATUS_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [currentUnionId, linkedCount]);

  const projects = useMemo(() => [...new Map(todos.filter(todo => todo.projectName).map(todo => [todo.projectId || todo.projectName, { id: todo.projectId || todo.projectName, name: todo.projectName }])).values()], [todos]);
  const sourceOptions = useMemo(() => [
    { value: "all", label: "全部来源" },
    ...Object.entries(SOURCE_META).map(([value, meta]) => ({ value, label: meta.label }))
  ], []);
  const projectOptions = useMemo(() => [
    { value: "all", label: "全部项目" },
    ...projects.map(project => ({ value: project.id, label: project.name }))
  ], [projects]);
  const filtered = useMemo(() => todos.filter(todo => (
    (sourceFilter === "all" || todo.sourceType === sourceFilter)
    && (projectFilter === "all" || (todo.projectId || todo.projectName) === projectFilter)
  )), [projectFilter, sourceFilter, todos]);
  const groups = useMemo(() => groupPersonalTodos(filtered, new Date()), [filtered]);

  const refresh = async () => {
    setRefreshing(true);
    setError("");
    try {
      await refreshPersonalTodoStatuses();
    } catch (refreshError) {
      setError(refreshError.message || "钉钉状态刷新失败，不影响平台待办使用。");
    } finally {
      setRefreshing(false);
    }
  };

  const run = async (id, action) => {
    setBusyId(id);
    setError("");
    try {
      await action();
    } catch (actionError) {
      setError(actionError.message || "待办操作失败，请稍后重试。");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="personal-todo-workbench">
      <div className="personal-todo-toolbar">
        <div className="personal-todo-summary">
          <strong>{todos.filter(todo => todo.status === "pending").length}</strong>
          <span>项待处理</span>
          <small>只显示明确分配给你的责任事项</small>
        </div>
        <div className="personal-todo-filters">
          <HeaderFilter label="来源类型" value={sourceFilter} onChange={setSourceFilter} options={sourceOptions} />
          <HeaderFilter label="关联项目" value={projectFilter} onChange={setProjectFilter} options={projectOptions} />
          <Button className="compact" onClick={refresh} disabled={refreshing || !currentUnionId} disabledReason={!currentUnionId ? "当前账号缺少钉钉 unionId" : ""}>
            <RefreshCw size={15} aria-hidden="true" className={refreshing ? "is-spinning" : ""} />刷新钉钉状态
          </Button>
        </div>
      </div>
      {error ? <div className="inline-alert" role="alert">{error}</div> : null}
      <section className="personal-todo-list" aria-label="我的责任事项">
        {GROUPS.map(group => groups[group.key].length ? (
          <div className="personal-todo-group" key={group.key}>
            <h2 className={group.tone}><span>{group.label}</span><small>{groups[group.key].length}</small></h2>
            {groups[group.key].map(todo => (
              <TodoRow
                key={todo.id}
                todo={todo}
                busy={busyId === todo.id}
                onOpen={() => onNavigate((SOURCE_META[todo.sourceType] || SOURCE_META.milestone).route)}
                onToggle={() => run(todo.id, () => setPersonalTodoDone(todo.id, todo.status !== "done"))}
                onSync={() => run(todo.id, () => syncPersonalTodo(todo.id))}
              />
            ))}
          </div>
        ) : null)}
        {!filtered.length ? <div className="personal-todo-empty"><Inbox size={26} aria-hidden="true" /><strong>当前筛选下没有待办</strong><p>新的明确责任事项会自动出现在这里；仅有负责部门的任务不会进入个人队列。</p></div> : null}
      </section>
      <DwsTodoPreview />
    </div>
  );
}

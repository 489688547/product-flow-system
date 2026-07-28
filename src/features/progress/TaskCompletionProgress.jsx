import { ChevronDown } from "lucide-react";
import {
  buildTaskAcceptancePatch,
  effectiveTaskExecutorIds,
  taskAcceptanceBlockReason,
  taskCompletionProgress
} from "../../domain/taskCompletion.js";

function unionIdOf(user = {}) {
  return String(user.unionid || user.unionId || "").trim();
}

export function TaskCompletionProgress({
  task,
  product,
  deliverables,
  currentUser,
  users = [],
  onChange
}) {
  const actorUnionId = unionIdOf(currentUser);
  const managerUnionId = String(product?.productManagerUnionId || "").trim();
  const isManager = Boolean(actorUnionId) && actorUnionId === managerUnionId;
  const progress = taskCompletionProgress(task, product);
  const blockReason = task.done ? "" : taskAcceptanceBlockReason({
    task,
    product,
    deliverables,
    actorUnionId
  });
  const names = new Map(users.map(user => [unionIdOf(user), user.name || unionIdOf(user)]));
  const statuses = new Map((task?.dingTodo?.executorStatuses || [])
    .map(status => [String(status?.unionId || ""), Boolean(status?.isDone)]));
  const executorIds = effectiveTaskExecutorIds(task, product);

  return (
    <details className={`task-completion-progress ${task.done ? "is-done" : ""}`}>
      <summary title="查看每位执行人的完成状态">
        <span>{task?.dingTodo?.id ? "钉钉 · " : ""}{progress.completed}/{progress.total}</span>
        <small>{task.done ? "已完成" : progress.allExecutorsDone ? "待负责人验收" : "已完成"}</small>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="task-completion-popover">
        {executorIds.map(unionId => (
          <div className="task-completion-person" key={unionId}>
            <input type="checkbox" checked={statuses.get(unionId) === true} readOnly aria-label={`${names.get(unionId) || unionId}钉钉完成状态`} />
            <span>{names.get(unionId) || unionId}</span>
            <small>{statuses.has(unionId) ? (statuses.get(unionId) ? "已完成" : "未完成") : "待同步"}</small>
          </div>
        ))}
        <label className="task-completion-person task-completion-manager" title={blockReason || undefined}>
          <input
            type="checkbox"
            checked={Boolean(task.done)}
            disabled={!isManager || (!task.done && Boolean(blockReason))}
            onChange={event => onChange(buildTaskAcceptancePatch({
              actorUnionId,
              accepted: event.target.checked
            }))}
            aria-label={`${product?.productManager || "产品负责人"}最终验收`}
          />
          <span>{product?.productManager || "产品负责人"}（最终验收）</span>
          <small>{task.done ? "已完成" : isManager ? (blockReason || "可验收") : "仅负责人操作"}</small>
        </label>
      </div>
    </details>
  );
}

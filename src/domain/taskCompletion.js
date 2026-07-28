function cleanUnionId(value) {
  return String(value || "").trim();
}

function executorStatusMap(task = {}) {
  return new Map((Array.isArray(task?.dingTodo?.executorStatuses)
    ? task.dingTodo.executorStatuses
    : [])
    .map(status => [cleanUnionId(status?.unionId || status?.id), Boolean(status?.isDone)])
    .filter(([unionId]) => unionId));
}

export function effectiveTaskExecutorIds(task = {}, product = {}) {
  const managerUnionId = cleanUnionId(product?.productManagerUnionId);
  return [...new Set((Array.isArray(task?.dingTodo?.executorUnionIds)
    ? task.dingTodo.executorUnionIds
    : [])
    .map(cleanUnionId)
    .filter(unionId => unionId && unionId !== managerUnionId))];
}

export function taskCompletionProgress(task = {}, product = {}) {
  const executorIds = effectiveTaskExecutorIds(task, product);
  const total = executorIds.length + 1;
  if (task.done) {
    return {
      completed: total,
      total,
      executorsDone: executorIds.length,
      executorsTotal: executorIds.length,
      allExecutorsDone: true,
      coverageComplete: true,
      managerAccepted: true
    };
  }

  const statuses = executorStatusMap(task);
  const executorsDone = executorIds.filter(unionId => statuses.get(unionId) === true).length;
  const coverageComplete = executorIds.length === 0
    || (
      task?.dingTodo?.executorStatusCoverage?.complete === true
      && executorIds.every(unionId => statuses.has(unionId))
    );
  const allExecutorsDone = coverageComplete && executorsDone === executorIds.length;
  const managerAccepted = task?.acceptance?.accepted === true;
  return {
    completed: executorsDone + (managerAccepted ? 1 : 0),
    total,
    executorsDone,
    executorsTotal: executorIds.length,
    allExecutorsDone,
    coverageComplete,
    managerAccepted
  };
}

export function taskAcceptanceBlockReason({
  task = {},
  product = {},
  deliverables = [],
  actorUnionId = ""
} = {}) {
  const managerUnionId = cleanUnionId(product?.productManagerUnionId);
  if (!managerUnionId) return "请先设置产品负责人";
  if (cleanUnionId(actorUnionId) !== managerUnionId) return "仅产品负责人可以确认完成";

  const progress = taskCompletionProgress(task, product);
  if (progress.executorsTotal > 0 && !progress.coverageComplete) return "完成状态尚未读取完整";
  if (!progress.allExecutorsDone) {
    return `还有 ${progress.executorsTotal - progress.executorsDone} 位执行人未完成`;
  }
  const linkedDeliverables = (Array.isArray(deliverables) ? deliverables : [])
    .filter(file => String(file?.taskId || "") === String(task?.id || ""));
  if (task.required && !linkedDeliverables.length) return "必需任务需要先添加交付物";
  return "";
}

export function buildTaskAcceptancePatch({
  actorUnionId = "",
  accepted = false,
  now = new Date().toISOString()
} = {}) {
  if (!accepted) {
    return {
      done: false,
      acceptance: {
        accepted: false,
        acceptedByUnionId: "",
        acceptedAt: ""
      }
    };
  }
  return {
    done: true,
    acceptance: {
      accepted: true,
      acceptedByUnionId: cleanUnionId(actorUnionId),
      acceptedAt: String(now)
    }
  };
}

function unionId(user) {
  return String(user?.unionid || user?.unionId || "").trim();
}

function dueTimestamp(date) {
  const due = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 0;
  return Date.parse(`${due}T23:59:00+08:00`);
}

export function buildDecisionTodoPayload(decision, project, creator, executor, detailUrl) {
  const creatorUnionId = unionId(creator);
  const executorUnionId = unionId(executor);
  if (!creatorUnionId || !executorUnionId) throw new Error("创建人或决策人缺少真实钉钉身份，无法同步待办。");
  return {
    todoId: decision?.dingTodo?.id || "",
    sourceId: `strategy-decision:${decision?.id || "unknown"}`,
    subject: `待决策：${decision?.title || "重点项目事项"}`,
    description: [
      project?.name ? `项目：${project.name}` : "",
      decision?.impact ? `影响：${decision.impact}` : "",
      decision?.recommendation ? `推荐方案：${decision.recommendation}` : ""
    ].filter(Boolean).join("\n"),
    creatorUnionId,
    executorUnionIds: [executorUnionId],
    participantUnionIds: [],
    detailUrl: String(detailUrl || ""),
    dueTime: dueTimestamp(decision?.dueDate),
    done: decision?.status !== "pending",
    priority: 30
  };
}

export function buildPersonalTodoPayload(todo, creator, detailUrl) {
  const creatorUnionId = unionId(creator);
  const executorUnionId = String(todo?.assigneeUnionId || "").trim();
  if (!creatorUnionId || !executorUnionId) throw new Error("创建人或执行人缺少真实钉钉身份，无法同步待办。");
  const dueTime = dueTimestamp(todo?.dueDate);
  if (!dueTime) throw new Error("请先设置待办截止日期，再同步到钉钉。");
  return {
    todoId: todo?.dingTodo?.id || "",
    sourceId: todo?.sourceKey || `strategy-platform:${todo?.sourceType || "todo"}:${todo?.sourceId || "unknown"}`,
    subject: String(todo?.title || "公司战略执行待办"),
    description: String(todo?.description || "公司战略执行平台责任事项"),
    creatorUnionId,
    executorUnionIds: [executorUnionId],
    participantUnionIds: [],
    detailUrl: String(detailUrl || ""),
    dueTime,
    done: todo?.status === "done",
    priority: Number(todo?.priority) || 20
  };
}

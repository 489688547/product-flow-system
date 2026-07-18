function unionId(user) {
  return String(user?.unionId || user?.unionid || "").trim();
}

export function buildCollaborationTodoPayload(item = {}, actor = {}, detailUrl = "") {
  const executorUnionId = unionId(item.ownerUser);
  const creatorUnionId = String(item.dingTodo?.creatorUnionId || unionId(actor) || unionId(item.requesterUser)).trim();
  if (!creatorUnionId || !executorUnionId) throw new Error("主负责人或同步人缺少真实钉钉身份，无法同步待办。");
  const dueTime = Date.parse(item.dueAt || "");
  if (!Number.isFinite(dueTime)) throw new Error("请先设置有效的协同截止时间，再同步到钉钉。");
  return {
    todoId: String(item.dingTodo?.id || ""),
    sourceId: `collaboration:${item.id || "unknown"}`,
    subject: String(item.title || "部门协同事项").slice(0, 160),
    description: [
      item.source?.sourceLabel ? `来源：${item.source.sourceLabel}` : "",
      item.requestedAction ? `下一步：${item.requestedAction}` : "",
      item.businessImpact ? `业务影响：${item.businessImpact}` : ""
    ].filter(Boolean).join("\n").slice(0, 2000),
    creatorUnionId,
    executorUnionIds: [executorUnionId],
    participantUnionIds: (item.partnerUsers || []).map(unionId).filter(Boolean),
    detailUrl: String(detailUrl || ""),
    dueTime,
    done: ["closed", "cancelled"].includes(item.status),
    priority: item.impactLevel === "high" ? 30 : 20
  };
}

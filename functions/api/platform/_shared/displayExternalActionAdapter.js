import {
  appendDataEnvironmentAudit
} from "./dataEnvironmentStorage.js";
import {
  controlDatabase,
  dataEnvironmentActorId
} from "./dataEnvironment.js";

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function simulationId(kind, sourceId) {
  return `display-${kind}-${stableHash(`${kind}\u001f${sourceId}`)}`;
}

function requireValue(value, message) {
  if (!String(value || "").trim()) {
    const error = new Error(message);
    error.status = 400;
    throw error;
  }
}

export function simulateDingTodo(input = {}) {
  requireValue(input.creatorUnionId, "缺少钉钉创建人 unionId，无法创建待办。");
  if (!Array.isArray(input.executorUnionIds) || !input.executorUnionIds.filter(Boolean).length) {
    const error = new Error("请至少选择一个待办执行人。");
    error.status = 400;
    throw error;
  }
  requireValue(input.detailUrl, "缺少待办详情链接 detailUrl。");
  const id = String(input.todoId || "") || simulationId("todo", input.sourceId || `${input.creatorUnionId}:${input.subject}`);
  return {
    id,
    taskId: id,
    sourceId: String(input.sourceId || ""),
    updated: Boolean(input.todoId),
    simulated: true
  };
}

export function simulateDingTodoSync(input = {}) {
  if (!Number(input.dueTime)) {
    const error = new Error("请先设置任务截止日期，再同步到钉钉待办。");
    error.status = 400;
    throw error;
  }
  return simulateDingTodo(input);
}

export function simulateDingCalendarEvent(input = {}) {
  const organizer = input.organizerUnionId || input.organizerUserId;
  requireValue(organizer, "缺少钉钉会议发起人 unionId，无法创建日程。");
  requireValue(input.startTime, "请填写会议开始和结束时间。");
  requireValue(input.endTime, "请填写会议开始和结束时间。");
  const id = simulationId("calendar", input.sourceId || `${organizer}:${input.summary}:${input.startTime}`);
  return {
    id,
    summary: String(input.summary || ""),
    startTime: String(input.startTime),
    endTime: String(input.endTime),
    status: "confirmed",
    simulated: true
  };
}

export async function auditDisplayExternalAction({ env = {}, data = {}, kind, resultId }) {
  const controlDb = data.controlDb || controlDatabase(env);
  await appendDataEnvironmentAudit(controlDb, {
    actorId: dataEnvironmentActorId(data.session) || "system",
    action: `simulate_${kind}`,
    environmentId: "display",
    environmentVersion: Math.max(1, Number(data.dataEnvironment?.version || 1)),
    jobId: resultId,
    resultCode: "DISPLAY_EXTERNAL_ACTION_SIMULATED"
  });
}

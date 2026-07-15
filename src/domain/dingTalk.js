import { normalizeTaskDueDate } from "./taskTodo.js";

function toDingTalkDateTime(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(text)) return text;
  return `${text.length === 16 ? `${text}:00` : text}+08:00`;
}

export function buildTaskMeetingPayload({ product, task, organizer, attendees = [], startTime, endTime }) {
  const organizerUnionId = String(organizer?.unionid || organizer?.unionId || "").trim();
  if (!organizerUnionId) throw new Error("当前账号缺少钉钉 unionId，请重新登录后再预约会议。");

  const attendeeUnionIds = [...new Set(attendees
    .map(user => String(user?.unionid || user?.unionId || "").trim())
    .filter(Boolean))];
  if (!attendeeUnionIds.length) throw new Error("请至少选择一位具有钉钉身份的参会人。");

  const normalizedStart = toDingTalkDateTime(startTime);
  const normalizedEnd = toDingTalkDateTime(endTime);
  if (!normalizedStart || !normalizedEnd || new Date(normalizedEnd) <= new Date(normalizedStart)) {
    throw new Error("请填写有效的会议开始和结束时间。");
  }

  return {
    organizerUnionId,
    sourceId: `meeting:${product.id}:${task.id}`,
    summary: `${product.name} · ${task.title}`,
    description: [`产品：${product.name}`, `任务：${task.title}`, task.deliverable ? `交付物：${task.deliverable}` : ""].filter(Boolean).join("\n"),
    startTime: normalizedStart,
    endTime: normalizedEnd,
    attendeeUnionIds,
    createOnlineMeeting: true
  };
}

export function createTaskMeetingRecord({ event = {}, payload, attendees = [], syncedAt = new Date().toISOString() }) {
  const onlineMeetingInfo = event.onlineMeetingInfo || {};
  return {
    eventId: event.id || event.eventId || "",
    joinUrl: onlineMeetingInfo.url || event.joinUrl || "",
    startTime: payload.startTime,
    endTime: payload.endTime,
    attendeeUnionIds: payload.attendeeUnionIds || [],
    attendeeNames: attendees.map(user => user.name).filter(Boolean),
    syncedAt
  };
}

export function buildTaskTodoPayload({ product, task, creator, executors = [], detailUrl, now = new Date() }) {
  const creatorUnionId = String(creator?.unionid || creator?.unionId || "").trim();
  if (!creatorUnionId) throw new Error("当前账号缺少钉钉 unionId，请重新登录后再同步待办。");
  const due = normalizeTaskDueDate(task?.due, now);
  if (!due) throw new Error("请先设置任务截止日期，再同步到钉钉待办。");
  const dueTime = new Date(`${due}T18:00:00+08:00`).getTime();
  if (!Number.isFinite(dueTime)) throw new Error("任务截止日期无效，请重新选择后再同步到钉钉待办。");
  const executorUnionIds = [...new Set(executors
    .map(user => String(user?.unionid || user?.unionId || "").trim())
    .filter(Boolean))];
  if (!executorUnionIds.length) throw new Error("请至少选择一位具有钉钉身份的执行人。");

  return {
    todoId: task.dingTodo?.id || "",
    sourceId: `task:${product.id}:${task.id}`,
    subject: `${product.name} · ${task.title}`,
    description: [
      `产品：${product.name}`,
      `任务：${task.title}`,
      task.ownerDept ? `责任部门：${task.ownerDept}` : "",
      task.deliverable ? `交付物：${task.deliverable}` : ""
    ].filter(Boolean).join("\n"),
    creatorUnionId,
    executorUnionIds,
    participantUnionIds: [],
    detailUrl: String(detailUrl || ""),
    dueTime,
    done: Boolean(task.done)
  };
}

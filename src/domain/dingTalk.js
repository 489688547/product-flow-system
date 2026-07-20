import { buildTaskTodoSnapshot, normalizeTaskDueDate } from "./taskTodo.js";

const TODO_PRIORITIES = new Set([10, 20, 30, 40]);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeHtmlEntities(value = "") {
  return String(value)
    .replace(/&#(?:x([0-9a-f]+)|(\d+));?/gi, (match, hex, decimal) => {
      const codePoint = Number.parseInt(hex || decimal, hex ? 16 : 10);
      try {
        return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
          ? String.fromCodePoint(codePoint)
          : match;
      } catch {
        return match;
      }
    })
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

const TODO_HTML_TAGS = new Set([
  "a", "b", "blockquote", "br", "code", "em", "h1", "h2", "h3", "h4", "h5", "h6",
  "i", "li", "ol", "p", "pre", "s", "strong", "u", "ul"
]);

function safeTodoHref(value = "") {
  let decoded = String(value);
  for (let index = 0; index < 3; index += 1) {
    const next = decodeHtmlEntities(decoded);
    if (next === decoded) break;
    decoded = next;
  }
  const normalized = decoded.trim().replace(/[\u0000-\u0020\u007f]+/g, "");
  if (/^(?:https?:|mailto:|tel:)/i.test(normalized) || /^(?:#|\/)/.test(normalized)) return normalized;
  return "";
}

export function sanitizeTodoDescriptionHtml(value = "") {
  const withoutExecutableBlocks = String(value)
    .replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "");
  return withoutExecutableBlocks.replace(/<\/?[^>]+>/g, rawTag => {
    const match = rawTag.match(/^<\s*(\/?)\s*([a-z0-9-]+)/i);
    if (!match) return "";
    const closing = Boolean(match[1]);
    const tag = match[2].toLowerCase();
    if (!TODO_HTML_TAGS.has(tag)) return "";
    if (closing) return tag === "br" ? "" : `</${tag}>`;
    if (tag === "br") return "<br>";
    if (tag !== "a") return `<${tag}>`;
    const hrefMatch = rawTag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const href = safeTodoHref(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "");
    return href ? `<a href="${escapeHtml(href)}">` : "<a>";
  });
}

export function todoRichTextToPlainText(value = "") {
  return decodeHtmlEntities(sanitizeTodoDescriptionHtml(value)
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/(p|div|li|ul|ol|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function createTodoComposerDraft({ product = {}, task = {} } = {}) {
  const currentProduct = product || {};
  const currentTask = task || {};
  const saved = currentTask.dingTodo?.draft;
  if (saved?.subject && saved?.descriptionHtml) {
    return {
      subject: String(saved.subject),
      descriptionHtml: sanitizeTodoDescriptionHtml(saved.descriptionHtml),
      priority: TODO_PRIORITIES.has(Number(saved.priority)) ? Number(saved.priority) : 20,
      dueDate: normalizeTaskDueDate(saved.dueDate || currentTask.due),
      dueClock: /^\d{2}:\d{2}$/.test(String(saved.dueClock || "")) ? String(saved.dueClock) : "18:00"
    };
  }
  const rows = [
    ["产品", currentProduct.name],
    ["任务", currentTask.title],
    ["责任部门", currentTask.ownerDept],
    ["交付物", currentTask.deliverable]
  ].filter(([, value]) => String(value || "").trim());
  return {
    subject: `${currentProduct.name || "产品"} · ${currentTask.title || "产品任务"}`,
    descriptionHtml: rows.map(([label, value]) => `<p><strong>${label}：</strong>${escapeHtml(value)}</p>`).join(""),
    priority: 20,
    dueDate: normalizeTaskDueDate(currentTask.due),
    dueClock: "18:00"
  };
}

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

export function buildTaskTodoPayload({ product, task, creator, executors = [], recoveryUsers = [], detailUrl, draft, now = new Date() }) {
  const creatorUnionId = String(creator?.unionid || creator?.unionId || "").trim();
  if (!creatorUnionId) throw new Error("当前账号缺少钉钉 unionId，请重新登录后再同步待办。");
  const composer = draft ? {
    ...createTodoComposerDraft({ product, task }),
    ...draft,
    subject: String(draft.subject || "").trim(),
    descriptionHtml: sanitizeTodoDescriptionHtml(draft.descriptionHtml),
    priority: Number(draft.priority),
    dueDate: normalizeTaskDueDate(draft.dueDate, now),
    dueClock: String(draft.dueClock || "")
  } : createTodoComposerDraft({ product, task });
  if (!composer.subject) throw new Error("请填写待办标题。");
  const description = todoRichTextToPlainText(composer.descriptionHtml);
  if (!description) throw new Error("请填写待办正文。");
  if (!TODO_PRIORITIES.has(composer.priority)) throw new Error("请选择有效的待办优先级。");
  const due = normalizeTaskDueDate(composer.dueDate || task?.due, now);
  if (!due) throw new Error("请先设置任务截止日期，再同步到钉钉待办。");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(composer.dueClock)) throw new Error("请填写有效的截止时间。");
  const dueTime = new Date(`${due}T${composer.dueClock}:00+08:00`).getTime();
  if (!Number.isFinite(dueTime)) throw new Error("任务截止日期无效，请重新选择后再同步到钉钉待办。");
  const executorUnionIds = [...new Set(executors
    .map(user => String(user?.unionid || user?.unionId || "").trim())
    .filter(Boolean))];
  const recoveryUnionIds = [...new Set(recoveryUsers
    .map(user => String(user?.unionid || user?.unionId || "").trim())
    .filter(Boolean))];
  if (!executorUnionIds.length) throw new Error("请至少选择一位具有钉钉身份的执行人。");

  return {
    todoId: task.dingTodo?.id || "",
    sourceId: `task:${product.id}:${task.id}`,
    subject: composer.subject,
    description,
    descriptionHtml: composer.descriptionHtml,
    priority: composer.priority,
    creatorUnionId,
    executorUnionIds,
    recoveryUnionIds,
    participantUnionIds: [],
    detailUrl: String(detailUrl || ""),
    dueTime,
    draft: { ...composer, dueDate: due },
    done: Boolean(task.done)
  };
}

function dingTodoCardId(card = {}) {
  return String(card.taskId || card.id || card.todoTaskId || "").trim();
}

function dingTodoExecutors(card = {}) {
  const values = card.executorIds || card.executorUnionIds;
  if (!Array.isArray(values)) return null;
  return [...new Set(values.map(value => String(value?.id || value || "").trim()).filter(Boolean))];
}

function shanghaiDateAndClock(value) {
  const date = new Date(Number(value));
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const part = type => parts.find(item => item.type === type)?.value || "";
  return {
    dueDate: `${part("year")}-${part("month")}-${part("day")}`,
    dueClock: `${part("hour")}:${part("minute")}`
  };
}

function plainTextToTodoHtml(value = "") {
  const lines = String(value).replace(/\r\n?/g, "\n").split("\n");
  return lines.map(line => `<p>${escapeHtml(line) || "<br>"}</p>`).join("") || "<p><br></p>";
}

function remoteModifiedAt(card = {}) {
  const value = card.modifiedTime || card.updatedAt || card.updateTime;
  if (!value) return "";
  const numeric = Number(value);
  const date = new Date(Number.isFinite(numeric) && String(value).trim() !== "" ? numeric : String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function todoSnapshotTime(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

export function reconcileTaskTodosFromDingTalk(tasks = [], cards = []) {
  const remoteById = new Map();
  const remoteBySource = new Map();
  (Array.isArray(cards) ? cards : []).forEach(card => {
    const id = dingTodoCardId(card);
    const sourceId = String(card?.sourceId || "").trim();
    if (id) remoteById.set(id, card);
    if (sourceId) remoteBySource.set(sourceId, card);
  });

  let changed = false;
  const nextTasks = (Array.isArray(tasks) ? tasks : []).map(task => {
    const todoId = String(task?.dingTodo?.id || "").trim();
    const sourceId = `task:${task?.productId || ""}:${task?.id || ""}`;
    const card = remoteById.get(todoId) || remoteBySource.get(sourceId);
    if (!card) return task;

    const remoteUpdatedAt = remoteModifiedAt(card);
    const localUpdatedAt = Math.max(
      todoSnapshotTime(task.dingTodo?.remoteUpdatedAt),
      todoSnapshotTime(task.dingTodo?.syncedAt)
    );
    if (localUpdatedAt && (!remoteUpdatedAt || todoSnapshotTime(remoteUpdatedAt) <= localUpdatedAt)) return task;

    const remoteId = dingTodoCardId(card) || todoId;
    const remoteDue = Number(card.dueTime) > 0 ? shanghaiDateAndClock(card.dueTime) : null;
    const previousDraft = task.dingTodo?.draft || createTodoComposerDraft({ task });
    const remotePriority = TODO_PRIORITIES.has(Number(card.priority)) ? Number(card.priority) : previousDraft.priority;
    const draft = {
      ...previousDraft,
      subject: Object.hasOwn(card, "subject") ? String(card.subject || "") : previousDraft.subject,
      descriptionHtml: Object.hasOwn(card, "description")
        ? plainTextToTodoHtml(card.description)
        : previousDraft.descriptionHtml,
      priority: remotePriority,
      dueDate: remoteDue?.dueDate || previousDraft.dueDate || task.due || "",
      dueClock: remoteDue?.dueClock || previousDraft.dueClock || "18:00"
    };
    const executorUnionIds = dingTodoExecutors(card) || task.dingTodo?.executorUnionIds || [];
    const sameExecutors = JSON.stringify(executorUnionIds) === JSON.stringify(task.dingTodo?.executorUnionIds || []);
    const done = Object.hasOwn(card, "isDone") ? Boolean(card.isDone) : Boolean(task.done);
    const effectiveTask = {
      ...task,
      due: draft.dueDate || task.due || "",
      done
    };
    const dingTodo = {
      ...(task.dingTodo || {}),
      id: remoteId,
      executorUnionIds,
      executorNames: sameExecutors ? (task.dingTodo?.executorNames || []) : [],
      draft,
      remoteUpdatedAt,
      lastError: "",
      failedAt: ""
    };
    dingTodo.snapshot = buildTaskTodoSnapshot(effectiveTask, executorUnionIds, draft);
    const nextTask = { ...effectiveTask, dingTodo };
    if (JSON.stringify(nextTask) === JSON.stringify(task)) return task;
    changed = true;
    return nextTask;
  });
  return changed ? nextTasks : tasks;
}

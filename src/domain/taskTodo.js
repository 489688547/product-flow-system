const ALL_DEPARTMENT_LABELS = new Set(["全员", "全部", "所有", "所有部门", "公司"]);

function departmentTokens(value) {
  return String(value || "")
    .split(/[\/、,，;；|]/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => item
      .replace(/\s+/g, "")
      .replace(/部门$/, "")
      .replace(/部$/, ""));
}

function userDepartmentTokens(user = {}) {
  return [...new Set([...(user.departments || []), user.department]
    .flatMap(departmentTokens)
    .filter(Boolean))];
}

export function taskMatchesUserDepartments(task, user) {
  const owners = departmentTokens(task?.ownerDept);
  if (!owners.length || !user) return false;
  if (owners.some(owner => ALL_DEPARTMENT_LABELS.has(owner))) return true;
  const departments = userDepartmentTokens(user);
  return owners.some(owner => departments.includes(owner));
}

function sortTasksByDue(tasks) {
  return [...tasks].sort((left, right) => {
    if (!left.due && !right.due) return 0;
    if (!left.due) return 1;
    if (!right.due) return -1;
    return String(left.due).localeCompare(String(right.due));
  });
}

export function dashboardTasksForUser(tasks = [], user) {
  return sortTasksByDue(tasks.filter(task => !task.done && taskMatchesUserDepartments(task, user)));
}

export function taskMatchesDepartment(task, departmentName) {
  const owners = departmentTokens(task?.ownerDept);
  if (!owners.length) return false;
  if (owners.some(owner => ALL_DEPARTMENT_LABELS.has(owner))) return true;
  const wanted = departmentTokens(departmentName)[0];
  return Boolean(wanted) && owners.includes(wanted);
}

// 总经办视角：看全公司未完成待办，可按部门收窄；departmentFilter 为 "all" 时不过滤。
export function dashboardTasksForExecutive(tasks = [], departmentFilter = "all") {
  return sortTasksByDue(tasks.filter(task => !task.done
    && (departmentFilter === "all" || taskMatchesDepartment(task, departmentFilter))));
}

function canonicalDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeTaskDueDate(value, now = new Date()) {
  const text = String(value || "").trim();
  let match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (match) return canonicalDate(Number(match[1]), Number(match[2]), Number(match[3]));

  match = text.match(/^(\d{1,2})[-/](\d{1,2})$/);
  if (!match) return "";
  return canonicalDate(shanghaiTodayParts(now).year, Number(match[1]), Number(match[2]));
}

function dateParts(value, now) {
  const match = normalizeTaskDueDate(value, now).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
}

function shanghaiTodayParts(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = type => Number(parts.find(part => part.type === type)?.value || 0);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function dayNumber(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000;
}

export function riskMetaForTask(task, now = new Date()) {
  if (!task || task.done) return null;
  const due = dateParts(task.due, now);
  if (!due) return null;
  const days = dayNumber(due) - dayNumber(shanghaiTodayParts(now));
  if (days > 2) return null;
  if (days < 0) return { days, tone: "overdue", label: `逾期 ${Math.abs(days)} 天` };
  if (days === 0) return { days, tone: "today", label: "今日截止" };
  return { days, tone: "upcoming", label: `${days} 天后截止` };
}

export function buildTaskTodoSnapshot(task, executorUnionIds = task?.dingTodo?.executorUnionIds || [], draft) {
  const snapshot = {
    title: String(task?.title || ""),
    due: String(task?.due || ""),
    done: Boolean(task?.done),
    deliverable: String(task?.deliverable || ""),
    ownerDept: String(task?.ownerDept || ""),
    executorUnionIds: [...new Set(executorUnionIds.filter(Boolean))].sort()
  };
  if (draft) snapshot.draft = {
    subject: String(draft.subject || ""),
    descriptionHtml: String(draft.descriptionHtml || ""),
    priority: Number(draft.priority) || 20,
    dueDate: String(draft.dueDate || ""),
    dueClock: String(draft.dueClock || "18:00")
  };
  return snapshot;
}

function sameSnapshot(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

export function todoSyncStatus(task) {
  const todo = task?.dingTodo;
  if (todo?.lastError) return "同步失败";
  if (!todo?.id) return "未同步";
  const current = buildTaskTodoSnapshot(task, todo.executorUnionIds || [], todo.draft);
  if (!sameSnapshot(current, todo.snapshot)) return "待更新";
  return task.done ? "已完成" : "已同步";
}

export function applyTaskTodoSyncSuccess(task, { payload, executors = [], snapshot, todo = {}, syncedAt }) {
  const due = String(payload?.draft?.dueDate || task?.due || "");
  const effectiveTask = { ...task, due };
  return {
    ...effectiveTask,
    dingTodo: {
      id: todo?.id || todo?.taskId || payload?.todoId || "",
      syncedAt,
      executorUnionIds: payload?.executorUnionIds || [],
      executorNames: executors.map(user => user.name).filter(Boolean),
      draft: payload?.draft,
      snapshot: snapshot || buildTaskTodoSnapshot(effectiveTask, payload?.executorUnionIds || [], payload?.draft),
      lastError: ""
    }
  };
}

export function applyTaskTodoSyncFailure(task, error, failedAt = new Date().toISOString()) {
  return {
    ...task,
    dingTodo: {
      ...(task?.dingTodo || {}),
      lastError: error?.message || "钉钉待办同步失败。",
      failedAt
    }
  };
}

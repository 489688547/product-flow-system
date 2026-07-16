const DAY_MS = 86400000;

const SOURCE_CONFIG = {
  milestone: { appId: "platform", priority: 20 },
  decision: { appId: "platform", priority: 10 },
  risk: { appId: "platform", priority: 10 },
  review: { appId: "platform", priority: 20 },
  product_task: { appId: "product-flow", priority: 20 }
};

function identityUnionId(user = {}) {
  return String(user.unionid || user.unionId || "").trim();
}

function identityUserId(user = {}) {
  return String(user.userid || user.userId || "").trim();
}

function cleanDate(value) {
  const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function addDays(dateText, amount) {
  const time = Date.parse(`${dateText}T00:00:00Z`);
  return Number.isFinite(time) ? new Date(time + amount * DAY_MS).toISOString().slice(0, 10) : dateText;
}

function safeId(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function userDepartments(user = {}) {
  return [user.department, ...(user.departments || []), ...(user.departmentNames || [])].filter(Boolean);
}

function findUserByName(users, name) {
  const value = String(name || "").trim();
  return value ? users.find(user => String(user.name || "").trim() === value) : null;
}

function sourceStatus(type, record) {
  if (type === "milestone") return record.status === "completed" ? "done" : "pending";
  if (type === "decision") return record.status && record.status !== "pending" ? "done" : "pending";
  if (type === "risk") return record.status === "closed" ? "done" : "pending";
  if (type === "product_task") return record.done ? "done" : "pending";
  return record.done ? "done" : "pending";
}

function sourceCandidate(type, record, user, context = {}) {
  const config = SOURCE_CONFIG[type];
  const project = context.project || {};
  const product = context.product || {};
  const unionId = identityUnionId(user);
  if (!config || !unionId) return null;
  const sourceId = String(record.id || "");
  const status = sourceStatus(type, record);
  const dueDate = cleanDate(context.dueDate);
  return {
    sourceType: type,
    sourceId,
    sourceAppId: config.appId,
    sourceKey: `strategy-platform:${type}:${sourceId}`,
    title: String(context.title || record.title || "未命名待办"),
    description: String(context.description || record.description || record.response || record.recommendation || record.deliverable || ""),
    strategyId: record.strategyId || project.strategyId || "",
    objectiveId: record.objectiveId || project.objectiveId || "",
    projectId: record.projectId || project.id || "",
    projectName: project.name || product.name || "",
    assigneeName: user.name || "",
    assigneeUserId: identityUserId(user),
    assigneeUnionId: unionId,
    dueDate,
    priority: Number(record.priority) || (record.critical || ["critical", "high"].includes(record.severity) ? 10 : config.priority),
    status,
    businessStatus: type === "product_task" ? (record.done ? "done" : "pending") : String(record.status || status),
    completedAt: status === "done" ? String(record.completedAt || record.resolvedAt || record.updatedAt || "") : "",
    completedFrom: status === "done" ? "platform" : ""
  };
}

function startOfWeek(dateValue) {
  const dateText = cleanDate(dateValue);
  const date = new Date(`${dateText}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  return new Date(date.getTime() - (day - 1) * DAY_MS).toISOString().slice(0, 10);
}

function reviewCandidates(platformState, users, now) {
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 6);
  const dueDate = addDays(weekStart, 4);
  return users
    .filter(user => userDepartments(user).includes("总经办") && identityUnionId(user))
    .map(user => {
      const unionId = identityUnionId(user);
      const submitted = (platformState.statusUpdates || []).some(update => {
        const updateDate = cleanDate(update.week || update.createdAt);
        const sameOwner = update.owner === user.name || update.ownerUnionId === unionId;
        return sameOwner && updateDate >= weekStart && updateDate <= weekEnd;
      });
      return sourceCandidate("review", {
        id: `weekly-${weekStart}-${unionId}`,
        title: "提交本周经营复盘",
        done: submitted,
        status: submitted ? "submitted" : "pending"
      }, user, {
        dueDate,
        description: "确认本周关键变化、当前最大风险以及需要协调或决策的事项。"
      });
    });
}

function platformCandidates(platformState, users) {
  const projects = new Map((platformState.projects || []).map(project => [project.id, project]));
  return [
    ...(platformState.milestones || []).filter(item => !item.archived).map(item => sourceCandidate(
      "milestone",
      item,
      findUserByName(users, item.owner),
      { project: projects.get(item.projectId), dueDate: item.dueDate }
    )),
    ...(platformState.risks || []).filter(item => !item.archived).map(item => sourceCandidate(
      "risk",
      item,
      findUserByName(users, item.owner),
      { project: projects.get(item.projectId), dueDate: item.promisedAt, title: `整改：${item.title || "未命名风险"}` }
    )),
    ...(platformState.decisionRequests || []).filter(item => !item.archived).map(item => sourceCandidate(
      "decision",
      item,
      findUserByName(users, item.decisionOwner),
      { project: projects.get(item.projectId), dueDate: item.dueDate, title: `决策：${item.title || "未命名事项"}` }
    ))
  ].filter(Boolean);
}

function productCandidates(productState, users) {
  const products = new Map((productState.products || []).map(product => [product.id, product]));
  return (productState.tasks || []).flatMap(task => {
    const unionIds = task.assigneeUnionIds || task.dingTodo?.executorUnionIds || [];
    const names = task.assigneeNames || task.dingTodo?.executorNames || [];
    return unionIds.map((unionId, index) => {
      const user = users.find(candidate => identityUnionId(candidate) === String(unionId)) || {
        unionid: unionId,
        name: names[index] || "待办执行人"
      };
      return sourceCandidate("product_task", task, user, {
        product: products.get(task.productId),
        dueDate: task.due,
        description: task.deliverable || ""
      });
    }).filter(Boolean);
  });
}

function candidateKey(item) {
  return `${item.sourceKey}::${item.assigneeUnionId}`;
}

function mergeCandidate(candidate, existing, timestamp) {
  const status = candidate.status === "done"
    ? "done"
    : existing?.status === "done" && ["decision", "risk", "review"].includes(candidate.sourceType)
      ? "done"
      : "pending";
  return {
    ...(existing || {}),
    ...candidate,
    id: existing?.id || `todo-${safeId(candidate.sourceType)}-${safeId(candidate.sourceId)}-${safeId(candidate.assigneeUnionId)}`,
    status,
    completedAt: status === "done" ? (candidate.completedAt || existing?.completedAt || timestamp) : "",
    completedFrom: status === "done" ? (candidate.completedFrom || existing?.completedFrom || "platform") : "",
    dingTodo: { ...(existing?.dingTodo || {}) },
    createdAt: existing?.createdAt || timestamp,
    updatedAt: existing && JSON.stringify({ ...existing, updatedAt: "" }) === JSON.stringify({ ...existing, ...candidate, status, updatedAt: "" })
      ? existing.updatedAt
      : timestamp
  };
}

export function reconcilePersonalTodos({ platformState = {}, productState = {}, orgCache = {}, existingTodos = [], now = new Date() } = {}) {
  const users = Array.isArray(orgCache.users) ? orgCache.users : [];
  const timestamp = iso(now);
  const candidates = [
    ...platformCandidates(platformState, users),
    ...productCandidates(productState, users),
    ...reviewCandidates(platformState, users, now)
  ];
  const existingByKey = new Map(existingTodos.map(todo => [candidateKey(todo), todo]));
  const activeKeys = new Set(candidates.map(candidateKey));
  const active = candidates.map(candidate => mergeCandidate(candidate, existingByKey.get(candidateKey(candidate)), timestamp));
  const cancelled = existingTodos
    .filter(todo => !activeKeys.has(candidateKey(todo)))
    .map(todo => todo.status === "cancelled" ? todo : { ...todo, status: "cancelled", updatedAt: timestamp });
  return [...active, ...cancelled].sort((left, right) => (
    String(left.dueDate || "9999-12-31").localeCompare(String(right.dueDate || "9999-12-31"))
    || String(left.id).localeCompare(String(right.id))
  ));
}

export function personalTodosForUser(todos = [], user = {}) {
  const unionId = identityUnionId(user);
  if (!unionId) return [];
  return todos.filter(todo => todo.assigneeUnionId === unionId && todo.status !== "cancelled");
}

export function groupPersonalTodos(todos = [], now = new Date()) {
  const today = cleanDate(now);
  const sevenDaysLater = addDays(today, 7);
  const groups = { overdue: [], today: [], nextSevenDays: [], later: [], completed: [] };
  todos.forEach(todo => {
    if (todo.status === "done") groups.completed.push(todo);
    else if (todo.dueDate && todo.dueDate < today) groups.overdue.push(todo);
    else if (todo.dueDate === today) groups.today.push(todo);
    else if (todo.dueDate && todo.dueDate <= sevenDaysLater) groups.nextSevenDays.push(todo);
    else groups.later.push(todo);
  });
  return groups;
}

function snapshotTaskId(snapshot = {}) {
  return String(snapshot.taskId || snapshot.id || "");
}

function snapshotTime(snapshot = {}, fallback) {
  return iso(snapshot.modifiedTime || snapshot.updatedAt || fallback);
}

function isNewerSnapshot(todo, snapshot, fallback) {
  const remoteTime = snapshotTime(snapshot, fallback);
  const previousTime = todo.dingTodo?.lastEventAt || "";
  const key = `${snapshotTaskId(snapshot)}:${Boolean(snapshot.isDone)}:${remoteTime}`;
  return {
    remoteTime,
    key,
    newer: key !== todo.dingTodo?.remoteSnapshotKey && (!previousTime || Date.parse(remoteTime) > Date.parse(previousTime))
  };
}

function completionEffect(todo, done) {
  if (todo.sourceType === "milestone") return { type: done ? "complete_milestone" : "reopen_milestone", sourceId: todo.sourceId };
  if (todo.sourceType === "product_task") return { type: done ? "complete_product_task" : "reopen_product_task", sourceId: todo.sourceId };
  return null;
}

export function applyRemoteTodoSnapshots(todos = [], snapshots = [], user = {}, now = new Date()) {
  const unionId = identityUnionId(user);
  const timestamp = iso(now);
  const latestById = new Map();
  snapshots.forEach(snapshot => {
    const id = snapshotTaskId(snapshot);
    if (!id) return;
    const previous = latestById.get(id);
    if (!previous || Date.parse(snapshotTime(snapshot, timestamp)) > Date.parse(snapshotTime(previous, timestamp))) latestById.set(id, snapshot);
  });
  const effects = [];
  const audits = [];
  const nextTodos = todos.map(todo => {
    if (!unionId || todo.assigneeUnionId !== unionId || !todo.dingTodo?.id) return todo;
    const snapshot = latestById.get(String(todo.dingTodo.id));
    if (!snapshot) return todo;
    const freshness = isNewerSnapshot(todo, snapshot, timestamp);
    if (!freshness.newer) return todo;
    const remoteDone = Boolean(snapshot.isDone);
    const localDone = todo.status === "done";
    const dingTodo = { ...todo.dingTodo, lastEventAt: freshness.remoteTime, remoteSnapshotKey: freshness.key };
    if (remoteDone === localDone) return { ...todo, dingTodo, updatedAt: timestamp };
    if (!remoteDone && todo.completedFrom !== "dingtalk") return { ...todo, dingTodo, updatedAt: timestamp };

    const effect = completionEffect(todo, remoteDone);
    if (effect) effects.push(effect);
    const action = remoteDone
      ? todo.sourceType === "decision" ? "decision_pending_confirmation"
        : todo.sourceType === "risk" ? "risk_pending_confirmation"
          : "complete_from_dingtalk"
      : "reopen_from_dingtalk";
    audits.push({ action, todoId: todo.id, sourceType: todo.sourceType, sourceId: todo.sourceId, remoteSnapshotKey: freshness.key, createdAt: timestamp });
    return {
      ...todo,
      status: remoteDone ? "done" : "pending",
      completedAt: remoteDone ? freshness.remoteTime : "",
      completedFrom: remoteDone ? "dingtalk" : "",
      dingTodo,
      updatedAt: timestamp
    };
  });
  return { todos: nextTodos, effects, audits };
}

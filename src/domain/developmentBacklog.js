export const BACKLOG_STATUSES = Object.freeze([
  "clarification",
  "ready",
  "in_progress",
  "review",
  "completed",
  "blocked",
  "cancelled"
]);

export const BACKLOG_PRIORITIES = Object.freeze(["p0", "p1", "p2", "p3"]);

export const BACKLOG_MODULES = Object.freeze([
  Object.freeze({ id: "company-platform", name: "公司平台" }),
  Object.freeze({ id: "data-center", name: "数据中心" }),
  Object.freeze({ id: "data-acquisition", name: "数据采集" }),
  Object.freeze({ id: "ai-platform", name: "AI 平台" }),
  Object.freeze({ id: "ecommerce-operations", name: "电商店铺运营" }),
  Object.freeze({ id: "product-lifecycle", name: "产品全周期" }),
  Object.freeze({ id: "supply-chain", name: "供应链管理" }),
  Object.freeze({ id: "brand-content", name: "品牌内容协同" }),
  Object.freeze({ id: "hr-performance", name: "人事与绩效" })
]);

export const BACKLOG_STATUS_LABELS = Object.freeze({
  clarification: "待澄清",
  ready: "待开发",
  in_progress: "开发中",
  review: "待验收",
  completed: "已完成",
  blocked: "已阻塞",
  cancelled: "已取消"
});

const ACTIVE_CONFLICT_STATUSES = new Set(["ready", "in_progress", "review", "blocked"]);
const MODULE_IDS = new Set(BACKLOG_MODULES.map(module => module.id));
const SOURCE_TYPES = new Set(["ai_assistant", "codex", "manual"]);
const BRANCH_PATTERN = /^codex\/[a-z0-9](?:[a-z0-9._/-]{0,118}[a-z0-9])?$/;
const SAFE_GITHUB_PR = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+\/?$/i;

function backlogError(code, message, status = 400, retryable = false, details) {
  return Object.assign(new Error(message), { code, status, retryable, ...(details ? { details } : {}) });
}

function splitIdentityValues(value) {
  return (Array.isArray(value) ? value : [value])
    .flatMap(entry => String(entry || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/))
    .map(entry => entry.trim())
    .filter(Boolean);
}

export function backlogActor(session = {}) {
  const departments = [...new Set([
    ...splitIdentityValues(session.department),
    ...splitIdentityValues(session.departmentName),
    ...splitIdentityValues(session.departments),
    ...splitIdentityValues(session.departmentNames)
  ])];
  const role = String(session.role || "").trim();
  return {
    userId: String(session.userId || session.userid || session.unionId || session.unionid || "").trim(),
    name: String(session.name || "").trim(),
    departments,
    role,
    executive: departments.includes("总经办") || ["executive", "admin"].includes(role),
    readonly: role === "readonly" || Boolean(session.readonly)
  };
}

export function canManageBacklog(actor = {}) {
  return Boolean(actor.executive && !actor.readonly);
}

export function canDevelopBacklog(actor = {}) {
  return Boolean(actor.userId && !actor.readonly);
}

export function canUpdateBacklogDevelopment(item = {}, actor = {}) {
  return canManageBacklog(actor) || (
    canDevelopBacklog(actor)
    && Boolean(item.ownerUserId)
    && item.ownerUserId === actor.userId
  );
}

function cleanText(value, label, { required = false, max = 4_000 } = {}) {
  const text = String(value || "").trim();
  if ((required && !text) || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    throw backlogError("BACKLOG_INPUT_INVALID", `${label}格式无效。`);
  }
  return text;
}

function cleanStringList(value, label, { maxItems = 30, maxLength = 500 } = {}) {
  const source = Array.isArray(value) ? value : [];
  if (source.length > maxItems) throw backlogError("BACKLOG_INPUT_INVALID", `${label}数量过多。`);
  return [...new Set(source.map(entry => cleanText(entry, label, { required: true, max: maxLength })))];
}

export function normalizeScopePath(value) {
  const raw = String(value || "").trim();
  if (
    !raw
    || raw.length > 240
    || /[\u0000-\u001f\u007f]/.test(raw)
    || raw.startsWith("/")
    || raw.startsWith("~")
    || /^[a-z]:[\\/]/i.test(raw)
    || raw.includes("\\")
    || /(^|\/)\.\.(\/|$)/.test(raw)
    || /[*?[\]{}()|^$]/.test(raw)
  ) {
    throw backlogError("BACKLOG_SCOPE_INVALID", "受影响路径必须是安全的仓库相对路径。");
  }
  const hadTrailingSlash = raw.endsWith("/");
  const normalized = raw
    .replace(/^\.\/+/, "")
    .split("/")
    .filter(segment => segment && segment !== ".")
    .join("/");
  if (!normalized) throw backlogError("BACKLOG_SCOPE_INVALID", "受影响路径不能为空。");
  return hadTrailingSlash ? `${normalized}/` : normalized;
}

function normalizeDependencyIds(value) {
  return cleanStringList(value, "依赖事项", { maxItems: 30, maxLength: 80 });
}

export function normalizeBacklogDraft(input = {}) {
  const title = cleanText(input.title, "标题", { required: true, max: 120 });
  const background = cleanText(input.background, "背景与目标", { max: 4_000 });
  const moduleId = cleanText(input.moduleId, "模块", { required: true, max: 80 });
  if (!MODULE_IDS.has(moduleId)) {
    throw backlogError("BACKLOG_MODULE_NOT_REGISTERED", "研发模块未登记。");
  }
  const priority = String(input.priority || "p2").toLowerCase();
  if (!BACKLOG_PRIORITIES.includes(priority)) {
    throw backlogError("BACKLOG_INPUT_INVALID", "优先级格式无效。");
  }
  const acceptanceCriteria = cleanStringList(input.acceptanceCriteria, "验收标准", { maxItems: 20, maxLength: 500 });
  const scopePaths = [...new Set((Array.isArray(input.scopePaths) ? input.scopePaths : []).map(normalizeScopePath))];
  if (scopePaths.length > 30) throw backlogError("BACKLOG_INPUT_INVALID", "受影响路径数量过多。");
  const sourceType = SOURCE_TYPES.has(input.sourceType) ? input.sourceType : "manual";
  return {
    title,
    background,
    moduleId,
    priority,
    status: acceptanceCriteria.length && scopePaths.length ? "ready" : "clarification",
    acceptanceCriteria,
    scopePaths,
    dependencyIds: normalizeDependencyIds(input.dependencyIds),
    sourceType
  };
}

function pathsOverlap(left, right) {
  if (left === right) return left;
  if (left.endsWith("/") && right.startsWith(left)) return left;
  if (right.endsWith("/") && left.startsWith(right)) return right;
  return "";
}

export function findBacklogConflicts(candidate = {}, items = []) {
  const candidatePaths = Array.isArray(candidate.scopePaths) ? candidate.scopePaths : [];
  const conflicts = [];
  for (const item of items) {
    if (!item || item.id === candidate.id || !ACTIVE_CONFLICT_STATUSES.has(item.status)) continue;
    const itemPaths = Array.isArray(item.scopePaths) ? item.scopePaths : [];
    let reason = "";
    let path = "";
    for (const candidatePath of candidatePaths) {
      for (const itemPath of itemPaths) {
        path = pathsOverlap(candidatePath, itemPath);
        if (path) {
          reason = "path_overlap";
          break;
        }
      }
      if (path) break;
    }
    if (!reason && candidate.moduleId === item.moduleId && (!candidatePaths.length || !itemPaths.length)) {
      reason = "module_scope_unknown";
    }
    if (!reason) continue;
    conflicts.push({
      id: item.id,
      displayId: item.displayId,
      title: item.title,
      moduleId: item.moduleId,
      ownerUserId: item.ownerUserId || null,
      ownerName: item.ownerName || null,
      claimedBranch: item.claimedBranch || null,
      reason,
      path: path || null
    });
  }
  return conflicts;
}

function requireExecutive(actor) {
  if (!canManageBacklog(actor)) throw backlogError("BACKLOG_FORBIDDEN", "仅总经办可执行此操作。", 403);
}

function requireDeveloper(actor) {
  if (!canDevelopBacklog(actor)) throw backlogError("BACKLOG_FORBIDDEN", "当前身份不能认领研发事项。", 403);
}

function requireOwnerOrExecutive(item, actor) {
  if (!canUpdateBacklogDevelopment(item, actor)) {
    throw backlogError("BACKLOG_FORBIDDEN", "仅当前负责人或总经办可推进该事项。", 403);
  }
}

function requireStatus(item, allowed) {
  if (!allowed.includes(item.status)) {
    throw backlogError("BACKLOG_INVALID_TRANSITION", "当前状态不能执行此操作。", 409);
  }
}

function cleanBranch(value) {
  const branch = cleanText(value, "分支", { required: true, max: 120 });
  if (!BRANCH_PATTERN.test(branch) || branch.includes("//") || branch.endsWith(".") || branch.endsWith("/")) {
    throw backlogError("BACKLOG_BRANCH_INVALID", "分支名必须使用 codex/ 前缀和安全字符。");
  }
  return branch;
}

function cleanOptionalPrUrl(value) {
  const url = cleanText(value, "Pull Request 链接", { max: 500 });
  if (url && !SAFE_GITHUB_PR.test(url)) {
    throw backlogError("BACKLOG_INPUT_INVALID", "Pull Request 链接格式无效。");
  }
  return url || null;
}

export function resolveBacklogAction(item = {}, action, actor = {}, input = {}) {
  const name = String(action || "").trim();
  if (name === "claim") {
    requireDeveloper(actor);
    requireStatus(item, ["ready"]);
    return {
      toStatus: "in_progress",
      patch: {
        status: "in_progress",
        ownerUserId: actor.userId,
        ownerName: actor.name,
        claimedBranch: cleanBranch(input.branch),
        blockedReason: null,
        resumeCondition: null
      },
      evidenceSummary: null
    };
  }
  if (name === "release") {
    requireOwnerOrExecutive(item, actor);
    requireStatus(item, ["in_progress", "blocked"]);
    return {
      toStatus: "ready",
      patch: {
        status: "ready",
        ownerUserId: null,
        ownerName: null,
        claimedBranch: null,
        blockedReason: null,
        resumeCondition: null
      },
      evidenceSummary: cleanText(input.reason, "释放原因", { max: 500 }) || null
    };
  }
  if (name === "submit_review") {
    requireOwnerOrExecutive(item, actor);
    requireStatus(item, ["in_progress"]);
    const acceptanceEvidence = cleanText(input.acceptanceEvidence, "验收证据", { max: 2_000 });
    if (!acceptanceEvidence) {
      throw backlogError("BACKLOG_ACCEPTANCE_EVIDENCE_REQUIRED", "提交验收前必须填写验收证据。");
    }
    return {
      toStatus: "review",
      patch: {
        status: "review",
        acceptanceEvidence,
        pullRequestUrl: cleanOptionalPrUrl(input.pullRequestUrl)
      },
      evidenceSummary: acceptanceEvidence
    };
  }
  if (name === "block") {
    requireOwnerOrExecutive(item, actor);
    requireStatus(item, ["in_progress", "review"]);
    const blockedReason = cleanText(input.blockedReason, "阻塞原因", { max: 1_000 });
    if (!blockedReason) throw backlogError("BACKLOG_BLOCKED_REASON_REQUIRED", "阻塞事项必须填写原因。");
    const resumeCondition = cleanText(input.resumeCondition, "恢复条件", { max: 1_000 });
    if (!resumeCondition) throw backlogError("BACKLOG_RESUME_CONDITION_REQUIRED", "阻塞事项必须填写恢复条件。");
    return {
      toStatus: "blocked",
      patch: { status: "blocked", blockedReason, resumeCondition },
      evidenceSummary: blockedReason
    };
  }
  if (name === "resume") {
    requireOwnerOrExecutive(item, actor);
    requireStatus(item, ["blocked"]);
    const toStatus = item.ownerUserId ? "in_progress" : "ready";
    return {
      toStatus,
      patch: { status: toStatus, blockedReason: null, resumeCondition: null },
      evidenceSummary: cleanText(input.reason, "恢复说明", { max: 500 }) || null
    };
  }
  if (name === "complete") {
    requireExecutive(actor);
    requireStatus(item, ["review"]);
    return {
      toStatus: "completed",
      patch: { status: "completed" },
      evidenceSummary: cleanText(input.reason, "验收说明", { max: 1_000 }) || item.acceptanceEvidence || null
    };
  }
  if (name === "cancel") {
    requireExecutive(actor);
    requireStatus(item, ["clarification", "ready", "in_progress", "review", "blocked"]);
    const reason = cleanText(input.reason, "取消原因", { required: true, max: 1_000 });
    return { toStatus: "cancelled", patch: { status: "cancelled" }, evidenceSummary: reason };
  }
  if (name === "reopen") {
    requireExecutive(actor);
    requireStatus(item, ["completed", "cancelled"]);
    const reason = cleanText(input.reason, "重新打开原因", { required: true, max: 1_000 });
    return {
      toStatus: "ready",
      patch: {
        status: "ready",
        ownerUserId: null,
        ownerName: null,
        claimedBranch: null,
        acceptanceEvidence: null,
        blockedReason: null,
        resumeCondition: null
      },
      evidenceSummary: reason
    };
  }
  throw backlogError("BACKLOG_INVALID_TRANSITION", "未知的研发待办操作。", 400);
}

export function formatBacklogDisplayId(sequenceNo) {
  const value = Number(sequenceNo);
  if (!Number.isInteger(value) || value < 1) {
    throw backlogError("BACKLOG_INPUT_INVALID", "研发待办编号无效.");
  }
  return `DEV-${String(value).padStart(6, "0")}`;
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function backlogRowToItem(row = {}) {
  if (!row) return null;
  return {
    id: row.id,
    sequenceNo: Number(row.sequence_no),
    displayId: row.display_id,
    title: row.title,
    background: row.background || "",
    moduleId: row.module_id,
    moduleName: BACKLOG_MODULES.find(module => module.id === row.module_id)?.name || row.module_id,
    priority: row.priority,
    status: row.status,
    acceptanceCriteria: parseJsonArray(row.acceptance_criteria_json),
    scopePaths: parseJsonArray(row.scope_paths_json),
    dependencyIds: parseJsonArray(row.dependency_ids_json),
    sourceType: row.source_type,
    ownerUserId: row.owner_user_id || null,
    ownerName: row.owner_name_snapshot || null,
    claimedBranch: row.claimed_branch || null,
    pullRequestUrl: row.pull_request_url || null,
    acceptanceEvidence: row.acceptance_evidence || null,
    blockedReason: row.blocked_reason || null,
    resumeCondition: row.resume_condition || null,
    version: Number(row.version),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at || null,
    cancelledAt: row.cancelled_at || null
  };
}

export function backlogEventRowToEvent(row = {}) {
  return {
    id: row.id,
    itemId: row.item_id,
    action: row.action,
    fromStatus: row.from_status || null,
    toStatus: row.to_status || null,
    changedFields: parseJsonArray(row.changed_fields_json),
    actorUserId: row.actor_user_id,
    actorName: row.actor_name_snapshot || "",
    branch: row.branch_snapshot || null,
    evidenceSummary: row.evidence_summary || null,
    createdAt: row.created_at
  };
}

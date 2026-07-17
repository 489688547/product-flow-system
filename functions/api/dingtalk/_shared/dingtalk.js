const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: JSON_HEADERS
  });
}

export function getDingCredentials(env = {}) {
  const appKey = env.DINGTALK_APP_KEY || env.DINGTALK_CLIENT_ID || "";
  const appSecret = env.DINGTALK_APP_SECRET || env.DINGTALK_CLIENT_SECRET || "";
  const missing = [];
  if (!appKey) missing.push("DINGTALK_APP_KEY");
  if (!appSecret) missing.push("DINGTALK_APP_SECRET");
  return { appKey, appSecret, missing };
}

export function buildConfigResponse(env = {}, origin = "") {
  const { appKey, missing } = getDingCredentials(env);
  const normalizedOrigin = String(origin || "").replace(/\/$/, "");
  return {
    configured: missing.length === 0,
    missing,
    clientId: appKey || "",
    callbackUrl: `${normalizedOrigin}/?corpId=$CORPID$`
  };
}

export async function getDingAccessToken(env = {}, fetchImpl = fetch) {
  const { appKey, appSecret, missing } = getDingCredentials(env);
  if (missing.length) {
    const err = new Error(`缺少钉钉应用配置：${missing.join("、")}`);
    err.status = 501;
    throw err;
  }
  const url = `https://oapi.dingtalk.com/gettoken?appkey=${encodeURIComponent(appKey)}&appsecret=${encodeURIComponent(appSecret)}`;
  const res = await fetchImpl(url);
  const data = await res.json();
  if (!res.ok || data.errcode !== 0) {
    const err = new Error(data.errmsg || "获取钉钉 access_token 失败");
    err.status = 502;
    err.detail = data;
    throw err;
  }
  return data.access_token;
}

export async function getDingUserAccessToken(env = {}, input = {}, fetchImpl = fetch) {
  const { appKey, appSecret, missing } = getDingCredentials(env);
  if (missing.length) {
    const err = new Error(`缺少钉钉应用配置：${missing.join("、")}`);
    err.status = 501;
    throw err;
  }
  const authCode = String(input.authCode || input.code || "").trim();
  const refreshToken = String(input.refreshToken || "").trim();
  if (!authCode && !refreshToken) {
    const err = new Error("需要用户授权码，才能读取当前账号可见的钉钉 AI 听记。");
    err.status = 400;
    throw err;
  }
  const body = refreshToken
    ? { clientId: appKey, clientSecret: appSecret, refreshToken, grantType: "refresh_token" }
    : { clientId: appKey, clientSecret: appSecret, code: authCode, grantType: "authorization_code" };
  const res = await fetchImpl("https://api.dingtalk.com/v1.0/oauth2/userAccessToken", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code || data.errcode || !data.accessToken) {
    const err = new Error(data.message || data.errmsg || "获取钉钉用户授权失败，无法读取 AI 听记。");
    err.status = res.ok ? 502 : res.status;
    err.detail = data;
    throw err;
  }
  return data;
}

export async function getDingUserByCode(accessToken, authCode, fetchImpl = fetch) {
  const res = await fetchImpl(`https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: authCode })
  });
  const data = await res.json();
  if (!res.ok || data.errcode !== 0) {
    const err = new Error(data.errmsg || "通过免登码获取用户失败");
    err.status = 502;
    err.detail = data;
    throw err;
  }
  return data.result || {};
}

export async function getDingUserDetail(accessToken, userid, fetchImpl = fetch) {
  if (!userid) return {};
  const res = await fetchImpl(`https://oapi.dingtalk.com/topapi/v2/user/get?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userid, language: "zh_CN" })
  });
  const data = await res.json();
  if (!res.ok || data.errcode !== 0) return {};
  return data.result || {};
}

export async function getDingCurrentUser(userAccessToken, fetchImpl = fetch) {
  return requestDingOpenApi(userAccessToken, "GET", "/v1.0/contact/users/me", null, fetchImpl);
}

export async function getDingUserByUnionId(accessToken, unionId, fetchImpl = fetch) {
  if (!unionId) return {};
  return postDingTopApi(accessToken, "/topapi/user/getbyunionid", { unionid: unionId }, fetchImpl);
}

async function postDingTopApi(accessToken, path, body, fetchImpl = fetch) {
  const res = await fetchImpl(`https://oapi.dingtalk.com${path}?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok || data.errcode !== 0) {
    const err = new Error(data.errmsg || "钉钉组织架构同步失败");
    err.status = 502;
    err.detail = data;
    throw err;
  }
  return data.result || {};
}

function dingClientToken(value = "") {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || `product-flow-${Date.now()}`;
}

async function requestDingOpenApi(accessToken, method, path, body, fetchImpl = fetch, extraHeaders = {}) {
  const res = await fetchImpl(`https://api.dingtalk.com${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      "x-acs-dingtalk-access-token": accessToken,
      ...extraHeaders
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code || data.errcode) {
    const err = new Error(data.message || data.errmsg || "钉钉接口调用失败");
    err.status = res.ok ? 502 : res.status;
    err.detail = data;
    throw err;
  }
  return data;
}

export async function getDingDepartments(accessToken, fetchImpl = fetch, rootDeptId = 1) {
  const root = Number(rootDeptId) || 1;
  const departmentsById = new Map();
  const visited = new Set();
  async function visit(parentId) {
    const normalizedParentId = Number(parentId) || 1;
    if (visited.has(normalizedParentId)) return;
    visited.add(normalizedParentId);
    const result = await postDingTopApi(accessToken, "/topapi/v2/department/listsub", {
      dept_id: normalizedParentId,
      language: "zh_CN"
    }, fetchImpl);
    const children = Array.isArray(result) ? result : result.list || [];
    for (const child of children) {
      const childId = Number(child.dept_id || child.deptId);
      if (childId && !departmentsById.has(String(childId))) {
        departmentsById.set(String(childId), child);
      }
      await visit(childId);
    }
  }
  await visit(root);

  try {
    const ids = await getDingSubDepartmentIds(accessToken, fetchImpl, root);
    for (const id of ids) {
      if (departmentsById.has(String(id))) continue;
      const detail = await getDingDepartmentDetail(accessToken, id, fetchImpl).catch(() => ({}));
      departmentsById.set(String(id), {
        dept_id: id,
        parent_id: detail.parent_id || detail.parentId || "",
        name: detail.name || `部门 ${id}`
      });
    }
  } catch (error) {
    // listsub already collected the visible tree; listsubid is only a completeness fallback.
  }

  return [...departmentsById.values()];
}

export async function getDingSubDepartmentIds(accessToken, fetchImpl = fetch, rootDeptId = 1) {
  const root = Number(rootDeptId) || 1;
  const ids = [];
  const visited = new Set();
  const collected = new Set();
  async function visit(parentId) {
    const normalizedParentId = Number(parentId) || 1;
    if (visited.has(normalizedParentId)) return;
    visited.add(normalizedParentId);
    const result = await postDingTopApi(accessToken, "/topapi/v2/department/listsubid", {
      dept_id: normalizedParentId
    }, fetchImpl);
    const children = Array.isArray(result)
      ? result
      : result.dept_id_list || result.sub_dept_id_list || result.deptIds || [];
    for (const value of children) {
      const childId = Number(value);
      if (!childId || collected.has(childId)) continue;
      collected.add(childId);
      ids.push(childId);
      await visit(childId);
    }
  }
  await visit(root);
  return ids;
}

export async function getDingDepartmentDetail(accessToken, deptId, fetchImpl = fetch) {
  return postDingTopApi(accessToken, "/topapi/v2/department/get", {
    dept_id: Number(deptId),
    language: "zh_CN"
  }, fetchImpl);
}

export async function getDingDepartmentUsers(accessToken, deptId, fetchImpl = fetch) {
  const users = [];
  let cursor = 0;
  let hasMore = true;
  while (hasMore) {
    const result = await postDingTopApi(accessToken, "/topapi/v2/user/list", {
      dept_id: Number(deptId),
      cursor,
      contain_access_limit: false,
      order_field: "modify_desc",
      size: 100,
      language: "zh_CN"
    }, fetchImpl);
    const list = Array.isArray(result.list) ? result.list : (Array.isArray(result.user_list) ? result.user_list : []);
    users.push(...list);
    hasMore = !!result.has_more;
    cursor = Number(result.next_cursor || cursor + list.length);
    if (!list.length) hasMore = false;
  }
  return users;
}

export function mapDingRole(user = {}) {
  const roleNames = (user.role_list || []).map(role => `${role.group_name || ""} ${role.name || ""}`).join(" ");
  const text = [
    user.name,
    user.title,
    user.org_email,
    user.work_place,
    user.remark,
    roleNames,
    user.extension
  ].filter(Boolean).join(" ");
  if (user.boss || user.admin || /老板|总经理|管理员|负责人|高层|管理层|创始人/i.test(text)) return "executive";
  if (/产品|产品经理|研发|项目/i.test(text)) return "product";
  if (/运营|店长|投放|直播|内容/i.test(text)) return "ops";
  if (/客服|售后|用户/i.test(text)) return "service";
  if (/品牌|设计|视觉|内容/i.test(text)) return "brand";
  if (/供应链|采购|仓储|物流|工厂|生产/i.test(text)) return "supply";
  if (/财务|会计|出纳|利润|成本/i.test(text)) return "finance";
  return "readonly";
}

export function publicUser(basic = {}, detail = {}) {
  return {
    userid: detail.userid || basic.userid || "",
    unionid: detail.unionid || basic.unionid || "",
    name: detail.name || basic.name || basic.userid || "",
    avatar: detail.avatar || "",
    title: detail.title || "",
    mobileMasked: detail.mobile ? `${String(detail.mobile).slice(0, 3)}****${String(detail.mobile).slice(-4)}` : "",
    deptIds: detail.dept_id_list || [],
    roles: detail.role_list || []
  };
}

function dingDepartmentName(user = {}) {
  const roles = Array.isArray(user.role_list) ? user.role_list : [];
  const group = roles.find(role => role.group_name && !/默认|角色/i.test(role.group_name));
  return group?.group_name || "";
}

function preferredDepartmentId(user = {}) {
  const deptIds = Array.isArray(user.dept_id_list) ? user.dept_id_list : [];
  const leaders = Array.isArray(user.leader_in_dept) ? user.leader_in_dept : [];
  const leaderIndex = leaders.findIndex(value => value === true || value === "true" || value === 1);
  return deptIds[leaderIndex >= 0 ? leaderIndex : 0] || "";
}

async function resolveDingDepartmentName(accessToken, user = {}, fetchImpl = fetch) {
  const deptId = preferredDepartmentId(user);
  if (!deptId) return dingDepartmentName(user);
  const department = await getDingDepartmentDetail(accessToken, deptId, fetchImpl).catch(() => ({}));
  return department.name || dingDepartmentName(user);
}

function normalizedSessionIdentity({ corpId, basic = {}, detail = {}, department = "" }) {
  const userId = detail.userid || basic.userid || "";
  const unionId = detail.unionid || basic.unionid || basic.unionId || "";
  const combined = { ...basic, ...detail };
  return {
    corpId: corpId || "",
    userId,
    unionId,
    name: detail.name || basic.name || basic.nick || userId,
    role: mapDingRole(combined),
    department: department || dingDepartmentName(combined),
    title: detail.title || basic.title || "",
    avatar: detail.avatar || basic.avatarUrl || basic.avatar || ""
  };
}

function assertEnterpriseEmployee(identity = {}, detail = {}) {
  if (!identity.userId || detail.active === false) {
    const error = new Error("当前钉钉账号不在当前企业的在职组织架构中，无法进入系统。");
    error.status = 403;
    throw error;
  }
  return identity;
}

export async function getDingBrowserLogin(code, env = {}, fetchImpl = fetch) {
  const userToken = await getDingUserAccessToken(env, { code }, fetchImpl);
  const current = await getDingCurrentUser(userToken.accessToken, fetchImpl);
  const appToken = await getDingAccessToken(env, fetchImpl);
  const enterprise = await getDingUserByUnionId(appToken, current.unionId || current.unionid, fetchImpl);
  const detail = await getDingUserDetail(appToken, enterprise.userid, fetchImpl);
  const department = await resolveDingDepartmentName(appToken, detail, fetchImpl);
  const identity = assertEnterpriseEmployee(normalizedSessionIdentity({
    corpId: env.DINGTALK_CORP_ID || env.DINGTALK_CORPID || "",
    basic: { ...current, userid: enterprise.userid, unionid: current.unionId || current.unionid },
    detail,
    department
  }), detail);
  return { identity, userToken };
}

export async function getDingBrowserIdentity(code, env = {}, fetchImpl = fetch) {
  return (await getDingBrowserLogin(code, env, fetchImpl)).identity;
}

export async function getDingEmbeddedIdentity(authCode, corpId, env = {}, fetchImpl = fetch) {
  if (!authCode) {
    const error = new Error("缺少钉钉免登授权码 authCode");
    error.status = 400;
    throw error;
  }
  const accessToken = await getDingAccessToken(env, fetchImpl);
  const basic = await getDingUserByCode(accessToken, authCode, fetchImpl);
  const detail = await getDingUserDetail(accessToken, basic.userid, fetchImpl);
  const department = await resolveDingDepartmentName(accessToken, detail, fetchImpl);
  return assertEnterpriseEmployee(normalizedSessionIdentity({
    corpId: corpId || env.DINGTALK_CORP_ID || env.DINGTALK_CORPID || "",
    basic,
    detail,
    department
  }), detail);
}

function publicOrgUser(user = {}, departmentsById = new Map()) {
  const deptIds = Array.isArray(user.dept_id_list) ? user.dept_id_list : [];
  return {
    userId: user.userid || "",
    unionId: user.unionid || "",
    name: user.name || user.userid || "",
    avatar: user.avatar || "",
    title: user.title || "",
    deptIds,
    departmentNames: deptIds.map(id => departmentsById.get(String(id))?.name).filter(Boolean),
    roles: user.role_list || [],
    role: mapDingRole(user),
    active: user.active !== false
  };
}

export async function syncDingOrg(accessToken, fetchImpl = fetch, now = new Date(), options = {}) {
  const rootDeptId = Number(options.rootDeptId || 1) || 1;
  const departments = (await getDingDepartments(accessToken, fetchImpl, options.rootDeptId || 1)).map(dept => ({
    deptId: String(dept.dept_id || dept.deptId || ""),
    parentId: String(dept.parent_id || dept.parentId || "0"),
    name: dept.name || ""
  })).filter(dept => dept.deptId && dept.name);
  const departmentsById = new Map(departments.map(dept => [dept.deptId, dept]));
  const byUserId = new Map();
  const syncWarnings = [];
  const departmentIds = [...new Set([String(rootDeptId), ...departments.map(dept => dept.deptId)])];
  for (const deptId of departmentIds) {
    let users = [];
    try {
      users = await getDingDepartmentUsers(accessToken, deptId, fetchImpl);
    } catch (error) {
      syncWarnings.push({
        deptId,
        department: departmentsById.get(String(deptId))?.name || (String(deptId) === String(rootDeptId) ? "根部门" : ""),
        message: error.message || "部门成员读取失败",
        code: error.detail?.errcode || error.detail?.code || ""
      });
      continue;
    }
    users.forEach(user => {
      const safeUser = publicOrgUser(user, departmentsById);
      if (safeUser.userId) byUserId.set(safeUser.userId, safeUser);
    });
  }
  const syncedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  return {
    version: "org-v2",
    syncedAt,
    expiresAt,
    departments,
    syncWarnings,
    users: [...byUserId.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
  };
}

export function filterOrgUsers(org = {}, query = "", limit = 20) {
  const text = String(query || "").trim().toLowerCase();
  const users = Array.isArray(org.users) ? org.users : [];
  const result = text
    ? users.filter(user => [
      user.name,
      user.title,
      user.role,
      ...(user.departmentNames || []),
      ...(user.roles || []).map(role => `${role.group_name || ""} ${role.name || ""}`)
    ].filter(Boolean).join(" ").toLowerCase().includes(text))
    : users;
  return result.slice(0, limit);
}

export function buildDingTodoPayload({
  sourceId,
  subject,
  description = "",
  creatorUnionId,
  executorUnionIds = [],
  participantUnionIds = [],
  detailUrl,
  dueTime = 0,
  priority = 20
} = {}) {
  return {
    sourceId: String(sourceId || ""),
    subject: String(subject || "").slice(0, 1024),
    description: String(description || ""),
    creatorId: String(creatorUnionId || ""),
    executorIds: executorUnionIds.filter(Boolean),
    participantIds: participantUnionIds.filter(Boolean),
    detailUrl: {
      appUrl: String(detailUrl || ""),
      pcUrl: String(detailUrl || "")
    },
    dueTime: Number(dueTime) || 0,
    isOnlyShowExecutor: true,
    priority
  };
}

export async function createDingTodoTask(accessToken, input = {}, fetchImpl = fetch) {
  const creatorUnionId = String(input.creatorUnionId || "");
  if (!creatorUnionId) {
    const err = new Error("缺少钉钉创建人 unionId，无法创建待办。");
    err.status = 400;
    throw err;
  }
  if (!input.executorUnionIds?.length) {
    const err = new Error("请至少选择一个待办执行人。");
    err.status = 400;
    throw err;
  }
  if (!input.detailUrl) {
    const err = new Error("缺少待办详情链接 detailUrl。");
    err.status = 400;
    throw err;
  }
  const body = buildDingTodoPayload(input);
  return requestDingOpenApi(
    accessToken,
    "POST",
    `/v1.0/todo/users/${encodeURIComponent(creatorUnionId)}/tasks?operatorId=${encodeURIComponent(creatorUnionId)}`,
    body,
    fetchImpl
  );
}

export async function updateDingTodoTask(accessToken, input = {}, fetchImpl = fetch) {
  const creatorUnionId = String(input.creatorUnionId || "");
  const todoId = String(input.todoId || "");
  if (!creatorUnionId || !todoId) {
    const err = new Error("缺少钉钉创建人 unionId 或待办 ID，无法更新待办。");
    err.status = 400;
    throw err;
  }
  if (!input.executorUnionIds?.length) {
    const err = new Error("请至少选择一个待办执行人。");
    err.status = 400;
    throw err;
  }
  const body = {
    subject: String(input.subject || "").slice(0, 1024),
    description: String(input.description || ""),
    dueTime: Number(input.dueTime) || 0,
    executorIds: input.executorUnionIds.filter(Boolean),
    participantIds: (input.participantUnionIds || []).filter(Boolean),
    done: Boolean(input.done)
  };
  const result = await requestDingOpenApi(
    accessToken,
    "PUT",
    `/v1.0/todo/users/${encodeURIComponent(creatorUnionId)}/tasks/${encodeURIComponent(todoId)}?operatorId=${encodeURIComponent(creatorUnionId)}`,
    body,
    fetchImpl
  );
  return { ...result, id: todoId, updated: true };
}

export function isDuplicateTodoSourceError(error) {
  const text = [error?.message, error?.detail?.message, error?.detail?.errmsg]
    .filter(Boolean)
    .join(" ");
  return /task existed sourceId/i.test(text);
}

export async function findDingTodoBySourceId(accessToken, unionId, sourceId, fetchImpl = fetch) {
  const wantedSourceId = String(sourceId || "");
  if (!wantedSourceId) return null;
  for (const isDone of [false, true]) {
    const cards = await listDingTodoTasks(accessToken, unionId, { isDone, fetchImpl });
    const found = cards.find(card => String(card?.sourceId || "") === wantedSourceId);
    if (found) return found;
  }
  return null;
}

export async function syncDingTodoTask(accessToken, input = {}, fetchImpl = fetch) {
  if (!Number(input.dueTime)) {
    const err = new Error("请先设置任务截止日期，再同步到钉钉待办。");
    err.status = 400;
    throw err;
  }
  if (input.todoId) return updateDingTodoTask(accessToken, input, fetchImpl);
  try {
    return await createDingTodoTask(accessToken, input, fetchImpl);
  } catch (error) {
    if (!isDuplicateTodoSourceError(error)) throw error;
    const existing = await findDingTodoBySourceId(
      accessToken,
      input.creatorUnionId,
      input.sourceId,
      fetchImpl
    );
    const todoId = String(existing?.id || existing?.taskId || existing?.todoTaskId || "");
    if (!todoId) throw error;
    const updated = await updateDingTodoTask(accessToken, { ...input, todoId }, fetchImpl);
    return { ...updated, recovered: true };
  }
}

export async function listDingTodoTasks(accessToken, unionId, { isDone = false, fetchImpl = fetch } = {}) {
  const userUnionId = String(unionId || "").trim();
  if (!userUnionId) {
    const err = new Error("当前登录账号缺少 unionId，无法查询钉钉待办。");
    err.status = 400;
    throw err;
  }
  const cards = [];
  let nextToken = "";
  let page = 0;
  do {
    const query = new URLSearchParams({ isDone: String(Boolean(isDone)) });
    if (nextToken) query.set("nextToken", nextToken);
    const result = await requestDingOpenApi(
      accessToken,
      "GET",
      `/v1.0/todo/users/${encodeURIComponent(userUnionId)}/tasks?${query.toString()}`,
      null,
      fetchImpl
    );
    cards.push(...(Array.isArray(result.todoCards) ? result.todoCards : []));
    nextToken = String(result.nextToken || "");
    page += 1;
  } while (nextToken && page < 100);
  return cards;
}

export function buildDingCalendarEventPayload({
  summary,
  description = "",
  startTime,
  endTime,
  attendeeUnionIds = [],
  attendeeUserIds = [],
  createOnlineMeeting = true,
  timeZone = "Asia/Shanghai"
} = {}) {
  const attendeeIds = attendeeUnionIds.length ? attendeeUnionIds : attendeeUserIds;
  return {
    summary: String(summary || "").slice(0, 1024),
    description: String(description || ""),
    start: { dateTime: String(startTime || ""), timeZone },
    end: { dateTime: String(endTime || ""), timeZone },
    attendees: attendeeIds.filter(Boolean).map(id => ({ id })),
    reminders: [{ method: "dingtalk", minutes: 15 }],
    onlineMeetingInfo: createOnlineMeeting ? { type: "dingtalk" } : undefined
  };
}

export async function createDingCalendarEvent(accessToken, input = {}, fetchImpl = fetch) {
  const organizerUnionId = String(input.organizerUnionId || input.organizerUserId || "");
  if (!organizerUnionId) {
    const err = new Error("缺少钉钉会议发起人 unionId，无法创建日程。");
    err.status = 400;
    throw err;
  }
  if (!input.startTime || !input.endTime) {
    const err = new Error("请填写会议开始和结束时间。");
    err.status = 400;
    throw err;
  }
  const body = buildDingCalendarEventPayload(input);
  return requestDingOpenApi(
    accessToken,
    "POST",
    `/v1.0/calendar/users/${encodeURIComponent(organizerUnionId)}/calendars/primary/events`,
    body,
    fetchImpl,
    { "x-client-token": dingClientToken(input.sourceId || `${organizerUnionId}-${input.summary || ""}-${input.startTime || ""}`) }
  );
}

function normalizeDingCalendarEvent(event = {}) {
  const onlineMeetingInfo = event.onlineMeetingInfo || {};
  const start = event.start || {};
  const end = event.end || {};
  return {
    id: event.id || "",
    summary: event.summary || "",
    description: event.description || "",
    startTime: start.dateTime || start.date || "",
    endTime: end.dateTime || end.date || "",
    organizer: event.organizer || null,
    attendees: Array.isArray(event.attendees) ? event.attendees : [],
    onlineMeetingInfo,
    conferenceId: onlineMeetingInfo.conferenceId || "",
    scheduleConferenceId: onlineMeetingInfo.scheduleConferenceId || onlineMeetingInfo.conferenceId || "",
    joinUrl: onlineMeetingInfo.url || "",
    status: event.status || ""
  };
}

export async function listDingCalendarEvents(accessToken, input = {}, fetchImpl = fetch) {
  const userUnionId = String(input.userUnionId || input.organizerUnionId || input.unionId || "").trim();
  if (!userUnionId) {
    const err = new Error("缺少当前钉钉账号 unionId，无法查询日历会议。");
    err.status = 400;
    throw err;
  }
  const query = new URLSearchParams();
  if (input.timeMin) query.set("timeMin", String(input.timeMin));
  if (input.timeMax) query.set("timeMax", String(input.timeMax));
  query.set("showDeleted", "false");
  query.set("maxResults", String(Math.min(Number(input.maxResults) || 50, 100)));
  query.set("maxAttendees", String(Math.min(Number(input.maxAttendees) || 20, 100)));
  if (input.nextToken) query.set("nextToken", String(input.nextToken));
  const data = await requestDingOpenApi(
    accessToken,
    "GET",
    `/v1.0/calendar/users/${encodeURIComponent(userUnionId)}/calendars/primary/events?${query.toString()}`,
    null,
    fetchImpl
  );
  const events = (Array.isArray(data.events) ? data.events : []).map(normalizeDingCalendarEvent);
  return {
    events,
    nextToken: data.nextToken || "",
    syncToken: data.syncToken || ""
  };
}

export function extractDingDocNodeId(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/i\/nodes\/([^/?#]+)/);
    if (match?.[1]) return decodeURIComponent(match[1]).trim();
  } catch {}
  const match = raw.match(/\/i\/nodes\/([^/?#\s]+)/);
  if (match?.[1]) return decodeURIComponent(match[1]).trim();
  return /^[a-zA-Z0-9_-]{16,}$/.test(raw) ? raw : "";
}

function textFromDingDocValue(value, lines) {
  if (value == null) return;
  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    if (text && !/^[-\w]{16,}$/.test(text) && !/^https?:\/\//i.test(text)) lines.push(text);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => textFromDingDocValue(item, lines));
    return;
  }
  if (typeof value !== "object") return;
  [
    value.text,
    value.content,
    value.plainText,
    value.markdown,
    value.title,
    value.name
  ].forEach(item => textFromDingDocValue(item, lines));
  [
    value.paragraph,
    value.heading,
    value.bullet,
    value.ordered,
    value.todo,
    value.callout,
    value.quote,
    value.code,
    value.table,
    value.list,
    value.children,
    value.elements,
    value.rows,
    value.cells
  ].forEach(item => textFromDingDocValue(item, lines));
}

export function flattenDingDocBlocks(blocks = []) {
  const lines = [];
  (Array.isArray(blocks) ? blocks : []).forEach(block => textFromDingDocValue(block, lines));
  return [...new Set(lines.map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean))].join("\n");
}

function firstArrayFromDingDocPayload(payload = {}) {
  const root = payload.result || payload;
  for (const path of [
    ["blocks"],
    ["blockList"],
    ["blockElements"],
    ["items"],
    ["list"],
    ["data"],
    ["result", "blocks"],
    ["result", "blockList"],
    ["result", "blockElements"]
  ]) {
    const value = nestedValue(root, path);
    if (Array.isArray(value)) return value;
  }
  return [];
}

function firstDingDocNodeMeta(payload = {}) {
  const root = payload.result || payload;
  const queue = [root];
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== "object") continue;
    const docKey = value.docKey || value.nodeId || value.dentryUuid || value.dentryId || value.id;
    if (docKey) {
      return {
        docKey: String(docKey),
        title: value.title || value.name || value.nodeName || "钉钉文档",
        contentType: value.contentType || value.nodeType || value.type || "",
        extension: value.extension || value.fileExtension || ""
      };
    }
    Object.values(value).forEach(child => {
      if (child && typeof child === "object") queue.push(child);
    });
  }
  return { docKey: "", title: "钉钉文档", contentType: "", extension: "" };
}

export async function queryDingDocNodeByUrl(accessToken, input = {}, fetchImpl = fetch) {
  const operatorId = String(input.operatorUnionId || input.unionId || input.operatorId || "").trim();
  const docUrl = String(input.docUrl || input.url || "").trim();
  if (!operatorId) {
    const err = new Error("缺少当前钉钉账号 unionId，无法读取钉钉文档。");
    err.status = 400;
    throw err;
  }
  if (!docUrl) {
    const err = new Error("请先粘贴钉钉文档链接。");
    err.status = 400;
    throw err;
  }
  const data = await requestDingOpenApi(
    accessToken,
    "POST",
    `/v2.0/wiki/nodes/queryByUrl?operatorId=${encodeURIComponent(operatorId)}`,
    {
      url: docUrl,
      option: {
        withStatisticalInfo: false,
        withPermissionRole: false
      }
    },
    fetchImpl
  );
  return { ...firstDingDocNodeMeta(data), raw: data };
}

export async function queryDingDocTextFromUrl(accessToken, input = {}, fetchImpl = fetch) {
  const operatorId = String(input.operatorUnionId || input.unionId || input.operatorId || "").trim();
  const docUrl = String(input.docUrl || input.url || "").trim();
  if (!operatorId) {
    const err = new Error("缺少当前钉钉账号 unionId，无法读取钉钉文档。");
    err.status = 400;
    throw err;
  }
  if (!/https?:\/\/(ali)?docs?\.dingtalk\./i.test(docUrl)) {
    const err = new Error("请粘贴有效的钉钉文档链接。");
    err.status = 400;
    throw err;
  }
  let node = {
    docKey: extractDingDocNodeId(docUrl),
    title: "钉钉文档",
    contentType: "",
    extension: ""
  };
  if (!node.docKey) node = await queryDingDocNodeByUrl(accessToken, { docUrl, operatorUnionId: operatorId }, fetchImpl);
  if (!node.docKey) {
    const err = new Error("无法从这个钉钉文档链接识别文档 ID。");
    err.status = 400;
    throw err;
  }
  const query = new URLSearchParams({ operatorId });
  const data = await requestDingOpenApi(
    accessToken,
    "GET",
    `/v1.0/doc/suites/documents/${encodeURIComponent(node.docKey)}/blocks?${query.toString()}`,
    null,
    fetchImpl
  );
  const blocks = firstArrayFromDingDocPayload(data);
  const text = flattenDingDocBlocks(blocks);
  if (!text) {
    const err = new Error("钉钉文档没有返回可生成纪要的正文。请确认链接是在线文档，并且当前账号有阅读权限。");
    err.status = 404;
    err.detail = data;
    throw err;
  }
  return {
    title: node.title || "钉钉文档",
    docKey: node.docKey,
    docUrl,
    text,
    raw: data
  };
}

export function buildDingMeetingMinutesQuery(input = {}) {
  const conferenceId = String(input.conferenceId || input.recordingId || input.meetingId || "").trim();
  if (!conferenceId) {
    const err = new Error("需要钉钉会议录制（闪记）的会议 ID，才能同步会议纪要。");
    err.status = 400;
    throw err;
  }
  const query = new URLSearchParams();
  if (input.unionId) query.set("unionId", String(input.unionId));
  if (input.startTime) query.set("startTime", String(input.startTime));
  if (input.direction) query.set("direction", String(input.direction));
  if (input.maxResults) query.set("maxResults", String(input.maxResults));
  if (input.nextToken) query.set("nextToken", String(input.nextToken));
  return { conferenceId, params: query.toString() };
}

function collectDingTranscriptText(payload = {}) {
  const root = payload.result || payload;
  const paragraphs = Array.isArray(root.paragraphList) ? root.paragraphList : [];
  const lines = [];
  const pushText = value => {
    const text = String(value || "").trim();
    if (text) lines.push(text);
  };
  paragraphs.forEach(paragraph => {
    pushText(paragraph.paragraph || paragraph.text);
    const sentences = Array.isArray(paragraph.sentenceList) ? paragraph.sentenceList : [];
    sentences.forEach(sentence => {
      pushText(sentence.sentence || sentence.text);
    });
  });
  const sentences = Array.isArray(root.sentences) ? root.sentences : [];
  sentences.forEach(sentence => {
    pushText(sentence.sentence || sentence.text);
  });
  [
    root.summary,
    root.aiSummary,
    root.meetingSummary,
    root.smartSummary,
    root.minutes,
    root.minute,
    root.conclusion,
    root.decision,
    root.actionItems,
    root.todoList
  ].forEach(value => {
    if (Array.isArray(value)) {
      value.forEach(item => pushText(typeof item === "object" ? item.text || item.content || item.summary || item.title : item));
    } else if (value && typeof value === "object") {
      Object.values(value).forEach(item => pushText(typeof item === "object" ? item.text || item.content || item.summary || item.title : item));
    } else {
      pushText(value);
    }
  });
  return [...new Set(lines)].join("\n");
}

const DING_MINUTES_MCP_ENDPOINT = "https://mcp-gw.dingtalk.com/server/1e798e16a79e82eb7933050fbd58ed3ba8934170efb7c92565e39a1fb1c888e1";

function unwrapDingMcpResult(payload = {}) {
  const root = payload.result || payload;
  if (root.structuredContent && typeof root.structuredContent === "object") return root.structuredContent;
  if (root.content && !Array.isArray(root.content) && typeof root.content === "object") return root.content;
  const blocks = Array.isArray(root.content) ? root.content : [];
  for (const block of blocks) {
    const text = String(block?.text || "").trim();
    if (!text) continue;
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }
  return root;
}

function dingMcpPayloadText(payload = {}) {
  const root = unwrapDingMcpResult(payload);
  const text = collectDingTranscriptText(root);
  if (text) return stripMarkdownImages(text);
  if (typeof root === "string") return stripMarkdownImages(root.trim());
  return stripMarkdownImages(String(root.text || root.content || root.fullSummary || root.summary || root.aiSummary || root.markdown || "").trim());
}

function stripMarkdownImages(text = "") {
  return String(text || "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectStringValues(value, lines = []) {
  if (value == null) return lines;
  if (typeof value === "string" || typeof value === "number") {
    lines.push(String(value));
    return lines;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectStringValues(item, lines));
    return lines;
  }
  if (typeof value === "object") {
    Object.values(value).forEach(item => collectStringValues(item, lines));
  }
  return lines;
}

export function extractDingAiMinutesPosterUrls(payload = {}) {
  const root = unwrapDingMcpResult(payload);
  const urls = [];
  const seen = new Set();
  const addUrl = value => {
    const url = String(value || "").trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };
  collectStringValues(root).forEach(text => {
    for (const match of String(text).matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
      addUrl(match[1]);
    }
    for (const match of String(text).matchAll(/<img[^>]+src=["'](https?:\/\/[^"']+)["']/gi)) {
      addUrl(match[1]);
    }
  });
  return urls;
}

export async function callDingMcpTool(userAccessToken, toolName, args = {}, fetchImpl = fetch) {
  const token = String(userAccessToken || "").trim();
  if (!token) {
    const err = new Error("缺少钉钉用户授权，无法读取 AI 听记。");
    err.status = 401;
    throw err;
  }
  const res = await fetchImpl(DING_MINUTES_MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
      "authorization": `Bearer ${token}`,
      "x-user-access-token": token
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || data.result?.isError) {
    const err = new Error(data.error?.message || data.result?.content?.[0]?.text || "钉钉 AI 听记接口调用失败");
    err.status = res.ok ? 502 : res.status;
    err.detail = data;
    throw err;
  }
  return data;
}

function nestedValue(root, keys = []) {
  let value = root;
  for (const key of keys) {
    if (!value || typeof value !== "object") return undefined;
    value = value[key];
  }
  return value;
}

function firstArrayByKeys(root, paths = []) {
  for (const path of paths) {
    const value = nestedValue(root, path);
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeDingAiMinute(item = {}) {
  const taskUuid = String(item.taskUuid || item.uuid || item.id || item.task_uuid || "").trim();
  if (!taskUuid) return null;
  return {
    taskUuid,
    title: item.title || item.name || item.minutesTitle || item.subject || "AI 听记",
    createTime: item.createTime || item.createdAt || item.startTime || item.startTimeISO || item.beginTime || item.gmtCreate || "",
    startTime: item.startTime || item.startTimeISO || item.beginTime || item.createTime || "",
    endTime: item.endTime || item.endTimeISO || item.finishTime || item.stopTime || "",
    creator: item.creator || item.creatorName || item.ownerName || "",
    raw: item
  };
}

export function extractDingAiMinutesList(payload = {}) {
  const root = unwrapDingMcpResult(payload);
  const items = firstArrayByKeys(root, [
    ["result", "minutesDetails"],
    ["result", "itemList"],
    ["minutesDetails"],
    ["itemList"],
    ["list"],
    ["items"],
    ["data"]
  ]);
  return items.map(normalizeDingAiMinute).filter(Boolean);
}

export async function queryDingAiMinutesList(userAccessToken, input = {}, fetchImpl = fetch) {
  const args = {
    belongingConditionId: input.belongingConditionId || "noLimit",
    maxResults: Math.min(Number(input.maxResults) || 50, 100)
  };
  if (input.keyword) args.keyword = String(input.keyword);
  if (input.nextToken) args.nextToken = String(input.nextToken);
  if (input.createTimeStart) args.createTimeStart = Number(input.createTimeStart);
  if (input.createTimeEnd) args.createTimeEnd = Number(input.createTimeEnd);
  const raw = await callDingMcpTool(userAccessToken, "list_by_keyword_and_time_range", args, fetchImpl);
  return { raw, minutes: extractDingAiMinutesList(raw) };
}

async function queryDingAiMinutesListWithScopeFallback(userAccessToken, input = {}, fetchImpl = fetch) {
  const primary = await queryDingAiMinutesList(userAccessToken, input, fetchImpl);
  if (input.belongingConditionId) return primary;
  if (primary.minutes.length && !input.forceScopeFallback) return primary;
  const byTaskUuid = new Map(primary.minutes.map(minute => [minute.taskUuid, minute]));
  const raw = [primary.raw];
  for (const belongingConditionId of ["created", "shared"]) {
    const scoped = await queryDingAiMinutesList(userAccessToken, { ...input, belongingConditionId }, fetchImpl);
    raw.push(scoped.raw);
    scoped.minutes.forEach(minute => {
      if (!byTaskUuid.has(minute.taskUuid)) byTaskUuid.set(minute.taskUuid, minute);
    });
  }
  return { raw, minutes: [...byTaskUuid.values()] };
}

export async function queryDingAiMinutesText(userAccessToken, input = {}, fetchImpl = fetch) {
  const taskUuid = extractDingAiMinutesTaskUuid(input.taskUuid || input.recordingId || input.minutesId || "");
  if (!taskUuid) {
    const err = new Error("需要 AI 听记 taskUuid，才能读取钉钉 AI 纪要。");
    err.status = 400;
    throw err;
  }
  const summaryRaw = await callDingMcpTool(userAccessToken, "get_minutes_ai_summary", { taskUuid }, fetchImpl);
  const posterUrls = extractDingAiMinutesPosterUrls(summaryRaw);
  let text = dingMcpPayloadText(summaryRaw);
  if (!text) {
    const transcriptRaw = await callDingMcpTool(userAccessToken, "get_minutes_transcription", { taskUuid }, fetchImpl);
    text = dingMcpPayloadText(transcriptRaw);
    const transcriptPosterUrls = extractDingAiMinutesPosterUrls(transcriptRaw);
    const mergedPosterUrls = [...new Set([...posterUrls, ...transcriptPosterUrls])];
    if (text) return { text, raw: { summaryRaw, transcriptRaw }, taskUuid, posterUrl: mergedPosterUrls[0] || "", posterUrls: mergedPosterUrls };
  }
  if (!text) {
    const err = new Error("钉钉 AI 听记没有返回纪要文本。");
    err.status = 404;
    err.detail = summaryRaw;
    throw err;
  }
  return { text, raw: summaryRaw, taskUuid, posterUrl: posterUrls[0] || "", posterUrls };
}

export function extractDingAiMinutesTaskUuid(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const queryUuid = url.searchParams.get("taskUuid");
    if (queryUuid) return queryUuid.trim();
    const match = url.pathname.match(/\/transcribes\/([^/?#]+)/);
    if (match) return decodeURIComponent(match[1]).trim();
  } catch {}
  const queryMatch = raw.match(/[?&]taskUuid=([^&#]+)/);
  if (queryMatch) return decodeURIComponent(queryMatch[1]).trim();
  const pathMatch = raw.match(/\/transcribes\/([^/?#]+)/);
  if (pathMatch) return decodeURIComponent(pathMatch[1]).trim();
  return raw;
}

function eventTimeMs(value) {
  if (value == null || value === "") return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && String(value).trim() !== "") {
    return numeric > 0 && numeric < 10000000000 ? numeric * 1000 : numeric;
  }
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function minuteTimeMs(minute = {}) {
  return eventTimeMs(minute.startTime || minute.createTime || minute.endTime);
}

function tokenScore(a = "", b = "") {
  const source = String(a || "");
  const target = String(b || "");
  if (!source || !target) return 0;
  const normalizedSource = source.replace(/[\s·,，、/|｜:：\-—_（）()【】\[\]{}<>《》]+/g, "");
  const normalizedTarget = target.replace(/[\s·,，、/|｜:：\-—_（）()【】\[\]{}<>《》]+/g, "");
  if (source.includes(target) || target.includes(source) || normalizedSource.includes(normalizedTarget) || normalizedTarget.includes(normalizedSource)) return 4;
  const tokens = [...new Set(source.split(/[\s·,，、/|｜:：-]+/).filter(token => token.length >= 2))];
  const separatedScore = tokens.filter(token => target.includes(token)).length * 2;
  return separatedScore;
}

function matchDingAiMinuteForEvent(event = {}, minutes = []) {
  const eventStart = eventTimeMs(event.startTime);
  const eventEnd = eventTimeMs(event.endTime) || eventStart;
  const eventTitle = event.summary || event.title || "";
  let best = null;
  let bestScore = 0;
  for (const minute of minutes) {
    const time = minuteTimeMs(minute);
    const sameWindow = time && eventStart && time >= eventStart - 12 * 60 * 60 * 1000 && time <= eventEnd + 12 * 60 * 60 * 1000;
    const sameDay = time && eventStart && new Date(time).toDateString() === new Date(eventStart).toDateString();
    const title = tokenScore(eventTitle, minute.title);
    const timeScore = sameWindow ? 3 : (sameDay ? 1 : 0);
    const score = title + timeScore;
    const strongTitleMatch = title >= 4;
    const timedTitleMatch = (sameWindow && title >= 1) || (sameDay && title >= 2);
    if (score > bestScore && (strongTitleMatch || timedTitleMatch)) {
      best = minute;
      bestScore = score;
    }
  }
  return best;
}

export async function queryDingAiMinutesForEvents(userAccessToken, input = {}, fetchImpl = fetch) {
  const events = Array.isArray(input.events) ? input.events : [];
  if (!events.length) return [];
  const starts = events.map(event => eventTimeMs(event.startTime)).filter(Boolean);
  const ends = events.map(event => eventTimeMs(event.endTime)).filter(Boolean);
  const createTimeStart = starts.length ? Math.min(...starts) - 24 * 60 * 60 * 1000 : undefined;
  const createTimeEnd = ends.length ? Math.max(...ends) + 24 * 60 * 60 * 1000 : undefined;
  let { minutes } = await queryDingAiMinutesListWithScopeFallback(userAccessToken, {
    keyword: input.keyword || "",
    createTimeStart,
    createTimeEnd,
    maxResults: input.maxResults || 80
  }, fetchImpl);
  if (input.keyword) {
    const fallback = await queryDingAiMinutesListWithScopeFallback(userAccessToken, {
      createTimeStart,
      createTimeEnd,
      maxResults: input.maxResults || 80
    }, fetchImpl);
    const byTaskUuid = new Map(minutes.map(minute => [minute.taskUuid, minute]));
    fallback.minutes.forEach(minute => {
      if (!byTaskUuid.has(minute.taskUuid)) byTaskUuid.set(minute.taskUuid, minute);
    });
    minutes = [...byTaskUuid.values()];
  }
  const used = new Set();
  const matched = [];
  const matchEvents = async (eventIndexes, sourceMinutes) => {
    for (const index of eventIndexes) {
      const event = events[index];
      const candidates = sourceMinutes.filter(minute => !used.has(minute.taskUuid));
      const minute = matchDingAiMinuteForEvent(event, candidates);
      if (!minute) {
        matched[index] = { ...event, minuteState: event.minuteState || "empty" };
        continue;
      }
      used.add(minute.taskUuid);
      let text = "";
      let posterUrl = "";
      try {
        const result = await queryDingAiMinutesText(userAccessToken, { taskUuid: minute.taskUuid }, fetchImpl);
        text = result.text;
        posterUrl = result.posterUrl || "";
      } catch {
        // Keep the taskUuid visible; users can still retry from the selected meeting.
      }
      matched[index] = {
        ...event,
        minuteState: text ? "ready" : "found",
        minuteText: text,
        minutePosterUrl: posterUrl,
        aiMinutesTaskUuid: minute.taskUuid,
        aiMinutesTitle: minute.title
      };
    }
  };
  await matchEvents(events.map((_, index) => index), minutes);
  const emptyIndexes = matched
    .map((event, index) => event?.minuteState === "empty" ? index : -1)
    .filter(index => index >= 0);
  if (emptyIndexes.length) {
    const loose = await queryDingAiMinutesListWithScopeFallback(userAccessToken, {
      maxResults: input.maxResults || 80,
      forceScopeFallback: true
    }, fetchImpl);
    const byTaskUuid = new Map(minutes.map(minute => [minute.taskUuid, minute]));
    loose.minutes.forEach(minute => {
      if (!byTaskUuid.has(minute.taskUuid)) byTaskUuid.set(minute.taskUuid, minute);
    });
    minutes = [...byTaskUuid.values()];
    await matchEvents(emptyIndexes, minutes);
  }
  return matched;
}

export async function queryDingMeetingMinutesText(accessToken, input = {}, fetchImpl = fetch) {
  const { conferenceId, params } = buildDingMeetingMinutesQuery(input);
  const suffix = params ? `?${params}` : "";
  const data = await requestDingOpenApi(
    accessToken,
    "GET",
    `/v1.0/conference/videoConferences/${encodeURIComponent(conferenceId)}/cloudRecords/getTexts${suffix}`,
    null,
    fetchImpl
  );
  const text = collectDingTranscriptText(data);
  if (!text) {
    const err = new Error("钉钉会议录制没有返回文本内容，请确认会议已开启云录制（闪记）且录制期间有人发言。");
    err.status = 404;
    err.detail = data;
    throw err;
  }
  return { text, raw: data };
}

function isDingCloudRecordMissing(error = {}) {
  const raw = JSON.stringify({
    message: error.message,
    detail: error.detail,
    code: error.code
  });
  return /cloudRecordNotFound|50513|云录制记录未找到|未开启云录制/i.test(raw);
}

export async function queryDingScheduleConferenceHistory(accessToken, input = {}, fetchImpl = fetch) {
  const scheduleConferenceId = String(input.scheduleConferenceId || input.conferenceId || input.recordingId || "").trim();
  if (!scheduleConferenceId) return [];
  const query = new URLSearchParams();
  query.set("maxResults", String(Math.min(Number(input.maxResults) || 20, 100)));
  if (input.nextToken) query.set("nextToken", String(input.nextToken));
  const data = await requestDingOpenApi(
    accessToken,
    "GET",
    `/v1.0/conference/videoConferences/scheduleConferences/${encodeURIComponent(scheduleConferenceId)}?${query.toString()}`,
    null,
    fetchImpl
  );
  return Array.isArray(data.conferenceList) ? data.conferenceList : [];
}

export async function queryDingMeetingMinutesTextWithFallback(accessToken, input = {}, fetchImpl = fetch) {
  try {
    return await queryDingMeetingMinutesText(accessToken, input, fetchImpl);
  } catch (error) {
    if (!isDingCloudRecordMissing(error)) throw error;
    const scheduleConferenceId = input.scheduleConferenceId || input.conferenceId || input.recordingId || "";
    if (!scheduleConferenceId) throw error;
    let history;
    try {
      history = await queryDingScheduleConferenceHistory(accessToken, { scheduleConferenceId }, fetchImpl);
    } catch (historyError) {
      if (/invalidScheduleConferenceId|预约会议id无效/i.test(JSON.stringify(historyError.detail || historyError.message || ""))) throw error;
      throw historyError;
    }
    const candidates = history
      .map(item => item.conferenceId)
      .filter(Boolean)
      .filter(id => id !== scheduleConferenceId);
    for (const candidateId of candidates) {
      try {
        const result = await queryDingMeetingMinutesText(accessToken, {
          ...input,
          conferenceId: candidateId,
          recordingId: candidateId
        }, fetchImpl);
        return {
          ...result,
          resolvedConferenceId: candidateId,
          scheduleConferenceId,
          history
        };
      } catch (candidateError) {
        if (!isDingCloudRecordMissing(candidateError)) throw candidateError;
      }
    }
    throw error;
  }
}

export async function queryDingCloudMinutesForEvents(accessToken, input = {}, fetchImpl = fetch) {
  const events = Array.isArray(input.events) ? input.events : [];
  const checked = [];
  for (const event of events) {
    if (!event?.conferenceId) {
      checked.push({ ...event, minuteState: "empty" });
      continue;
    }
    try {
      const result = await queryDingMeetingMinutesTextWithFallback(accessToken, {
        conferenceId: event.conferenceId,
        recordingId: event.conferenceId,
        scheduleConferenceId: event.conferenceId,
        unionId: input.unionId
      }, fetchImpl);
      checked.push({
        ...event,
        minuteState: "ready",
        minuteText: result.text,
        resolvedConferenceId: result.resolvedConferenceId || event.conferenceId
      });
    } catch (error) {
      const raw = JSON.stringify({ message: error.message, detail: error.detail, code: error.code });
      checked.push({
        ...event,
        minuteState: /Forbidden|AccessDenied|Permission|权限/i.test(raw) ? "permission" : "empty",
        minuteError: error.message || "钉钉会议纪要不可读取"
      });
    }
  }
  return checked;
}

export async function loginWithDingTalk({ authCode, corpId }, env = {}, fetchImpl = fetch) {
  if (!authCode) {
    const err = new Error("缺少钉钉免登授权码 authCode");
    err.status = 400;
    throw err;
  }
  const accessToken = await getDingAccessToken(env, fetchImpl);
  const basic = await getDingUserByCode(accessToken, authCode, fetchImpl);
  const detail = await getDingUserDetail(accessToken, basic.userid, fetchImpl);
  const user = publicUser(basic, detail);
  const role = mapDingRole({ ...basic, ...detail });
  return {
    role,
    user,
    org: { corpId: corpId || "", deptIds: user.deptIds, roles: user.roles }
  };
}

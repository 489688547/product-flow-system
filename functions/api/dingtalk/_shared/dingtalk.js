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
  const { missing } = getDingCredentials(env);
  const normalizedOrigin = String(origin || "").replace(/\/$/, "");
  return {
    configured: missing.length === 0,
    missing,
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
  const result = await postDingTopApi(accessToken, "/topapi/v2/department/listsub", {
    dept_id: Number(rootDeptId) || 1,
    language: "zh_CN"
  }, fetchImpl);
  return Array.isArray(result) ? result : result.list || [];
}

export async function getDingDepartmentUsers(accessToken, deptId, fetchImpl = fetch) {
  const users = [];
  let cursor = 0;
  let hasMore = true;
  while (hasMore) {
    const result = await postDingTopApi(accessToken, "/topapi/v2/user/list", {
      dept_id: Number(deptId),
      cursor,
      size: 100,
      language: "zh_CN"
    }, fetchImpl);
    const list = Array.isArray(result.list) ? result.list : [];
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
  const departments = (await getDingDepartments(accessToken, fetchImpl, options.rootDeptId || 1)).map(dept => ({
    deptId: String(dept.dept_id || dept.deptId || ""),
    parentId: String(dept.parent_id || dept.parentId || "0"),
    name: dept.name || ""
  })).filter(dept => dept.deptId && dept.name);
  const departmentsById = new Map(departments.map(dept => [dept.deptId, dept]));
  const byUserId = new Map();
  for (const dept of departments) {
    const users = await getDingDepartmentUsers(accessToken, dept.deptId, fetchImpl);
    users.forEach(user => {
      const safeUser = publicOrgUser(user, departmentsById);
      if (safeUser.userId) byUserId.set(safeUser.userId, safeUser);
    });
  }
  const syncedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  return {
    version: "org-v1",
    syncedAt,
    expiresAt,
    departments,
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
  paragraphs.forEach(paragraph => {
    const paragraphText = String(paragraph.paragraph || paragraph.text || "").trim();
    if (paragraphText) lines.push(paragraphText);
    const sentences = Array.isArray(paragraph.sentenceList) ? paragraph.sentenceList : [];
    sentences.forEach(sentence => {
      const text = String(sentence.sentence || sentence.text || "").trim();
      if (text) lines.push(text);
    });
  });
  const sentences = Array.isArray(root.sentences) ? root.sentences : [];
  sentences.forEach(sentence => {
    const text = String(sentence.sentence || sentence.text || "").trim();
    if (text) lines.push(text);
  });
  return [...new Set(lines)].join("\n");
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

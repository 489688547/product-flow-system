const GROUP_SEARCH_ENDPOINT = "https://mcp-gw.dingtalk.com/server/450eede6b54d83e030140e66ec77c98a2e89a0869ef4db481f8217a98a42f821";
const GROUP_MEMBERS_ENDPOINT = "https://mcp-gw.dingtalk.com/server/0a1609437385696b77fc4771c3ddaf5656b487f809966c0cc8d4755e7b1d3b74";
const CONTACT_SEARCH_ENDPOINT = "https://mcp-gw.dingtalk.com/server/db4b26cb38ea6a8739ad55d1997fa1da608cd36b33a6cf0f77884f70c49382fe";

function unwrap(payload = {}) {
  const root = payload.result || payload;
  if (root.structuredContent && typeof root.structuredContent === "object") return root.structuredContent;
  if (root.content && !Array.isArray(root.content) && typeof root.content === "object") return root.content;
  if (Array.isArray(root.content)) {
    const text = root.content.find(block => block?.text)?.text;
    if (text) {
      try { return JSON.parse(text); } catch {}
    }
  }
  return root || {};
}

async function callMcp(endpoint, accessToken, toolName, args, fetchImpl = fetch) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
      "x-user-access-token": accessToken
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: args }
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error || payload.result?.isError) {
    const error = new Error(payload.error?.message || payload.result?.content?.[0]?.text || "钉钉群接口调用失败。");
    error.status = response.ok ? 502 : response.status;
    error.detail = payload;
    throw error;
  }
  return payload;
}

export function normalizeGroupSearch(payload = {}) {
  const root = unwrap(payload);
  const result = root.result || root;
  const groups = (Array.isArray(result.groups) ? result.groups : []).map(group => ({
    id: String(group.openConversationId || group.id || ""),
    name: String(group.title || group.name || "钉钉群"),
    memberCount: Number(group.memberCount) || 0,
    ...(group.myRole ? { myRole: String(group.myRole) } : {})
  })).filter(group => group.id);
  return {
    groups,
    nextCursor: String(result.nextCursor || result.cursor || ""),
    hasMore: Boolean(result.hasMore)
  };
}

export function normalizeGroupMembers(payload = {}) {
  const root = unwrap(payload);
  const result = root.result || root;
  const list = Array.isArray(result.list) ? result.list : Array.isArray(result.members) ? result.members : [];
  return {
    members: list.map(member => ({
      name: String(member.memberNick || member.memberGroupNick || member.name || "群成员"),
      openDingTalkId: String(member.openDingtalkId || member.openDingTalkId || "")
    })).filter(member => member.openDingTalkId),
    nextCursor: String(result.nextCursor || ""),
    hasMore: Boolean(result.hasMore)
  };
}

export async function searchDingGroups(accessToken, query, cursor = "0", fetchImpl = fetch) {
  const payload = await callMcp(GROUP_SEARCH_ENDPOINT, accessToken, "search_groups", {
    keyword: String(query || "").trim(),
    cursor: String(cursor || "0"),
    limit: 20
  }, fetchImpl);
  return normalizeGroupSearch(payload);
}

export async function listOwnedDingGroups(accessToken, fetchImpl = fetch) {
  const payload = await callMcp(GROUP_SEARCH_ENDPOINT, accessToken, "list_owned_or_admin_groups", {
    excludeMuted: false,
    limit: 50
  }, fetchImpl);
  return normalizeGroupSearch(payload);
}

export async function loadAllDingGroupMembers(accessToken, groupId, fetchImpl = fetch) {
  const members = [];
  let cursor = "0";
  for (let page = 0; page < 100; page += 1) {
    const payload = await callMcp(GROUP_MEMBERS_ENDPOINT, accessToken, "get_group_members", {
      openconversation_id: groupId,
      cursor
    }, fetchImpl);
    const normalized = normalizeGroupMembers(payload);
    members.push(...normalized.members);
    if (!normalized.hasMore) return members;
    if (!normalized.nextCursor || normalized.nextCursor === cursor) throw new Error("钉钉群成员分页信息不完整，请稍后重试。");
    cursor = normalized.nextCursor;
  }
  throw new Error("钉钉群成员数量过多，未能完整读取。");
}

export async function searchDingContacts(accessToken, keyword, fetchImpl = fetch) {
  const payload = await callMcp(CONTACT_SEARCH_ENDPOINT, accessToken, "search_contact_by_key_word", {
    keyword: String(keyword || "").trim()
  }, fetchImpl);
  const root = unwrap(payload);
  const list = Array.isArray(root.result) ? root.result : Array.isArray(root.result?.result) ? root.result.result : [];
  return list.map(user => ({
    name: String(user.name || user.nick || ""),
    openDingTalkId: String(user.openDingTalkId || user.openDingtalkId || ""),
    userId: String(user.userId || user.userid || "")
  })).filter(user => user.userId);
}

export async function resolveGroupMembers(rawMembers, { corpId, db, searchContact }) {
  const contactsByName = new Map();
  const resolved = [];
  const skippedMembers = [];
  for (const member of rawMembers) {
    let contacts = contactsByName.get(member.name);
    if (!contacts) {
      contacts = await searchContact(member.name);
      contactsByName.set(member.name, contacts);
    }
    const contact = contacts.find(item => item.openDingTalkId === member.openDingTalkId);
    if (!contact?.userId) {
      skippedMembers.push({ name: member.name, reason: "不在当前企业组织架构或身份无法确认" });
      continue;
    }
    const row = await db.prepare(`SELECT user_id, union_id, name, department, title
      FROM product_flow_org_members WHERE corp_id = ? AND user_id = ? AND active = 1`)
      .bind(corpId, contact.userId).first();
    if (!row?.union_id) {
      skippedMembers.push({ name: member.name, reason: "不在当前企业组织架构或身份无法确认" });
      continue;
    }
    resolved.push({
      unionId: String(row.union_id),
      userId: String(row.user_id),
      name: String(row.name),
      department: String(row.department || ""),
      title: String(row.title || "")
    });
  }
  const members = [...new Map(resolved.map(member => [member.unionId, member])).values()];
  return {
    members,
    skippedCount: skippedMembers.length,
    skippedReasons: skippedMembers.length ? [`${skippedMembers.length} 人不在当前企业组织架构或身份无法确认`] : [],
    skippedMembers
  };
}

import { orgUsers } from "./productFlow.js";
export function resolveCurrentUser(account, orgCache) {
  if (!account) return null;
  const dingUser = account.dingUser || {};
  const userIds = [dingUser.userid, dingUser.userId].filter(Boolean).map(String);
  const unionIds = [dingUser.unionid, dingUser.unionId].filter(Boolean).map(String);
  const users = orgUsers(orgCache);
  const matched = users.find(user =>
    userIds.includes(String(user.userid || user.userId || ""))
    || unionIds.includes(String(user.unionid || user.unionId || ""))
    || (dingUser.name && user.name === dingUser.name)
  );
  if (matched) {
    const matchedDepartments = matched.departments || matched.departmentNames || [matched.department].filter(Boolean);
    return {
      ...matched,
      userid: matched.userid || matched.userId || dingUser.userid || dingUser.userId || "",
      unionid: matched.unionid || matched.unionId || dingUser.unionid || dingUser.unionId || "",
      department: matched.department || matchedDepartments[0] || "未分组",
      departments: matchedDepartments,
      role: account.role || matched.role || "readonly",
      source: account.source || "session"
    };
  }

  const departments = dingUser.departmentNames || [dingUser.department].filter(Boolean);
  return {
    userid: dingUser.userid || dingUser.userId || dingUser.name || "session-user",
    unionid: dingUser.unionid || dingUser.unionId || "",
    name: dingUser.name || account.name || "当前账号",
    title: dingUser.title || account.title || "成员",
    department: departments[0] || "未分组",
    departments,
    role: account.role || "readonly",
    source: account.source || "session"
  };
}

export function ensureCurrentUserInOrgCache(orgCache = {}, currentUser) {
  if (!currentUser?.name) return orgCache;
  const users = Array.isArray(orgCache.users) ? orgCache.users : [];
  const exists = users.some(user =>
    (currentUser.userid && String(user.userid || user.userId || "") === String(currentUser.userid))
    || (currentUser.unionid && String(user.unionid || user.unionId || "") === String(currentUser.unionid))
    || user.name === currentUser.name
  );
  return exists ? orgCache : { ...orgCache, users: [currentUser, ...users] };
}

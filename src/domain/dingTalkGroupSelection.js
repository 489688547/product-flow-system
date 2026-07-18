function normalizedUser(user = {}) {
  const unionid = String(user.unionid || user.unionId || "").trim();
  return { ...user, unionid };
}

export function initialExecutorSelection(users = [], selectedUnionIds = []) {
  const selected = new Set(selectedUnionIds.map(String));
  const people = {};
  users.map(normalizedUser).filter(user => user.unionid && selected.has(user.unionid)).forEach(user => {
    people[user.unionid] = { user, manual: true, groupIds: [] };
  });
  return { people, groups: {}, excludedUnionIds: [] };
}

export function toggleManualExecutor(state, rawUser) {
  const user = normalizedUser(rawUser);
  if (!user.unionid) return state;
  const current = state.people[user.unionid];
  const people = { ...state.people };
  if (current?.manual) {
    if (current.groupIds.length) people[user.unionid] = { ...current, manual: false };
    else delete people[user.unionid];
  } else {
    people[user.unionid] = { user: current?.user || user, manual: true, groupIds: current?.groupIds || [] };
  }
  return { ...state, people, excludedUnionIds: state.excludedUnionIds.filter(id => id !== user.unionid) };
}

export function addGroupExecutors(state, group, members = [], details = {}) {
  const id = String(group.id || "");
  if (!id) return state;
  const excluded = new Set(state.excludedUnionIds);
  const people = { ...state.people };
  members.forEach(raw => {
    const user = normalizedUser(raw);
    if (!user.unionid || excluded.has(user.unionid)) return;
    const current = people[user.unionid];
    people[user.unionid] = {
      user: current?.user || user,
      manual: Boolean(current?.manual),
      groupIds: [...new Set([...(current?.groupIds || []), id])].sort()
    };
  });
  return {
    ...state,
    people,
    groups: { ...state.groups, [id]: { ...group, ...details, id } }
  };
}

export function removeGroupExecutors(state, groupId) {
  const id = String(groupId || "");
  const groups = { ...state.groups };
  delete groups[id];
  const people = {};
  Object.entries(state.people).forEach(([unionId, person]) => {
    const groupIds = person.groupIds.filter(value => value !== id);
    if (person.manual || groupIds.length) people[unionId] = { ...person, groupIds };
  });
  return { ...state, groups, people };
}

export function excludeExecutor(state, unionId) {
  const id = String(unionId || "");
  if (!id) return state;
  const people = { ...state.people };
  delete people[id];
  return { ...state, people, excludedUnionIds: [...new Set([...state.excludedUnionIds, id])] };
}

export function selectedExecutorUsers(state) {
  return Object.values(state.people).map(person => normalizedUser(person.user));
}

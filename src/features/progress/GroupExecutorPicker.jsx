import { Check, MessagesSquare, Search, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addGroupExecutors,
  excludeExecutor,
  removeGroupExecutors,
  selectedExecutorUsers,
  toggleManualExecutor
} from "../../domain/dingTalkGroupSelection.js";
import { loadDingTalkGroupMembers, searchDingTalkGroups } from "../../domain/dingTalkGroups.js";

export function GroupExecutorPicker({ users, selection, onChange, disabled = false }) {
  const [mode, setMode] = useState("people");
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingGroupId, setLoadingGroupId] = useState("");
  const [error, setError] = useState(null);
  const requestId = useRef(0);
  const selectedUsers = selectedExecutorUsers(selection);

  const filteredUsers = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return users.filter(user => !keyword || `${user.name} ${user.department} ${user.title}`.toLowerCase().includes(keyword));
  }, [query, users]);

  useEffect(() => {
    const current = ++requestId.current;
    if (mode !== "groups" || !query.trim()) {
      setGroups([]);
      setSearching(false);
      setError(null);
      return undefined;
    }
    setSearching(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const result = await searchDingTalkGroups(query.trim());
        if (current === requestId.current) setGroups(result.groups || []);
      } catch (nextError) {
        if (current === requestId.current) setError(nextError);
      } finally {
        if (current === requestId.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mode, query]);

  const selectGroup = async group => {
    setLoadingGroupId(group.id);
    setError(null);
    try {
      const result = await loadDingTalkGroupMembers(group.id);
      onChange(current => addGroupExecutors(current, group, result.members || [], {
        skippedCount: result.skippedCount || 0,
        skippedReasons: result.skippedReasons || []
      }));
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoadingGroupId("");
    }
  };

  return (
    <div className="todo-executor-picker">
      <div className="todo-executor-modes" aria-label="执行人选择方式">
        <button type="button" aria-pressed={mode === "people"} onClick={() => { setMode("people"); setQuery(""); }}><Users size={15} />按人员</button>
        <button type="button" aria-pressed={mode === "groups"} onClick={() => { setMode("groups"); setQuery(""); }}><MessagesSquare size={15} />按群聊</button>
      </div>

      <label className="meeting-attendee-search">
        <span>{mode === "people" ? "执行人" : "钉钉群"}</span>
        <div><Search size={15} /><input disabled={disabled} value={query} onChange={event => setQuery(event.target.value)} placeholder={mode === "people" ? "搜索姓名、部门或岗位" : "搜索群名称"} /></div>
      </label>

      {mode === "people" ? (
        <div className="meeting-attendee-list">
          {filteredUsers.map(user => {
            const selected = Boolean(selection.people[user.unionid]?.manual);
            return <button key={user.userid || user.name} type="button" disabled={disabled || !user.unionid} className={selected ? "selected" : ""} onClick={() => onChange(toggleManualExecutor(selection, user))}>
              <span className="meeting-attendee-avatar">{user.name.slice(0, 1)}</span>
              <span><strong>{user.name}</strong><small>{user.department} / {user.title}{!user.unionid ? " · 缺少钉钉身份" : ""}</small></span>
              <span className="meeting-attendee-check">{selected ? <Check size={14} /> : null}</span>
            </button>;
          })}
        </div>
      ) : (
        <div className="todo-group-results" aria-live="polite">
          {!query.trim() ? <p>输入群名称，选择后会把群内可识别的企业成员带入执行人。</p> : null}
          {searching ? <p>正在搜索钉钉群…</p> : null}
          {!searching && query.trim() && !groups.length && !error ? <p>没有找到匹配的群聊。</p> : null}
          {groups.map(group => {
            const added = Boolean(selection.groups[group.id]);
            return <button key={group.id} type="button" disabled={disabled || added || loadingGroupId === group.id} onClick={() => selectGroup(group)}>
              <span><MessagesSquare size={16} /></span>
              <span><strong>{group.name}</strong><small>{group.memberCount ? `${group.memberCount} 名成员` : "成员数由钉钉返回"}</small></span>
              <span>{loadingGroupId === group.id ? "读取中…" : added ? "已添加" : "选择"}</span>
            </button>;
          })}
        </div>
      )}

      {error ? <div className="todo-group-error" role="alert"><span>{error.message}</span>{error.authorizeUrl ? <a href={error.authorizeUrl}>重新授权</a> : null}</div> : null}

      {Object.values(selection.groups).length ? <div className="todo-selected-groups">
        {Object.values(selection.groups).map(group => <span key={group.id}>{group.name}{group.skippedCount ? ` · 跳过 ${group.skippedCount} 人` : ""}<button type="button" aria-label={`移除群 ${group.name}`} onClick={() => onChange(removeGroupExecutors(selection, group.id))}><X size={13} /></button></span>)}
      </div> : null}

      <div className="meeting-attendee-summary">已选 {selectedUsers.length} 人{Object.values(selection.groups).length ? ` · 从 ${Object.values(selection.groups).length} 个群带入` : " · 使用登录时缓存的组织架构"}</div>
      {selectedUsers.length ? <div className="todo-selected-people">
        {selectedUsers.map(user => <span key={user.unionid}>{user.name}<button type="button" aria-label={`移除执行人 ${user.name}`} onClick={() => onChange(excludeExecutor(selection, user.unionid))}><X size={12} /></button></span>)}
      </div> : null}
    </div>
  );
}

import { Check, Search, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { orgUsers } from "../../domain/productFlow.js";
import { normalizeTaskDueDate, todoSyncStatus } from "../../domain/taskTodo.js";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";

function TodoLoading() {
  return createPortal(
    <div className="meeting-loading-layer" role="status" aria-live="assertive">
      <div className="meeting-loading-card"><span className="loading-spinner" />正在同步到钉钉待办…</div>
    </div>,
    document.body
  );
}

export function TodoSyncModal({ open, task, product, orgCache, onClose, onSync }) {
  const users = useMemo(() => orgUsers(orgCache), [orgCache]);
  const [query, setQuery] = useState("");
  const [selectedUnionIds, setSelectedUnionIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedUnionIds(task?.dingTodo?.executorUnionIds || []);
    setQuery("");
    setError("");
  }, [open, task?.id, task?.dingTodo?.syncedAt]);

  const filteredUsers = users.filter(user => {
    const text = `${user.name} ${user.department} ${user.title}`.toLowerCase();
    return !query.trim() || text.includes(query.trim().toLowerCase());
  });
  const selectedUsers = users.filter(user => selectedUnionIds.includes(user.unionid));
  const toggleUser = user => {
    if (!user.unionid) return;
    setSelectedUnionIds(current => current.includes(user.unionid)
      ? current.filter(id => id !== user.unionid)
      : [...current, user.unionid]);
  };
  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      await onSync({ executors: selectedUsers });
      onClose();
    } catch (syncError) {
      setError(syncError.message || "钉钉待办同步失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };
  const status = task ? todoSyncStatus(task) : "未同步";
  const normalizedDue = normalizeTaskDueDate(task?.due);
  const submitDisabledReason = submitting ? "正在同步，请稍候" : !normalizedDue ? "请先设置任务截止日期" : !selectedUsers.length ? "请至少选择一名执行人" : "";

  return (
    <>
      <Modal
        open={open}
        title={task?.dingTodo?.id ? "更新钉钉待办" : "同步到钉钉待办"}
        size="small"
        onClose={() => !submitting && onClose()}
        footer={<><Button disabled={submitting} disabledReason="正在同步，请稍候" onClick={onClose}>取消</Button><Button variant="primary" disabled={Boolean(submitDisabledReason)} disabledReason={submitDisabledReason} onClick={submit}><Send size={16} />{task?.dingTodo?.id ? "更新待办" : "发送待办"}</Button></>}
      >
        <div className="meeting-context todo-context">
          <strong>{task?.title || "产品任务"}</strong>
          <span>{product?.name} · {task?.ownerDept || "待确定责任部门"} · 截止 {normalizedDue || "未设置"}</span>
          <span>当前状态：<b className={`todo-status-text status-${status}`}>{status}</b></span>
        </div>
        <label className="meeting-attendee-search"><span>执行人</span><div><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索姓名、部门或岗位" /></div></label>
        <div className="meeting-attendee-summary">已选 {selectedUsers.length} 人 · 使用登录时缓存的组织架构</div>
        <div className="meeting-attendee-list">
          {filteredUsers.map(user => {
            const selected = selectedUnionIds.includes(user.unionid);
            return (
              <button key={user.userid || user.name} type="button" disabled={!user.unionid} title={!user.unionid ? "该成员缺少钉钉身份，不能接收待办" : undefined} className={selected ? "selected" : ""} onClick={() => toggleUser(user)}>
                <span className="meeting-attendee-avatar">{user.name.slice(0, 1)}</span>
                <span><strong>{user.name}</strong><small>{user.department} / {user.title}{!user.unionid ? " · 缺少钉钉身份" : ""}</small></span>
                <span className="meeting-attendee-check">{selected ? <Check size={14} /> : null}</span>
              </button>
            );
          })}
        </div>
        {!normalizedDue ? <div className="form-error" role="alert">请先关闭弹窗，为任务设置有效的截止日期。</div> : null}
        {error ? <div className="form-error" role="alert">{error}</div> : null}
      </Modal>
      {submitting ? <TodoLoading /> : null}
    </>
  );
}

import { Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { orgUsers } from "../../domain/productFlow.js";
import { normalizeTaskDueDate, todoSyncStatus } from "../../domain/taskTodo.js";
import { initialExecutorSelection, selectedExecutorUsers } from "../../domain/dingTalkGroupSelection.js";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { GroupExecutorPicker } from "./GroupExecutorPicker.jsx";

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
  const [selection, setSelection] = useState(() => initialExecutorSelection([], []));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelection(initialExecutorSelection(users, task?.dingTodo?.executorUnionIds || []));
    setError("");
  }, [open, task?.id, task?.dingTodo?.syncedAt]);

  const selectedUsers = selectedExecutorUsers(selection);
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
        <GroupExecutorPicker users={users} selection={selection} onChange={setSelection} disabled={submitting} />
        {!normalizedDue ? <div className="form-error" role="alert">请先关闭弹窗，为任务设置有效的截止日期。</div> : null}
        {error ? <div className="form-error" role="alert">{error}</div> : null}
      </Modal>
      {submitting ? <TodoLoading /> : null}
    </>
  );
}

import { Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createTodoComposerDraft, todoRichTextToPlainText } from "../../domain/dingTalk.js";
import { orgUsers } from "../../domain/productFlow.js";
import { normalizeTaskDueDate, todoSyncStatus } from "../../domain/taskTodo.js";
import { hydrateSavedExecutors, initialExecutorSelection, selectedExecutorUsers } from "../../domain/dingTalkGroupSelection.js";
import { Button } from "../../ui/Button.jsx";
import { FullScreenLoading } from "../../ui/FullScreenLoading.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { GroupExecutorPicker } from "./GroupExecutorPicker.jsx";
import { TodoComposerFields } from "./TodoComposerFields.jsx";
import { TodoPreview } from "./TodoPreview.jsx";

export function TodoSyncModal({ open, task, product, orgCache, onClose, onSync }) {
  const users = useMemo(() => orgUsers(orgCache), [orgCache]);
  const [selection, setSelection] = useState(() => initialExecutorSelection([], []));
  const [draft, setDraft] = useState(() => createTodoComposerDraft({ product, task }));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const savedExecutorUnionIds = task?.dingTodo?.executorUnionIds || [];
  const savedExecutorKey = savedExecutorUnionIds.join("|");

  useEffect(() => {
    if (!open) return;
    setSelection(initialExecutorSelection(users, savedExecutorUnionIds));
    setDraft(createTodoComposerDraft({ product, task }));
    setError("");
  }, [open, task?.id, task?.dingTodo?.syncedAt, product?.id]);

  useEffect(() => {
    if (!open || !savedExecutorUnionIds.length) return;
    setSelection(current => hydrateSavedExecutors(current, users, savedExecutorUnionIds));
  }, [open, savedExecutorKey, users]);

  const selectedUsers = selectedExecutorUsers(selection);
  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      await onSync({ executors: selectedUsers, draft });
      onClose();
    } catch (syncError) {
      setError(syncError.message || "钉钉待办同步失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };
  const status = task ? todoSyncStatus(task) : "未同步";
  const validDate = normalizeTaskDueDate(draft.dueDate);
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.dueClock);
  const submitDisabledReason = submitting
    ? "正在同步，请稍候"
    : !draft.subject.trim()
      ? "请填写待办标题"
      : !todoRichTextToPlainText(draft.descriptionHtml)
        ? "请填写待办正文"
        : !validDate || !validTime
          ? "请设置有效的截止日期和时间"
          : !selectedUsers.length
            ? "请至少选择一名执行人"
            : "";

  return (
    <>
      <Modal
        open={open}
        title={task?.dingTodo?.id ? "更新钉钉待办" : "同步到钉钉待办"}
        onClose={() => !submitting && onClose()}
        footer={<><Button disabled={submitting} disabledReason="正在同步，请稍候" onClick={onClose}>取消</Button><Button variant="primary" disabled={Boolean(submitDisabledReason)} disabledReason={submitDisabledReason} onClick={submit}><Send size={16} />{task?.dingTodo?.id ? "更新待办" : "发送待办"}</Button></>}
      >
        <div className="meeting-context todo-context">
          <strong>{product?.name || "产品任务"}</strong>
          <span>{task?.ownerDept || "待确定责任部门"} · 当前状态：<b className={`todo-status-text status-${status}`}>{status}</b></span>
        </div>
        <TodoComposerFields draft={draft} onChange={setDraft} disabled={submitting} />
        <GroupExecutorPicker users={users} selection={selection} onChange={setSelection} disabled={submitting} />
        <TodoPreview draft={draft} executors={selectedUsers} />
        {error ? <div className="form-error" role="alert">{error}</div> : null}
      </Modal>
      <FullScreenLoading visible={submitting} message="正在同步到钉钉待办…" />
    </>
  );
}

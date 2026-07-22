import { CalendarPlus, Check, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { orgUsers } from "../../domain/productFlow.js";
import { Button } from "../../ui/Button.jsx";
import { FullScreenLoading } from "../../ui/FullScreenLoading.jsx";
import { Modal } from "../../ui/Modal.jsx";

function localDateTime(date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function defaultMeetingTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60_000);
  return { startTime: localDateTime(start), endTime: localDateTime(end) };
}

export function MeetingScheduleModal({ open, task, product, currentUser, orgCache, onClose, onSchedule }) {
  const users = useMemo(() => orgUsers(orgCache), [orgCache]);
  const [query, setQuery] = useState("");
  const [selectedUnionIds, setSelectedUnionIds] = useState([]);
  const [times, setTimes] = useState(defaultMeetingTimes);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const defaults = defaultMeetingTimes();
    const organizerUnionId = currentUser?.unionid || currentUser?.unionId || "";
    setTimes(defaults);
    setSelectedUnionIds(organizerUnionId ? [organizerUnionId] : []);
    setQuery("");
    setError("");
  }, [currentUser?.unionid, currentUser?.unionId, open, task?.id]);

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
      await onSchedule({ startTime: times.startTime, endTime: times.endTime, attendees: selectedUsers });
      onClose();
    } catch (scheduleError) {
      setError(scheduleError.message || "钉钉日程创建失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  };
  const submitDisabledReason = submitting ? "正在同步，请稍候" : !selectedUsers.length ? "请至少选择一名参会人" : "";

  return (
    <>
      <Modal
        open={open}
        title="预约钉钉会议"
        size="small"
        onClose={() => !submitting && onClose()}
        footer={<><Button disabled={submitting} disabledReason="正在同步，请稍候" onClick={onClose}>取消</Button><Button variant="primary" disabled={Boolean(submitDisabledReason)} disabledReason={submitDisabledReason} onClick={submit}><CalendarPlus size={16} />同步到钉钉日程</Button></>}
      >
        <div className="meeting-context">
          <strong>{task?.title || "会议任务"}</strong>
          <span>{product?.name} · {task?.ownerDept || "待确定责任部门"}</span>
        </div>
        <div className="meeting-time-grid">
          <label>开始时间<input type="datetime-local" value={times.startTime} onChange={event => setTimes(current => ({ ...current, startTime: event.target.value }))} /></label>
          <label>结束时间<input type="datetime-local" value={times.endTime} onChange={event => setTimes(current => ({ ...current, endTime: event.target.value }))} /></label>
        </div>
        <label className="meeting-attendee-search"><span>参会人</span><div><Search size={15} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索姓名、部门或岗位" /></div></label>
        <div className="meeting-attendee-summary">已选 {selectedUsers.length} 人 · 使用登录时缓存的组织架构</div>
        <div className="meeting-attendee-list">
          {filteredUsers.map(user => {
            const selected = selectedUnionIds.includes(user.unionid);
            return (
              <button key={user.userid || user.name} type="button" disabled={!user.unionid} title={!user.unionid ? "该成员缺少钉钉身份，不能加入日程" : undefined} className={selected ? "selected" : ""} onClick={() => toggleUser(user)}>
                <span className="meeting-attendee-avatar">{user.name.slice(0, 1)}</span>
                <span><strong>{user.name}</strong><small>{user.department} / {user.title}{!user.unionid ? " · 缺少钉钉身份" : ""}</small></span>
                <span className="meeting-attendee-check">{selected ? <Check size={14} /> : null}</span>
              </button>
            );
          })}
        </div>
        {error ? <div className="form-error" role="alert">{error}</div> : null}
      </Modal>
      <FullScreenLoading visible={submitting} message="正在同步到钉钉日程…" />
    </>
  );
}

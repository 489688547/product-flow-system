import { DatePickerField } from "../../ui/DatePickerField.jsx";
import { RichTextEditor } from "../../ui/RichTextEditor.jsx";

export function TodoComposerFields({ draft, onChange, disabled = false }) {
  const update = patch => onChange(current => ({ ...current, ...patch }));
  return (
    <div className="todo-composer-fields">
      <label className="todo-composer-title">
        <span>待办标题</span>
        <input data-autofocus disabled={disabled} maxLength={1024} value={draft.subject} onChange={event => update({ subject: event.target.value })} placeholder="填写清晰、可执行的待办标题" />
      </label>
      <label>
        <span>优先级</span>
        <select disabled={disabled} value={draft.priority} onChange={event => update({ priority: Number(event.target.value) })}>
          <option value={10}>较低</option>
          <option value={20}>普通</option>
          <option value={30}>较高</option>
          <option value={40}>紧急</option>
        </select>
      </label>
      <div className="todo-composer-deadline">
        <span>截止时间</span>
        <div>
          <DatePickerField disabled={disabled} ariaLabel="选择待办截止日期" value={draft.dueDate} onChange={dueDate => update({ dueDate })} />
          <input disabled={disabled} aria-label="待办截止时间" type="time" value={draft.dueClock} onChange={event => update({ dueClock: event.target.value })} />
        </div>
      </div>
      <label className="todo-composer-body">
        <span>正文</span>
        <RichTextEditor compact allowImages={false} disabled={disabled} value={draft.descriptionHtml} onChange={descriptionHtml => update({ descriptionHtml })} placeholder="说明目标、要求和相关链接" />
      </label>
    </div>
  );
}

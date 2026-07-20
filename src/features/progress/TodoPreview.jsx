import { Flag } from "lucide-react";
import { todoRichTextToPlainText } from "../../domain/dingTalk.js";

const priorityLabels = { 10: "较低", 20: "普通", 30: "较高", 40: "紧急" };

export function TodoPreview({ draft, executors = [] }) {
  const description = todoRichTextToPlainText(draft.descriptionHtml);
  return (
    <section className="todo-preview" aria-label="钉钉待办发送预览" aria-live="polite">
      <div className="todo-preview-heading"><span>发送预览</span><small>钉钉端将显示以下核心信息</small></div>
      <strong>{draft.subject || "未填写标题"}</strong>
      <p>{description || "未填写正文"}</p>
      <div><span>{executors.length ? executors.map(user => user.name).join("、") : "未选择执行人"}</span><span>{draft.dueDate || "未设置日期"} {draft.dueClock || ""}</span><span><Flag size={13} />{priorityLabels[draft.priority] || "普通"}</span></div>
    </section>
  );
}

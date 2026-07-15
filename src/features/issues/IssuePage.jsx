import { ImagePlus, Send } from "lucide-react";
import { useState } from "react";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";

export function IssuePage() {
  const { state, addFeedbackIssue } = useProductFlow();
  const [desc, setDesc] = useState("");
  const [screenshot, setScreenshot] = useState("");

  function readScreenshot(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result);
    reader.readAsDataURL(file);
  }

  function submit() {
    if (!desc.trim() || !screenshot) return;
    addFeedbackIssue({ desc, screenshot, reporter: "本地测试账号" });
    setDesc("");
    setScreenshot("");
  }

  return (
    <section className="page">
      <PageHeader title="问题反馈" description="收集团队使用中的 BUG 和优化建议，由总经办统一处理。" />
      <div className="feedback-grid">
        <section className="section-panel">
          <h2>提交问题</h2>
          <label className="full-field">问题描述<textarea name="issue-page-description" autoComplete="off" value={desc} onChange={event => setDesc(event.target.value)} placeholder="描述哪里不好用、预期是什么、实际发生了什么…" /></label>
          <label className="upload-field"><ImagePlus size={18} />截图<input type="file" accept="image/*" onChange={event => readScreenshot(event.target.files?.[0])} /></label>
          {screenshot ? <img className="issue-preview" src={screenshot} alt="待提交的问题截图" width="260" height="180" /> : null}
          <Button data-testid="issue-submit" variant="primary" disabled={!desc.trim() || !screenshot} disabledReason="问题描述和截图都必须填写" onClick={submit}><Send size={16} />提交问题</Button>
        </section>
        <section className="section-panel">
          <h2>问题列表</h2>
          {(state.feedbackIssues || []).map(issue => <article className="issue-row" key={issue.id}><div><strong>{issue.desc}</strong><span>{issue.reporter} · {issue.created}</span></div><span className="badge">{issue.status}</span>{issue.screenshot ? <img src={issue.screenshot} alt="问题截图" width="240" height="160" loading="lazy" /> : null}</article>)}
          {!state.feedbackIssues?.length ? <div className="empty-state">暂无问题记录。</div> : null}
        </section>
      </div>
    </section>
  );
}

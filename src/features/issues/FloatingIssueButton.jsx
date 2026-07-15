import { ImagePlus, MessageCircleQuestion, Send } from "lucide-react";
import { useState } from "react";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";

export function FloatingIssueButton() {
  const { addFeedbackIssue } = useProductFlow();
  const [open, setOpen] = useState(false);
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
    setOpen(false);
  }

  return (
    <>
      <button data-testid="floating-issue-button" className="floating-issue-button" onClick={() => setOpen(true)}>
        <MessageCircleQuestion size={18} aria-hidden="true" />
        <span>提出问题</span>
      </button>
      <Modal
        open={open}
        title="提出问题"
        size="small"
        onClose={() => setOpen(false)}
        footer={<><Button onClick={() => setOpen(false)}>取消</Button><Button data-testid="floating-issue-submit" variant="primary" disabled={!desc.trim() || !screenshot} onClick={submit}><Send size={16} />提交问题</Button></>}
      >
        <label className="full-field">问题描述<textarea name="issue-description" autoComplete="off" value={desc} onChange={event => setDesc(event.target.value)} placeholder="描述哪里不好用、预期是什么、实际发生了什么…" /></label>
        <label className="upload-field"><ImagePlus size={18} />截图<input type="file" accept="image/*" onChange={event => readScreenshot(event.target.files?.[0])} /></label>
        {screenshot ? <img className="issue-preview" src={screenshot} alt="待提交的问题截图" width="260" height="180" /> : null}
      </Modal>
    </>
  );
}

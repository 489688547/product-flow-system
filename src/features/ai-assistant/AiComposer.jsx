import { useEffect, useRef, useState } from "react";
import { Send, Square } from "lucide-react";
import { Button } from "../../ui/Button.jsx";

export function AiComposer({ sending, disabled = false, onSend, onStop, autoFocus = false, idSuffix = "default" }) {
  const [value, setValue] = useState("");
  const textareaRef = useRef(null);
  const submit = () => {
    const content = value.trim();
    if (!content || sending || disabled) return;
    onSend(content);
    setValue("");
  };

  useEffect(() => {
    if (autoFocus && !disabled) textareaRef.current?.focus();
  }, [autoFocus, disabled]);

  return (
    <div className="ai-assistant-composer">
      <label htmlFor={`ai-assistant-question-${idSuffix}`}>向公司 AI 总助提问</label>
      <textarea
        ref={textareaRef}
        id={`ai-assistant-question-${idSuffix}`}
        value={value}
        rows={3}
        maxLength={4000}
        disabled={disabled}
        placeholder={disabled ? "模型服务未就绪" : "例如：今天公司最需要关注的三个风险是什么？"}
        onChange={event => setValue(event.target.value)}
        onKeyDown={event => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />
      <div className="ai-composer-actions">
        <span>⌘ / Ctrl + Enter 发送 · 最多 4,000 字</span>
        {sending ? (
          <Button className="compact" onClick={onStop}><Square size={14} aria-hidden="true" />停止</Button>
        ) : (
          <Button variant="primary" className="compact" disabled={disabled || !value.trim()} onClick={submit}><Send size={14} aria-hidden="true" />发送</Button>
        )}
      </div>
    </div>
  );
}

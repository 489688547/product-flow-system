import { Sparkles } from "lucide-react";
import { useAiAssistant } from "../../state/AiAssistantProvider.jsx";

export function AiAssistantTrigger({ triggerRef }) {
  const { status, panelOpen, open } = useAiAssistant();
  if (!status.enabled) return null;
  return (
    <button
      ref={triggerRef}
      className="ai-assistant-trigger"
      type="button"
      aria-expanded={panelOpen}
      aria-controls="company-ai-assistant-panel"
      onClick={open}
    >
      <Sparkles size={16} aria-hidden="true" />
      <span>AI 总助</span>
      <i className={status.ready ? "ready" : "pending"} aria-label={status.ready ? "服务可用" : "服务未就绪"} />
    </button>
  );
}

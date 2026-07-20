import { useEffect, useRef } from "react";
import { Expand, RotateCcw, X } from "lucide-react";
import { IconAction } from "../../ui/Button.jsx";
import { useAiAssistant } from "../../state/AiAssistantProvider.jsx";
import { AiConversation } from "./AiConversation.jsx";
import { AiComposer } from "./AiComposer.jsx";

export function AiAssistantPanel({ active = true, triggerRef, appHint }) {
  const { status, panelOpen, messages, sending, error, close, send, stop, retry, clear } = useAiAssistant();
  const headingRef = useRef(null);

  useEffect(() => {
    if (!active && panelOpen) close();
  }, [active, close, panelOpen]);

  useEffect(() => {
    if (!panelOpen) return undefined;
    headingRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, panelOpen, triggerRef]);

  if (!active || !panelOpen) return null;
  const closePanel = () => {
    close();
    triggerRef.current?.focus();
  };
  const openWorkspace = () => {
    close();
    window.location.hash = "#ai-assistant";
  };

  return (
    <>
      <button className="ai-assistant-scrim" type="button" aria-label="关闭 AI 总助" onClick={closePanel} />
      <aside id="company-ai-assistant-panel" className="ai-assistant-panel" aria-label="公司 AI 总助">
        <header className="ai-assistant-panel-head">
          <div>
            <h2 ref={headingRef} tabIndex="-1">公司 AI 总助</h2>
            <span className={status.ready ? "ready" : "pending"}>{status.ready ? "模型服务可用" : "模型服务未就绪"}</span>
          </div>
          <div className="ai-panel-actions">
            <IconAction label="打开完整工作台" onClick={openWorkspace}><Expand size={16} aria-hidden="true" /></IconAction>
            <IconAction label="清空当前会话" disabled={!messages.length} onClick={clear}><RotateCcw size={16} aria-hidden="true" /></IconAction>
            <IconAction label="关闭 AI 总助" onClick={closePanel}><X size={17} aria-hidden="true" /></IconAction>
          </div>
        </header>
        {!status.ready ? (
          <div className="ai-assistant-not-ready" role="status">
            <strong>{status.loading ? "正在检查模型服务…" : "AI 总助暂未就绪"}</strong>
            <p>需要总经办在数据中心确认服务端密钥、启用状态和合成连接测试。</p>
          </div>
        ) : null}
        <AiConversation messages={messages} sending={sending} error={error} onPrompt={prompt => send(prompt, appHint)} onRetry={() => retry(appHint)} />
        <AiComposer sending={sending} disabled={!status.ready} onSend={content => send(content, appHint)} onStop={stop} autoFocus={status.ready} idSuffix="panel" />
      </aside>
    </>
  );
}

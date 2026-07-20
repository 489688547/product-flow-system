import { ShieldCheck, Sparkles } from "lucide-react";
import { useAiAssistant } from "../../state/AiAssistantProvider.jsx";
import { AiConversation } from "./AiConversation.jsx";
import { AiComposer } from "./AiComposer.jsx";

export function AiAssistantWorkspace({ appHint }) {
  const { status, messages, sending, error, send, stop, retry } = useAiAssistant();
  return (
    <section className="page ai-assistant-workspace">
      <header className="page-header">
        <div className="page-header-copy">
          <h1>公司 AI 总助</h1>
          <p>跨 App 读取你有权查看的数据，提供只读分析、判断和建议。</p>
        </div>
        <span className={`ai-workspace-status ${status.ready ? "ready" : "pending"}`}><Sparkles size={15} aria-hidden="true" />{status.ready ? "服务可用" : "服务未就绪"}</span>
      </header>
      <div className="ai-assistant-workspace-shell">
        <aside className="ai-workspace-policy" aria-label="AI 数据边界">
          <h2>本次数据边界</h2>
          <dl>
            <div><dt>可用数据域</dt><dd>{status.allowedDomains?.length || 0} 个</dd></div>
            <div><dt>第三方模型</dt><dd>{status.provider?.displayName || "未配置"}</dd></div>
            <div><dt>回答留存</dt><dd>store=false</dd></div>
          </dl>
          <p><ShieldCheck size={15} aria-hidden="true" />未纳入成本、利润、预算、结算和奖金数据。</p>
          <small>只提供分析和建议，不会修改数据或执行外部动作。</small>
        </aside>
        <div className="ai-workspace-chat">
          {!status.ready ? <div className="ai-assistant-not-ready" role="status"><strong>模型服务未就绪</strong><p>请联系总经办在数据中心完成安全配置。</p></div> : null}
          <AiConversation messages={messages} sending={sending} error={error} onPrompt={prompt => send(prompt, appHint)} onRetry={() => retry(appHint)} />
          <AiComposer sending={sending} disabled={!status.ready} onSend={content => send(content, appHint)} onStop={stop} autoFocus={false} idSuffix="workspace" />
        </div>
      </div>
    </section>
  );
}

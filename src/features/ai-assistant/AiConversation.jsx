import { AlertTriangle, Database, RefreshCcw, ShieldCheck, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "../../ui/Button.jsx";
import { isAiConversationNearBottom } from "./aiComposerBehavior.js";

const QUICK_PROMPTS = [
  "今天公司最需要关注的三个风险是什么？",
  "哪些重点项目存在延期或跨部门阻塞？",
  "结合现有数据，给出本周经营建议。",
  "哪些产品或供应链事项需要管理层介入？"
];

function SourceList({ sources = [] }) {
  if (!sources.length) return null;
  return (
    <div className="ai-message-sources" aria-label="本次回答参考来源">
      <Database size={13} aria-hidden="true" />
      {sources.map(source => (
        <span key={`${source.domainId}-${source.updatedAt}`}>{source.appId} · {source.recordCount} 条{source.updatedAt ? ` · ${source.updatedAt.slice(0, 10)}` : ""}</span>
      ))}
    </div>
  );
}

export function AiConversation({ messages, sending, error, onPrompt, onRetry }) {
  const conversationRef = useRef(null);
  const [followingLatest, setFollowingLatest] = useState(true);
  const latestUserId = [...messages].reverse().find(message => message.role === "user")?.id || "";

  const scrollToLatest = useCallback(behavior => {
    const node = conversationRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    setFollowingLatest(true);
    scrollToLatest("auto");
  }, [latestUserId, scrollToLatest]);

  useEffect(() => {
    if (!followingLatest) return undefined;
    const frame = globalThis.requestAnimationFrame?.(() => scrollToLatest("auto"));
    return () => frame && globalThis.cancelAnimationFrame?.(frame);
  }, [error, followingLatest, messages, scrollToLatest, sending]);

  return (
    <div
      ref={conversationRef}
      className="ai-assistant-conversation"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      data-following-latest={followingLatest ? "true" : "false"}
      onScroll={event => setFollowingLatest(isAiConversationNearBottom(event.currentTarget))}
    >
      {!messages.length ? (
        <div className="ai-assistant-welcome">
          <span className="ai-welcome-mark"><Sparkles size={18} aria-hidden="true" /></span>
          <div>
            <h3>公司 AI 总助</h3>
            <p>只提供分析和建议，不会修改数据或执行外部动作。回答会标明参考 App 与数据日期。</p>
          </div>
          <div className="ai-quick-prompts" aria-label="快捷问题">
            {QUICK_PROMPTS.map(prompt => <button type="button" key={prompt} onClick={() => onPrompt(prompt)}>{prompt}</button>)}
          </div>
          <p className="ai-finance-notice"><ShieldCheck size={15} aria-hidden="true" />当前未纳入成本、利润、预算、结算和奖金数据。</p>
        </div>
      ) : messages.map(message => (
        <article className={`ai-message ${message.role}`} key={message.id}>
          <span className="ai-message-role">{message.role === "user" ? "你" : "总助"}</span>
          <div className="ai-message-content">
            {message.role === "assistant" ? (
              message.content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown> : sending ? <span className="ai-thinking">正在读取授权数据并分析…</span> : <span>回答未完整生成。</span>
            ) : <p>{message.content}</p>}
          </div>
          <SourceList sources={message.sources} />
          {message.blockedDomains?.includes("finance") ? <p className="ai-message-limit"><ShieldCheck size={13} aria-hidden="true" />未纳入财务数据</p> : null}
          {message.error ? (
            <div className="ai-message-error" role="alert">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>回答未完整生成：{message.error.message}</span>
              {message.error.retryable ? <Button className="compact" onClick={onRetry}><RefreshCcw size={14} aria-hidden="true" />重试</Button> : null}
            </div>
          ) : null}
        </article>
      ))}
      {error ? <div className="ai-conversation-error" role="alert"><AlertTriangle size={15} aria-hidden="true" /><span>{error.message || "AI 总助暂不可用。"}</span></div> : null}
      {!followingLatest ? <button className="ai-scroll-latest" type="button" onClick={() => { setFollowingLatest(true); scrollToLatest("smooth"); }}>回到最新</button> : null}
    </div>
  );
}

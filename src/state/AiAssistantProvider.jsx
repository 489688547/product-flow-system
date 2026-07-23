import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadAiStatus, sendAiChat } from "./aiAssistantApi.js";
import { sanitizeAiSkillActivity, upsertAiSkillActivity } from "./aiAssistantActivity.js";
import { environmentStorageKey, migrateLegacyProductionCache } from "./dataEnvironmentClient.js";
import { getBrowserStorage, persistLocalState, tryGetStorageItem, tryRemoveStorageItem } from "./resilientLocalStorage.js";

const AiAssistantContext = createContext(null);
const STORAGE_KEY = "companyAiAssistantSessionV1";
const sessionCache = getBrowserStorage("sessionStorage");

function sessionStorageKey() {
  migrateLegacyProductionCache(sessionCache, STORAGE_KEY);
  return environmentStorageKey(STORAGE_KEY);
}

function id() {
  return globalThis.crypto?.randomUUID?.() || `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadSession() {
  try {
    const value = JSON.parse(tryGetStorageItem(sessionCache, sessionStorageKey()) || "{}");
    return Array.isArray(value.messages) ? value.messages.slice(-12).map(message => ({
      ...message,
      skillActivity: sanitizeAiSkillActivity(message.skillActivity)
    })) : [];
  } catch {
    return [];
  }
}

export function AiAssistantProvider({ children }) {
  const [status, setStatus] = useState({ loading: true, enabled: false, ready: false, allowedDomains: [], blockedDomains: [] });
  const [panelOpen, setPanelOpen] = useState(false);
  const [messages, setMessages] = useState(loadSession);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const controllerRef = useRef(null);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus({ ...(await loadAiStatus()), loading: false });
      setError(null);
    } catch (loadError) {
      setStatus(current => ({ ...current, loading: false }));
      setError(loadError);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    persistLocalState(sessionCache, sessionStorageKey(), { messages: messages.slice(-12) });
  }, [messages]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setSending(false);
  }, []);

  const send = useCallback(async (content, appHint = {}) => {
    const question = String(content || "").trim().slice(0, 4000);
    if (!question || sending) return;
    const prior = messages.slice(-11).map(({ role, content: value }) => ({ role, content: value }));
    const userMessage = { id: id(), role: "user", content: question };
    const assistantId = id();
    setMessages(current => [...current, userMessage, {
      id: assistantId,
      role: "assistant",
      content: "",
      sources: [],
      skillActivity: [],
      blockedDomains: [],
      complete: false
    }].slice(-12));
    setSending(true);
    setError(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      await sendAiChat({
        messages: [...prior, { role: "user", content: question }],
        appHint,
        signal: controller.signal,
        onEvent(event) {
          setMessages(current => current.map(message => {
            if (message.id !== assistantId) return message;
            if (event.type === "text_delta") return { ...message, content: message.content + event.delta };
            if (event.type === "sources") return { ...message, sources: event.sources || [], blockedDomains: event.blockedDomains || [] };
            if (event.type === "meta") return {
              ...message,
              requestId: event.requestId,
              blockedDomains: event.blockedDomains || [],
              skillMode: event.skillMode || "summary"
            };
            if (["skill_started", "skill_completed", "skill_failed"].includes(event.type)) {
              return { ...message, skillActivity: upsertAiSkillActivity(message.skillActivity, event) };
            }
            if (event.type === "done") return { ...message, complete: Boolean(event.complete) };
            if (event.type === "error") return { ...message, error: event, complete: false };
            return message;
          }));
        }
      });
    } catch (sendError) {
      if (sendError.name !== "AbortError") setError(sendError);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setSending(false);
    }
  }, [messages, sending]);

  const clear = useCallback(() => {
    stop();
    setMessages([]);
    tryRemoveStorageItem(sessionCache, sessionStorageKey());
    setError(null);
  }, [stop]);

  const retry = useCallback(appHint => {
    const lastUser = [...messages].reverse().find(item => item.role === "user");
    if (lastUser) send(lastUser.content, appHint);
  }, [messages, send]);

  const open = useCallback(() => setPanelOpen(true), []);
  const close = useCallback(() => setPanelOpen(false), []);
  const value = useMemo(() => ({
    status,
    panelOpen,
    messages,
    sending,
    error,
    open,
    close,
    send,
    stop,
    retry,
    clear,
    refreshStatus
  }), [status, panelOpen, messages, sending, error, open, close, send, stop, retry, clear, refreshStatus]);

  return <AiAssistantContext.Provider value={value}>{children}</AiAssistantContext.Provider>;
}

export function useAiAssistant() {
  const context = useContext(AiAssistantContext);
  if (!context) throw new Error("useAiAssistant must be used inside AiAssistantProvider");
  return context;
}

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleOff,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldCheck
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PLATFORM_CONNECTION_DEFINITIONS } from "../../domain/platformConnections.js";
import { Button } from "../../ui/Button.jsx";
import "./platform-connections.css";

const STATUS_LABELS = {
  connected: "已连接",
  configured: "已配置",
  needs_attention: "需处理",
  incomplete: "配置不完整",
  disabled: "已停用",
  unconfigured: "未连接",
  unavailable: "准备接入"
};

function PlatformMark({ definition, size = "normal" }) {
  return <span className={`platform-mark ${size}`} aria-hidden="true" data-platform={definition.id}>{definition.mark}</span>;
}

function LoadingState() {
  return (
    <div className="platform-connections-loading" aria-busy="true" aria-label="正在加载平台连接">
      {[0, 1, 2].map(item => <span key={item} />)}
    </div>
  );
}

function ConnectionField({ field, value, configured, disabled, onChange }) {
  const [showValue, setShowValue] = useState(false);
  const password = field.type === "password";
  return (
    <label className="platform-connection-field">
      <span className="platform-connection-label">
        <strong>{field.label}</strong>
        {configured ? <small><CheckCircle2 size={13} aria-hidden="true" />已配置 · 留空保持原值</small> : field.required ? <small>必填</small> : <small>选填</small>}
      </span>
      <span className="platform-connection-input">
        <input
          type={password ? (showValue ? "text" : "password") : "text"}
          value={value}
          disabled={disabled}
          autoComplete="new-password"
          spellCheck="false"
          placeholder={configured ? "留空则保持原值" : `请输入${field.label}`}
          maxLength={field.maxLength}
          onChange={event => onChange(event.target.value)}
        />
        {password ? (
          <button type="button" disabled={disabled || !value} aria-label={showValue ? `隐藏${field.label}` : `显示${field.label}`} onClick={() => setShowValue(shown => !shown)}>
            {showValue ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          </button>
        ) : null}
      </span>
    </label>
  );
}

function RevealedConnectionField({ field, value }) {
  const [showValue, setShowValue] = useState(false);
  return (
    <label className="platform-connection-field">
      <span className="platform-connection-label"><strong>{field.label}</strong><small>仅本页暂时显示</small></span>
      <span className="platform-connection-input">
        <input type={showValue ? "text" : "password"} value={value} readOnly autoComplete="off" spellCheck="false" />
        <button type="button" aria-label={showValue ? `隐藏${field.label}` : `显示${field.label}`} onClick={() => setShowValue(shown => !shown)}>
          {showValue ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </span>
    </label>
  );
}

function statusText(connection, definition) {
  if (!definition.available) return STATUS_LABELS.unavailable;
  return STATUS_LABELS[connection?.status] || STATUS_LABELS.unconfigured;
}

function PlatformConnectionList({ definitions, connections, onSelect, buttonRefs }) {
  const byId = new Map(connections.map(item => [item.platformId, item]));
  return (
    <div className="platform-connection-list" aria-label="公司平台连接">
      {definitions.map(definition => {
        const connection = byId.get(definition.id);
        const unavailable = !definition.available;
        return (
          <button
            type="button"
            className="platform-connection-row"
            key={definition.id}
            ref={node => {
              if (node) buttonRefs.current.set(definition.id, node);
              else buttonRefs.current.delete(definition.id);
            }}
            disabled={unavailable}
            title={unavailable ? definition.disabledReason : undefined}
            onClick={() => onSelect(definition.id)}
          >
            <PlatformMark definition={definition} />
            <span className="platform-connection-summary">
              <strong>{definition.name}</strong>
              <small>{definition.description}</small>
            </span>
            <span className={`platform-connection-state ${connection?.status || (unavailable ? "unavailable" : "unconfigured")}`}>
              {connection?.status === "connected" ? <CheckCircle2 size={15} aria-hidden="true" /> : unavailable ? <CircleOff size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
              {statusText(connection, definition)}
            </span>
            <span className="platform-connection-action">{unavailable ? definition.disabledReason : <>配置连接<ChevronRight size={16} aria-hidden="true" /></>}</span>
          </button>
        );
      })}
    </div>
  );
}

function PlatformConnectionForm({
  definition,
  connection,
  canManage,
  onBack,
  onConflict,
  onSave,
  onDisable,
  onReveal,
  onConnectionChange,
  showBackButton = true,
  revealActive = true,
  backLabel = "返回数据接入"
}) {
  const [draft, setDraft] = useState(() => Object.fromEntries(definition.fields.map(field => [field.key, ""])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const [revealPurpose, setRevealPurpose] = useState("");
  const [revealConfirmation, setRevealConfirmation] = useState("");
  const [revealBusy, setRevealBusy] = useState(false);
  const [revealError, setRevealError] = useState("");
  const [revealed, setRevealed] = useState(null);
  const resultRef = useRef(null);
  const changedFields = useMemo(() => Object.fromEntries(Object.entries(draft).filter(([, value]) => value.trim())), [draft]);
  const changed = Object.keys(changedFields).length > 0;
  const configured = new Set(connection?.configuredFields || []);
  const canDisable = canManage && connection?.source === "vault" && connection?.enabled;
  const canReveal = canDisable && typeof onReveal === "function";
  const clearRevealed = useCallback(() => {
    setRevealed(null);
    setRevealPurpose("");
    setRevealConfirmation("");
    setConfirmReveal(false);
    setRevealError("");
  }, []);

  useEffect(() => {
    if (!revealed?.expiresAt) return undefined;
    const delay = Math.max(0, Date.parse(revealed.expiresAt) - Date.now());
    const timer = setTimeout(clearRevealed, delay);
    return () => clearTimeout(timer);
  }, [clearRevealed, revealed?.expiresAt]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) clearRevealed();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [clearRevealed]);

  useEffect(() => {
    if (!revealActive) clearRevealed();
  }, [clearRevealed, revealActive]);

  async function handleSave(event) {
    event.preventDefault();
    if (!changed || busy) return;
    clearRevealed();
    setBusy(true);
    setError("");
    setRequestId("");
    setNotice("");
    try {
      await onSave({ platformId: definition.id, expectedVersion: connection?.version || 0, fields: changedFields });
      await onConnectionChange?.();
      setDraft(Object.fromEntries(definition.fields.map(field => [field.key, ""])));
      setNotice("连接已验证并启用。");
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (nextError) {
      if (nextError?.code === "PLATFORM_CONNECTION_VERSION_CONFLICT") {
        await onConflict();
        setError("连接刚被其他人更新，当前状态已刷新。本次填写仍保留，请确认后再次保存。");
      } else {
        setError(`${nextError?.message || "连接验证失败。"} 原连接未受影响。`);
      }
      setRequestId(nextError?.requestId || "");
      requestAnimationFrame(() => resultRef.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  function handleBack() {
    if (busy) return;
    if (changed) {
      setConfirmBack(true);
      return;
    }
    onBack();
  }

  async function handleDisable() {
    clearRevealed();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await onDisable({ platformId: definition.id, expectedVersion: connection?.version || 0 });
      await onConnectionChange?.();
      setConfirmDisable(false);
      setNotice("连接已停用，系统将使用原有回退配置（如有）。");
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (nextError) {
      setError(nextError?.message || "停用失败，请重试。");
      setRequestId(nextError?.requestId || "");
    } finally {
      setBusy(false);
    }
  }

  async function handleReveal() {
    if (!canReveal || revealBusy) return;
    setRevealBusy(true);
    setRevealError("");
    try {
      const result = await onReveal({
        platformId: definition.id,
        purpose: revealPurpose,
        confirmation: revealConfirmation
      });
      setRevealed(result);
      setConfirmReveal(false);
      setRevealPurpose("");
      setRevealConfirmation("");
    } catch (nextError) {
      setRevealError(nextError?.message || "已保存内容查看失败。");
      setRequestId(nextError?.requestId || "");
    } finally {
      setRevealBusy(false);
    }
  }

  return (
    <div className="platform-connection-detail">
      {showBackButton ? <button type="button" className="platform-connection-back" disabled={busy} onClick={handleBack}><ArrowLeft size={16} aria-hidden="true" />{backLabel}</button> : null}
      {confirmBack ? (
        <div className="platform-connection-disable-confirm" role="alert">
          <div><strong>放弃本次填写？</strong><p>尚未保存的连接信息会被清空。</p></div>
          <span><Button type="button" onClick={() => setConfirmBack(false)} disabled={busy}>继续填写</Button><Button type="button" variant="danger" onClick={onBack} disabled={busy}>放弃并返回</Button></span>
        </div>
      ) : null}
      <header className="platform-connection-detail-head">
        <PlatformMark definition={definition} size="large" />
        <div><h2>{definition.name}</h2><p>{definition.description}</p></div>
        <span className={`platform-connection-state ${connection?.status || "unconfigured"}`}>{statusText(connection, definition)}</span>
      </header>

      <div className="platform-connection-detail-grid">
        <form className="platform-connection-form" onSubmit={handleSave}>
          <div className="platform-connection-form-head"><div><h3>连接信息</h3><p>只填写需要新增或更换的内容；已保存内容默认隐藏。</p></div></div>
          {!canManage ? <p className="platform-connection-permission"><ShieldCheck size={16} aria-hidden="true" />仅最高权限管理员可以修改平台连接。</p> : null}
          <fieldset disabled={!canManage || busy}>
            {definition.fields.map(field => (
              <ConnectionField
                key={field.key}
                field={field}
                value={draft[field.key]}
                configured={configured.has(field.key)}
                disabled={!canManage || busy}
                onChange={value => setDraft(current => ({ ...current, [field.key]: value }))}
              />
            ))}
          </fieldset>
          <div className="platform-connection-form-actions">
            <Button type="submit" variant="primary" disabled={!canManage || !changed || busy} disabledReason={!canManage ? "仅最高权限管理员可以保存" : !changed ? "请填写需要新增或更换的连接信息" : ""}>
              {busy ? <RefreshCw size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}{busy ? "正在验证…" : "保存并验证"}
            </Button>
            {canDisable ? <Button type="button" className="quiet-danger" disabled={busy} onClick={() => setConfirmDisable(true)}>停用连接</Button> : null}
            {canReveal ? <Button type="button" disabled={busy || revealBusy} onClick={() => { clearRevealed(); setConfirmReveal(true); }}><Eye size={16} aria-hidden="true" />显示已保存内容</Button> : null}
          </div>
          {confirmReveal ? (
            <div className="platform-connection-reveal-confirm" role="group" aria-labelledby="platform-reveal-title">
              <div><strong id="platform-reveal-title">确认查看灵算凭据</strong><p>请说明用途并输入确认语。查看行为会被审计，内容将在 5 分钟后或离开页面时清除。</p></div>
              <label>本次查看用途<input value={revealPurpose} maxLength={200} autoComplete="off" onChange={event => setRevealPurpose(event.target.value)} /></label>
              <label>确认语<input value={revealConfirmation} autoComplete="off" placeholder="输入：查看灵算凭据" onChange={event => setRevealConfirmation(event.target.value)} /></label>
              <span><Button type="button" onClick={clearRevealed} disabled={revealBusy}>取消</Button><Button type="button" variant="primary" onClick={handleReveal} disabled={revealBusy || !revealPurpose.trim() || revealConfirmation !== "查看灵算凭据"}>{revealBusy ? "正在读取…" : "确认查看"}</Button></span>
              {revealError ? <p className="platform-connection-message error" role="alert">{revealError}{requestId ? <small>请求编号：{requestId}</small> : null}</p> : null}
            </div>
          ) : null}
          {revealed?.fields ? (
            <div className="platform-connection-revealed">
              <div><strong>已保存内容</strong><p role="status">仅当前页面暂时可见，最迟 5 分钟后自动清除。</p></div>
              {definition.fields.filter(field => revealed.fields[field.key]).map(field => <RevealedConnectionField key={field.key} field={field} value={revealed.fields[field.key]} />)}
              <Button type="button" onClick={clearRevealed}>立即隐藏</Button>
            </div>
          ) : null}
          {confirmDisable ? (
            <div className="platform-connection-disable-confirm" role="alert">
              <div><strong>确认停用当前连接？</strong><p>停用后会自动使用原有回退配置；没有回退时相关能力将不可用。</p></div>
              <span><Button type="button" onClick={() => setConfirmDisable(false)} disabled={busy}>取消</Button><Button type="button" variant="danger" onClick={handleDisable} disabled={busy}>确认停用</Button></span>
            </div>
          ) : null}
          {error ? <p className="platform-connection-message error" role="alert" tabIndex="-1" ref={resultRef}>{error}{requestId ? <small>请求编号：{requestId}</small> : null}</p> : null}
          {notice ? <p className="platform-connection-message success" role="status" tabIndex="-1" ref={resultRef}>{notice}</p> : null}
        </form>

        <aside className="platform-connection-facts" aria-label="连接状态">
          <h3>当前状态</h3>
          <dl>
            <div><dt>连接状态</dt><dd>{statusText(connection, definition)}</dd></div>
            <div><dt>已配置</dt><dd>{configured.size ? `${configured.size} 项` : "尚未配置"}</dd></div>
            <div><dt>最近验证</dt><dd>{connection?.verifiedAt ? new Date(connection.verifiedAt).toLocaleString("zh-CN") : "尚未验证"}</dd></div>
            <div><dt>更新人</dt><dd>{connection?.verifiedBy || "—"}</dd></div>
          </dl>
          <div className="platform-connection-security"><ShieldCheck size={18} aria-hidden="true" /><div><strong>安全保存</strong><p>已保存内容默认隐藏；最高权限明确确认后可临时查看。每次更换都先验证，失败不会影响正在使用的连接。</p></div></div>
        </aside>
      </div>
    </div>
  );
}

export function PlatformConnectionsWorkspace({
  canManage = false,
  platformIds = PLATFORM_CONNECTION_DEFINITIONS.map(item => item.id),
  initialPlatformId = "",
  embedded = false,
  showBackButton = true,
  revealActive = true,
  onConnectionChange,
  controller,
  onBack
}) {
  const [selectedId, setSelectedId] = useState(initialPlatformId);
  const [returnFocusId, setReturnFocusId] = useState("");
  const platformButtonRefs = useRef(new Map());
  const platformIdKey = platformIds.join("|");
  const definitions = PLATFORM_CONNECTION_DEFINITIONS.filter(item => platformIds.includes(item.id));
  const connections = controller?.connections || [];
  const loading = Boolean(controller?.loading);
  const error = controller?.error || "";
  const refresh = controller?.refresh;
  const save = controller?.save;
  const disable = controller?.disable;
  const reveal = controller?.reveal;
  const effectiveCanManage = controller?.canManage ?? canManage;
  useEffect(() => {
    const allowed = new Set(platformIdKey.split("|").filter(Boolean));
    setSelectedId(current => {
      if (current && allowed.has(current)) return current;
      return initialPlatformId && allowed.has(initialPlatformId) ? initialPlatformId : "";
    });
  }, [initialPlatformId, platformIdKey]);
  useEffect(() => {
    if (selectedId || !returnFocusId) return;
    requestAnimationFrame(() => platformButtonRefs.current.get(returnFocusId)?.focus());
  }, [returnFocusId, selectedId]);

  const definition = definitions.find(item => item.id === selectedId);
  const connection = connections.find(item => item.platformId === selectedId);

  if (loading && !connections.length) return <LoadingState />;
  if (error && !connections.length) {
    return <div className="platform-connections-error" role="alert"><AlertTriangle size={20} aria-hidden="true" /><div><strong>平台连接暂不可用</strong><p>{error}</p><Button onClick={() => refresh?.().catch(() => {})}><RefreshCw size={16} />重新加载</Button></div></div>;
  }
  if (definition?.available) {
    return <PlatformConnectionForm
      definition={definition}
      connection={connection}
      canManage={effectiveCanManage}
      showBackButton={showBackButton}
      revealActive={revealActive}
      onBack={() => {
        if (embedded) onBack?.();
        else { setReturnFocusId(definition.id); setSelectedId(""); }
      }}
      onConflict={() => refresh?.()}
      onSave={save}
      onDisable={disable}
      onReveal={reveal}
      onConnectionChange={onConnectionChange}
    />;
  }
  return (
    <section className="platform-connections-workspace">
      <div className="platform-connections-intro"><div><h2>公司平台连接</h2><p>选择平台并完成安全连接；保存后系统会自动验证。</p></div><span><ShieldCheck size={15} aria-hidden="true" />已保存内容不会回显</span></div>
      {error ? <p className="platform-connection-message error" role="alert">{error}</p> : null}
      <PlatformConnectionList
        definitions={definitions}
        connections={connections}
        onSelect={setSelectedId}
        buttonRefs={platformButtonRefs}
      />
    </section>
  );
}

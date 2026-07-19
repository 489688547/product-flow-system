import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, CheckCircle2, CircleAlert, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { loadAiProvider, saveAiProvider, testAiProvider } from "../../state/aiAssistantApi.js";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";

const FINANCE_POLICY = {
  domainId: "finance",
  name: "财务",
  classification: "restricted",
  providerTransfer: { "lingsuan-responses": "blocked" },
  reason: "当前模型服务尚未通过财务数据外发审核。"
};

function checkedAtLabel(value) {
  if (!value) return "尚未测试";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "尚未测试" : new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai"
  }).format(date);
}

function providerDraft(provider = {}) {
  return {
    providerId: provider.providerId || "lingsuan-responses",
    model: provider.model || "gpt-5.6-sol",
    reasoningEffort: provider.reasoningEffort || "xhigh",
    enabled: provider.enabled === true
  };
}

export function AiProviderSettings() {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(providerDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await loadAiProvider();
      setData(next);
      setDraft(providerDraft(next.provider));
    } catch (loadError) {
      setError(loadError.message || "模型服务状态加载失败。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const provider = data?.provider || {};
  const canManage = data?.canManage === true;
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(providerDraft(provider)), [draft, provider]);
  const policies = useMemo(() => {
    const available = Array.isArray(data?.policies) ? data.policies : [];
    return available.some(item => item.domainId === "finance") ? available : [...available, FINANCE_POLICY];
  }, [data?.policies]);

  const save = async () => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const next = await saveAiProvider(draft);
      setData(next);
      setDraft(providerDraft(next.provider));
      setNotice("模型服务安全元数据已保存。");
    } catch (saveError) {
      setError(saveError.message || "模型服务保存失败。");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setError("");
    setNotice("");
    try {
      const result = await testAiProvider();
      setNotice(result.skillsSupported
        ? `连接与只读 Skill 能力测试通过，耗时 ${result.latencyMs || 0} ms。`
        : `模型连接通过，但按需查询能力未通过（${result.skillError?.code || "AI_PROVIDER_SKILLS_UNSUPPORTED"}）；总助将使用只读摘要模式。`);
      const next = await loadAiProvider();
      setData(next);
      setDraft(providerDraft(next.provider));
    } catch (testError) {
      setError(testError.message || "模型服务连接测试失败。");
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <section className="section-panel ai-provider-settings" aria-busy="true"><div className="empty-state">正在读取模型服务状态…</div></section>;
  if (!data) return (
    <section className="section-panel ai-provider-settings">
      <div className="ai-provider-error" role="status"><CircleAlert size={18} aria-hidden="true" /><span>{error || "模型服务状态加载失败。"}</span><Button onClick={reload}><RefreshCw size={16} aria-hidden="true" />重新加载</Button></div>
    </section>
  );

  const configured = provider.secretConfigured === true;
  return (
    <section className="section-panel ai-provider-settings" aria-labelledby="ai-provider-title">
      <div className="section-head ai-provider-heading">
        <div><span className="ai-provider-eyebrow">COMPANY AI</span><h2 id="ai-provider-title">AI 模型服务</h2><p>统一管理公司总助使用的第三方模型、安全状态和数据外发边界。</p></div>
        <div className="ai-provider-actions">
          {!canManage ? <span className="status-badge neutral">只读</span> : null}
          <Button disabled={!canManage || !configured || testing || saving} onClick={testConnection}><RefreshCw size={16} aria-hidden="true" />{testing ? "测试中…" : "连接与 Skill 测试"}</Button>
          <Button variant="primary" disabled={!canManage || !changed || saving || testing} onClick={save}><Save size={16} aria-hidden="true" />{saving ? "保存中…" : "保存设置"}</Button>
        </div>
      </div>

      <div className="ai-provider-status-grid">
        <article><Bot size={18} aria-hidden="true" /><span>服务状态</span><strong>{provider.enabled ? "已启用" : "未启用"}</strong></article>
        <article>{configured ? <CheckCircle2 size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}<span>服务端 Secret</span><strong>{configured ? "已配置" : "未配置"}</strong></article>
        <article><ShieldCheck size={18} aria-hidden="true" /><span>回答留存</span><strong>store=false</strong></article>
        <article>{provider.skillsSupported ? <CheckCircle2 size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}<span>按需查询</span><strong>{provider.skillsSupported ? "Skills 已验证" : "摘要模式"}</strong></article>
        <article><RefreshCw size={18} aria-hidden="true" /><span>最近测试</span><strong>{checkedAtLabel(provider.lastCheckedAt)}</strong></article>
      </div>

      <fieldset className="ai-provider-config-grid" disabled={!canManage || saving || testing}>
        <label>模型服务<input value={provider.displayName || "灵算"} readOnly /></label>
        <label>协议<input value={provider.wireApi || "responses"} readOnly /></label>
        <label>白名单地址<input value={provider.baseUrl || "https://lingsuan.top"} readOnly /></label>
        <label>模型<select value={draft.model} onChange={event => setDraft(current => ({ ...current, model: event.target.value }))}><option value="gpt-5.6-sol">gpt-5.6-sol</option></select></label>
        <label>推理强度<select value={draft.reasoningEffort} onChange={event => setDraft(current => ({ ...current, reasoningEffort: event.target.value }))}><option value="xhigh">xhigh</option></select></label>
        <label className="ai-provider-toggle"><input type="checkbox" checked={draft.enabled} disabled={!canManage || saving || testing || (!configured && !draft.enabled)} onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))} /><span>启用公司 AI 总助</span></label>
      </fieldset>

      <p className="ai-provider-secret-note"><ShieldCheck size={16} aria-hidden="true" />密钥仅通过部署环境的服务端 Secret 配置；此页面不会录入或回显凭据。连接与 Skill 测试只发送合成数据，不读取公司业务数据。</p>
      {error ? <div className="ai-provider-feedback danger" role="status">{error}</div> : null}
      {notice ? <div className="ai-provider-feedback success" role="status">{notice}</div> : null}

      <div className="ai-provider-policy-head"><div><h3>数据外发策略</h3><p>用户有内部查看权限，不代表数据可以发送给第三方模型；外发策略始终优先。</p></div><span className="status-badge warning">财务阻止外发</span></div>
      <DataTable minWidth={680} columns={[
        { key: "domain", header: "数据域", render: row => <span className="data-product-cell"><strong>{row.name}</strong><small>{row.classification === "restricted" ? "受限数据" : "内部数据"}</small></span> },
        { key: "transfer", header: "灵算外发", render: row => { const blocked = row.providerTransfer?.[provider.providerId || "lingsuan-responses"] === "blocked"; return <span className={`status-badge ${blocked ? "danger" : "success"}`}>{blocked ? "阻止外发" : "允许脱敏摘要"}</span>; } },
        { key: "reason", header: "规则说明", render: row => row.reason || "按权限校验并脱敏后发送。" },
        { key: "reviewed", header: "最近复核", render: row => row.reviewedAt ? `${row.reviewedAt} · ${row.reviewedBy || "未记录"}` : "待复核" }
      ]} rows={policies} empty={<div className="empty-state compact-empty">暂无可展示的数据外发策略。</div>} />
    </section>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, ShieldCheck } from "lucide-react";
import { aiUsagePresetRange, defaultAiUsageRange, validateAiUsageRange } from "../../domain/aiModelGovernance.js";
import { loadAiUsage } from "../../state/aiModelGovernanceApi.js";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { DateRangeControls } from "../../ui/DateRangeControls.jsx";
import { AiProviderSettings } from "./AiProviderSettings.jsx";

const EMPTY_SUMMARY = Object.freeze({
  providerCalls: 0,
  successfulCalls: 0,
  successRate: null,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  skillCalls: 0,
  fallbackRuns: 0
});

const PRESETS = Object.freeze([
  { days: 7, label: "最近 7 天" },
  { days: 30, label: "最近 30 天" },
  { days: 90, label: "最近 90 天" }
]);

function count(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function rate(value) {
  return Number.isFinite(value) ? `${(value * 100).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%` : "—";
}

function usedAt(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function environmentLabel(value) {
  return value === "display" ? "展示库" : "正式库";
}

function AiUsageSummary({ summary = EMPTY_SUMMARY, loading = false }) {
  const items = [
    ["模型调用", count(summary.providerCalls), "次 Provider 请求"],
    ["总 Token", count(summary.totalTokens), `输入 ${count(summary.inputTokens)} · 输出 ${count(summary.outputTokens)}`],
    ["成功率", rate(summary.successRate), summary.providerCalls ? `${count(summary.successfulCalls)} 次成功` : "暂无可计算调用"],
    ["Skill 调用", count(summary.skillCalls), "次只读业务查询"],
    ["规则降级", count(summary.fallbackRuns), "次使用确定性规则"]
  ];
  return (
    <dl className={`ai-usage-summary${loading ? " loading" : ""}`} aria-label="AI 使用汇总" aria-busy={loading}>
      {items.map(([label, value, detail]) => <div key={label}><dt>{label}</dt><dd>{value}</dd><small>{detail}</small></div>)}
    </dl>
  );
}

function featureRows(features = []) {
  return features.map((item, index) => ({ ...item, id: `${item.appId}:${item.featureId}:${item.dataEnvironment || "production"}:${item.providerId || "none"}:${item.model || "none"}:${index}` }));
}

function skillRows(skills = []) {
  return skills.map((item, index) => ({ ...item, id: `${item.callerAppId}:${item.callerFeatureId}:${item.dataEnvironment || "production"}:${item.skillId}:${item.sourceAppId}:${index}` }));
}

function AiUsageTables({ data, loading }) {
  const features = useMemo(() => featureRows(data?.features), [data?.features]);
  const skills = useMemo(() => skillRows(data?.skills), [data?.skills]);
  return <>
    <section className="section-panel ai-usage-section" aria-labelledby="ai-feature-usage-title" aria-busy={loading}>
      <div className="section-head"><div><h2 id="ai-feature-usage-title">App 与功能用量</h2><p>按 App、功能、数据环境、Provider 和模型拆分，已登记但未使用的功能也会保留。</p></div>{loading ? <span className="status-badge neutral">正在刷新</span> : null}</div>
      <DataTable className="ai-feature-usage-table" minWidth={1160} columns={[
        { key: "feature", header: "App / 功能", render: row => <span className="ai-usage-primary-cell"><strong>{row.appName}</strong><small>{row.featureName} · {row.featureId}</small>{!row.providerCalls && row.historyNote ? <em>{row.historyNote}</em> : null}</span> },
        { key: "environment", header: "数据环境", render: row => <span className="status-badge neutral">{environmentLabel(row.dataEnvironment)}</span> },
        { key: "model", header: "Provider / 模型", render: row => row.providerCalls ? <span className="ai-usage-primary-cell"><strong>{row.providerId || "—"}</strong><small>{row.model || "—"}</small></span> : "—" },
        { key: "calls", header: "模型调用", render: row => row.providerCalls ? count(row.providerCalls) : <span className="status-badge neutral">暂无调用</span> },
        { key: "input", header: "输入 Token", render: row => count(row.inputTokens) },
        { key: "output", header: "输出 Token", render: row => count(row.outputTokens) },
        { key: "total", header: "总 Token", render: row => <strong>{count(row.totalTokens)}</strong> },
        { key: "success", header: "成功率", render: row => rate(row.successRate) },
        { key: "fallback", header: "规则降级", render: row => row.fallbackRuns ? <span className="status-badge warning">{count(row.fallbackRuns)} 次</span> : "0" },
        { key: "last", header: "最近使用", render: row => usedAt(row.lastUsedAt) }
      ]} rows={features} empty={<div className="empty-state compact-empty">尚未登记可展示的 AI 功能。</div>} />
    </section>
    <section className="section-panel ai-usage-section" aria-labelledby="ai-skill-usage-title" aria-busy={loading}>
      <div className="section-head"><div><h2 id="ai-skill-usage-title">Skill 用量</h2><p>只统计受控 Skill 的调用结果，不展示查询参数和业务内容。</p></div></div>
      <DataTable className="ai-skill-usage-table" minWidth={1000} columns={[
        { key: "caller", header: "调用方", render: row => <span className="ai-usage-primary-cell"><strong>{row.callerAppName}</strong><small>{row.callerFeatureName}</small></span> },
        { key: "skill", header: "Skill", render: row => <span className="ai-usage-primary-cell"><strong>{row.skillName}</strong><small>{row.skillId}</small></span> },
        { key: "environment", header: "数据环境", render: row => <span className="status-badge neutral">{environmentLabel(row.dataEnvironment)}</span> },
        { key: "source", header: "数据来源", render: row => row.sourceAppId },
        { key: "calls", header: "调用次数", render: row => count(row.calls) },
        { key: "result", header: "成功 / 失败", render: row => `${count(row.successes)} / ${count(row.failures)}` },
        { key: "records", header: "返回记录", render: row => count(row.resultCount) },
        { key: "last", header: "最近使用", render: row => usedAt(row.lastUsedAt) }
      ]} rows={skills} empty={<div className="empty-state compact-empty">所选时间内没有 Skill 调用记录。</div>} />
    </section>
  </>;
}

export function AiModelWorkspace() {
  const initialRange = useRef(defaultAiUsageRange());
  const requestSequence = useRef(0);
  const [draftRange, setDraftRange] = useState({ ...initialRange.current });
  const [appliedRange, setAppliedRange] = useState({ ...initialRange.current });
  const [preset, setPreset] = useState(30);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [providerStatus, setProviderStatus] = useState({ label: "读取中", tone: "neutral" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const validation = validateAiUsageRange(draftRange);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    setLoading(true);
    setError(null);
    loadAiUsage(appliedRange, fetch, controller.signal).then(payload => {
      if (requestId === requestSequence.current) setData(payload);
    }).catch(cause => {
      if (cause.name !== "AbortError" && requestId === requestSequence.current) setError(cause);
    }).finally(() => {
      if (requestId === requestSequence.current) setLoading(false);
    });
    return () => controller.abort();
  }, [appliedRange.from, appliedRange.to, reloadKey]);

  const updateDraftRange = updater => {
    setPreset(null);
    setDraftRange(current => typeof updater === "function" ? updater(current) : updater);
  };

  const applyPreset = days => {
    const range = aiUsagePresetRange(days);
    setPreset(days);
    setDraftRange(range);
    setAppliedRange(range);
  };

  const submitRange = event => {
    event.preventDefault();
    if (!validation.valid) return;
    setPreset(null);
    if (draftRange.from === appliedRange.from && draftRange.to === appliedRange.to) setReloadKey(value => value + 1);
    else setAppliedRange({ ...draftRange });
  };

  const handleProviderStatus = useCallback(next => setProviderStatus(next), []);
  const summary = data?.summary || EMPTY_SUMMARY;
  const initialFailure = Boolean(error && !data);

  return (
    <div className="data-workspace ai-model-workspace">
      <form className="ai-usage-toolbar" onSubmit={submitRange} aria-label="AI 使用统计日期">
        <div className="ai-usage-presets" aria-label="快速日期范围">{PRESETS.map(item => <Button key={item.days} type="button" className={preset === item.days ? "selected" : ""} aria-pressed={preset === item.days} onClick={() => applyPreset(item.days)}>{item.label}</Button>)}</div>
        <DateRangeControls range={draftRange} setRange={updateDraftRange} idPrefix="ai-usage-range" />
        <div className="ai-usage-actions">
          <Button type="submit" variant="primary" disabled={!validation.valid}><Search size={16} aria-hidden="true" />{loading && !data ? "查询中…" : "查询"}</Button>
          <Button type="button" disabled={loading} onClick={() => setReloadKey(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />刷新当前区间</Button>
        </div>
        <p id="ai-usage-range-help" className={validation.valid ? "" : "danger"}>{validation.valid ? `已确认区间：${appliedRange.from} 至 ${appliedRange.to}` : validation.message}</p>
      </form>

      <p className="ai-usage-privacy"><ShieldCheck size={16} aria-hidden="true" />页面只展示汇总，不展示员工排行、提示词或回答内容。</p>

      {error ? <div className="ai-usage-error" role="alert"><span><strong>{error.status === 403 ? "当前账号没有数据中心查看权限" : "AI 使用统计加载失败"}</strong><small>{error.message}{error.requestId ? ` · Request ID：${error.requestId}` : ""}</small></span><Button type="button" onClick={() => setReloadKey(value => value + 1)}>重新加载</Button></div> : null}

      {initialFailure ? null : <>
        <AiUsageSummary summary={summary} loading={loading && !data} />
        {data ? <AiUsageTables data={data} loading={loading} /> : <div className="ai-usage-skeleton" aria-label="正在加载 AI 使用统计" aria-busy="true"><span /><span /><span /></div>}
      </>}

      <details className="ai-model-settings" onToggle={event => setSettingsOpen(event.currentTarget.open)}>
        <summary><span><ShieldCheck size={17} aria-hidden="true" /><strong>模型与安全设置</strong><small>Provider、连接测试与数据外发边界</small></span><span className={`status-badge ${providerStatus.tone}`}>{providerStatus.label}</span></summary>
        <AiProviderSettings onStatusChange={handleProviderStatus} active={settingsOpen} />
      </details>
    </div>
  );
}

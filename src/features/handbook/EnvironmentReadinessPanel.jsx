import {
  AlertTriangle,
  CheckCircle2,
  CircleX,
  Database,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UnlockKeyhole
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { canManagePermissions } from "../../domain/permissions.js";
import {
  loadEnvironmentReadiness,
  lockProductionWrite,
  rollbackProductionData,
  unlockProductionWrite
} from "../../state/environmentReadinessApi.js";
import "./environment-readiness.css";

const ENVIRONMENT_LABELS = {
  development: "本地测试",
  preview: "预览环境",
  production: "生产环境"
};

const STATUS_LABELS = {
  ready: "已就绪",
  warning: "有警告",
  blocked: "阻断"
};

function StatusIcon({ status }) {
  if (status === "ready") return <CheckCircle2 size={17} aria-hidden="true" />;
  if (status === "warning") return <AlertTriangle size={17} aria-hidden="true" />;
  return <CircleX size={17} aria-hidden="true" />;
}

function LoadingState() {
  return (
    <div className="environment-loading" aria-busy="true" aria-label="正在检查环境状态">
      <span /><span /><span />
      <p>正在核对环境变量、数据库绑定和平台能力…</p>
    </div>
  );
}

function CapabilityList({ capabilities = [] }) {
  return (
    <section className="environment-section" aria-labelledby="environment-capability-title">
      <div className="environment-section-heading">
        <div><h2 id="environment-capability-title">能力检查</h2><p>只展示配置是否存在，不读取或显示密钥内容。</p></div>
      </div>
      <div className="environment-capability-grid">
        {capabilities.map(capability => (
          <article className={`environment-capability ${capability.status}`} key={capability.id}>
            <div className="environment-capability-heading">
              <span className="environment-status-icon"><StatusIcon status={capability.status} /></span>
              <div><h3>{capability.name}</h3><p>{capability.description}</p></div>
              <strong>{STATUS_LABELS[capability.status] || capability.status}</strong>
            </div>
            {capability.missing?.length ? (
              <div className="environment-missing"><span>缺少</span><ul>{capability.missing.map(item => <li key={item}><code>{item}</code></li>)}</ul></div>
            ) : <p className="environment-complete"><ShieldCheck size={15} aria-hidden="true" />必要配置与表结构完整</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function AuditList({ audits = [], canRollback, busy, onRollback }) {
  const [selectedId, setSelectedId] = useState("");
  const [confirmation, setConfirmation] = useState("");
  if (!audits.length) return <p className="environment-audit-empty">还没有跨环境生产写入记录。</p>;
  return (
    <div className="environment-audit-list">
      {audits.map(audit => {
        const selected = selectedId === audit.id;
        const rollbackAvailable = canRollback && audit.status === "succeeded" && audit.snapshot_id;
        return (
          <article key={audit.id} className="environment-audit-row">
            <div>
              <strong>{audit.action === "rollback" ? "回滚生产数据" : "修改生产数据"}</strong>
              <p>{audit.reason || "未记录原因"}</p>
              <small>{audit.name || "未知账号"} · {new Date(audit.created_at).toLocaleString("zh-CN")}</small>
            </div>
            <span className={`environment-audit-status ${audit.status}`}>{audit.status === "succeeded" ? "成功" : audit.status}</span>
            {rollbackAvailable ? <button type="button" className="btn compact" onClick={() => { setSelectedId(selected ? "" : audit.id); setConfirmation(""); }} disabled={busy}><RotateCcw size={14} />回滚</button> : null}
            {selected ? (
              <div className="environment-rollback-confirm">
                <label><span>输入“修改线上真实数据”确认回滚</span><input value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
                <button type="button" className="btn danger compact" disabled={busy || confirmation !== "修改线上真实数据"} onClick={() => onRollback(audit.id, confirmation)}>确认回滚</button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function EnvironmentReadinessPanel({ sessionUser }) {
  const [payload, setPayload] = useState(null);
  const [loadState, setLoadState] = useState("loading");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const load = useCallback(async () => {
    setLoadState("loading");
    setError("");
    try {
      setPayload(await loadEnvironmentReadiness());
      setLoadState("ready");
    } catch (nextError) {
      setError(nextError?.message || "环境状态暂时无法读取。");
      setLoadState("error");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const access = payload?.dataAccess || {};
  const isDevelopment = payload?.environment === "development";
  const canManage = canManagePermissions(sessionUser) && sessionUser?.role !== "readonly";
  const canUnlock = isDevelopment && canManage && access.configured;
  const minutesRemaining = useMemo(() => access.expiresAt
    ? Math.max(0, Math.ceil((Date.parse(access.expiresAt) - Date.now()) / 60_000))
    : 0, [access.expiresAt]);

  const runAction = async (action, successMessage) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
      await load();
    } catch (nextError) {
      setError(nextError?.message || "操作失败，请重试。");
    } finally {
      setBusy(false);
    }
  };

  if (loadState === "loading" && !payload) return <LoadingState />;
  if (loadState === "error" && !payload) {
    return <div className="environment-load-error" role="alert"><CircleX size={20} /><div><strong>环境状态暂不可用</strong><p>{error}</p><button type="button" className="btn" onClick={load}>重新检查</button></div></div>;
  }

  return (
    <section className="environment-readiness" aria-label="环境与生产数据">
      <header className={`environment-overview ${payload.ready ? "ready" : "blocked"}`}>
        <div className="environment-overview-icon">{payload.ready ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}</div>
        <div>
          <span>{ENVIRONMENT_LABELS[payload.environment] || payload.environment}</span>
          <h2>{payload.ready ? "生产环境配置完整" : "生产环境缺少必要配置"}</h2>
          <p>{payload.ready ? "数据库、钉钉和生产数据控制能力已通过必要检查。" : "存在阻断项，不能完成发布验收；请按下方缺少项补齐。"}</p>
        </div>
        <button type="button" className="btn compact" onClick={load} disabled={busy || loadState === "loading"}><RefreshCw size={14} />重新检查</button>
      </header>

      {access.unlocked ? (
        <div className="production-write-active" role="alert">
          <UnlockKeyhole size={19} />
          <div><strong>正在修改线上真实数据</strong><p>剩余约 {minutesRemaining} 分钟 · 原因：{access.reason}</p></div>
          <button type="button" className="btn danger compact" disabled={busy} onClick={() => runAction(lockProductionWrite, "生产写入已锁定。")}>立即锁定</button>
        </div>
      ) : null}

      {error ? <p className="environment-inline-error" role="alert">{error}</p> : null}
      {notice ? <p className="environment-inline-success" role="status">{notice}</p> : null}

      <CapabilityList capabilities={payload.capabilities} />

      {isDevelopment ? (
        <section className="environment-section production-access-section" aria-labelledby="production-access-title">
          <div className="environment-section-heading">
            <div><h2 id="production-access-title">生产数据访问</h2><p>本地默认实时读取生产数据，写入必须由指定最高权限账号短时解锁。</p></div>
            <span className={`environment-access-badge ${access.configured ? "configured" : "missing"}`}><Database size={14} />{access.configured ? "已连接生产数据" : "未配置个人令牌"}</span>
          </div>

          {!access.configured ? <div className="environment-access-help"><LockKeyhole size={18} /><div><strong>当前保持本地数据模式</strong><p>在被忽略的 <code>.env</code> 中配置 <code>PRODUCTION_DATA_ACCESS_TOKEN</code> 后重启本地服务。</p></div></div> : null}
          {access.configured && !canManage ? <p className="environment-no-permission">当前账号可以查看真实数据，但没有生产写入解锁权限。</p> : null}
          {canUnlock && !access.unlocked ? (
            <form className="production-unlock-form" onSubmit={event => {
              event.preventDefault();
              runAction(() => unlockProductionWrite({ reason, confirmation }), "生产写入已解锁 15 分钟。");
            }}>
              <div className="production-unlock-warning"><AlertTriangle size={18} /><p>接下来的测试修改会直接写入线上数据库，并记录审计。钉钉等外部真实操作仍保持禁止。</p></div>
              <label><span>修改原因</span><input value={reason} onChange={event => setReason(event.target.value)} minLength="4" maxLength="200" placeholder="例如：修正测试中发现的产品状态" /></label>
              <label><span>输入“修改线上真实数据”确认</span><input value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
              <button type="submit" className="btn danger" disabled={busy || reason.trim().length < 4 || confirmation !== "修改线上真实数据"}><UnlockKeyhole size={15} />解锁 15 分钟生产写入</button>
            </form>
          ) : null}

          <div className="environment-audit-heading"><h3>最近生产数据审计</h3><span>最多显示 30 条</span></div>
          <AuditList audits={payload.audit || []} canRollback={canUnlock && access.unlocked} busy={busy} onRollback={(auditId, nextConfirmation) => runAction(() => rollbackProductionData({ auditId, confirmation: nextConfirmation }), "生产数据已回滚，并生成新的审计记录。")} />
        </section>
      ) : null}
    </section>
  );
}

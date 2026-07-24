import { AlertTriangle, ExternalLink, GitBranch, X } from "lucide-react";
import { useEffect, useState } from "react";
import { BACKLOG_STATUS_LABELS } from "../../domain/developmentBacklog.js";
import { Button } from "../../ui/Button.jsx";

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(new Date(value));
}

export function DevelopmentBacklogDetail({
  item,
  events = [],
  loading,
  currentUser,
  canManage,
  actionLoading,
  actionError,
  onAction,
  onEdit,
  onClose
}) {
  const [claimedBranch, setClaimedBranch] = useState("codex/");
  const [acceptanceEvidence, setAcceptanceEvidence] = useState("");
  const [pullRequestUrl, setPullRequestUrl] = useState("");
  const [blockedReason, setBlockedReason] = useState("");
  const [resumeCondition, setResumeCondition] = useState("");
  const [reason, setReason] = useState("");
  const isOwner = Boolean(item?.ownerUserId && item.ownerUserId === (currentUser?.userId || currentUser?.userid || currentUser?.unionId));
  const canDevelop = Boolean(currentUser && currentUser.role !== "readonly");
  const expectedVersion = item?.version;

  useEffect(() => {
    setClaimedBranch(item?.claimedBranch || "codex/");
    setAcceptanceEvidence(item?.acceptanceEvidence || "");
    setPullRequestUrl(item?.pullRequestUrl || "");
    setBlockedReason(item?.blockedReason || "");
    setResumeCondition(item?.resumeCondition || "");
    setReason("");
  }, [item?.id, item?.version]);

  if (!item) return null;
  const run = (action, input = {}) => onAction(action, expectedVersion, input);
  return (
    <aside className="development-backlog-detail" aria-label={`${item.displayId} 详情`} aria-busy={loading || actionLoading}>
      <header>
        <div><span>{item.displayId}</span><h2>{item.title}</h2></div>
        <button className="icon-action" type="button" aria-label="关闭研发待办详情" onClick={onClose}><X size={18} /></button>
      </header>

      <div className="backlog-detail-meta">
        <span className={`backlog-priority ${item.priority}`}>{item.priority.toUpperCase()}</span>
        <span className={`backlog-status ${item.status}`}>{BACKLOG_STATUS_LABELS[item.status]}</span>
        <span>{item.moduleName}</span>
        <span>版本 {item.version}</span>
      </div>

      {item.conflicts?.length ? <div className="backlog-conflict-panel" role="alert"><AlertTriangle size={17} aria-hidden="true" /><span><strong>暂时不能认领</strong><small>与 {item.conflicts.map(conflict => `${conflict.displayId}（${conflict.ownerName || "待认领"}）`).join("、")} 的范围重叠。</small></span></div> : null}
      {actionError ? <div className="backlog-inline-error" role="alert"><strong>操作未完成</strong><span>{actionError.message}</span></div> : null}

      <section><h3>背景与目标</h3><p>{item.background || "尚未补充。"}</p></section>
      <section><h3>验收标准</h3>{item.acceptanceCriteria?.length ? <ol>{item.acceptanceCriteria.map(entry => <li key={entry}>{entry}</li>)}</ol> : <p>尚未明确，事项保持待澄清。</p>}</section>
      <section><h3>受影响路径</h3>{item.scopePaths?.length ? <ul className="backlog-code-list">{item.scopePaths.map(path => <li key={path}><code>{path}</code></li>)}</ul> : <p>尚未明确。</p>}</section>
      <section className="backlog-owner-panel">
        <h3>开发占用</h3>
        <dl>
          <div><dt>负责人</dt><dd>{item.ownerName || "待认领"}</dd></div>
          <div><dt>分支</dt><dd>{item.claimedBranch ? <span><GitBranch size={13} aria-hidden="true" />{item.claimedBranch}</span> : "—"}</dd></div>
          <div><dt>PR</dt><dd>{item.pullRequestUrl ? <a href={item.pullRequestUrl} target="_blank" rel="noreferrer">打开 Pull Request <ExternalLink size={12} /></a> : "—"}</dd></div>
        </dl>
      </section>

      {(canDevelop || canManage) && !["completed", "cancelled", "clarification"].includes(item.status) ? (
        <section className="backlog-action-panel">
          <h3>推进事项</h3>
          {item.status === "ready" ? (
            <label>开发分支<input value={claimedBranch} onChange={event => setClaimedBranch(event.target.value)} placeholder="codex/feature-name" /><Button variant="primary" disabled={actionLoading || Boolean(item.conflicts?.length)} disabledReason={item.conflicts?.length ? "请先处理范围冲突" : ""} onClick={() => run("claim", { branch: claimedBranch })}>认领并开始</Button></label>
          ) : null}
          {item.status === "in_progress" && (isOwner || canManage) ? (
            <>
              <label>验收证据<textarea value={acceptanceEvidence} onChange={event => setAcceptanceEvidence(event.target.value)} rows="3" placeholder="测试、构建和人工验证结果" /></label>
              <label>Pull Request（可选）<input value={pullRequestUrl} onChange={event => setPullRequestUrl(event.target.value)} placeholder="https://github.com/…/pull/123" /></label>
              <Button variant="primary" disabled={actionLoading || !acceptanceEvidence.trim()} onClick={() => run("submit_review", { acceptanceEvidence, pullRequestUrl })}>提交验收</Button>
            </>
          ) : null}
          {["in_progress", "review"].includes(item.status) && (isOwner || canManage) ? (
            <>
              <label>阻塞原因<textarea value={blockedReason} onChange={event => setBlockedReason(event.target.value)} rows="2" /></label>
              <label>恢复条件<textarea value={resumeCondition} onChange={event => setResumeCondition(event.target.value)} rows="2" /></label>
              <Button disabled={actionLoading || !blockedReason.trim() || !resumeCondition.trim()} onClick={() => run("block", { blockedReason, resumeCondition })}>标记阻塞</Button>
            </>
          ) : null}
          {item.status === "blocked" && (isOwner || canManage) ? <Button variant="primary" disabled={actionLoading} onClick={() => run("resume", { reason })}>恢复开发</Button> : null}
          {["in_progress", "blocked"].includes(item.status) && (isOwner || canManage) ? <Button disabled={actionLoading} onClick={() => run("release", { reason })}>释放认领</Button> : null}
        </section>
      ) : null}

      {canManage ? (
        <section className="backlog-executive-actions">
          <h3>总经办操作</h3>
          <label>操作说明<textarea value={reason} onChange={event => setReason(event.target.value)} rows="2" placeholder="验收、取消或重开原因" /></label>
          <div>
            <Button onClick={() => onEdit(item)}>编辑内容</Button>
            {item.status === "review" ? <Button variant="primary" disabled={actionLoading} onClick={() => run("complete", { reason })}>验收并完成</Button> : null}
            {!["completed", "cancelled"].includes(item.status) ? <Button disabled={actionLoading || !reason.trim()} onClick={() => run("cancel", { reason })}>取消事项</Button> : null}
            {["completed", "cancelled"].includes(item.status) ? <Button variant="primary" disabled={actionLoading || !reason.trim()} onClick={() => run("reopen", { reason })}>重新打开</Button> : null}
          </div>
        </section>
      ) : null}

      <section><h3>变更记录</h3>{events.length ? <ol className="backlog-event-list">{events.map(event => <li key={event.id}><span>{event.actorName || "系统"} · {event.action}</span><small>{formatDateTime(event.createdAt)}{event.evidenceSummary ? ` · ${event.evidenceSummary}` : ""}</small></li>)}</ol> : <p>{loading ? "正在加载记录…" : "暂无变更记录。"}</p>}</section>
    </aside>
  );
}

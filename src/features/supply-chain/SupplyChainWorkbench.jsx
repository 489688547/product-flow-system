import { AlertTriangle, Clock3, DatabaseZap, Inbox, UserRoundCheck } from "lucide-react";
import { useMemo } from "react";
import { buildRoleWorkbench } from "../../domain/supplyChainWorkflow.js";

const ATTENTION_LABELS = Object.freeze({
  overdue: "已逾期",
  due_soon: "即将到期",
  needs_assignment: "待指派",
  data_issue: "数据问题",
  normal: "待处理"
});

function formatDueAt(value) {
  if (!value) return "未设置截止时间";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "截止时间待确认";
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export function SupplyChainWorkbench({ actor, items = [], dataQuality = null }) {
  const workbench = useMemo(() => buildRoleWorkbench({ actor, items }), [actor, items]);
  const summaryItems = [
    { key: "total", label: "待处理", value: workbench.summary.total, icon: UserRoundCheck },
    { key: "dueSoon", label: "即将逾期", value: workbench.summary.dueSoon + workbench.summary.overdue, icon: Clock3 },
    { key: "dataIssues", label: "数据问题", value: workbench.summary.dataIssues, icon: DatabaseZap }
  ];
  return (
    <div className="supply-workbench">
      <header className="supply-workbench-heading">
        <div>
          <h2>{workbench.scope === "all" ? "团队工作台" : "我的工作台"}</h2>
          <p>先处理逾期、临期和数据缺口，再进入常规采购与质量事项。</p>
        </div>
        {dataQuality?.lastSuccessfulSyncAt ? <small>共享数据更新于 {dataQuality.lastSuccessfulSyncAt}</small> : null}
      </header>

      {dataQuality && dataQuality.status !== "trusted" ? (
        <div className={`supply-coverage-notice is-${dataQuality.status}`} role="status">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>
            <strong>{dataQuality.status === "stale" ? "共享数据已过期" : dataQuality.status === "unavailable" ? "共享数据暂不可用" : "共享数据仅部分覆盖"}</strong>
            <small>{dataQuality.missing?.length ? `缺少：${dataQuality.missing.join("、")}` : "当前没有足够数据计算，不按 0 处理。"}</small>
          </span>
        </div>
      ) : null}

      <dl className="supply-workbench-summary" aria-label="供应链工作摘要">
        {summaryItems.map(({ key, label, value, icon: Icon }) => (
          <div key={key}>
            <dt><Icon size={16} aria-hidden="true" />{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <section className="supply-task-list" aria-label="供应链待处理事项">
        <div className="supply-task-list-head">
          <h3>按优先级处理</h3>
          {workbench.summary.needsAssignment ? <span>{workbench.summary.needsAssignment} 项待主管指派</span> : null}
        </div>
        {workbench.items.length ? (
          <ul>
            {workbench.items.map(item => (
              <li key={item.id}>
                <span className={`supply-task-state is-${item.attentionState}`}>{ATTENTION_LABELS[item.attentionState]}</span>
                <span className="supply-task-copy">
                  <strong>{item.title}</strong>
                  <small>{item.reason || item.objectName || "查看详情确认下一步"}</small>
                </span>
                <span className="supply-task-owner">{item.ownerName || item.ownerDepartment || "待主管指派"}</span>
                <time dateTime={item.dueAt || undefined}>{formatDueAt(item.dueAt)}</time>
                {item.screen ? <a className="btn btn-secondary" href={`#${item.screen}`}>{item.actionLabel || "查看"}</a> : null}
              </li>
            ))}
          </ul>
        ) : (
          <div className="supply-workbench-empty">
            <Inbox size={22} aria-hidden="true" />
            <strong>当前没有待处理事项</strong>
            <span>新预警、采购跟进和质量事项会按责任范围出现在这里。</span>
          </div>
        )}
      </section>
    </div>
  );
}

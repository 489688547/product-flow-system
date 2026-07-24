import { AlertTriangle, ArrowRight, GitBranch } from "lucide-react";
import { BACKLOG_STATUS_LABELS } from "../../domain/developmentBacklog.js";

function formatTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(new Date(value));
}

export function DevelopmentBacklogTable({ items = [], selectedId = "", onOpen }) {
  return (
    <div className="development-backlog-table table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>待办</th>
            <th>模块</th>
            <th>优先级</th>
            <th>状态</th>
            <th>负责人 / 分支</th>
            <th>更新</th>
            <th><span className="sr-only">操作</span></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr className={selectedId === item.id ? "selected" : ""} key={item.id}>
              <td>
                <button className="backlog-title-button" type="button" onClick={() => onOpen(item)}>
                  <span>{item.displayId}</span>
                  <strong>{item.title}</strong>
                  {item.conflicts?.length ? <small className="backlog-conflict-text"><AlertTriangle size={13} aria-hidden="true" />与 {item.conflicts[0].displayId} 范围冲突</small> : null}
                </button>
              </td>
              <td><span className="backlog-module">{item.moduleName}</span></td>
              <td><span className={`backlog-priority ${item.priority}`}>{item.priority.toUpperCase()}</span></td>
              <td><span className={`backlog-status ${item.status}`}>{BACKLOG_STATUS_LABELS[item.status] || item.status}</span></td>
              <td>
                <span className="backlog-owner">{item.ownerName || "待认领"}</span>
                {item.claimedBranch ? <small><GitBranch size={12} aria-hidden="true" />{item.claimedBranch}</small> : null}
              </td>
              <td>{formatTime(item.updatedAt)}</td>
              <td><button className="icon-action" type="button" aria-label={`查看 ${item.displayId}`} onClick={() => onOpen(item)}><ArrowRight size={16} /></button></td>
            </tr>
          ))}
          {!items.length ? <tr className="data-table-empty-row"><td className="data-table-empty" colSpan="7">暂无研发待办。</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}

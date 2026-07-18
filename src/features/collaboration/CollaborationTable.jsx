import { ArrowRight, ExternalLink } from "lucide-react";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { Button } from "../../ui/Button.jsx";
import { CollaborationStatusBadge } from "./CollaborationStatusBadge.jsx";

const IMPACT = { high: "高影响", medium: "中影响", low: "低影响" };
const NEXT_STEP = {
  pending_acceptance: "主责部门确认接收",
  returned: "发起方补充并重提",
  in_progress: "主负责人推进结果",
  blocked: "协调阻塞并恢复",
  pending_verification: "发起方验收结果",
  closed: "已闭环",
  cancelled: "已取消"
};

function dateLabel(value) {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function CollaborationTable({ items, selectedId, onOpen }) {
  const columns = [
    {
      key: "item",
      header: "事项",
      render: item => <span className="collaboration-item-cell"><strong>{item.title}</strong><small>{item.requestedAction || "等待补充下一步"}</small></span>
    },
    {
      key: "source",
      header: "来源",
      render: item => <span className="collaboration-source"><strong>{item.source?.sourceLabel || item.source?.appId || "协同工作台"}</strong><small>{item.kind}</small></span>
    },
    {
      key: "departments",
      header: "发起 / 主责",
      render: item => <span className="collaboration-departments"><span>{item.requesterDepartment?.name || "未识别"}</span><ArrowRight size={13} aria-hidden="true" /><strong>{item.ownerDepartment?.name || "待指定"}</strong></span>
    },
    { key: "owner", header: "主负责人", render: item => item.ownerUser?.name || "待接收时指定" },
    { key: "status", header: "状态", render: item => <CollaborationStatusBadge status={item.status} archived={Boolean(item.archivedAt)} compact /> },
    { key: "impact", header: "影响", render: item => <span className={`collaboration-impact ${item.impactLevel}`}>{IMPACT[item.impactLevel] || "未分级"}</span> },
    { key: "due", header: "截止", render: item => <time dateTime={item.dueAt}>{dateLabel(item.dueAt)}</time> },
    { key: "next", header: "下一步", render: item => NEXT_STEP[item.status] || "查看详情" },
    {
      key: "actions",
      header: "操作",
      render: item => <TableActions><Button variant="secondary" className="compact" onClick={() => onOpen(item)} aria-label={`查看协同事项：${item.title}`}>查看 <ExternalLink size={14} /></Button></TableActions>
    }
  ];
  return (
    <DataTable
      className="collaboration-table"
      columns={columns}
      rows={items}
      minWidth={1120}
      empty={<div className="collaboration-empty"><strong>当前视图没有协同事项</strong><span>可切换责任视图或清除筛选。</span></div>}
      getRowProps={item => ({ className: item.id === selectedId ? "selected" : "" })}
    />
  );
}

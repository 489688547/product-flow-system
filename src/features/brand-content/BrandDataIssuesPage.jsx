import { AlertTriangle, DatabaseZap } from "lucide-react";
import { useMemo, useState } from "react";
import { findBrandContentIssues } from "../../domain/brandContent.js";
import { useBrandContent } from "../../state/BrandContentProvider.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";

const SEVERITY_LABEL = { critical: "严重", high: "高", medium: "中", low: "低" };
const ROLE_LABEL = { operator: "运营", editor: "剪辑", director: "编导", lead: "负责人" };

export function BrandDataIssuesPage() {
  const { state } = useBrandContent();
  const [severity, setSeverity] = useState("all");
  const issues = useMemo(() => findBrandContentIssues(state, new Date()), [state]);
  const rows = severity === "all" ? issues : issues.filter(issue => issue.severity === severity);
  const columns = [
    { key: "severity", header: "严重度", render: row => <span className={`issue-severity ${row.severity}`}><AlertTriangle size={14} aria-hidden="true" />{SEVERITY_LABEL[row.severity] || row.severity}</span> },
    { key: "issue", header: "问题", render: row => <span className="content-product-cell"><strong>{row.title}</strong><small>{row.contentId || row.type}</small></span> },
    { key: "role", header: "责任角色", render: row => <strong>{ROLE_LABEL[row.ownerRole] || row.ownerRole}</strong> },
    { key: "scope", header: "影响范围", render: row => <span>{row.scope || "待核对"}</span> },
    { key: "action", header: "恢复动作", render: row => <span className="content-number-cell"><strong>{row.action}</strong><small>{row.lastRetriedAt ? `最近重试 ${row.lastRetriedAt.slice(0, 16).replace("T", " ")}` : "尚未重试"}</small></span> }
  ];
  return (
    <section className="page brand-content-page brand-issues-page">
      <PageHeader title="数据问题" description="集中处理重复素材 ID、缺失映射、来源缺日、未对平和 NAS 文件失联。" />
      <section className="status-strip brand-issue-filter" aria-label="按严重度筛选">{[["all", "全部"], ["critical", "严重"], ["high", "高"], ["medium", "中"]].map(([key, label]) => <button key={key} type="button" className={severity === key ? "active" : ""} onClick={() => setSeverity(key)}><strong>{key === "all" ? issues.length : issues.filter(issue => issue.severity === key).length}</strong><span>{label}</span></button>)}</section>
      <section className="section-panel">{rows.length ? <DataTable columns={columns} rows={rows} minWidth={940} empty="没有数据问题" className="brand-issues-table" /> : <div className="empty-state"><DatabaseZap size={22} aria-hidden="true" />当前筛选没有待处理问题。</div>}</section>
    </section>
  );
}

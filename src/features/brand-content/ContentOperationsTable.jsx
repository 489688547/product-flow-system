import { ArrowRight } from "lucide-react";
import { DataTable } from "../../ui/DataTable.jsx";
import { ContentStatusBadge } from "./ContentStatusBadge.jsx";

const money = value => value == null ? "—" : `¥${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
const ratio = value => value == null ? "—" : Number(value).toFixed(2);

export function ContentOperationsTable({ products, statuses, onOpenWorkbench }) {
  const columns = [
    { key: "product", header: "产品", render: row => <span className="content-product-cell"><strong>{row.productName}</strong><small>{row.contentCount} 条新内容</small></span> },
    { key: "baseline", header: "归因表现", render: row => <span className="content-number-cell"><strong>{money(row.gmv)}</strong><small>消耗 {money(row.spend)} · ROI {ratio(row.roi)}</small></span> },
    { key: "maturity", header: "上线结构", render: row => <span className="content-number-cell"><strong>{row.tested} 条已测试</strong><small>{row.learning} 条学习中 · {row.untested} 条待测试</small></span> },
    { key: "status", header: "当前判断", render: row => <ContentStatusBadge status={row.untested ? statuses.untested : row.learning ? statuses.learning : row.tested ? statuses.tested : statuses.notPublished} label={row.nextAction} /> },
    { key: "action", header: "下一步", render: row => <button className="table-link" type="button" onClick={() => onOpenWorkbench(row.productId)} aria-label={`打开${row.productName}内容作战台`}>{row.nextAction}<ArrowRight size={14} aria-hidden="true" /></button> }
  ];
  return <DataTable columns={columns} rows={products.map(row => ({ ...row, id: row.productId }))} minWidth={900} empty={<div className="empty-state">尚未建立产品内容主档。创建第一条 Brief 后，这里会显示生产与测试结构。</div>} className="content-operations-table" />;
}

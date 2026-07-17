import { useMemo, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { parseQualityImportRows } from "../../domain/supplyChain.js";
import { streamSpreadsheetRows } from "../../domain/xlsxLite.js";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";

async function rowsFromSpreadsheet(file) {
  let headers = null;
  const rows = [];
  await streamSpreadsheetRows(file, row => {
    if (!headers) { headers = row.map(value => String(value || "").trim()); return; }
    if (row.some(value => String(value ?? "").trim())) rows.push(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  });
  return rows;
}

export function QualityWorkspace({ products, canEdit }) {
  const { state, dispatch } = useSupplyChain();
  const [pending, setPending] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const productMap = useMemo(() => new Map(products.map(item => [item.id, item])), [products]);
  const supplierMap = useMemo(() => new Map(state.suppliers.map(item => [item.id, item])), [state.suppliers]);
  async function handleFile(file) {
    if (!file) return;
    setParsing(true); setError(""); setPending(null);
    try {
      const parsed = parseQualityImportRows(await rowsFromSpreadsheet(file), { products, suppliers: state.suppliers });
      setPending({ ...parsed, fileName: file.name });
    } catch (event) { setError(event.message || "差评文件解析失败。"); }
    finally { setParsing(false); }
  }
  function confirmImport() {
    if (!pending?.validRows.length) return;
    const batchId = `quality-batch-${Date.now()}`;
    dispatch({ type: "batch", actions: [
      { type: "upsert", collection: "qualityImportBatches", record: { id: batchId, fileName: pending.fileName, rows: pending.validRows.length, errorRows: pending.errors.length, importedAt: new Date().toISOString() } },
      ...pending.validRows.map(issue => ({ type: "upsert", collection: "qualityIssues", record: { ...issue, id: `${batchId}-${issue.sourceRow}`, batchId, importedAt: new Date().toISOString() } }))
    ] });
    setPending(null);
  }
  function closeIssue(issue) {
    const publicRelationsResult = window.prompt("请记录公关处理结果和整改结论：", issue.publicRelationsResult || "");
    if (publicRelationsResult === null || !publicRelationsResult.trim()) return;
    dispatch({ type: "upsert", collection: "qualityIssues", record: { ...issue, status: "closed", publicRelationsStatus: "已处理", publicRelationsResult: publicRelationsResult.trim(), verificationResult: issue.verificationResult || "关闭时已确认", closedAt: new Date().toISOString() } });
  }
  const columns = [
    { key: "product", header: "产品 / 批次", render: row => <span><strong>{productMap.get(row.productId)?.name || row.skuCode}</strong><small className="table-secondary">{row.batchNo || "批次待补充"}</small></span> },
    { key: "source", header: "来源", render: row => <span><strong>{row.sourceType || row.platform || "文件导入"}</strong><small className="table-secondary">{[row.platform, row.shopName].filter(Boolean).join(" · ") || "—"}</small></span> },
    { key: "supplier", header: "供应商 / 仓库", render: row => <span><strong>{supplierMap.get(row.supplierId)?.name || row.supplierName || "供应商待补充"}</strong><small className="table-secondary">{row.warehouse || "仓库待补充"}</small></span> },
    { key: "content", header: "差评与质量问题", render: row => <p>{row.content}</p> },
    { key: "category", header: "问题分类", render: row => row.category || "待判定" },
    { key: "action", header: "处置与整改", render: row => <span><strong>{row.disposition || "处置待补充"}</strong><small className="table-secondary">{row.correctiveAction || row.publicRelationsResult || "整改待补充"}</small></span> },
    { key: "verification", header: "验证 / 公关", render: row => <span><strong>{row.verificationResult || "待验证"}</strong><small className="table-secondary">{row.publicRelationsStatus || (row.status === "closed" ? "公关已处理" : "公关待处理")}</small></span> },
    { key: "status", header: "闭环状态", render: row => <span className={`status-badge ${row.status === "closed" ? "success" : "warning"}`}>{row.status === "closed" ? "已关闭" : "待处理"}</span> },
    { key: "actions", header: "操作", render: row => canEdit && row.status !== "closed" ? <TableActions><Button className="compact" onClick={() => closeIssue(row)}><CheckCircle2 size={15} />关闭问题</Button></TableActions> : "—" }
  ];
  return <div className="supply-work-grid"><section className="section-panel"><div className="section-head"><div><h2>质量数据导入</h2><p>兼容差评、到货抽检、月度抽检和仓库验收表，统一进入批次质量闭环。</p></div>{canEdit ? <label className={`upload-field ${parsing ? "is-busy" : ""}`}><Upload size={16} />{parsing ? "正在解析…" : "导入质量 XLSX / CSV"}<input type="file" accept=".xlsx,.csv" disabled={parsing} onChange={event => { handleFile(event.target.files?.[0]); event.target.value = ""; }} /></label> : null}</div>{error ? <p className="supply-message error" role="alert">{error}</p> : null}{pending ? <div className="supply-import-preview"><FileSpreadsheet size={20} /><div><strong>{pending.fileName}</strong><span>有效 {pending.validRows.length} 行 · 错误 {pending.errors.length} 行</span>{pending.errors.slice(0, 3).map(item => <small key={`${item.rowNumber}-${item.field}`}>第 {item.rowNumber} 行：{item.message}</small>)}</div><div className="supply-import-actions"><Button onClick={() => setPending(null)}>取消</Button><Button variant="primary" disabled={!pending.validRows.length} onClick={confirmImport}>确认导入</Button></div></div> : null}</section><section className="section-panel"><div className="section-head"><div><h2>质量问题闭环</h2><p>按产品、批次、供应商和仓库追踪处置、整改、验证与公关结果。</p></div></div><DataTable minWidth={1280} columns={columns} rows={state.qualityIssues} empty={<div className="empty-state compact-empty">还没有导入质量问题。</div>} /></section></div>;
}

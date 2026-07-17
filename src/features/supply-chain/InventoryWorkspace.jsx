import { useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { parseInventoryImportRows } from "../../domain/supplyChain.js";
import { streamSpreadsheetRows } from "../../domain/xlsxLite.js";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";

async function rowsFromSpreadsheet(file) {
  let headers = null;
  const rows = [];
  await streamSpreadsheetRows(file, row => {
    if (!headers) { headers = row.map(value => String(value || "").trim()); return; }
    if (!row.some(value => String(value ?? "").trim())) return;
    rows.push(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  });
  return rows;
}

export function InventoryWorkspace({ products, summary, canEdit }) {
  const { state, dispatch } = useSupplyChain();
  const [pending, setPending] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [stocktakeDate, setStocktakeDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouse, setWarehouse] = useState("主仓");
  async function handleFile(file) {
    if (!file) return;
    setParsing(true); setError(""); setPending(null);
    try {
      const rows = await rowsFromSpreadsheet(file);
      const parsed = parseInventoryImportRows(rows, { products, suppliers: state.suppliers });
      setPending({ ...parsed, fileName: file.name });
    } catch (event) { setError(event.message || "盘点文件解析失败。"); }
    finally { setParsing(false); }
  }
  function confirmImport() {
    if (!pending?.validRows.length) return;
    const batchId = `inventory-batch-${Date.now()}`;
    const productFunds = new Map(summary.byProduct.map(item => [item.productId, item.adjustedInventoryFunds]));
    const supplierFunds = new Map(summary.bySupplier.map(item => [item.supplierId, item.adjustedInventoryFunds]));
    const actions = [{ type: "upsert", collection: "inventoryBatches", record: { id: batchId, fileName: pending.fileName, stocktakeDate, warehouse, rows: pending.validRows.length, errorRows: pending.errors.length, status: "confirmed", importedAt: new Date().toISOString() } }];
    pending.validRows.forEach(row => {
      actions.push({ type: "upsert", collection: "inventorySnapshots", record: { ...row, id: `${batchId}-${row.sourceRow}`, batchId, stocktakeDate, warehouse } });
      if (row.inventoryAmount !== null) {
        const currentFunds = row.supplierId ? supplierFunds.get(row.supplierId) : productFunds.get(row.productId);
        actions.push({ type: "upsert", collection: "inventoryAdjustments", record: { id: `adjust-${batchId}-${row.sourceRow}`, batchId, productId: row.productId, supplierId: row.supplierId, adjustmentAmount: Number(row.inventoryAmount) - Number(currentFunds || 0), reason: `盘点校准：实盘 ${row.countedQuantity}，ERP库存 ${row.erpQuantity}`, status: "confirmed", confirmedAt: new Date().toISOString() } });
        if (row.supplierId) supplierFunds.set(row.supplierId, Number(row.inventoryAmount));
        else productFunds.set(row.productId, Number(row.inventoryAmount));
      }
    });
    dispatch({ type: "batch", actions });
    setPending(null);
  }
  const snapshotColumns = [
    { key: "date", header: "盘点日", render: row => row.stocktakeDate || "—" },
    { key: "warehouse", header: "仓库", render: row => row.warehouse || "—" },
    { key: "sku", header: "商品编码", render: row => <strong>{row.skuCode}</strong> },
    { key: "counted", header: "实盘数量", render: row => row.countedQuantity },
    { key: "erp", header: "ERP库存", render: row => row.erpQuantity },
    { key: "variance", header: "库存差异", render: row => <span className={row.quantityVariance ? "text-warning" : ""}>{row.quantityVariance > 0 ? "+" : ""}{row.quantityVariance}</span> },
    { key: "amount", header: "盘点库存金额", render: row => row.inventoryAmount === null ? "未提供（仅核对数量）" : `¥${Number(row.inventoryAmount).toFixed(2)}` }
  ];
  return <div className="supply-work-grid"><section className="section-panel"><div className="section-head"><div><h2>库存盘点导入</h2><p>导入实盘数量与 ERP库存进行核对，确认后生成可审计的资金校准。</p></div>{canEdit ? <label className={`upload-field ${parsing ? "is-busy" : ""}`}><Upload size={16} />{parsing ? "正在解析…" : "选择 XLSX / CSV"}<input type="file" accept=".xlsx,.csv" disabled={parsing} onChange={event => { handleFile(event.target.files?.[0]); event.target.value = ""; }} /></label> : null}</div>{canEdit ? <div className="supply-import-context"><label>盘点日<input type="date" value={stocktakeDate} onChange={event => setStocktakeDate(event.target.value)} /></label><label>仓库<input value={warehouse} onChange={event => setWarehouse(event.target.value)} /></label></div> : null}{error ? <p className="supply-message error" role="alert">{error}</p> : null}{pending ? <div className="supply-import-preview"><FileSpreadsheet size={20} /><div><strong>{pending.fileName}</strong><span>有效 {pending.validRows.length} 行 · 错误 {pending.errors.length} 行</span>{pending.errors.slice(0, 3).map(item => <small key={`${item.rowNumber}-${item.field}`}>第 {item.rowNumber} 行：{item.message}</small>)}</div><div className="supply-import-actions"><Button onClick={() => setPending(null)}>取消</Button><Button variant="primary" disabled={!pending.validRows.length} onClick={confirmImport}>确认导入</Button></div></div> : null}</section><section className="section-panel"><div className="section-head"><div><h2>盘点与 ERP 核对记录</h2><p>原始盘点、ERP快照和校准调整分层保留。</p></div></div><DataTable minWidth={840} columns={snapshotColumns} rows={state.inventorySnapshots} empty={<div className="empty-state compact-empty">还没有盘点记录。</div>} /></section></div>;
}

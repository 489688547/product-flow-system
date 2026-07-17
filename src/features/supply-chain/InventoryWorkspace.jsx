import { useState } from "react";
import { Database, FileSpreadsheet, Upload } from "lucide-react";
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
  const [importMode, setImportMode] = useState("erp");
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouse, setWarehouse] = useState("兰山云仓");

  async function handleFile(file) {
    if (!file) return;
    setParsing(true); setError(""); setPending(null);
    try {
      const rows = await rowsFromSpreadsheet(file);
      const parsed = parseInventoryImportRows(rows, { products, suppliers: state.suppliers, mode: importMode });
      setPending({ ...parsed, fileName: file.name, importMode });
    } catch (event) { setError(event.message || "库存文件解析失败。"); }
    finally { setParsing(false); }
  }

  function confirmImport() {
    if (!pending?.validRows.length) return;
    const batchId = `inventory-batch-${Date.now()}`;
    const productFunds = new Map(summary.byProduct.map(item => [item.productId, item.adjustedInventoryFunds]));
    const supplierFunds = new Map(summary.bySupplier.map(item => [item.supplierId, item.adjustedInventoryFunds]));
    const stocktake = pending.importMode === "stocktake";
    const actions = [{
      type: "upsert",
      collection: "inventoryBatches",
      record: {
        id: batchId,
        fileName: pending.fileName,
        stocktakeDate: snapshotDate,
        warehouse,
        sourceType: stocktake ? "stocktake-import" : "kuaimai-import",
        rows: pending.validRows.length,
        errorRows: pending.errors.length,
        status: "confirmed",
        importedAt: new Date().toISOString()
      }
    }];
    pending.validRows.forEach(row => {
      const rowWarehouse = row.warehouse || warehouse;
      actions.push({ type: "upsert", collection: "inventorySnapshots", record: { ...row, id: `${batchId}-${row.sourceRow}`, batchId, stocktakeDate: snapshotDate, warehouse: rowWarehouse } });
      if (stocktake && row.inventoryAmount !== null) {
        const currentFunds = row.supplierId ? supplierFunds.get(row.supplierId) : productFunds.get(row.productId);
        actions.push({
          type: "upsert",
          collection: "inventoryAdjustments",
          record: {
            id: `adjust-${batchId}-${row.sourceRow}`,
            batchId,
            productId: row.productId,
            supplierId: row.supplierId,
            adjustmentAmount: Number(row.inventoryAmount) - Number(currentFunds || 0),
            reason: `盘点校准：实盘 ${row.countedQuantity}，ERP库存 ${row.erpQuantity}`,
            status: "confirmed",
            confirmedAt: new Date().toISOString()
          }
        });
        if (row.supplierId) supplierFunds.set(row.supplierId, Number(row.inventoryAmount));
        else productFunds.set(row.productId, Number(row.inventoryAmount));
      }
    });
    dispatch({ type: "batch", actions });
    setPending(null);
  }

  const snapshotColumns = [
    { key: "source", header: "数据来源", render: row => <span><strong>{row.sourceType === "kuaimai-import" ? "ERP 快照" : "盘点核对"}</strong><small className="table-secondary">文件快照</small></span> },
    { key: "date", header: "数据日期", render: row => row.stocktakeDate || "—" },
    { key: "warehouse", header: "仓库", render: row => row.warehouse || "—" },
    { key: "sku", header: "商品编码", render: row => <strong>{row.skuCode}</strong> },
    { key: "erp", header: "ERP库存", render: row => Number(row.erpQuantity || 0).toLocaleString("zh-CN") },
    { key: "counted", header: "实盘库存", render: row => row.countedQuantity === null || row.countedQuantity === undefined ? "—" : Number(row.countedQuantity).toLocaleString("zh-CN") },
    { key: "variance", header: "盘点差异", render: row => row.quantityVariance === null || row.quantityVariance === undefined ? "—" : <span className={row.quantityVariance ? "text-warning" : ""}>{row.quantityVariance > 0 ? "+" : ""}{row.quantityVariance}</span> },
    { key: "amount", header: "实盘金额", render: row => row.inventoryAmount === null ? "—" : `¥${Number(row.inventoryAmount).toFixed(2)}` }
  ];

  return <div className="supply-work-grid">
    <section className="section-panel">
      <div className="section-head"><div><h2>ERP库存快照与盘点核对</h2><p>快麦 ERP 文件先形成库存快照；盘点文件再核对数量并校准资金，后续可无缝切换自动同步。</p></div>{canEdit ? <label className={`upload-field ${parsing ? "is-busy" : ""}`}><Upload size={16} />{parsing ? "正在解析…" : "选择 XLSX / CSV"}<input type="file" accept=".xlsx,.csv" disabled={parsing} onChange={event => { handleFile(event.target.files?.[0]); event.target.value = ""; }} /></label> : null}</div>
      {canEdit ? <div className="supply-import-controls">
        <div className="supply-import-mode" role="group" aria-label="库存导入类型">
          <button type="button" className={importMode === "erp" ? "active" : ""} onClick={() => { setImportMode("erp"); setPending(null); }}><Database size={15} />ERP 快照</button>
          <button type="button" className={importMode === "stocktake" ? "active" : ""} onClick={() => { setImportMode("stocktake"); setPending(null); }}><FileSpreadsheet size={15} />盘点核对</button>
        </div>
        <div className="supply-import-context"><label>数据日期<input type="date" value={snapshotDate} onChange={event => setSnapshotDate(event.target.value)} /></label><label>默认仓库<input value={warehouse} onChange={event => setWarehouse(event.target.value)} /></label></div>
      </div> : null}
      {error ? <p className="supply-message error" role="alert">{error}</p> : null}
      {pending ? <div className="supply-import-preview"><FileSpreadsheet size={20} /><div><strong>{pending.fileName}</strong><span>{pending.importMode === "erp" ? "ERP 快照" : "盘点核对"} · 有效 {pending.validRows.length} 行 · 错误 {pending.errors.length} 行</span>{pending.errors.slice(0, 3).map(item => <small key={`${item.rowNumber}-${item.field}`}>第 {item.rowNumber} 行：{item.message}</small>)}</div><div className="supply-import-actions"><Button onClick={() => setPending(null)}>取消</Button><Button variant="primary" disabled={!pending.validRows.length} onClick={confirmImport}>确认导入</Button></div></div> : null}
    </section>
    <section className="section-panel">
      <div className="section-head"><div><h2>库存数据轨迹</h2><p>每次 ERP 快照和实盘结果都独立保留，不覆盖历史证据。</p></div></div>
      <DataTable minWidth={960} columns={snapshotColumns} rows={state.inventorySnapshots} empty={<div className="empty-state compact-empty">还没有库存快照。可直接导入快麦库存表或盘点表。</div>} />
    </section>
  </div>;
}

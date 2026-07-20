import { useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import { inventorySourceLabel, parseInventoryImportRows } from "../../domain/supplyChain.js";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { StocktakeWorkspace } from "./StocktakeWorkspace.jsx";
import { rowsFromInventorySpreadsheet } from "./inventoryImportRows.js";

function displayNumber(value) {
  return value === null || value === undefined ? "—" : Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function displayMoney(value) {
  return value === null || value === undefined ? <span className="permission-hidden">按权限隐藏</span> : `¥${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function InventoryWorkspace({
  products,
  canEdit,
  projectionRows = [],
  stocktakes = [],
  stocktakePermissions = {},
  createStocktake,
  transitionStocktake
}) {
  const { state, dispatch } = useSupplyChain();
  const [pending, setPending] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouse, setWarehouse] = useState("兰山云仓");

  async function handleFile(file) {
    if (!file) return;
    setParsing(true); setError(""); setPending(null);
    try {
      const rows = await rowsFromInventorySpreadsheet(file);
      const parsed = parseInventoryImportRows(rows, { products, suppliers: state.suppliers, mode: "erp" });
      setPending({ ...parsed, fileName: file.name });
    } catch (event) { setError(event.message || "库存文件解析失败。"); }
    finally { setParsing(false); }
  }

  function confirmImport() {
    if (!pending?.validRows.length) return;
    const batchId = `inventory-batch-${Date.now()}`;
    const actions = [{
      type: "upsert",
      collection: "inventoryBatches",
      record: {
        id: batchId,
        fileName: pending.fileName,
        stocktakeDate: snapshotDate,
        warehouse,
        sourceType: "kuaimai-import",
        rows: pending.validRows.length,
        errorRows: pending.errors.length,
        status: "confirmed",
        importedAt: new Date().toISOString()
      }
    }];
    pending.validRows.forEach(row => {
      const rowWarehouse = row.warehouse || warehouse;
      actions.push({ type: "upsert", collection: "inventorySnapshots", record: { ...row, id: `${batchId}-${row.sourceRow}`, batchId, stocktakeDate: snapshotDate, warehouse: rowWarehouse } });
    });
    dispatch({ type: "batch", actions });
    setPending(null);
  }

  const snapshotColumns = [
    { key: "source", header: "数据来源", render: row => <span><strong>{inventorySourceLabel(row.sourceType)}</strong><small className="table-secondary">{row.sourceDocument || "文件快照"}</small></span> },
    { key: "date", header: "数据日期", render: row => row.stocktakeDate || "—" },
    { key: "warehouse", header: "仓库", render: row => row.warehouse || "—" },
    { key: "product", header: "产品", render: row => <span><strong>{row.productName || row.skuCode || "待关联产品"}</strong><small className="table-secondary">{row.skuCode || "待关联产品档案"}</small></span> },
    { key: "erp", header: "ERP库存", render: row => Number(row.erpQuantity || 0).toLocaleString("zh-CN") },
    { key: "counted", header: "实盘库存", render: row => row.countedQuantity === null || row.countedQuantity === undefined ? "—" : Number(row.countedQuantity).toLocaleString("zh-CN") },
    { key: "variance", header: "盘点差异", render: row => row.quantityVariance === null || row.quantityVariance === undefined ? "—" : <span className={row.quantityVariance ? "text-warning" : ""}>{row.quantityVariance > 0 ? "+" : ""}{row.quantityVariance}</span> },
    { key: "amount", header: "实盘金额", render: row => row.inventoryAmount === null ? "—" : `¥${Number(row.inventoryAmount).toFixed(2)}` }
  ];

  const productById = new Map(products.map(product => [product.id, product]));
  const projectionColumns = [
    { key: "product", header: "产品 / SKU / 69码", render: row => {
      const product = productById.get(row.productId);
      return <span><strong>{product?.name || product?.productName || row.skuCode || "待关联产品"}</strong><small className="table-secondary">SKU {row.skuId || "—"} · 69码 {row.skuCode || "—"}</small></span>;
    } },
    { key: "warehouse", header: "仓库", render: row => row.warehouseId || "—" },
    { key: "erp", header: "ERP账面", render: row => displayNumber(row.erpQuantity) },
    { key: "counted", header: "最近实盘", render: row => displayNumber(row.countedQuantity) },
    { key: "calibrated", header: "校准库存", render: row => <strong>{displayNumber(row.calibratedQuantity)}</strong> },
    { key: "variance", header: "盘点差异", render: row => {
      const variance = row.countedQuantity === null || row.countedQuantity === undefined ? null : Number(row.countedQuantity) - Number(row.erpQuantity || 0);
      return variance === null ? "—" : <span className={variance ? "text-warning" : ""}>{variance > 0 ? "+" : ""}{displayNumber(variance)}</span>;
    } },
    { key: "days", header: "可售天数", render: row => row.daysOfSupply === null || row.daysOfSupply === undefined ? "待销量" : `${displayNumber(row.daysOfSupply)} 天` },
    { key: "age", header: "库龄", render: row => row.ageBucket || "待 ERP" },
    { key: "funds", header: "库存资金", render: row => displayMoney(row.inventoryCashTied) },
    { key: "status", header: "数据状态", render: row => <span><span className={`status-badge ${row.stocktakeStatus === "calibrated" ? "success" : "warning"}`}>{row.stocktakeStatus === "calibrated" ? "已盘点校准" : "未盘点"}</span><small className="table-secondary">{row.sourceUpdatedAt ? `更新 ${row.sourceUpdatedAt}` : "来源时间待补"}</small></span> }
  ];

  const riskColumns = [
    { key: "product", header: "产品", render: row => <span><strong>{row.productName}</strong><small className="table-secondary">{row.skuCode || "—"}</small></span> },
    { key: "days", header: "预计可售", render: row => <strong className={Number(row.sellableDays) <= 5 ? "text-warning" : ""}>{row.sellableDays} 天</strong> },
    { key: "arrival", header: "下一批到仓", render: row => <span><strong>{row.estimatedArrivalDate || "待确认"}</strong><small className="table-secondary">{row.estimatedArrivalQuantity === null ? "数量待确认" : `${Number(row.estimatedArrivalQuantity).toLocaleString("zh-CN")} 件`}</small></span> },
    { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "active" ? "danger" : "success"}`}>{row.status === "active" ? "异常中" : "已解除"}</span> },
    { key: "note", header: "原因与处理", render: row => <span className="supply-note-cell">{row.note || "—"}</span> }
  ];

  const materialColumns = [
    { key: "product", header: "所属产品", render: row => <span><strong>{row.productName}</strong><small className="table-secondary">{row.productSkuCode || "待关联产品档案"}</small></span> },
    { key: "material", header: "原料 / 包材", render: row => <strong>{row.materialName}</strong> },
    { key: "warehouse", header: "仓库", render: row => row.warehouse || "—" },
    { key: "quantity", header: "数量", render: row => Number(row.quantity || 0).toLocaleString("zh-CN") },
    { key: "unitCost", header: "单价", render: row => row.unitCost === null ? "—" : `¥${Number(row.unitCost).toLocaleString("zh-CN", { maximumFractionDigits: 4 })}` },
    { key: "amount", header: "库存金额", render: row => `¥${Number(row.inventoryAmount || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
    { key: "note", header: "备注", render: row => <span className="supply-note-cell">{row.note || "—"}</span> }
  ];

  const sortedRisks = [...state.inventoryRisks].sort((left, right) => Number(left.status !== "active") - Number(right.status !== "active") || Number(left.sellableDays) - Number(right.sellableDays));

  return <div className="supply-work-grid">
    <section className="section-panel">
      <div className="section-head"><div><h2>SKU × 仓库库存余额</h2><p>ERP账面永不被实盘覆盖；校准库存按最近月度盘点锚点延伸。</p></div></div>
      <DataTable className="goods-flow-inventory-table" minWidth={1280} columns={projectionColumns} rows={projectionRows} empty={<div className="empty-state compact-empty">还没有统一库存投影。先导入 ERP 库存快照；首次线下盘点前会明确标记“未盘点”。</div>} />
    </section>
    <StocktakeWorkspace
      products={products}
      stocktakes={stocktakes}
      permissions={stocktakePermissions}
      createStocktake={createStocktake}
      transitionStocktake={transitionStocktake}
    />
    <section className="section-panel">
      <div className="section-head"><div><h2>ERP库存快照导入</h2><p>这里只写入 ERP 账面快照；盘点实存必须经过上方月度盘点流程，不能在导入时直接确认金额。</p></div>{canEdit ? <label className={`upload-field ${parsing ? "is-busy" : ""}`}><Upload size={16} />{parsing ? "正在解析…" : "选择 XLSX / CSV"}<input type="file" accept=".xlsx,.csv" disabled={parsing} onChange={event => { handleFile(event.target.files?.[0]); event.target.value = ""; }} /></label> : null}</div>
      {canEdit ? <div className="supply-import-controls">
        <div className="supply-import-context"><label>数据日期<input type="date" value={snapshotDate} onChange={event => setSnapshotDate(event.target.value)} /></label><label>默认仓库<input value={warehouse} onChange={event => setWarehouse(event.target.value)} /></label></div>
      </div> : null}
      {error ? <p className="supply-message error" role="alert">{error}</p> : null}
      {pending ? <div className="supply-import-preview"><FileSpreadsheet size={20} /><div><strong>{pending.fileName}</strong><span>ERP 快照 · 有效 {pending.validRows.length} 行 · 错误 {pending.errors.length} 行</span>{pending.errors.slice(0, 3).map(item => <small key={`${item.rowNumber}-${item.field}`}>第 {item.rowNumber} 行：{item.message}</small>)}</div><div className="supply-import-actions"><Button onClick={() => setPending(null)}>取消</Button><Button variant="primary" disabled={!pending.validRows.length} onClick={confirmImport}>确认导入</Button></div></div> : null}
    </section>
    <section className="section-panel">
      <div className="section-head"><div><h2>成品库存与盘点轨迹</h2><p>每次 ERP 快照和实盘结果都独立保留；钉钉表是文件快照，快麦接口接通前不标记为自动同步。</p></div></div>
      <DataTable minWidth={1040} columns={snapshotColumns} rows={state.inventorySnapshots} empty={<div className="empty-state compact-empty">还没有成品库存快照。可导入快麦库存表或钉钉盘点表。</div>} />
    </section>
    <section className="section-panel">
      <div className="section-head"><div><h2>异常库存与到货风险</h2><p>异常中的产品优先展示；已解除记录保留，便于回看供应商延迟和补货处理。</p></div></div>
      <DataTable minWidth={940} columns={riskColumns} rows={sortedRisks} empty={<div className="empty-state compact-empty">还没有异常库存记录。</div>} />
    </section>
    <section className="section-panel">
      <div className="section-head"><div><h2>原辅料库存明细</h2><p>按产品、物料和仓库保留数量、单价与金额；不同计量口径不做数量合计。</p></div></div>
      <DataTable minWidth={1040} columns={materialColumns} rows={state.materialInventorySnapshots} empty={<div className="empty-state compact-empty">还没有原辅料库存记录。</div>} />
    </section>
  </div>;
}

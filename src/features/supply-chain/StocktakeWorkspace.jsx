import { useState } from "react";
import { Check, FileSpreadsheet, Upload } from "lucide-react";
import { parseInventoryImportRows } from "../../domain/supplyChain.js";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable } from "../../ui/DataTable.jsx";
import { rowsFromInventorySpreadsheet } from "./inventoryImportRows.js";

const STAGES = ["生成任务", "线下盘库", "导入实存", "确认差异", "确认金额"];

function completedStage(status) {
  if (status === "confirmed") return 5;
  if (status === "difference_confirmed") return 4;
  if (status === "counted") return 3;
  return status === "created" ? 1 : 0;
}

function statusLabel(status) {
  return {
    created: "待线下盘库",
    counted: "实存已导入",
    difference_confirmed: "差异已确认",
    confirmed: "金额已确认"
  }[status] || "待处理";
}

export function StocktakeWorkspace({ anchorId, products, stocktakes = [], permissions = {}, createStocktake, transitionStocktake }) {
  const { state } = useSupplyChain();
  const [warehouseId, setWarehouseId] = useState("兰山云仓");
  const [countedAt, setCountedAt] = useState(new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function disabledReason(action) {
    if (action === "create" && !permissions.canSubmitCount) return "仅仓库、供应链或总经办可导入实存。";
    if (action === "confirm_difference" && !permissions.canConfirmDifference) return "仅供应链或总经办可确认账实差异。";
    if (action === "confirm_amount" && !permissions.canConfirmAmount) return "仅财务或总经办可确认盘点金额。";
    if (action === "correct" && !permissions.canSubmitCount) return "仅仓库、供应链或总经办可追加更正。";
    return "";
  }

  async function previewFile(file) {
    if (!file) return;
    setParsing(true); setPending(null); setError(""); setNotice("");
    try {
      const rows = await rowsFromInventorySpreadsheet(file);
      const parsed = parseInventoryImportRows(rows, { products, suppliers: state.suppliers, mode: "stocktake" });
      const validRows = parsed.validRows.filter(row => row.productId && row.skuCode && row.countedQuantity !== null && row.countedQuantity !== undefined);
      const rejected = parsed.validRows.length - validRows.length;
      setPending({
        fileName: file.name,
        validRows,
        errors: [...parsed.errors, ...(rejected ? [{ rowNumber: "—", field: "SKU", message: `${rejected} 行缺少产品、69码或实盘数量` }] : [])]
      });
    } catch (event) {
      setError(event.message || "盘点文件解析失败。");
    } finally {
      setParsing(false);
    }
  }

  async function submitCount() {
    if (!pending?.validRows.length || disabledReason("create")) return;
    const id = `stocktake-${countedAt}-${Date.now()}`;
    setBusyId(id); setError(""); setNotice("");
    try {
      await createStocktake({
        id,
        warehouseId,
        countedAt,
        source: "monthly-stocktake-import",
        sourceReference: pending.fileName,
        version: 1,
        lines: pending.validRows.map(row => ({
          skuId: `${row.productId}::${row.skuCode}`,
          warehouseId: row.warehouse || warehouseId,
          erpQuantity: Number(row.erpQuantity || 0),
          countedQuantity: Number(row.countedQuantity || 0),
          unitCost: row.unitCost,
          reason: row.note || "月度线下盘点"
        }))
      });
      setNotice(`实存已导入 ${pending.validRows.length} 行，等待供应链确认差异。`);
      setPending(null);
    } catch (event) {
      setError(event.message || "实存提交失败。");
    } finally {
      setBusyId("");
    }
  }

  async function transition(row, action) {
    const reason = disabledReason(action);
    if (reason) return;
    setBusyId(`${row.id}-${action}`); setError(""); setNotice("");
    try {
      await transitionStocktake(row.id, action, row.version);
      setNotice(action === "confirm_difference" ? "账实差异已确认，等待财务确认金额。" : action === "confirm_amount" ? "盘点金额已确认，校准结果将进入库存投影。" : "已创建追加更正版本，原确认记录继续保留。 ");
    } catch (event) {
      setError(event.message || "盘点状态更新失败。");
    } finally {
      setBusyId("");
    }
  }

  const columns = [
    { key: "warehouse", header: "仓库 / 盘点日", render: row => <span><strong>{row.warehouseId}</strong><small className="table-secondary">{row.countedAt}</small></span> },
    { key: "progress", header: "确认进度", render: row => <span><strong>{statusLabel(row.status)}</strong><small className="table-secondary">版本 {row.version} · {row.lines?.length || 0} 个 SKU</small></span> },
    { key: "people", header: "责任记录", render: row => <span><strong>{row.submittedBy || "待录入"}</strong><small className="table-secondary">差异：{row.differenceConfirmedBy || "待确认"} · 金额：{row.amountConfirmedBy || "待确认"}</small></span> },
    { key: "actions", header: "操作", render: row => {
      const action = row.status === "counted" ? "confirm_difference" : row.status === "difference_confirmed" ? "confirm_amount" : row.status === "confirmed" ? "correct" : "";
      const label = action === "confirm_difference" ? "确认差异" : action === "confirm_amount" ? "确认金额" : action === "correct" ? "追加更正" : "等待实存";
      const reason = disabledReason(action);
      return <Button disabled={!action || Boolean(reason) || Boolean(busyId)} title={reason || undefined} aria-label={reason ? `${label}：${reason}` : label} onClick={() => transition(row, action)}>{busyId === `${row.id}-${action}` ? "处理中…" : label}</Button>;
    } }
  ];

  const latestProgress = stocktakes.length ? Math.max(...stocktakes.map(row => completedStage(row.status))) : 0;
  return (
    <section className="section-panel stocktake-workspace" id={anchorId}>
      <div className="section-head"><div><h2>月度线下盘点</h2><p>ERP 原始快照始终保留；确认后追加盘盈或盘亏事实，不覆盖账面库存。</p></div></div>
      <ol className="stocktake-stages" aria-label="盘点流程">
        {STAGES.map((stage, index) => <li key={stage} className={`stocktake-stage ${index < latestProgress ? "complete" : ""}`}><span>{index < latestProgress ? <Check size={13} /> : index + 1}</span>{stage}</li>)}
      </ol>
      <fieldset className="stocktake-import" disabled={!permissions.canSubmitCount || parsing || Boolean(busyId)}>
        <label>盘点日期<input type="date" value={countedAt} onChange={event => setCountedAt(event.target.value)} /></label>
        <label>默认仓库<input value={warehouseId} onChange={event => setWarehouseId(event.target.value)} /></label>
        <label className={`upload-field ${parsing ? "is-busy" : ""}`}><Upload size={16} />{parsing ? "正在解析…" : "选择实盘 XLSX / CSV"}<input type="file" accept=".xlsx,.csv" onChange={event => { previewFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </fieldset>
      {!permissions.canSubmitCount ? <p className="permission-note">{disabledReason("create")}</p> : null}
      {error ? <p className="supply-message error" role="alert">{error}</p> : null}
      {notice ? <p className="supply-message success" role="status">{notice}</p> : null}
      {pending ? <div className="supply-import-preview"><FileSpreadsheet size={20} /><div><strong>{pending.fileName}</strong><span>有效 {pending.validRows.length} 行 · 失败 {pending.errors.length} 行</span>{pending.errors.slice(0, 3).map((item, index) => <small key={`${item.rowNumber}-${item.field}-${index}`}>第 {item.rowNumber} 行：{item.message}</small>)}</div><div className="supply-import-actions"><Button onClick={() => setPending(null)}>取消</Button><Button variant="primary" disabled={!pending.validRows.length || Boolean(disabledReason("create")) || Boolean(busyId)} title={disabledReason("create") || undefined} onClick={submitCount}>导入实存</Button></div></div> : null}
      <DataTable className="stocktake-table" minWidth={860} columns={columns} rows={stocktakes} empty={<div className="empty-state compact-empty">本月还没有盘点任务。线下盘库完成后导入实存文件即可生成任务。</div>} />
    </section>
  );
}

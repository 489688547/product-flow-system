import { CloudUpload, Database, FileSpreadsheet, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { createSalesAggregator, detectSalesColumns, detectSalesHeader, SALES_COLUMN_RULES } from "../../domain/salesData.js";
import { streamSpreadsheetRows } from "../../domain/xlsxLite.js";
import { deleteSalesMonth, loadSalesMeta, saveSalesData } from "../../state/salesStore.js";
import { Button, IconAction } from "../../ui/Button.jsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";

const RULE_LABELS = new Map(SALES_COLUMN_RULES.map(rule => [rule.key, rule.label]));
const HEADER_SCAN_LIMIT = 8;

async function parseSalesFile(file) {
  const headCandidates = [];
  let detection = null;
  let aggregator = null;
  await streamSpreadsheetRows(file, row => {
    if (!aggregator) {
      headCandidates.push(row);
      const headerInfo = detectSalesHeader(headCandidates);
      if (headerInfo) {
        const detected = detectSalesColumns(headerInfo.header);
        if (!detected.complete) throw new Error(`缺少必要的列：${detected.missing.join("、")}。`);
        detection = detected;
        aggregator = createSalesAggregator(detected.mapping);
      } else if (headCandidates.length >= HEADER_SCAN_LIMIT) {
        throw new Error("没有找到表头行：需要包含商品编码（69码）和销量列。");
      }
      return;
    }
    aggregator.add(row);
  });
  if (!aggregator) throw new Error("没有找到表头行：需要包含商品编码（69码）和销量列。");
  const aggregated = dropEdgeMonths(aggregator.finish());
  if (!aggregated.rows.length) throw new Error("没有解析出有效的销售数据行（69码或日期缺失）。");
  return { detection, aggregated };
}

// A monthly export usually carries a handful of stray rows from adjacent months.
// Saving those slivers would wipe a previously imported complete month, so they
// are dropped and reported instead.
function dropEdgeMonths(aggregated) {
  const counts = new Map();
  aggregated.rows.forEach(row => {
    const month = row.date.slice(0, 7);
    counts.set(month, (counts.get(month) || 0) + 1);
  });
  const threshold = Math.max(30, Math.floor(aggregated.rows.length * 0.02));
  const kept = [...counts.keys()].filter(month => counts.get(month) >= threshold).sort();
  if (!kept.length || kept.length === counts.size) return { ...aggregated, droppedMonths: [] };
  const keptSet = new Set(kept);
  return {
    ...aggregated,
    rows: aggregated.rows.filter(row => keptSet.has(row.date.slice(0, 7))),
    months: kept,
    droppedMonths: [...counts.keys()].filter(month => !keptSet.has(month)).sort().map(month => `${month}(${counts.get(month)}行)`)
  };
}

export function SalesDataSettings({ canEdit = false, currentUser }) {
  const [meta, setMeta] = useState({ imports: [], titles: {}, local: false });
  const [parsing, setParsing] = useState(false);
  const [pending, setPending] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [monthToDelete, setMonthToDelete] = useState("");

  const refreshMeta = () => loadSalesMeta().then(setMeta).catch(event => setError(event.message || "销售数据加载失败。"));
  useEffect(() => { refreshMeta(); }, []);

  async function handleFile(file) {
    if (!file) return;
    setError("");
    setNotice("");
    setPending(null);
    setParsing(true);
    try {
      const { detection, aggregated } = await parseSalesFile(file);
      setPending({ fileName: file.name, detection, aggregated });
    } catch (event) {
      setError(event.message || "文件解析失败。");
    } finally {
      setParsing(false);
    }
  }

  async function handleSave() {
    if (!pending) return;
    setError("");
    try {
      const result = await saveSalesData({
        rows: pending.aggregated.rows,
        titles: pending.aggregated.titles,
        months: pending.aggregated.months,
        source: pending.fileName,
        importedBy: currentUser?.name || ""
      });
      setNotice(result.local ? "已保存到本机浏览器（本地预览模式，未同步到共享数据库）。" : "销售数据已保存并共享给全公司。");
      setPending(null);
      refreshMeta();
    } catch (event) {
      setError(event.message || "销售数据保存失败。");
    }
  }

  function handleDeleteMonth(month) {
    setMonthToDelete(month);
  }

  async function confirmDeleteMonth() {
    const month = monthToDelete;
    setMonthToDelete("");
    if (!month) return;
    setError("");
    try {
      await deleteSalesMonth(month);
      setNotice(`已删除 ${month} 的销售数据。`);
      refreshMeta();
    } catch (event) {
      setError(event.message || "销售数据删除失败。");
    }
  }

  // One row per data month: the ERP export is monthly, so the table mirrors that rhythm.
  const monthRows = [...new Set(meta.imports.flatMap(item => item.months || []))]
    .sort()
    .reverse()
    .map(month => {
      const source = meta.imports.find(item => (item.months || []).includes(month));
      return {
        id: month,
        month,
        rows: source?.monthRows?.[month] ?? source?.rows ?? "—",
        source: source?.source || "",
        importedAt: source?.importedAt || "",
        importedBy: source?.importedBy || ""
      };
    });
  const monthColumns = [
    { key: "month", header: "数据月份", render: item => <strong>{item.month}</strong> },
    { key: "rows", header: "聚合行数", render: item => <span>{item.rows}</span> },
    { key: "source", header: "来源文件", render: item => <span className="muted">{item.source || "—"}</span> },
    { key: "importedAt", header: "导入时间", render: item => <span className="muted">{item.importedAt ? new Date(item.importedAt).toLocaleString("zh-CN", { hour12: false }) : "—"}{item.importedBy ? ` · ${item.importedBy}` : ""}</span> },
    {
      key: "actions", header: "操作", render: item => canEdit ? (
        <TableActions>
          <IconAction label={`删除 ${item.month} 销售数据`} className="danger" onClick={() => handleDeleteMonth(item.month)}><Trash2 size={16} /></IconAction>
        </TableActions>
      ) : <span className="muted">—</span>
    }
  ];

  return (
    <section className="section-panel settings-sales-data">
      <div className="section-head settings-template-head">
        <div>
          <h2>销售数据源</h2>
          <p>导入快麦ERP导出的《销售统计分析-按订单商品明细》Excel（导出时按<strong>付款时间</strong>筛选整月），系统自动按 69码×日×平台 聚合保存。</p>
          <p className="sales-workflow-tip">建议每月导入两个文件：<strong>本月新数据 + 上月重新导出的数据</strong>。晚到的退款会更新在上月订单里，重导上月即可自动校准，不漏数据。</p>
        </div>
        {canEdit ? (
          <label className={`upload-field sales-upload ${parsing ? "is-busy" : ""}`}>
            <CloudUpload size={16} aria-hidden="true" />
            {parsing ? "正在解析…" : "选择 Excel / CSV 文件"}
            <input type="file" accept=".xlsx,.xls,.csv" disabled={parsing} onChange={event => { handleFile(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
        ) : null}
      </div>
      {error ? <p className="sales-import-message error" role="alert">{error}</p> : null}
      {notice ? <p className="sales-import-message success" role="status">{notice}</p> : null}
      {pending ? (
        <div className="sales-import-preview">
          <div className="sales-import-summary">
            <FileSpreadsheet size={18} aria-hidden="true" />
            <div>
              <strong>{pending.fileName}</strong>
              <span>
                识别到 {Object.keys(pending.detection.mapping).length} 列（{Object.keys(pending.detection.mapping).map(key => RULE_LABELS.get(key)).join("、")}）
                · 数据月份 {pending.aggregated.months.join("、")}
                · 原始 {pending.aggregated.sourceRows} 行 → 聚合 {pending.aggregated.rows.length} 行
                · 跳过 {pending.aggregated.skipped} 行（无69码或无日期，含汇总行）
                · 涉及 {Object.keys(pending.aggregated.titles).length} 个69码
                {pending.aggregated.droppedMonths?.length ? ` · 已忽略零星跨月数据 ${pending.aggregated.droppedMonths.join("、")}` : ""}
              </span>
            </div>
          </div>
          <p className="sales-import-warning">保存会覆盖相同月份的已有数据。</p>
          <div className="sales-import-actions">
            <Button onClick={() => setPending(null)}>取消</Button>
            <Button variant="primary" onClick={handleSave}><Database size={16} />确认保存</Button>
          </div>
        </div>
      ) : null}
      <DataTable
        className="sales-import-table"
        minWidth={720}
        columns={monthColumns}
        rows={monthRows}
        empty={<div className="empty-state compact-empty">还没有导入过销售数据{canEdit ? "，每月从ERP按付款时间导出销售明细后在这里上传" : ""}</div>}
      />
      {monthRows.length && meta.local ? <p className="muted sales-import-note">本地预览模式：数据保存在当前浏览器，未进入共享数据库。</p> : null}
      <ConfirmDialog
        open={Boolean(monthToDelete)}
        title="删除销售数据"
        message={monthToDelete ? `确认删除 ${monthToDelete} 的全部销售数据？` : ""}
        description="删除后需要重新导入对应月份的ERP明细才能恢复。"
        onClose={() => setMonthToDelete("")}
        onConfirm={confirmDeleteMonth}
      />
    </section>
  );
}

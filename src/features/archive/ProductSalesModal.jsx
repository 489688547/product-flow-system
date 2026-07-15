import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  buildDailySeries,
  filterRowsByPeriod,
  normalizeSkuCodes,
  resolveSalesPeriod,
  SALES_PERIOD_PRESETS,
  sortPlatformSalesRows,
  summarizeProductSales
} from "../../domain/salesData.js";
import { fetchSalesForCodes, loadSalesMeta } from "../../state/salesStore.js";
import { DataTable } from "../../ui/DataTable.jsx";
import { Modal } from "../../ui/Modal.jsx";

const SalesTrendChart = lazy(() => import("./SalesTrendChart.jsx"));
const DEFAULT_PLATFORM_SORT = { key: "netSales", direction: "desc" };

function formatMoney(value) {
  if (value == null) return "—";
  return `¥${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

function formatPercent(value) {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function PlatformSortHeader({ columnKey, label, sort, onSort }) {
  const active = sort.key === columnKey;
  const Icon = active ? (sort.direction === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
  const directionLabel = active ? (sort.direction === "desc" ? "降序" : "升序") : "排序";
  return (
    <span className={`sales-sort-heading${active ? " active" : ""}`}>
      <span>{label}</span>
      <button type="button" className="sales-sort-button" onClick={() => onSort(columnKey)} aria-label={`${label}${directionLabel}`} title={`${label}${directionLabel}`}>
        <Icon size={14} aria-hidden="true" />
      </button>
    </span>
  );
}

export function ProductSalesModal({ open, product, onClose }) {
  const skuCodes = useMemo(() => normalizeSkuCodes(product?.skuCodes), [product]);
  const [rows, setRows] = useState([]);
  const [preset, setPreset] = useState("15d");
  const [customRange, setCustomRange] = useState({ from: "", to: "" });
  const [selectedCode, setSelectedCode] = useState("all");
  const [skuTitles, setSkuTitles] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [platformSort, setPlatformSort] = useState(DEFAULT_PLATFORM_SORT);

  useEffect(() => {
    if (!open || !skuCodes.length) return undefined;
    let alive = true;
    setLoading(true);
    setError("");
    setPreset("15d");
    setSelectedCode("all");
    setPlatformSort(DEFAULT_PLATFORM_SORT);
    fetchSalesForCodes(skuCodes.map(item => item.code))
      .then(result => alive && setRows(result))
      .catch(event => alive && setError(event.message || "销售数据加载失败。"))
      .finally(() => alive && setLoading(false));
    loadSalesMeta()
      .then(meta => alive && setSkuTitles(meta.titles || {}))
      .catch(() => {});
    return () => { alive = false; };
  }, [open, skuCodes]);

  // 多69码时默认看全部，可切到单个SKU；数据、图表、平台表都跟着变。
  const activeCodes = useMemo(
    () => (selectedCode === "all" ? skuCodes : skuCodes.filter(item => item.code === selectedCode)),
    [skuCodes, selectedCode]
  );
  const activeRows = useMemo(
    () => (selectedCode === "all" ? rows : rows.filter(row => row.code === selectedCode)),
    [rows, selectedCode]
  );
  const period = useMemo(() => resolveSalesPeriod(preset, activeRows, customRange), [preset, activeRows, customRange]);
  const periodRows = useMemo(() => filterRowsByPeriod(activeRows, period), [activeRows, period]);
  const summary = useMemo(() => summarizeProductSales(periodRows, activeCodes), [periodRows, activeCodes]);
  const series = useMemo(() => buildDailySeries(periodRows.filter(row => activeCodes.some(item => item.code === row.code)), period), [periodRows, activeCodes, period]);
  const hasPrices = activeCodes.some(item => item.price);
  const skuLabel = code => [code, skuTitles[code]].filter(Boolean).join(" ");
  const sortedPlatformRows = useMemo(
    () => sortPlatformSalesRows(summary.byPlatform, platformSort),
    [summary.byPlatform, platformSort]
  );
  const togglePlatformSort = key => {
    setPlatformSort(current => current.key === key
      ? { key, direction: current.direction === "desc" ? "asc" : "desc" }
      : { key, direction: key === "platform" ? "asc" : "desc" });
  };
  const sortableHeader = (key, label) => (
    <PlatformSortHeader columnKey={key} label={label} sort={platformSort} onSort={togglePlatformSort} />
  );

  const metrics = [
    { key: "qty", label: "销量", value: summary.totals.qty.toLocaleString("zh-CN") },
    { key: "netSales", label: "销售额", value: formatMoney(summary.totals.netSales) },
    { key: "grossMargin", label: "毛利润率", value: formatPercent(summary.totals.grossMarginRate), sub: `毛利 ${formatMoney(summary.totals.grossProfit)}` },
    { key: "marketing", label: "营销费用率", value: hasPrices ? formatPercent(summary.totals.marketingExpenseRate) : "需设置定价", sub: hasPrices ? `费用 ${formatMoney(summary.totals.marketingExpense)}` : "" },
    { key: "preShip", label: "发货前退款率", value: formatPercent(summary.totals.preShipRefundRate), sub: formatMoney(summary.totals.preShipRefund) },
    { key: "postShip", label: "发货后退款率", value: formatPercent(summary.totals.postShipRefundRate), sub: formatMoney(summary.totals.postShipRefund) }
  ];

  const platformColumns = [
    { key: "platform", label: "平台", header: sortableHeader("platform", "平台"), ariaSort: platformSort.key === "platform" ? `${platformSort.direction}ending` : undefined, render: row => <strong>{row.platform}</strong> },
    { key: "qty", label: "销量", header: sortableHeader("qty", "销量"), ariaSort: platformSort.key === "qty" ? `${platformSort.direction}ending` : undefined, render: row => <span>{row.qty.toLocaleString("zh-CN")}</span> },
    { key: "netSales", label: "销售额", header: sortableHeader("netSales", "销售额"), ariaSort: platformSort.key === "netSales" ? `${platformSort.direction}ending` : undefined, render: row => <span>{formatMoney(row.netSales)}</span> },
    { key: "grossMarginRate", label: "毛利润率", header: sortableHeader("grossMarginRate", "毛利润率"), ariaSort: platformSort.key === "grossMarginRate" ? `${platformSort.direction}ending` : undefined, render: row => <span>{formatPercent(row.grossMarginRate)}</span> },
    { key: "marketingExpenseRate", label: "营销费用率", header: sortableHeader("marketingExpenseRate", "营销费用率"), ariaSort: platformSort.key === "marketingExpenseRate" ? `${platformSort.direction}ending` : undefined, render: row => <span>{hasPrices ? formatPercent(row.marketingExpenseRate) : "—"}</span> },
    { key: "preShipRefundRate", label: "发货前退款率", header: sortableHeader("preShipRefundRate", "发货前退款率"), ariaSort: platformSort.key === "preShipRefundRate" ? `${platformSort.direction}ending` : undefined, render: row => <span className={row.preShipRefundRate > 15 ? "sales-metric-risk" : ""}>{formatPercent(row.preShipRefundRate)}</span> },
    { key: "postShipRefundRate", label: "发货后退款率", header: sortableHeader("postShipRefundRate", "发货后退款率"), ariaSort: platformSort.key === "postShipRefundRate" ? `${platformSort.direction}ending` : undefined, render: row => <span className={row.postShipRefundRate > 15 ? "sales-metric-risk" : ""}>{formatPercent(row.postShipRefundRate)}</span> }
  ];

  return (
    <Modal open={open} title={`${product?.name || "产品"} · 销售数据`} onClose={onClose} size="large">
      <div className="sales-modal-meta">
        {skuCodes.length > 1 ? (
          <label className="sales-month-select">69码
            <select value={selectedCode} onChange={event => setSelectedCode(event.target.value)} aria-label="选择69码">
              <option value="all">全部69码（{skuCodes.length}个）</option>
              {skuCodes.map(item => <option key={item.code} value={item.code}>{skuLabel(item.code)}</option>)}
            </select>
          </label>
        ) : (
          <span>69码:{skuCodes[0]?.code || "未设置"}</span>
        )}
        <div className="sales-period-picker" role="group" aria-label="统计周期">
          {SALES_PERIOD_PRESETS.map(item => (
            <button
              type="button"
              key={item.key}
              className={preset === item.key ? "active" : ""}
              onClick={() => setPreset(item.key)}
            >{item.label}</button>
          ))}
        </div>
      </div>
      {preset === "custom" ? (
        <div className="sales-custom-range">
          <label>从<input type="date" value={customRange.from} onChange={event => setCustomRange(current => ({ ...current, from: event.target.value }))} /></label>
          <label>到<input type="date" value={customRange.to} onChange={event => setCustomRange(current => ({ ...current, to: event.target.value }))} /></label>
        </div>
      ) : null}
      <p className="muted sales-period-note">统计周期 {period.start} ~ {period.end}{hasPrices ? " · 营销费用 = 定价×销量 − 销售额" : " · 在产品编辑里为69码填写定价后可计算营销费用"}</p>
      {loading ? <div className="empty-state compact-empty">正在加载销售数据…</div> : null}
      {error ? <p className="sales-import-message error" role="alert">{error}</p> : null}
      {!loading && !error && !rows.length ? (
        <div className="empty-state compact-empty">还没有这个产品的销售数据，请先在「设置 → 销售数据源」导入销售明细 Excel。</div>
      ) : null}
      {!loading && rows.length ? (
        <>
          <div className="sales-metric-grid six">
            {metrics.map(metric => (
              <div className="sales-metric-card" key={metric.key}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                {metric.sub ? <small>{metric.sub}</small> : null}
              </div>
            ))}
          </div>
          <figure className="sales-trend">
            <figcaption>日销售额趋势</figcaption>
            <Suspense fallback={<div className="empty-state compact-empty">正在加载图表…</div>}>
              <SalesTrendChart series={series} />
            </Suspense>
          </figure>
          <DataTable
            className="sales-platform-table"
            minWidth={760}
            columns={platformColumns}
            rows={sortedPlatformRows.map(row => ({ ...row, id: row.platform }))}
            empty={<div className="empty-state compact-empty">当前周期内没有销售数据</div>}
          />
        </>
      ) : null}
    </Modal>
  );
}

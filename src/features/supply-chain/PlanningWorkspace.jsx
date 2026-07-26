import { ArchiveX, Flame, PackagePlus, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { calculateProcurementSuggestion, classifyStockRisk } from "../../domain/supplyChainWorkflow.js";
import { Button } from "../../ui/Button.jsx";

const RISK_LABELS = Object.freeze({
  replenish: "断货风险",
  spike: "爆单风险",
  clearance: "清仓建议",
  healthy: "库存正常",
  unknown: "数据待补"
});

function productCodes(product) {
  return (product?.skuCodes || [])
    .map(value => typeof value === "object" ? value.code : value)
    .map(value => String(value || "").trim())
    .filter(Boolean);
}

function dateOnly(value) {
  const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] || "";
}

function averageSales(rows) {
  const dates = new Set(rows.map(row => dateOnly(row.date || row.createdAt)).filter(Boolean));
  const quantity = rows.reduce((sum, row) => sum + Number(row.qty ?? row.quantity ?? 0), 0);
  return {
    average: dates.size ? quantity / dates.size : null,
    today: dates.size
      ? rows.filter(row => dateOnly(row.date || row.createdAt) === [...dates].sort().at(-1))
        .reduce((sum, row) => sum + Number(row.qty ?? row.quantity ?? 0), 0)
      : null
  };
}

function matchingSupplyLink(productId, links) {
  return links.find(link => link.productId === productId && String(link.status || "active").toLowerCase() === "active")
    || links.find(link => link.productId === productId)
    || null;
}

function buildPlanningRows({ products, summary, salesRows, risks, supplyLinks }) {
  const summaryByProduct = new Map((summary?.byProduct || []).map(item => [item.productId, item]));
  const productByCode = new Map(products.flatMap(product => productCodes(product).map(code => [code, product.id])));
  const salesByProduct = new Map();
  for (const row of salesRows) {
    const productId = productByCode.get(String(row.code || row.skuCode || "").trim());
    if (!productId) continue;
    const current = salesByProduct.get(productId) || [];
    current.push(row);
    salesByProduct.set(productId, current);
  }
  return products.map(product => {
    const productSummary = summaryByProduct.get(product.id) || {};
    const productRisk = risks.find(item => item.productId === product.id || productCodes(product).includes(String(item.skuCode || ""))) || null;
    const link = matchingSupplyLink(product.id, supplyLinks);
    const sales = averageSales(salesByProduct.get(product.id) || []);
    const inventoryQuantity = productSummary.hasErpSnapshot ? Number(productSummary.erpInventoryQuantity || 0) : null;
    const averageDailySales = sales.average;
    const daysOfSupply = productRisk?.sellableDays ?? (
      inventoryQuantity !== null && averageDailySales > 0
        ? Math.round(inventoryQuantity / averageDailySales * 10) / 10
        : null
    );
    const longestLeadTimeDays = productRisk?.longestLeadTimeDays
      ?? link?.longestLeadTimeDays
      ?? link?.productionCycleDays
      ?? null;
    const risk = classifyStockRisk({
      daysOfSupply,
      longestLeadTimeDays,
      todaySales: sales.today,
      averageDailySales
    });
    const suggestion = calculateProcurementSuggestion({
      inventoryQuantity,
      averageDailySales,
      seasonalDailySales: productRisk?.seasonalDailySales,
      promotionDailySales: productRisk?.promotionDailySales,
      promotionDays: productRisk?.promotionDays,
      longestLeadTimeDays,
      minimumOrderQuantity: link?.minimumOrderQuantity ?? link?.moq,
      capacityPerBatch: link?.capacityPerBatch ?? link?.dailyCapacity,
      coverage: {
        inventory: inventoryQuantity !== null,
        demand: averageDailySales !== null,
        seasonal: productRisk?.seasonalDailySales !== null && productRisk?.seasonalDailySales !== undefined,
        promotions: productRisk?.promotionCoverage === "complete",
        leadTime: longestLeadTimeDays !== null,
        moq: link?.minimumOrderQuantity !== null && link?.minimumOrderQuantity !== undefined || link?.moq !== null && link?.moq !== undefined,
        capacity: link?.capacityPerBatch !== null && link?.capacityPerBatch !== undefined || link?.dailyCapacity !== null && link?.dailyCapacity !== undefined
      }
    });
    return {
      id: product.id,
      name: product.name || product.productName || "未命名产品",
      category: product.category || "未分类",
      daysOfSupply,
      averageDailySales,
      inventoryQuantity,
      risk,
      suggestion
    };
  }).sort((left, right) => {
    const priority = { replenish: 0, spike: 1, clearance: 2, unknown: 3, healthy: 4 };
    return priority[left.risk.kind] - priority[right.risk.kind]
      || (left.daysOfSupply ?? Number.POSITIVE_INFINITY) - (right.daysOfSupply ?? Number.POSITIVE_INFINITY)
      || left.name.localeCompare(right.name, "zh-CN");
  });
}

function displayNumber(value, suffix = "") {
  return value === null || value === undefined
    ? "待接入"
    : `${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}${suffix}`;
}

function RiskIcon({ kind }) {
  if (kind === "replenish") return <TriangleAlert size={16} aria-hidden="true" />;
  if (kind === "spike") return <Flame size={16} aria-hidden="true" />;
  if (kind === "clearance") return <ArchiveX size={16} aria-hidden="true" />;
  return <PackagePlus size={16} aria-hidden="true" />;
}

export function PlanningWorkspace({
  products = [],
  summary,
  salesRows = [],
  risks = [],
  supplyLinks = [],
  inventoryCoverage,
  inventoryReadError = "",
  workflowAvailable = false
}) {
  const rows = useMemo(
    () => buildPlanningRows({ products, summary, salesRows, risks, supplyLinks }),
    [products, risks, salesRows, summary, supplyLinks]
  );
  const actionableRows = rows.filter(row => ["replenish", "spike", "clearance"].includes(row.risk.kind));
  const unknownRows = rows.filter(row => row.risk.kind === "unknown");
  const visibleRows = actionableRows.length ? actionableRows : unknownRows.slice(0, 50);
  const [selectedId, setSelectedId] = useState(() => visibleRows[0]?.id || "");
  const selected = visibleRows.find(row => row.id === selectedId) || visibleRows[0] || null;
  const [adjustedQuantity, setAdjustedQuantity] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const counts = {
    replenish: rows.filter(row => row.risk.kind === "replenish").length,
    spike: rows.filter(row => row.risk.kind === "spike").length,
    clearance: rows.filter(row => row.risk.kind === "clearance").length
  };

  function selectRow(id) {
    setSelectedId(id);
    setAdjustedQuantity("");
    setAdjustmentReason("");
  }

  const finalQuantity = adjustedQuantity === ""
    ? selected?.suggestion.suggestedQuantity || 0
    : Math.max(0, Number(adjustedQuantity) || 0);
  const changed = selected ? finalQuantity !== selected.suggestion.suggestedQuantity : false;
  const canConfirm = Boolean(selected?.suggestion.canConfirm && workflowAvailable && (!changed || adjustmentReason.trim()));

  return (
    <div className="supply-planning-workspace">
      <header className="supply-workbench-heading">
        <div>
          <h2>库存风险与采购建议</h2>
          <p>系统解释库存、销量、周期、促销、起订量和产能依据；缺数据时保留未知，不按 0 计算。</p>
        </div>
        <small>销售按订单创建时间 · Asia/Shanghai</small>
      </header>
      <dl className="supply-planning-alerts" aria-label="采购风险摘要">
        <div><dt><TriangleAlert size={16} aria-hidden="true" />断货风险</dt><dd>{counts.replenish}</dd></div>
        <div><dt><Flame size={16} aria-hidden="true" />爆单风险</dt><dd>{counts.spike}</dd></div>
        <div><dt><ArchiveX size={16} aria-hidden="true" />清仓建议</dt><dd>{counts.clearance}</dd></div>
      </dl>
      {!workflowAvailable ? (
        <p className="supply-message warning" role="status">
          采购建议可查看和调整预览；版本化工作流接入后可确认并生成采购计划。
        </p>
      ) : null}
      {inventoryCoverage?.totalRows > 0 ? (
        <div className="supply-coverage-notice is-partial" role="status">
          <TriangleAlert size={17} aria-hidden="true" />
          <span>
            <strong>ERP 库存快照已存在 {inventoryCoverage.totalRows} 条，最新 {inventoryCoverage.latestDate || "日期待确认"}</strong>
            <small>
              {inventoryCoverage.matchedRows} 条已匹配商品，{inventoryCoverage.unmatchedRows} 条编码待匹配。
              {inventoryReadError ? "共享库存接口当前不可读，采购建议仅使用已匹配快照；接口恢复后自动读取当前库存。" : "采购建议只使用已匹配且具备需求依据的库存。"}
            </small>
          </span>
        </div>
      ) : null}
      {unknownRows.length ? (
        <div className="supply-coverage-notice is-partial" role="status">
          <TriangleAlert size={17} aria-hidden="true" />
          <span>
            <strong>{unknownRows.length} 个产品未进入采购建议</strong>
            <small>缺少已匹配库存、销量或周期依据；待编码映射和共享事实恢复后自动重算，不按 0 参与风险判断。</small>
          </span>
        </div>
      ) : null}
      {selected ? (
        <div className="supply-planning-layout">
          <section className="supply-planning-table" aria-label="产品库存风险">
            <table>
              <thead><tr><th>风险</th><th>产品</th><th className="num">可售</th><th className="num">建议量</th></tr></thead>
              <tbody>
                {visibleRows.map(row => (
                  <tr key={row.id} className={row.id === selected.id ? "is-selected" : ""}>
                    <td>
                      <button type="button" className={`supply-risk-link is-${row.risk.kind}`} onClick={() => selectRow(row.id)}>
                        <RiskIcon kind={row.risk.kind} />{RISK_LABELS[row.risk.kind]}
                      </button>
                    </td>
                    <td><strong>{row.name}</strong><small>{row.category} · 日销 {displayNumber(row.averageDailySales)}</small></td>
                    <td className="num">{displayNumber(row.daysOfSupply, "天")}</td>
                    <td className="num"><strong>{displayNumber(row.suggestion.suggestedQuantity)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <aside className="supply-suggestion-detail" aria-label={`${selected.name}采购建议`}>
            <div className="supply-suggestion-title">
              <span className={`supply-task-state is-${selected.risk.kind === "replenish" ? "overdue" : selected.risk.kind === "healthy" ? "normal" : "due_soon"}`}>{RISK_LABELS[selected.risk.kind]}</span>
              <h3>{selected.name}</h3>
              <p>{selected.risk.reason}</p>
            </div>
            <dl className="supply-before-after" aria-label="采购前后库存">
              <div><dt>采购前库存</dt><dd>{displayNumber(selected.inventoryQuantity)}</dd></div>
              <div><dt>系统建议量</dt><dd>{displayNumber(selected.suggestion.suggestedQuantity)}</dd></div>
              <div><dt>采购后库存</dt><dd>{displayNumber(selected.suggestion.projectedInventory)}</dd></div>
              <div><dt>预计覆盖</dt><dd>{displayNumber(selected.suggestion.projectedDaysOfSupply, "天")}</dd></div>
            </dl>
            <section className="supply-suggestion-basis">
              <h4>计算依据</h4>
              <ul>{selected.suggestion.basis.map(item => <li key={item}>{item}</li>)}</ul>
              {selected.suggestion.quality.missing.length ? <p>待补：{selected.suggestion.quality.missing.join("、")}</p> : null}
            </section>
            {selected.suggestion.rollout.length > 1 ? (
              <section className="supply-suggestion-rollout">
                <h4>滚动补货</h4>
                <ol>{selected.suggestion.rollout.map(item => <li key={item.sequence}>第 {item.sequence} 批：{item.quantity.toLocaleString("zh-CN")} 件{item.offsetDays ? `，第 ${item.offsetDays} 天` : "，立即"}</li>)}</ol>
              </section>
            ) : null}
            <div className="supply-adjustment-form">
              <label>最终采购量
                <input type="number" min="0" value={adjustedQuantity} placeholder={String(selected.suggestion.suggestedQuantity)} onChange={event => setAdjustedQuantity(event.target.value)} />
              </label>
              <label>调整依据
                <textarea rows="3" value={adjustmentReason} placeholder={changed ? "调整数量后必须填写判断依据" : "数量未调整时可不填"} onChange={event => setAdjustmentReason(event.target.value)} />
              </label>
              <Button variant="primary" disabled={!canConfirm} disabledReason={!workflowAvailable ? "版本化采购建议工作流尚未接入" : selected.suggestion.quality.missing.length ? "采购依据数据尚未完整" : changed && !adjustmentReason.trim() ? "请填写调整依据" : "当前无法确认"}>
                工作流接入后可确认
              </Button>
            </div>
          </aside>
        </div>
      ) : (
        <div className="supply-workbench-empty">
          <PackagePlus size={22} aria-hidden="true" />
          <strong>暂无可计算产品</strong>
          <span>商品、库存和销售事实接入后，系统会生成库存风险与采购建议。</span>
        </div>
      )}
    </div>
  );
}

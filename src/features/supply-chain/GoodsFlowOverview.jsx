import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "../../ui/Button.jsx";
import { SupplyChainProductFundsTable } from "./SupplyChainOverview.jsx";

function numberText(value, digits = 1) {
  return Number(value).toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function MetricHeadline({ label, value, unit, reason }) {
  const unavailable = value === null || value === undefined;
  return (
    <div className="goods-flow-headline" tabIndex={0} aria-label={`${label}：${unavailable ? reason : `${numberText(value)}${unit}`}`}>
      <span>{label}</span>
      <strong>{unavailable ? "—" : numberText(value)}<small>{unavailable ? "" : unit}</small></strong>
      <p>{unavailable ? reason : "按当前完整来源计算"}</p>
    </div>
  );
}

function coverageText(coverage = {}) {
  const values = Object.values(coverage).filter(Number.isFinite);
  if (!values.length) return "尚无可用数据";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `${Math.round(average * 100)}%`;
}

function legacyExceptions(summary) {
  const rows = [
    ["待映射采购", summary?.exceptions?.unmappedApprovals],
    ["未关联付款", summary?.exceptions?.unmappedPayments],
    ["付款超申请", summary?.exceptions?.overpaidPurchases],
    ["待关闭质量问题", summary?.exceptions?.openQualityIssues],
    ["待确认盘点调整", summary?.exceptions?.pendingAdjustments]
  ];
  return rows.filter(([, count]) => Number(count) > 0).map(([label, count]) => ({ id: label, message: label, count }));
}

function GoodsFlowExceptionStrip({ exceptions = [] }) {
  return (
    <section className="goods-flow-exceptions" aria-labelledby="goods-flow-decisions-title">
      <div>
        <h2 id="goods-flow-decisions-title">需要判断</h2>
        <p>只列会影响库存、实付或质量结论的例外。</p>
      </div>
      {exceptions.length ? (
        <ul>
          {exceptions.slice(0, 6).map(row => (
            <li key={row.id || row.code || row.message}>
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{row.message || row.code}</span>
              {row.count ? <strong>{row.count}</strong> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="goods-flow-clear"><CheckCircle2 size={16} aria-hidden="true" />当前没有需要人工判断的货流例外。</p>
      )}
    </section>
  );
}

export function GoodsFlowOverview({ dashboard, legacySummary, stale = false, loading = false, error = "", onRefresh }) {
  const metrics = dashboard?.metrics || {};
  const exceptions = dashboard?.exceptions?.length ? dashboard.exceptions : legacyExceptions(legacySummary);
  const unavailableReason = dashboard ? "来源覆盖不足，暂不可计算" : "尚无可用数据，请先完成库存、销量、账期和付款接入";
  const updatedAt = metrics.calculatedAt || metrics.sourceUpdatedAt;
  return (
    <div className="goods-flow-workspace">
      <section className="goods-flow-status" aria-label="数据状态">
        <div>
          <strong>数据覆盖 {coverageText(metrics.coverage)}</strong>
          <span>{updatedAt ? `计算于 ${new Date(updatedAt).toLocaleString("zh-CN", { hour12: false })}` : "尚未生成月度 CCC"}</span>
          <span>{metrics.formulaVersion ? `公式 ${metrics.formulaVersion} · 版本 ${metrics.version || 1}` : "等待第一版可复算结果"}</span>
        </div>
        <div className="goods-flow-status-action">
          {stale || error ? <span className="status-badge warning">当前展示上次成功数据</span> : <span className="status-badge neutral">{metrics.confidence === "complete" ? "来源完整" : "待补齐来源"}</span>}
          <Button onClick={onRefresh} disabled={loading}><RefreshCw size={15} aria-hidden="true" />{loading ? "刷新中…" : "刷新数据"}</Button>
        </div>
      </section>

      {error ? <p className="supply-message warning" role="status">{error}</p> : null}

      <section className="goods-flow-headlines" aria-label="货流核心指标">
        <MetricHeadline label="CCC 现金循环周期" value={metrics.cccDays} unit="天" reason={unavailableReason} />
        <MetricHeadline label="断货率" value={metrics.stockoutRate} unit="%" reason={unavailableReason} />
        <MetricHeadline label="库存周转天数" value={metrics.inventoryDays} unit="天" reason={unavailableReason} />
      </section>

      <GoodsFlowExceptionStrip exceptions={exceptions} />

      <section className="goods-flow-formula" aria-label="现金循环口径">
        <div><strong>现金循环</strong><span>库存周转天数 + 应收天数 − 应付天数</span></div>
        <div><strong>库存资金</strong><span>采购实付 − 按销量消耗成本 ± 已确认盘点损益</span></div>
        <div><strong>库存校准</strong><span>最近实盘 + 盘点后 ERP 数量变化</span></div>
      </section>

      <SupplyChainProductFundsTable
        summary={legacySummary}
        title="库存资金与来源核对"
        description="保留现有采购实付、销售成本、ERP 账面库存和月度实盘证据；新指标不覆盖原始数据。"
      />
    </div>
  );
}

const STATUS_LABELS = Object.freeze({
  trusted: "可信",
  partial: "部分覆盖",
  stale: "数据过期",
  unavailable: "不可用"
});

const RULES = Object.freeze([
  { name: "销售需求归属", value: "订单创建时间 · Asia/Shanghai · 默认排除其它", version: "company-sales-v1" },
  { name: "盘点差异", value: "理论与实盘差异 5% 内可接受，超阈值需讨论", version: "stocktake-v1" },
  { name: "BOM 损耗", value: "组成 SKU 成本 × 用量后默认上浮 10%；缺成本不计算", version: "bom-cost-v1" },
  { name: "清仓阈值", value: "可售天数 > 45 天，结合过季、过节与日动销 < 20", version: "clearance-v1" },
  { name: "采购建议", value: "覆盖最长周期并结合同比、活动、MOQ 与产能", version: "procurement-v1" }
]);

export function DataRulesWorkspace({ sources = [], workflowAvailable = false, children }) {
  return (
    <div className="supply-work-grid supply-data-rules">
      <section className="section-panel">
        <div className="section-head"><div><h2>数据覆盖</h2><p>商品主数据、ERP 库存、销售需求、采购与付款、质量与售后分别显示来源和可信状态。</p></div></div>
        <div className="supply-source-grid">
          {sources.map(source => {
            const status = ["trusted", "partial", "stale", "unavailable"].includes(source.status) ? source.status : "partial";
            return <article key={source.name}>
              <div><strong>{source.name}</strong><span className={`status-badge ${status === "trusted" ? "success" : status === "unavailable" ? "danger" : "warning"}`}>{STATUS_LABELS[status]}</span></div>
              <p>{source.description}</p>
              <b>{source.countLabel}</b>
              <small>{source.updatedAt ? `最近可信：${source.updatedAt}` : "最近可信时间待补"}</small>
            </article>;
          })}
          <article>
            <div><strong>工作流命令</strong><span className={`status-badge ${workflowAvailable ? "success" : "neutral"}`}>{workflowAvailable ? "已接通" : "计划中"}</span></div>
            <p>责任规则、采购计划、供应商评价、质量标准与运费核对</p>
            <b>{workflowAvailable ? "版本化写入已开放" : "DEV-000006 未交付"}</b>
            <small>未接通前所有新动作保持禁用</small>
          </article>
        </div>
      </section>
      <section className="section-panel">
        <div className="section-head"><div><h2>规则目录</h2><p>规则值、版本与数据口径集中可见；版本化编辑由共享工作流服务提供。</p></div></div>
        <div className="supply-rule-list">
          {RULES.map(rule => <article key={rule.name}><div><strong>{rule.name}</strong><small>{rule.version}</small></div><p>{rule.value}</p></article>)}
        </div>
      </section>
      {children}
    </div>
  );
}

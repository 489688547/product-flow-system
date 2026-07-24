import { ArrowDownRight, ArrowUpRight, Minus, Radio, RefreshCw, Store, Video } from "lucide-react";

const money = value => value == null ? "暂无" : `¥${Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
const count = value => value == null ? "暂无" : Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
const percent = value => value == null ? "暂无" : `${(Number(value) * 100).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`;

function formatMetric(value, format) {
  if (format === "money") return money(value);
  if (format === "percent") return percent(value);
  return count(value);
}

// 金额与数量用相对百分比，比率（退款率、点击率）用百分点，符合数据总览既有口径约定。
function deltaLabel(comparison, format) {
  if (format === "percent") {
    const points = Math.abs(Number(comparison.delta) * 100);
    return `${points.toLocaleString("zh-CN", { maximumFractionDigits: 1 })} 个百分点`;
  }
  const ratio = comparison.changeRatio;
  if (ratio == null) return "较昨日无可比基数";
  return `${Math.abs(ratio * 100).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}%`;
}

function ChangeBadge({ comparison, format, compact = false }) {
  if (!comparison || !comparison.available) {
    return <span className={`store-ops-delta na${compact ? " compact" : ""}`}><Minus size={12} aria-hidden="true" />首日无同比</span>;
  }
  if (comparison.direction === "flat") {
    return <span className={`store-ops-delta flat${compact ? " compact" : ""}`}><Minus size={12} aria-hidden="true" />持平</span>;
  }
  const up = comparison.direction === "up";
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const tone = comparison.favorable ? "up" : "down";
  const word = up ? "环比上升" : "环比下降";
  const text = deltaLabel(comparison, format);
  return (
    <span className={`store-ops-delta ${tone}${compact ? " compact" : ""}`} aria-label={`${word} ${text}`}>
      <Icon size={12} aria-hidden="true" />{text}
    </span>
  );
}

function StoreSwitcher({ stores, selectedStore, onSelectStore }) {
  return (
    <label className="store-ops-switcher">
      <Store size={15} aria-hidden="true" />
      <select value={selectedStore || ""} onChange={event => onSelectStore(event.target.value)} aria-label="切换店铺查看经营数据">
        {stores.map(store => <option key={store.storeId} value={store.storeId}>{store.storeName || store.storeId}（{store.storeId}）</option>)}
      </select>
    </label>
  );
}

function PanelShell({ businessDate, children, stores, selectedStore, onSelectStore }) {
  return (
    <section className="section-panel store-ops-panel" aria-label="店铺经营数据">
      <div className="store-ops-head">
        <div className="store-ops-title">
          <h2>店铺经营数据</h2>
          <p>抖店罗盘 · 店铺每日汇总与同比昨天{businessDate ? <span className="store-ops-datepill">业务日 {businessDate}</span> : null}</p>
        </div>
        {stores?.length ? <StoreSwitcher stores={stores} selectedStore={selectedStore} onSelectStore={onSelectStore} /> : null}
      </div>
      {children}
    </section>
  );
}

export function StoreOperationsPanel({
  stores = [],
  selectedStore = "",
  onSelectStore,
  storeDaily,
  products,
  content,
  loading = false,
  error = null,
  permissionDenied = false
}) {
  if (permissionDenied) {
    return <PanelShell><div className="store-ops-empty">当前账号无权查看店铺经营数据，可联系数据中心开通。</div></PanelShell>;
  }
  if (!stores.length) {
    return <PanelShell><div className="store-ops-empty">{loading ? "正在读取店铺经营数据…" : "尚无已登记的抖店店铺。"}</div></PanelShell>;
  }
  const businessDate = storeDaily?.businessDate;
  const shell = children => <PanelShell businessDate={businessDate} stores={stores} selectedStore={selectedStore} onSelectStore={onSelectStore}>{children}</PanelShell>;

  if (error) return shell(<div className="store-ops-empty">{error}</div>);
  if (loading && !businessDate) return shell(<div className="store-ops-empty"><RefreshCw size={15} className="is-spinning" aria-hidden="true" />正在读取该店铺经营数据…</div>);
  if (!businessDate) return shell(<div className="store-ops-empty">该店铺暂无经营数据，等待抖店罗盘采集完成后显示。</div>);

  const maxProductGmv = Math.max(1, ...(products?.rows || []).map(row => row.gmv || 0));

  return shell(
    <>
      <div className="store-ops-kpi">
        {storeDaily.metrics.map(metric => (
          <article key={metric.key} className={metric.key === "transactionAmount" ? "is-hero" : undefined}>
            <span className="store-ops-kpi-label">{metric.label}</span>
            <strong className="store-ops-kpi-value">{formatMetric(metric.value, metric.format)}</strong>
            <ChangeBadge comparison={metric.comparison} format={metric.format} />
          </article>
        ))}
      </div>

      <div className="store-ops-detail-grid">
        <div className="store-ops-products">
          <div className="store-ops-subhead"><h3>重点商品 Top {products?.rows?.length || 0}</h3><span>按成交金额</span></div>
          {(products?.rows || []).length ? (
            <ol className="store-ops-rank">
              {products.rows.map((row, index) => (
                <li key={row.productId}>
                  <span className={`store-ops-rank-no${index < 3 ? " is-top" : ""}`}>{index + 1}</span>
                  <div className="store-ops-rank-main">
                    <span className="store-ops-rank-name" title={row.productName}>{row.productName}</span>
                    <i className="store-ops-rank-bar" aria-hidden="true"><b style={{ width: `${Math.max(4, (row.gmv || 0) / maxProductGmv * 100)}%` }} /></i>
                  </div>
                  <div className="store-ops-rank-figures">
                    <b>{money(row.gmv)}</b>
                    <ChangeBadge comparison={row.comparison} format="money" compact />
                  </div>
                </li>
              ))}
            </ol>
          ) : <div className="store-ops-empty compact">当日暂无商品经营数据。</div>}
        </div>

        <div className="store-ops-content">
          <div className="store-ops-subhead"><h3>直播 / 短视频</h3></div>
          <div className="store-ops-tiles">
            <div className="store-ops-tile">
              <span className="store-ops-tile-icon"><Radio size={16} aria-hidden="true" /></span>
              <span className="store-ops-tile-label">直播成交</span>
              <strong>{money(content?.live?.transactionAmount)}</strong>
              <small>{content?.live?.businessDate || businessDate} · {content?.live?.sessionCount || 0} 场</small>
            </div>
            <div className="store-ops-tile">
              <span className="store-ops-tile-icon"><Video size={16} aria-hidden="true" /></span>
              <span className="store-ops-tile-label">短视频成交</span>
              <strong>{money(content?.video?.transactionAmount)}</strong>
              <small>{content?.video?.businessDate || businessDate} · {content?.video?.videoCount || 0} 条</small>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

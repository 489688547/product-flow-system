const EXCLUDED_PLATFORMS = new Set(["", "其它", "其他", "未知", "未知平台"]);

const CONNECTOR_PLATFORMS = Object.freeze({
  "douyin-ecommerce": "抖音",
  oceanengine: "巨量引擎",
  kuaishou: "快手",
  taobao: "天猫 / 淘宝",
  pinduoduo: "拼多多",
  xiaohongshu: "小红书",
  "jd-jingmai": "京东"
});

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableRatio(numerator, denominator) {
  return denominator ? numerator / denominator * 100 : null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function skuCodes(item = {}) {
  return new Set((item.skus || []).flatMap(sku => [sku?.barcode, sku?.merchantSkuCode]).map(text).filter(Boolean));
}

function aggregateRows(rows) {
  if (!rows.length) return {
    netSales: null,
    grossProfit: null,
    refundRate: null,
    grossMarginRate: null,
    quantity: null
  };
  const totals = rows.reduce((sum, row) => ({
    sales: sum.sales + number(row.sales),
    netSales: sum.netSales + number(row.netSales),
    grossProfit: sum.grossProfit + number(row.grossProfit),
    refund: sum.refund + number(row.refund),
    quantity: sum.quantity + number(row.qty ?? row.quantity)
  }), { sales: 0, netSales: 0, grossProfit: 0, refund: 0, quantity: 0 });
  return {
    netSales: totals.netSales,
    grossProfit: totals.grossProfit,
    refundRate: nullableRatio(totals.refund, totals.sales),
    grossMarginRate: nullableRatio(totals.grossProfit, totals.netSales),
    quantity: totals.quantity
  };
}

function productRows(item, rows) {
  const codes = skuCodes(item);
  return rows.filter(row => codes.has(text(row.code)));
}

function buildProducts(catalogItems, rows) {
  return (catalogItems || []).map(item => {
    const matching = productRows(item, rows);
    const platforms = [...new Set(matching.map(row => text(row.platform)).filter(Boolean))];
    return {
      id: text(item.id),
      name: text(item.name) || "未命名商品",
      brand: text(item.brand),
      category: text(item.category),
      mappingStatus: skuCodes(item).size ? "mapped" : "unmapped",
      metrics: aggregateRows(matching),
      platforms,
      platformMetrics: buildPlatforms(matching)
    };
  }).sort((left, right) => number(right.metrics.netSales) - number(left.metrics.netSales) || left.name.localeCompare(right.name, "zh-CN"));
}

function buildPlatforms(rows) {
  const values = new Map();
  for (const row of rows) {
    const platform = text(row.platform);
    const current = values.get(platform) || [];
    current.push(row);
    values.set(platform, current);
  }
  return [...values.entries()].map(([platform, platformRows]) => ({
    id: `platform-${platform}`,
    platform,
    metrics: aggregateRows(platformRows)
  })).sort((left, right) => number(right.metrics.netSales) - number(left.metrics.netSales));
}

function buildStores(connections) {
  return (connections || []).flatMap(connection => {
    const platform = CONNECTOR_PLATFORMS[connection?.connectorId];
    const datasets = Array.isArray(connection?.datasets) ? connection.datasets : [];
    const isStoreConnection = !datasets.length || datasets.some(dataset => ["orders", "shop-performance", "shop_performance"].includes(text(dataset)));
    if (!platform || connection?.enabled === false || !isStoreConnection) return [];
    return [{
      id: text(connection.id),
      platform,
      connectorId: text(connection.connectorId),
      accountType: text(connection.accountType),
      name: text(connection.name) || "未命名店铺",
      status: text(connection.status) || "pending_validation",
      lastDataDate: text(connection.lastDataDate)
    }];
  });
}

function buildInventorySummary(inventory, dashboard, quality) {
  const rows = Array.isArray(inventory) ? inventory : [];
  const days = rows.map(row => nullableNumber(row?.daysOfSupply)).filter(value => value !== null);
  const metrics = dashboard?.metrics || {};
  return {
    rowCount: rows.length,
    sellableQuantity: rows.reduce((total, row) => total + number(row?.sellableQuantity), 0),
    minimumDaysOfSupply: days.length ? Math.min(...days) : null,
    inventoryDays: nullableNumber(metrics.inventoryDays),
    stockoutRate: nullableNumber(metrics.stockoutRate),
    coverage: nullableNumber(quality?.inventoryCoverage),
    confidence: text(quality?.confidence || metrics.confidence) || null
  };
}

export function buildOperationsDataSnapshot({
  salesRows = [],
  catalogItems = [],
  connections = [],
  range = {},
  salesMeta = {},
  metricResults,
  inventory = null,
  goodsFlowDashboard = null,
  inventoryQuality = null,
  advertising = null
} = {}) {
  const rows = salesRows.filter(row => {
    const platform = text(row?.platform);
    const date = text(row?.date);
    return !EXCLUDED_PLATFORMS.has(platform)
      && (!range.from || date >= range.from)
      && (!range.to || date <= range.to);
  });
  const latestDataDate = rows.reduce((latest, row) => text(row.date) > latest ? text(row.date) : latest, text(salesMeta.latestDataDate));
  const products = buildProducts(catalogItems, rows);
  const stores = buildStores(connections);
  const unavailable = !rows.length;
  const stale = Boolean(rows.length && range.to && latestDataDate && latestDataDate < range.to);
  const rawMetrics = aggregateRows(rows);
  const governedByCode = Array.isArray(metricResults) ? new Map(metricResults
    .filter(result => (!result.from || result.from === text(range.from)) && (!result.to || result.to === text(range.to)))
    .map(result => [result.metricCode, result])) : null;
  const governedValue = code => governedByCode?.has(code) ? governedByCode.get(code)?.value ?? null : null;
  const metrics = governedByCode ? {
    netSales: governedValue("sales.net_sales"),
    grossProfit: governedValue("sales.gross_profit"),
    refundRate: governedValue("sales.refund_rate"),
    grossMarginRate: governedValue("sales.gross_margin_rate"),
    quantity: governedValue("sales.quantity")
  } : rawMetrics;
  const inventorySummary = buildInventorySummary(inventory, goodsFlowDashboard, inventoryQuality);
  const inventoryAvailable = inventorySummary.rowCount > 0
    || inventorySummary.inventoryDays !== null
    || inventorySummary.stockoutRate !== null;
  return {
    range: { from: text(range.from), to: text(range.to) },
    metrics,
    platforms: buildPlatforms(rows),
    products,
    stores,
    quality: {
      status: unavailable ? "unavailable" : stale ? "stale" : "ready",
      latestDataDate,
      lastSuccessfulSyncAt: text(salesMeta.lastSuccessfulSyncAt),
      timeBasis: text(salesMeta.timeBasis) || "create_time",
      timezone: text(salesMeta.timezone) || "Asia/Shanghai",
      excludeOther: salesMeta.excludeOther !== false,
      rowCount: rows.length
    },
    metricResults: Array.isArray(metricResults) ? metricResults : [],
    inventory: inventorySummary,
    availability: {
      sales: !unavailable,
      storeDirectory: stores.length > 0,
      storeSales: false,
      advertising: Array.isArray(advertising) && advertising.length > 0,
      inventory: inventoryAvailable
    }
  };
}

export function evidenceSnapshotForScope(snapshot, { productId = "", platform = "", storeId = "" } = {}) {
  const product = snapshot.products.find(item => item.id === productId);
  const store = snapshot.stores.find(item => item.id === storeId);
  let metrics = product?.metrics || snapshot.metrics;
  if (product && platform) {
    const platformMetric = product.platformMetrics?.find(item => item.platform === platform);
    if (platformMetric) metrics = platformMetric.metrics;
  }
  const limitations = [];
  if (storeId && !snapshot.availability.storeSales) limitations.push("店铺维度尚未接入，当前基线只到平台与商品层级。");
  if (!snapshot.availability.advertising) limitations.push("投放数据尚未接入，不能判断广告后 ROI 或贡献利润。");
  if (snapshot.quality.status !== "ready") limitations.push("销售数据未达到完整就绪状态，当前判断需保留条件。");
  return {
    id: `evidence-${productId || "all"}-${platform || "all"}-${snapshot.range.to || "current"}`,
    productId,
    productName: product?.name || "全部商品",
    platform,
    storeId,
    storeName: store?.name || "",
    scopeLevel: storeId ? "platform_product" : productId && platform ? "platform_product" : productId ? "product" : "company",
    storeMetricsAvailable: snapshot.availability.storeSales,
    metrics: { ...metrics },
    range: { ...snapshot.range },
    quality: { ...snapshot.quality },
    limitations,
    source: {
      dataset: "product_sales_daily",
      metricTimeBasis: snapshot.quality.timeBasis,
      timezone: snapshot.quality.timezone,
      excludeOther: snapshot.quality.excludeOther
    },
    capturedAt: new Date().toISOString()
  };
}

function item(priority, type, title, detail, targetId) {
  return { id: `${type}-${targetId}`, priority, type, title, detail, targetId };
}

export function buildOperationsCockpit({ state = {}, viewer = {}, dataQuality = {} } = {}) {
  const plans = Array.isArray(state.plans) ? state.plans : [];
  const executions = Array.isArray(state.executions) ? state.executions : [];
  const collaborations = Array.isArray(state.collaborations) ? state.collaborations : [];
  const actions = [];
  if (viewer.manager) {
    for (const plan of plans.filter(entry => entry.status === "submitted")) actions.push(item(10, "review_plan", `审批 ${plan.product || "重点产品"} 方案`, "核对证据、目标、问题和止损线。", plan.id));
    for (const execution of executions.filter(entry => entry.status === "submitted")) actions.push(item(20, "review_execution", "验收执行与复盘", "核对执行结果、数据证据和下一步。", execution.id));
    for (const collaboration of collaborations.filter(entry => ["overdue", "returned", "pending"].includes(entry.status))) actions.push(item(30, "resolve_collaboration", collaboration.title || "处理跨部门阻塞", "确认承接、升级或调整截止时间。", collaboration.id));
    if (["stale", "unavailable"].includes(dataQuality.status)) actions.push(item(40, "data_quality", "确认经营数据可用性", "数据未更新到当前截止日，暂缓确定性归因。", "sales"));
  } else {
    for (const plan of plans.filter(entry => entry.ownerId === viewer.id && entry.status === "returned")) actions.push(item(10, "revise_plan", `修改 ${plan.product || "重点产品"} 方案`, plan.reviewReason || "按主管意见补齐方案后重新提交。", plan.id));
    for (const plan of plans.filter(entry => entry.ownerId === viewer.id && entry.status === "approved")) {
      const hasOpenExecution = executions.some(entry => entry.planId === plan.id && ["submitted", "accepted"].includes(entry.status));
      if (!hasOpenExecution) actions.push(item(20, "execute_plan", `推进 ${plan.product || "重点产品"}`, "记录今天的动作、检测数据和下一步。", plan.id));
    }
  }
  return { actions: actions.sort((left, right) => left.priority - right.priority) };
}

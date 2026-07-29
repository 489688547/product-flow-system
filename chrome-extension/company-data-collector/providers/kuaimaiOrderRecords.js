// 把 /trade/search 的订单行转成 order_items 采集记录。
// 字段名沿用快麦导出文件的列名（KUAIMAI_ORDER_EXPORT_FIELDS），
// 这样接口路线与文件路线产出同一种记录，下游解析和投影无需分叉。
//
// 全部映射都在生产数据上实测过，见 docs/features/kuaimai-api-collection/findings.md。

// 子表 cost 是「单价成本」而不是整行成本：同一条码在 num=1/2/3/4 下 cost 恒定
// （实测 3、6.5、7.5、13 四组）。因此订单成本必须乘以数量，直接累加会严重低估。
export function orderCost(orders = []) {
  return round2((Array.isArray(orders) ? orders : [])
    .reduce((total, item) => total + Number(item?.cost || 0) * Number(item?.num || 0), 0));
}

export function orderQuantity(orders = []) {
  // 主表没有数量字段，只能由子表求和。
  return (Array.isArray(orders) ? orders : [])
    .reduce((total, item) => total + Number(item?.num || 0), 0);
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

// 时间戳统一转成 Asia/Shanghai 的可读时间，与导出文件的写法一致。
function shanghaiTime(milliseconds) {
  const value = Number(milliseconds);
  if (!Number.isFinite(value) || value <= 0) return "";
  const shifted = new Date(value + 8 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 10)} ${shifted.toISOString().slice(11, 19)}`;
}

export function businessDayOfTrade(trade) {
  const created = Number(trade?.created);
  if (!Number.isFinite(created) || created <= 0) return "";
  return new Date(created + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function buildKuaimaiOrderRecord(trade) {
  const sid = String(trade?.sid || "");
  if (!sid) return null;
  const orders = Array.isArray(trade?.orders) ? trade.orders : [];
  return {
    // sid 是系统订单号，实测在单日 200 行样本中唯一。
    sourceKey: sid,
    occurredAt: new Date(Number(trade.created)).toISOString(),
    shopId: String(trade?.shopName || "") || null,
    payload: {
      系统订单号: sid,
      平台订单号: String(trade?.tid || ""),
      内部单号: String(trade?.shortId || ""),
      平台: String(trade?.shopSourceName || trade?.source || ""),
      店铺: String(trade?.shopName || ""),
      订单状态: String(trade?.chStatus || ""),
      订单平台状态: String(trade?.sysStatus || ""),
      商品数量: orderQuantity(orders),
      订单买家已付金额: Number(trade?.payment || 0),
      订单成本: orderCost(orders),
      下单时间: shanghaiTime(trade?.created),
      付款时间: shanghaiTime(trade?.payTime),
      发货时间: shanghaiTime(trade?.consignTime),
      // 毛利润不在此处推导。导出文件里的「毛利润」是否扣运费尚未核实，
      // 自行用「已付金额 - 成本」填进去会造出一个看起来权威的错数字。
      商品信息: orders.map(item => ({
        条码: String(item?.outerId || ""),
        商家编码: String(item?.sysItemOuterId || ""),
        规格: String(item?.skuPropertiesName || ""),
        数量: Number(item?.num || 0),
        单价: Number(item?.price || 0),
        分摊金额: Number(item?.payment || 0),
        单位成本: Number(item?.cost || 0)
      }))
    }
  };
}

// 采集的业务日必须由订单自身的创建时间判定，不能信任请求参数：
// 07-26 的一次网页采集就是导出了别的日期却当成功，被下游守卫拦下
// （WEB_COLLECTION_BUSINESS_DATE_MISMATCH）。这里在源头就挡住。
export function buildKuaimaiOrderRecords(trades = [], { businessDate = "" } = {}) {
  const rows = Array.isArray(trades) ? trades : [];
  const records = [];
  const mismatched = [];
  for (const trade of rows) {
    const record = buildKuaimaiOrderRecord(trade);
    if (!record) continue;
    if (businessDate && businessDayOfTrade(trade) !== businessDate) {
      mismatched.push(String(trade?.sid || ""));
      continue;
    }
    records.push(record);
  }
  return { records, mismatched };
}

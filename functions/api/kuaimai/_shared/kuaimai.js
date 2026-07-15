// 快麦ERP开放平台客户端。使用 Web Crypto（hmac-sha256 签名），
// 同一份代码跑在 Cloudflare Pages Functions 和本地 server.mjs（Node 18+）里。
const GATEWAY = "https://gw.superboss.cc/router";
const CODE_PATTERN = /^69\d{10,12}$/;

// 平台简码 → 与Excel导入一致的平台名称（保证两个数据源能合并统计）
const PLATFORM_NAMES = {
  tb: "淘宝",
  tm: "天猫",
  jd: "京东",
  fxg: "抖店(放心购)",
  kuaishou: "快手",
  pdd: "拼多多",
  pdd_wd: "拼多多",
  xhs: "小红书",
  yz: "有赞",
  wxsph: "微信小店（微信视频号）",
  wxxd: "微信小商店",
  pddtemu: "TEMU",
  shein: "希音",
  qimen: "奇门",
  sys: "其它",
  open: "其它"
};

export function kuaimaiConfigFromEnv(env = {}) {
  const config = {
    appKey: String(env.KUAIMAI_APP_KEY || "").trim(),
    appSecret: String(env.KUAIMAI_APP_SECRET || "").trim(),
    accessToken: String(env.KUAIMAI_ACCESS_TOKEN || "").trim(),
    refreshToken: String(env.KUAIMAI_REFRESH_TOKEN || "").trim()
  };
  config.ready = Boolean(config.appKey && config.appSecret && config.accessToken);
  return config;
}

export function gmt8Timestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export async function signKuaimaiParams(params, appSecret) {
  const source = Object.keys(params)
    .filter(key => key !== "sign" && params[key] !== null && params[key] !== undefined && params[key] !== "")
    .sort()
    .map(key => `${key}${params[key]}`)
    .join("");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(source));
  return bytesToHex(signature);
}

export async function callKuaimai(method, bizParams, config, fetchImpl = fetch) {
  const params = {
    method,
    appKey: config.appKey,
    timestamp: gmt8Timestamp(),
    version: "1.0",
    sign_method: "hmac-sha256",
    session: config.accessToken,
    format: "json"
  };
  Object.entries(bizParams || {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") params[key] = String(value);
  });
  params.sign = await signKuaimaiParams(params, config.appSecret);
  const body = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => body.append(key, String(value)));
  const response = await fetchImpl(GATEWAY, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString()
  });
  const payload = await response.json().catch(() => null);
  if (!payload) throw new Error(`快麦接口返回异常（HTTP ${response.status}）。`);
  if (payload.success === false) {
    const error = new Error(`${payload.msg || "快麦接口调用失败"}（code ${payload.code || "?"}）`);
    error.kuaimaiCode = String(payload.code || "");
    throw error;
  }
  return payload;
}

export async function refreshKuaimaiSession(config, fetchImpl = fetch) {
  const payload = await callKuaimai("open.token.refresh", { refreshToken: config.refreshToken }, config, fetchImpl);
  return payload.session || payload;
}

export async function fetchShopPlatformMap(config, fetchImpl = fetch) {
  const payload = await callKuaimai("erp.shop.list.query", { pageNo: 1, pageSize: 200 }, config, fetchImpl);
  const map = new Map();
  (payload.list || []).forEach(shop => {
    if (shop?.userId == null) return;
    const source = String(shop.source || "").toLowerCase();
    map.set(String(shop.userId), PLATFORM_NAMES[source] || shop.source || "其它");
  });
  return map;
}

function toAmount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// 把订单里的子订单聚合成 69码×日×平台 的日行（与Excel导入同一个存储结构）。
// 口径说明：API的订单接口没有净销售额/退款金额明细，sales/netSales 先取买家已付，
// 毛利=已付−成本；退款字段留0，等每月Excel重导时整月覆盖校准。
export function createOrderAggregator(shopPlatformMap = new Map()) {
  const buckets = new Map();
  const titles = {};
  let orders = 0;
  let skippedItems = 0;
  return {
    addOrder(order) {
      orders += 1;
      const payDate = order?.payTime ? new Date(order.payTime) : null;
      const platform = shopPlatformMap.get(String(order?.userId ?? "")) || "其它";
      (order?.orders || []).forEach(child => {
        if (child?.isCancel === 1) return;
        const code = String(child?.sysOuterId || "").trim();
        const childPayDate = child?.payTime ? new Date(child.payTime) : payDate;
        if (!CODE_PATTERN.test(code) || !childPayDate || Number.isNaN(childPayDate.valueOf())) {
          skippedItems += 1;
          return;
        }
        const date = gmt8Timestamp(childPayDate).slice(0, 10);
        const key = `${code}|${date}|${platform}`;
        const bucket = buckets.get(key) || { code, date, platform, qty: 0, sales: 0, netSales: 0, grossProfit: 0, refund: 0, cost: 0, preShipRefund: 0, postShipRefund: 0 };
        const payment = toAmount(child.payment);
        const cost = toAmount(child.cost);
        bucket.qty += Number(child.num) || 0;
        bucket.sales += payment;
        bucket.netSales += payment;
        bucket.cost += cost;
        bucket.grossProfit += payment - cost;
        buckets.set(key, bucket);
        const title = String(child.sysTitle || "").trim();
        if (title && !titles[code]) titles[code] = title;
      });
    },
    finish() {
      const rows = [...buckets.values()].map(bucket => ({
        ...bucket,
        sales: round2(bucket.sales),
        netSales: round2(bucket.netSales),
        grossProfit: round2(bucket.grossProfit),
        cost: round2(bucket.cost)
      })).sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
      return { rows, titles, orders, skippedItems };
    }
  };
}

// 拉取某一天的订单并聚合。maxPages 用于限制单次请求的分页数
// （Cloudflare 免费版一次请求最多50个子请求），返回 nextPage 供前端续拉。
export async function pullKuaimaiDay(config, { date, pageNo = 1, maxPages = 8 }, fetchImpl = fetch) {
  const shopMap = await fetchShopPlatformMap(config, fetchImpl);
  const aggregator = createOrderAggregator(shopMap);
  let page = Number(pageNo) || 1;
  let pagesFetched = 0;
  let hasNext = false;
  while (pagesFetched < maxPages) {
    const payload = await callKuaimai("erp.trade.list.query", {
      timeType: "pay_time",
      startTime: `${date} 00:00:00`,
      endTime: `${date} 23:59:59`,
      pageNo: page,
      pageSize: 200,
      useHasNext: true
    }, config, fetchImpl);
    (payload.list || []).forEach(order => aggregator.addOrder(order));
    pagesFetched += 1;
    hasNext = Boolean(payload.hasNext);
    if (!hasNext) break;
    page += 1;
  }
  const result = aggregator.finish();
  // 退出循环时 page 已指向下一个未拉取的页码
  return { ...result, date, nextPage: hasNext ? page : null, hasNext };
}

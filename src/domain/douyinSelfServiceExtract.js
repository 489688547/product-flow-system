// 抖音罗盘「数据工厂 → 自助取数」是官方的批量取数入口，能力远超逐页抓接口：
// 最长支持近 14 个月，一次覆盖店铺、商品、直播间、短视频四个主要维度，指标含
// 成交、结算、退款、支出、流量、体验分（见 docs/features/douyin-api-collection/
// compass-survey.md）。逐页接口的回溯能力差别极大——直播 90 天、商品卡仅约 3 天。
//
// 它是异步的：创建任务 → 排队 → 下载。队列为全平台共用，实测创建后约 12 分钟完成，
// 页面提示一般需 10-20 分钟。因此不能指望同步拿到文件。

export const SELF_SERVICE_ROUTE = "/shop/workshop/appcustom-access?tab=access";

// 主要维度是单选，取值取自页面表单的 radio value。
export const PRIMARY_DIMENSIONS = Object.freeze({
  store_daily: "shop",
  product_daily: "product",
  live_daily: "live",
  video_daily: "video"
});

// 指标不是四个维度通用的，而且指标面板还有一层分类筛选（2026-07-30 在专用浏览器逐维度实测）。
//
// 两处结构必须同时说清，否则报错会指向错误的方向：
//
// 一、指标 value 随维度变，连同名指标都不同名：
//     店铺「成交订单数」= pay_cnt，直播是 live_room_pay_cnt，短视频是 video_pay_cnt。
//     更要紧的是直播与短视频**没有「成交金额」**，只有「用户支付金额」——
//     两者口径不同，不能拿支付金额冒充成交金额填进 transactionAmount。
//
// 二、指标按分类筛选显示，未勾选的分类其指标根本不在 DOM 里：
//     店铺默认停在「成交」，所以最初一眼就看到了 income_amt；
//     直播与短视频默认停在「基础信息」，商品默认勾的是流量/预售/退款。
//     不先勾分类就找指标，报的是「指标不可用」，真实原因却是「没勾分类」。
//
// 所以取指标前必须先勾中它所属的分类。
export const METRICS_BY_DIMENSION = Object.freeze({
  shop: Object.freeze({
    categories: Object.freeze(["1"]),
    // 罗盘首页接口不返回成交订单数与成交人数，而这两项正是 store_daily 靠页面标签
    // 抓错、已从面板撤下的指标（面板曾显示 314 万单、257 万人，实际 GMV 仅 6.5 万）。
    // 自助取数是目前已知的唯一可信来源：实测 07-25 是 3418 单 / 2810 人 / ¥67159。
    metrics: Object.freeze({
      transactionAmount: "income_amt",
      userPaymentAmount: "pay_amt",
      transactionOrderCount: "pay_cnt",
      transactionBuyerCount: "pay_ucnt",
      netTransactionAmount: "net_income_amt",
      adContributedAmount: "ad_receive_amt",
      adContributedRatio: "ad_receive_amt_ratio"
    })
  }),
  product: Object.freeze({
    categories: Object.freeze(["1"]),
    // 商品维度同样没有「成交金额」，只有用户支付金额——四个维度里只有店铺有 income_amt。
    metrics: Object.freeze({
      userPaymentAmount: "pay_amt",
      transactionOrderCount: "pay_cnt",
      transactionBuyerCount: "pay_ucnt",
      transactionQuantity: "pay_combo_cnt"
    })
  }),
  live: Object.freeze({
    // 要两个分类：成交（2）之外还要基础信息（1），因为必须把 live_start_ts 取回来。
    //
    // 直播导出是一行一个直播间、没有按天的「日期」列，统计日期给的是整段区间。
    // 少了开播时间，就只能靠「我请求的是这几天」去推断业务日——那是推断，不是事实，
    // 5 天的数据会被当成某一天入库。把开播时间取进来，业务日就在数据里。
    categories: Object.freeze(["1", "2"]),
    metrics: Object.freeze({
      liveStartedAt: "live_start_ts",
      userPaymentAmount: "live_room_pay_amt",
      transactionOrderCount: "live_room_pay_cnt",
      transactionBuyerCount: "live_room_pay_ucnt"
    })
  }),
  video: Object.freeze({
    categories: Object.freeze(["1", "2"]),
    // 短视频不能照搬直播那招：它只有「统计日期累计」，给的是区间合计；
    // 而发布时间也不能当业务日——5 月发的视频 7 月照样出单。
    // 所以短视频只能一天一个任务，业务日由文件里的统计日期自证（见 SINGLE_DAY_ONLY_DIMENSIONS）。
    metrics: Object.freeze({
      userPaymentAmount: "video_pay_amt",
      transactionOrderCount: "video_pay_cnt"
    })
  })
});

// 登记表不是靠点页面摸出来的，而是与平台的配置接口逐条核对过
// （GET /data_factory/download/config?main_dimension=…&date_type=…&edition=2，
// 它返回该维度可选的粒度、指标分类与每类下的指标）。提交前还会再核一次，
// 平台改了什么会被当场指出来，而不是采回一个少列的文件才发现。
export function metricsFor(dimension) {
  const entry = METRICS_BY_DIMENSION[dimension];
  if (!entry) {
    throw Object.assign(
      new Error(`维度 ${dimension} 的指标尚未实测登记，不能凭猜测取数。`),
      { code: "DOUYIN_EXTRACT_METRICS_UNVERIFIED" }
    );
  }
  return entry;
}

// 时间粒度选项随主要维度变化，四个维度并不通用（与平台配置接口逐条核对）：
//
// | 维度    | 可选粒度 |
// |---------|----------|
// | shop    | 统计日期累计 / 自然日累计 / 自然周累计 / 自然月累计 |
// | product | 同上 |
// | live    | 开播日期累计 / 分钟级 |
// | video   | 只有统计日期累计 |
//
// 原先写死「自然日累计」，直播与短视频根本没有这个选项，找不到控件后报的却是
// GRANULARITY_MISSING，与真正原因隔了好几步。
//
// 顺带纠正一处早期在 DOM 上的误读：短视频那组「挂车 / 非挂车」不是粒度，
// 是另一个字段 video_type。
//
// 选取原则是「能还原到业务日」：店铺与商品用自然日累计；直播用开播日期累计——
// 直播的天然单位是场次，按开播日归集才对得上业务日；短视频只有统计日期累计，
// 它给的是区间合计，因此短视频必须按单日建任务，一天一个任务。
// 登记 value 而不只是文案：文案随时可能改，value 是提交给接口的字段值；
// 更重要的是按 value 选完可以回读 checked 确认，靠文案只能确认「点到了那几个字」。
export const GRANULARITY_BY_DIMENSION = Object.freeze({
  shop: Object.freeze({ value: "day", label: "自然日累计" }),
  product: Object.freeze({ value: "day", label: "自然日累计" }),
  live: Object.freeze({ value: "live_start_date", label: "开播日期累计" }),
  video: Object.freeze({ value: "all", label: "统计日期累计" })
});

// 短视频只有区间合计粒度，跨多天会把几天混成一行，无法还原业务日。
export const SINGLE_DAY_ONLY_DIMENSIONS = Object.freeze(["video"]);

// 单次统计周期最长 3 个月，超出会被表单拒绝。补历史时必须按此切段。
export const MAX_RANGE_DAYS = 92;

// 每天只能建 5 条任务（2026-07-31 实测，第 6 条直接被拒：「每天仅支持创建5条任务」）。
//
// 这条硬约束直接改变规划方式：
// - 每天四个资源各一条正好 4 条，只剩 1 条余量，失败重试就要烧配额；
// - 因此提交前的配置核对不是可有可无的——一次白建的任务吃掉当日 20% 的配额；
// - 补历史要靠长区间：店铺/商品/直播一条能覆盖 92 天，短视频只能单日，
//   也就是说短视频每天最多补 5 天，14 个月的历史用自助取数补不动。
export const DAILY_TASK_QUOTA = 5;

// 短视频必须指定视频类型，传空串会被拒（「请选择视频类型(挂车/非挂车)」）。
//
// 只采挂车：挂车视频才挂着商品，成交金额是归到它头上的。非挂车是否也有成交尚未验证
// ——当天配额已用尽，没能建成对照任务。要采的话得另占一条配额，而且任务名必须带上
// 视频类型，否则两批数据会撞名（平台按名称判重）。
export const VIDEO_TYPES = Object.freeze({ ecom: "ecom_video", unecom: "unecom_video" });
export const DEFAULT_VIDEO_TYPE = VIDEO_TYPES.ecom;

// 页面提示「取数完成等待时间一般至少为 10-20 分钟」，且队列全平台共用。
// 超时留足余量：宁可等，也不要把还在排队的任务判成失败后重复创建，
// 那只会让本就拥挤的队列更长。
export const TASK_TIMEOUT_MS = 45 * 60 * 1000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value, label) {
  const text = String(value || "");
  if (!DATE_PATTERN.test(text)) {
    throw Object.assign(new Error(`${label}格式应为 YYYY-MM-DD，收到「${text}」。`), {
      code: "DOUYIN_EXTRACT_DATE_INVALID"
    });
  }
  return text;
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
}

// 任务名称要能在任务列表里被唯一认出来：列表只给名称、创建人、状态、创建日期，
// 没有业务字段，靠名称回找是唯一可行的关联方式。
export function buildTaskName({ resourceType, from, to, videoType = "" } = {}) {
  const dimension = PRIMARY_DIMENSIONS[resourceType];
  if (!dimension) {
    throw Object.assign(new Error(`资源 ${resourceType} 未登记主要维度。`), {
      code: "DOUYIN_EXTRACT_RESOURCE_INVALID"
    });
  }
  const start = assertDate(from, "开始日期");
  const end = assertDate(to, "结束日期");
  // 短视频的挂车与非挂车是两批数据，名字必须区分：平台按名称判重，同名会被拒，
  // 而被拒也照样耗掉一次尝试。
  const slice = videoType ? `-${videoType}` : "";
  return `采集-${dimension}${slice}-${start.replace(/-/g, "")}-${end.replace(/-/g, "")}`;
}

export function buildExtractPlan({ resourceType, from, to } = {}) {
  const dimension = PRIMARY_DIMENSIONS[resourceType];
  if (!dimension) {
    throw Object.assign(new Error(`资源 ${resourceType} 未登记主要维度。`), {
      code: "DOUYIN_EXTRACT_RESOURCE_INVALID"
    });
  }
  const start = assertDate(from, "开始日期");
  const end = assertDate(to, "结束日期");
  if (start > end) {
    throw Object.assign(new Error("开始日期不能晚于结束日期。"), {
      code: "DOUYIN_EXTRACT_RANGE_INVALID"
    });
  }
  const span = daysBetween(start, end);
  if (SINGLE_DAY_ONLY_DIMENSIONS.includes(dimension) && span > 1) {
    throw Object.assign(
      new Error(`${dimension} 维度只有区间合计粒度，跨 ${span} 天会混成一行，必须按单日建任务。`),
      { code: "DOUYIN_EXTRACT_SINGLE_DAY_REQUIRED" }
    );
  }
  if (span > MAX_RANGE_DAYS) {
    throw Object.assign(new Error(`统计周期 ${span} 天超过单次上限 ${MAX_RANGE_DAYS} 天，需拆分。`), {
      code: "DOUYIN_EXTRACT_RANGE_TOO_LONG"
    });
  }
  const { categories, metrics } = metricsFor(dimension);
  const videoType = dimension === "video" ? DEFAULT_VIDEO_TYPE : "";
  return {
    taskName: buildTaskName({ resourceType, from: start, to: end, videoType }),
    videoType,
    dimension,
    from: start,
    to: end,
    granularity: GRANULARITY_BY_DIMENSION[dimension].label,
    granularityValue: GRANULARITY_BY_DIMENSION[dimension].value,
    metricCategories: categories,
    metricValues: Object.freeze(Object.values(metrics)),
    // 字段名 → 指标 value 的反查，供解析导出文件时对齐用。
    metrics
  };
}

// 把一个长区间切成不超过上限的若干段。补 14 个月历史时必须先切，
// 否则表单直接拒绝，而且拒绝信息只在页面上，采集器看不到。
export function splitExtractRange({ from, to, maxDays = MAX_RANGE_DAYS } = {}) {
  const start = assertDate(from, "开始日期");
  const end = assertDate(to, "结束日期");
  if (start > end) return [];
  const segments = [];
  let cursor = start;
  while (cursor <= end) {
    const cursorMs = Date.parse(`${cursor}T00:00:00Z`);
    const lastMs = Math.min(cursorMs + (maxDays - 1) * 86400000, Date.parse(`${end}T00:00:00Z`));
    const last = new Date(lastMs).toISOString().slice(0, 10);
    segments.push({ from: cursor, to: last });
    cursor = new Date(lastMs + 86400000).toISOString().slice(0, 10);
  }
  return segments;
}

const READY_STATUS = "取数完成";
const FAILED_MARKERS = Object.freeze(["失败", "异常"]);

// 任务列表只有名称、创建人、状态、创建日期四列，没有业务字段。
// 因此必须靠任务名称回找自己创建的那一条，不能取「最新一条」——
// 全平台队列里随时可能有别人的任务，取最新会拿错。
export function selectExtractTask(rows = [], taskName = "") {
  const name = String(taskName || "");
  if (!name) return { state: "missing" };
  const row = (Array.isArray(rows) ? rows : []).find(item => String(item?.taskName || "").trim() === name);
  if (!row) return { state: "missing" };
  const status = String(row.status || "").replace(/\s+/g, "");
  if (FAILED_MARKERS.some(marker => status.includes(marker))) {
    return { state: "failed", errorCode: "DOUYIN_EXTRACT_TASK_FAILED", status };
  }
  if (status.includes(READY_STATUS)) return { state: "ready", status };
  return { state: "pending", status };
}

// 判断是否还该继续等。超时后不再等待，但要说清是「还在排队」而不是「失败了」，
// 否则人会以为要改代码，实际只需要过一会儿重试。
export function planExtractWait({ startedAt, now, state, status = "" } = {}) {
  if (state === "ready") return { action: "download" };
  if (state === "failed") {
    return { action: "fail", errorCode: "DOUYIN_EXTRACT_TASK_FAILED", message: `罗盘取数任务失败：${status}` };
  }
  const elapsed = Number(now) - Number(startedAt);
  if (!Number.isFinite(elapsed)) {
    return { action: "fail", errorCode: "DOUYIN_EXTRACT_TIMEOUT", message: "无法判断取数任务已等待多久。" };
  }
  if (elapsed >= TASK_TIMEOUT_MS) {
    return {
      action: "fail",
      errorCode: "DOUYIN_EXTRACT_TIMEOUT",
      message: `罗盘取数任务等待超过 ${Math.round(TASK_TIMEOUT_MS / 60000)} 分钟仍未完成（当前状态：${status || "排队中"}），队列繁忙时属正常，稍后重试即可。`
    };
  }
  return { action: "wait" };
}

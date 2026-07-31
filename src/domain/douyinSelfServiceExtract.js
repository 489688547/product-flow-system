// 抖音罗盘「数据工厂 → 自助取数」是官方的批量取数入口，能力远超逐页抓接口：
// 最长支持近 14 个月，一次覆盖店铺、商品、直播间、短视频四个主要维度，指标含
// 成交、结算、退款、支出、流量、体验分（见 docs/features/douyin-api-collection/
// compass-survey.md）。逐页接口的回溯能力差别极大——直播 90 天、商品卡仅约 3 天。
//
// 它是异步的：创建任务 → 排队 → 下载。队列为全平台共用，实测创建后约 12 分钟完成，
// 页面提示一般需 10-20 分钟。因此不能指望同步拿到文件。

export const SELF_SERVICE_ROUTE = "/shop/workshop/appcustom-access?tab=access";

// 抖音的日事实一律走自助取数。
//
// 这是资源的属性，不是某个任务的属性，所以由执行器按资源类型自己判定，不靠字段传输。
// 之前是在排日计划时打一个 viaSelfService 标记带过去，但 web_collection_jobs 表没有
// 这一列——标记经服务端一个来回就没了，执行器拿到 undefined，于是悄悄走回逐页导出，
// 采回另一个口径的数据还不报错。本地测试全绿，是因为测试直接构造带标记的任务，
// 绕过了那个来回。
// 四个日事实资源全部走自助取数。
//
// store 与 product 是最后切的：它们除成交外还要结算、退款、商品曝光/点击——
// 面板的退款率与曝光点击率由这些算出，少取一类就会静默变成 null。
// 现在四类指标都取上了，列名也用 preview 接口逐列核对过（见 assertPreviewCovers）。
export const SELF_SERVICE_RESOURCES = Object.freeze([
  "store_daily",
  "product_daily",
  "live_daily",
  "video_daily"
]);

// 只看 provider 与资源类型：执行器拿到的任务里没有 rangeKind，
// 判定条件必须只用它确实有的字段——否则又是一个「本地能过、生产判不出来」。
export function usesSelfService({ providerId, resourceType } = {}) {
  return String(providerId) === "douyin-ecommerce" && SELF_SERVICE_RESOURCES.includes(resourceType);
}

// 主要维度是单选，取值取自页面表单的 radio value。
export const PRIMARY_DIMENSIONS = Object.freeze({
  store_daily: "shop",
  product_daily: "product",
  live_daily: "live",
  video_daily: "video"
});

// 指标选多少，按维度而异——这条是实测撞出来的，不能一刀切。
//
// 店铺与商品：全选。清单本身就是脆弱点（漏选一类，那几列静默变 null，平台新增指标
// 我们也不会知道），全选没有代价：落库只取登记过的列，其余留在归档文件里。
// 实测店铺 6 类共 76 个指标全选，接口照收，身份列仍是「日期」/「商品ID」。
//
// 直播与短视频：只能选定。全选会把「基础信息」里的达人字段（account_id / nickname 等）
// 也带上，于是**行的身份从直播间/短视频变成了达人**——preview 实测直播全选后列里
// 根本没有「直播间ID」，短视频没有「短视频ID」。那不是少一列，是整张表的含义变了。
export const SELECTED_METRICS = Object.freeze({
  live: Object.freeze({
    // 基础信息只取开播时间：业务日靠它归集，取多了会把身份换成达人。
    categories: Object.freeze(["1", "2"]),
    metrics: Object.freeze([
      "live_start_ts",
      "live_room_pay_amt",
      "live_room_pay_cnt",
      "live_room_pay_ucnt",
      "live_room_pay_combo_cnt"
    ])
  }),
  video: Object.freeze({
    categories: Object.freeze(["2"]),
    metrics: Object.freeze(["video_pay_amt", "video_pay_cnt", "video_gpm"])
  })
});

// 需要登记的另外两件按维度而异、且选错不会报错的事：时间粒度与视频类型。

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

// 每天只能建 5 条任务（2026-07-31 实测：当天任务列表里正好 5 条，第 6 次提交被拒，
// 原文「每天仅支持创建5条任务」）。额度在页面上不显示，只以接口拒绝的形式出现。
//
// 被拒绝的提交不占额度——当天有两次被拒（重名、没选视频类型），5 条是净成功数。
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
// 任务名必须编码「这次到底要什么」，不能只有维度与区间。
//
// 平台按名称判重，而我们的名字是确定性的。指标集一变（比如从只取成交类改成全选），
// 名字却没变，重名逻辑就把它当成「我之前建过的同一个请求」接着等——拿回来的是旧任务
// 的旧文件。实测就这么中过一次：明明提交了全选，下回来的还是 10 列的窄表，且不报错。
//
// 同名 ≠ 同内容。指纹取自实际提交的粒度、视频类型、指标分类与指标。
export function fingerprintSelection({ granularityValue = "", videoType = "", categories = [], metrics = [] } = {}) {
  const text = [granularityValue, videoType, [...categories].sort().join(","), [...metrics].sort().join(",")].join("|");
  // FNV-1a：够稳定、够短，不引入依赖。这里只用来区分不同的取数内容，不做安全用途。
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(6, "0").slice(-6);
}

// 平台的任务名上限是 40 字符（页面上显示 25/40）。视频类型只留首字母，
// 否则 采集-video-ecom_video-20260730-20260730-xxxxxx 就超了。
export function buildTaskName({ resourceType, from, to, videoType = "", fingerprint = "" } = {}) {
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
  const slice = videoType ? `-${videoType.slice(0, 1)}` : "";
  const suffix = fingerprint ? `-${fingerprint}` : "";
  return `采集-${dimension}${slice}-${start.replace(/-/g, "")}-${end.replace(/-/g, "")}${suffix}`;
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
  const videoType = dimension === "video" ? DEFAULT_VIDEO_TYPE : "";
  return {
    // 任务名要等指标选定后才能算指纹，由接口客户端补上（见 douyinExtractApi.js）。
    videoType,
    dimension,
    from: start,
    to: end,
    granularity: GRANULARITY_BY_DIMENSION[dimension].label,
    granularityValue: GRANULARITY_BY_DIMENSION[dimension].value,
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

// 自助取数的接口口径。
//
// 这套流程原本是驱动页面表单做的，改成直连接口，起因是页面驱动太脆：可信事件只能按
// 视口坐标派发，于是「量坐标时元素还在动画中」「日期面板展开在视口外」这类问题接连
// 出现，而它们失败时都不报错——只是点空。页面缩放不是 100%、平台改个 class，同样会挂。
//
// 抓包（2026-07-30，专用浏览器）确认整个自助取数就是三个普通 JSON 接口：
//   POST /data_factory/download/submit     建任务
//   GET  /data_factory/download/task_list  查任务（支持 task_name 精确过滤）
//   GET  /data_factory/download_file?task_id=…  取文件（列表里直接给全地址）
//
// 而且接口字段与页面控件一一对应，今天在 DOM 上摸出来的登记表正好就是参数表：
//   main_dimension ← 主要维度 radio 的 value
//   main_metrics   ← 指标分类复选框的 value（成交 = "1"）
//   date_type      ← 时间粒度 radio 的 value
//   metrics        ← 指标复选框的 value
//
// 请求一律在页面上下文里发，登录态与 CSRF 由浏览器自己带，采集器不接触任何凭据。

import { SELECTED_METRICS } from "./douyinSelfServiceExtract.js";

export const SUBMIT_PATH = "/data_factory/download/submit";
export const PREVIEW_PATH = "/data_factory/download/preview";
export const TASK_LIST_PATH = "/data_factory/download/task_list";

// 业务日按 Asia/Shanghai 的自然日边界换算，不依赖运行机器的时区设置。
// 抓包实测 begin=当日 00:00:00+08:00、end=当日 23:59:59+08:00。
export function dayStartSeconds(date) {
  return Math.floor(Date.parse(`${date}T00:00:00+08:00`) / 1000);
}

export function dayEndSeconds(date) {
  return Math.floor(Date.parse(`${date}T23:59:59+08:00`) / 1000);
}

// 指标一律全选。
//
// 维护一份「我们要哪些指标」的清单本身就是脆弱点：漏选一类，那几列就静默变成 null
// （店铺少选退款与流量，面板的退款率与曝光点击率就没了，而且不报错）；平台新增指标，
// 我们也不会知道。全选没有代价——落库只取登记过的列，其余留在归档文件里，
// 将来要用不必重采。实测店铺 6 类共 76 个指标全选，接口照收。
export function selectMetrics(config, dimension) {
  // 直播与短视频不能全选：会把达人字段带上，行的身份就从直播间/短视频变成达人，
  // 导出表里连「直播间ID」都没有。选定集仍要与配置接口核对，指标被下掉要当场发现。
  const listed = SELECTED_METRICS[dimension];
  if (listed) {
    const offered = new Set();
    for (const category of listed.categories) {
      for (const metric of config.categories.get(category) || []) offered.add(metric);
    }
    const missing = listed.metrics.filter(metric => !offered.has(metric));
    if (missing.length) {
      throw Object.assign(
        new Error(`罗盘自助取数的可选项已变化，本次不提交：${dimension} 缺少指标 ${missing.join("、")}`),
        { code: "DOUYIN_EXTRACT_CONFIG_DRIFTED" }
      );
    }
    return { categories: [...listed.categories], metrics: [...listed.metrics] };
  }
  const categories = [...config.categories.keys()];
  const metrics = [];
  for (const set of config.categories.values()) for (const metric of set) metrics.push(metric);
  if (!categories.length || !metrics.length) {
    throw Object.assign(new Error("配置接口没有返回任何指标，本次不提交。"), {
      code: "DOUYIN_EXTRACT_CONFIG_EMPTY"
    });
  }
  return { categories, metrics };
}

export function buildSubmitPayload(plan, { categories, metrics }) {
  const dimension = String(plan?.dimension || "");
  return {
    main_dimension: dimension,
    main_metrics: [...categories],
    metrics: [...metrics],
    begin_date: dayStartSeconds(plan.from),
    end_date: dayEndSeconds(plan.to),
    date_type: plan.granularityValue,
    video_type: plan.videoType || "",
    name: plan.taskName
  };
}

// 列表返回的每格都裹了三层（cell_info → <字段>_value → value.value_str），
// 逐格取字符串，别去猜结构。
function cellText(row, field) {
  const cell = row?.cell_info?.[field]?.[`${field}_value`]?.value;
  return String(cell?.value_str ?? "").trim();
}

export function parseTaskList(payload) {
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows.map(row => ({
    taskId: cellText(row, "task_id"),
    taskName: cellText(row, "task_name"),
    statusCode: cellText(row, "task_status"),
    pendingRank: cellText(row, "pending_rank"),
    downloadUrl: cellText(row, "download_url"),
    createdAt: cellText(row, "create_time")
  })).filter(row => row.taskName);
}

// 任务状态码。逐个拿页面上的中文状态标定，标到一个记一个：
//   "0" ↔ 排队中（同一行的 pending_rank 显示 3/4）
//   "1" ↔ 取数中
//   "2" ↔ 取数完成
//
// 还见过一次 "10"，当时页面显示排队中，但那份列表明显滞后（缺了三分钟前建的任务），
// 证据不够硬，因此不登记。失败码则从未遇到过。
//
// 没见过就不假装知道：未知码一律继续等，并把原始码带进状态里，
// 下次遇到就能照这个办法把映射补上——这一条今天已经生效两次了。
//
// 特别注意：**不能拿 download_url 判断是否完成**。刚建好还在排队 3/4 的任务，
// 列表里同样带着 download_url，看着像能下。照那个判，会把排队中的任务当完成去下载，
// 拿回半成品——「半成品被当成真数」这个错今天已经犯过一次了。
export const TASK_STATUS = Object.freeze({ QUEUED: "0", RUNNING: "1", DONE: "2" });

const PENDING_LABELS = Object.freeze({ [TASK_STATUS.QUEUED]: "排队中", [TASK_STATUS.RUNNING]: "取数中" });

export function selectApiTask(rows = [], taskName = "") {
  const name = String(taskName || "");
  if (!name) return { state: "missing" };
  const row = (Array.isArray(rows) ? rows : []).find(item => item.taskName === name);
  if (!row) return { state: "missing" };
  if (row.statusCode === TASK_STATUS.DONE) return { state: "ready", ...row };
  const label = PENDING_LABELS[row.statusCode];
  const status = label
    ? `${label} ${row.pendingRank || ""}`.trim()
    : `未知状态码 ${row.statusCode}`;
  return { state: "pending", status, ...row };
}

// 配置接口：平台自己声明每个维度可选的粒度、指标分类与各分类下的指标。
//   GET /data_factory/download/config?main_dimension=<维度>&dimensions=&date_type=<粒度>&video_type=&edition=2
//
// 登记表就是照它核对出来的，提交前再核一次。这是对「平台改一点就挂」的正面回答：
// 改了会被当场指出来是哪个指标没了，而不是等任务排完队、下回一个少列的文件，
// 再由解析器报一个离原因很远的错。
export const CONFIG_PATH = "/data_factory/download/config";

export function configQuery({ dimension, granularityValue }) {
  const params = new URLSearchParams({
    main_dimension: dimension,
    dimensions: "",
    date_type: granularityValue,
    video_type: "",
    edition: "2"
  });
  return `${CONFIG_PATH}?${params.toString()}`;
}

// 分类下的指标挂在 childrens（平台拼写如此）。
export function parseExtractConfig(payload) {
  const data = payload?.data || {};
  const granularities = (Array.isArray(data.date_type) ? data.date_type : [])
    .map(item => String(item?.key || ""))
    .filter(Boolean);
  const categories = new Map();
  for (const group of Array.isArray(data.metrics) ? data.metrics : []) {
    const key = String(group?.key || "");
    if (!key) continue;
    categories.set(key, new Set(
      (Array.isArray(group?.childrens) ? group.childrens : [])
        .map(item => String(item?.key || ""))
        .filter(Boolean)
    ));
  }
  return { granularities, categories };
}

// 粒度还在不在。指标全选，所以不必逐个核对；粒度不同，选错了拿回来的是另一种聚合，
// 而它不会报错——直播若没了「开播日期累计」，业务日就再也归不准。
export function assertConfigSupportsPlan(config, plan) {
  if (config.granularities.length && !config.granularities.includes(plan.granularityValue)) {
    throw Object.assign(
      new Error(
        `罗盘自助取数的可选项已变化，本次不提交：粒度 ${plan.granularityValue} 已不在 `
        + `${plan.dimension} 的可选项（现有：${config.granularities.join("、")}）`
      ),
      { code: "DOUYIN_EXTRACT_CONFIG_DRIFTED" }
    );
  }
  return true;
}

// preview 返回这次取数会生成哪些列（index_name 是指标 key，index_display 是列名）。
// 它不建任务、不耗当日配额，因此可以在提交前免费核对一遍。
export function parsePreviewColumns(payload) {
  return (Array.isArray(payload?.meta) ? payload.meta : [])
    .map(item => ({ key: String(item?.index_name || ""), label: String(item?.index_display || "").trim() }))
    .filter(column => column.label);
}

// 落库依赖的列还在不在。
//
// 这是「平台改一点就挂」真正的防线：指标 key 还在，不代表导出的列名没变，
// 而解析是按中文列名做的。列名一改，解析出来就是一列静默的 null——
// 页面上会显示成「这天没生意」，比缺数更糟。
//
// 也正因如此，列名一律以 preview 为准，不拿配置接口的文案当列名：实测商品维度的
// refund_cnt，配置说是「退款订单数（退款时间）」，preview 给的却是「（支付时间）」。
export function assertPreviewCovers(columns, dimension, required = []) {
  const labels = new Set(columns.map(column => column.label));
  const missing = required.filter(label => !labels.has(label));
  if (missing.length) {
    throw Object.assign(
      new Error(
        `${dimension} 的取数结果缺少必需列：${missing.join("、")}；`
        + `现有列：${[...labels].slice(0, 20).join("、")}`
      ),
      { code: "DOUYIN_EXTRACT_COLUMNS_DRIFTED" }
    );
  }
  return true;
}

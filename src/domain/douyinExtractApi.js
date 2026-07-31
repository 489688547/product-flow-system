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

export const SUBMIT_PATH = "/data_factory/download/submit";
export const TASK_LIST_PATH = "/data_factory/download/task_list";

// 短视频维度另有 video_type：挂车 / 非挂车。其余维度传空串。
export const VIDEO_TYPE_BY_DIMENSION = Object.freeze({
  shop: "",
  product: "",
  live: "",
  video: ""
});

// 业务日按 Asia/Shanghai 的自然日边界换算，不依赖运行机器的时区设置。
// 抓包实测 begin=当日 00:00:00+08:00、end=当日 23:59:59+08:00。
export function dayStartSeconds(date) {
  return Math.floor(Date.parse(`${date}T00:00:00+08:00`) / 1000);
}

export function dayEndSeconds(date) {
  return Math.floor(Date.parse(`${date}T23:59:59+08:00`) / 1000);
}

export function buildSubmitPayload(plan) {
  const dimension = String(plan?.dimension || "");
  const categories = plan?.metricCategories;
  if (!Array.isArray(categories) || !categories.length) {
    throw Object.assign(new Error(`维度 ${dimension} 未登记指标分类编号。`), {
      code: "DOUYIN_EXTRACT_CATEGORY_UNKNOWN"
    });
  }
  return {
    main_dimension: dimension,
    main_metrics: [...categories],
    metrics: [...plan.metricValues],
    begin_date: dayStartSeconds(plan.from),
    end_date: dayEndSeconds(plan.to),
    date_type: plan.granularityValue,
    video_type: VIDEO_TYPE_BY_DIMENSION[dimension] ?? "",
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

// 任务状态码。拿页面上的中文状态标定过（2026-07-30）：
//   "0" ↔ 排队中（同一行的 pending_rank 显示 3/4）
//   "2" ↔ 取数完成
//
// 失败码还没遇到过，所以不登记——没见过就不假装知道。未知码一律继续等，
// 并把原始码带进超时信息里，下次遇到就能把映射补上。
//
// 特别注意：**不能拿 download_url 判断是否完成**。刚建好还在排队 3/4 的任务，
// 列表里同样带着 download_url，看着像能下。照那个判，会把排队中的任务当完成去下载，
// 拿回半成品——「半成品被当成真数」这个错今天已经犯过一次了。
export const TASK_STATUS = Object.freeze({ QUEUED: "0", DONE: "2" });

export function selectApiTask(rows = [], taskName = "") {
  const name = String(taskName || "");
  if (!name) return { state: "missing" };
  const row = (Array.isArray(rows) ? rows : []).find(item => item.taskName === name);
  if (!row) return { state: "missing" };
  if (row.statusCode === TASK_STATUS.DONE) return { state: "ready", ...row };
  const status = row.statusCode === TASK_STATUS.QUEUED
    ? `排队中 ${row.pendingRank || ""}`.trim()
    : `未知状态码 ${row.statusCode}`;
  return { state: "pending", status, ...row };
}

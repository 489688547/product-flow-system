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

// 计划里要的东西平台还给不给。给不出就明确说是哪一项，不猜、也不降级——
// 少一个指标就是少一列，落到事实表里是一个静默的 null。
export function assertConfigSupportsPlan(config, plan) {
  const problems = [];
  if (config.granularities.length && !config.granularities.includes(plan.granularityValue)) {
    problems.push(`粒度 ${plan.granularityValue} 已不在 ${plan.dimension} 的可选项（现有：${config.granularities.join("、")}）`);
  }
  const offered = new Set();
  for (const category of plan.metricCategories) {
    const metrics = config.categories.get(category);
    if (!metrics) {
      problems.push(`指标分类 ${category} 已不存在（现有：${[...config.categories.keys()].join("、")}）`);
      continue;
    }
    for (const metric of metrics) offered.add(metric);
  }
  // 分类整体都没了时不再逐个指标报，否则一条改动会刷出一屏噪音。
  if (!problems.length) {
    const missing = plan.metricValues.filter(metric => !offered.has(metric));
    if (missing.length) problems.push(`指标已不在所选分类中：${missing.join("、")}`);
  }
  if (problems.length) {
    throw Object.assign(
      new Error(`罗盘自助取数的可选项已变化，本次不提交：${problems.join("；")}`),
      { code: "DOUYIN_EXTRACT_CONFIG_DRIFTED" }
    );
  }
  return true;
}

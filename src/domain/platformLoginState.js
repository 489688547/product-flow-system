// 按平台汇总登录态，供数据接入页展示与操作。
//
// 登录失效是采集失败最常见的原因，但它在页面上只体现为某几条任务的错误码，
// 要人自己在一堆失败里认出「这是登录掉了」。这里把它汇总到平台一级。
//
// **这里给的是「上次采集时的状态」，不是此刻的真相。** 判据来自采集记录，
// 而采集是定时的——登录可能刚掉、也可能刚恢复，记录都还没跟上。因此每一项都带上
// 判据的时间，页面必须把时间一起显示出来。把陈旧记录当成实时状态，
// 会让人在「显示已登录」的情况下反复排查别的原因。

export const LOGIN_ERROR_CODES = Object.freeze([
  "KUAIMAI_LOGIN_REQUIRED",
  "DOUYIN_LOGIN_REQUIRED"
]);

// 各平台在哪里登录，以及那个登录态归谁用。
//
// 两者的差别必须讲清楚，否则按钮会把人带到错误的浏览器：
// - 快麦由 Chrome 扩展采集，登录态要在「装着采集扩展的那个 Chrome」里，
//   而数据接入页本身就在那个 Chrome 里打开，所以普通链接正好落在对的地方。
// - 抖音由专用浏览器采集，它是独立的 Chrome 实例与独立 profile。
//   网页上的链接打不开它——只能让本机采集器去拉起，因此这里不给链接。
export const PLATFORM_LOGIN_TARGETS = Object.freeze({
  kuaimai: Object.freeze({
    name: "快麦 ERP",
    loginUrl: "https://erp.superboss.cc",
    openIn: "current_browser",
    hint: "在当前浏览器登录即可——采集用的就是这个浏览器里的扩展。"
  }),
  "douyin-ecommerce": Object.freeze({
    name: "抖音罗盘",
    loginUrl: "https://compass.jinritemai.com/shop",
    openIn: "dedicated_browser",
    hint: "抖音用的是独立的专用浏览器，网页链接打不开它。点「重新采集」会让本机采集器拉起它，再在那个窗口里登录。"
  })
});

function isLoginFailure(job) {
  const code = String(job?.errorCode || "");
  if (LOGIN_ERROR_CODES.includes(code)) return true;
  // waiting_human 是「等人处理」，登录失效是它最常见的成因；错误码缺失时按状态兜底。
  return String(job?.status || "") === "waiting_human" && !code;
}

function newer(left, right) {
  return String(left?.updatedAt || "") >= String(right?.updatedAt || "") ? left : right;
}

// 每个平台取「最近一次有结论的采集」来判断：成功过就算登录着，登录类失败就算掉了。
// 其它失败（超时、页面结构变化）不改变登录判断——它们说明的是别的问题。
export function buildPlatformLoginStates(jobs = [], { platforms = PLATFORM_LOGIN_TARGETS } = {}) {
  return Object.entries(platforms).map(([providerId, target]) => {
    const own = (Array.isArray(jobs) ? jobs : []).filter(job => job?.providerId === providerId);
    const loginFailure = own.filter(isLoginFailure).reduce((best, job) => (best ? newer(best, job) : job), null);
    const success = own.filter(job => String(job?.status || "") === "success")
      .reduce((best, job) => (best ? newer(best, job) : job), null);

    if (!loginFailure && !success) {
      return { providerId, ...target, state: "unknown", since: "", reason: "还没有采集记录可判断。" };
    }
    const latest = loginFailure && success ? newer(loginFailure, success) : (loginFailure || success);
    const needsLogin = latest === loginFailure;
    return {
      providerId,
      ...target,
      state: needsLogin ? "login_required" : "signed_in",
      since: String(latest?.updatedAt || ""),
      reason: needsLogin
        ? `${latest?.resourceType || "采集"} 报了 ${latest?.errorCode || "需要人工处理"}`
        : `${latest?.resourceType || "采集"} 采集成功`
    };
  });
}

// 待重采的任务数。按钮上要标出来——实测点一下排了 34 条，而点之前完全看不出会排多少。
// 抖音自助取数每天只有 5 条配额，一次排几十条的话超出的部分注定当天失败。
export const PENDING_STATUSES = Object.freeze(["failed", "waiting_human", "schema_changed"]);

export function countPendingJobs(jobs = [], providerId) {
  return (Array.isArray(jobs) ? jobs : [])
    .filter(job => job?.providerId === providerId && PENDING_STATUSES.includes(String(job?.status || "")))
    .length;
}

export const LOGIN_STATE_LABELS = Object.freeze({
  login_required: "需要登录",
  signed_in: "上次采集时已登录",
  unknown: "无法判断"
});

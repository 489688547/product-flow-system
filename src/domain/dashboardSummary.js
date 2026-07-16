const DAY_MS = 86400000;
const LEVEL_PRIORITY = new Map([
  ["P0", 0],
  ["P1", 1],
  ["P2", 2],
  ["P3", 3]
]);
const TASK_PROGRESS_SEGMENTS = [
  { stage: 1, weight: 20 },
  { stage: 2, weight: 25 },
  { stage: 3, weight: 20 },
  { stage: 4, weight: 35 }
];

function cleanDate(value) {
  const date = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function dateTime(value) {
  const date = cleanDate(value);
  return date ? Date.parse(`${date}T00:00:00Z`) : NaN;
}

function currentDate(value) {
  if (typeof value === "string") return cleanDate(value);
  const date = value instanceof Date ? value : new Date();
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function planForProduct(product, plans, demands) {
  const demandIds = new Set(
    demands.filter(demand => demand?.productId === product.id).map(demand => demand.id)
  );
  return plans.find(plan => plan?.demandSnapshot?.productId === product.id || demandIds.has(plan?.demandId)) || null;
}

export function calculateProductTaskProgress(product, tasks = []) {
  const productStage = Math.max(1, Number(product?.stage) || 1);
  const productTasks = (Array.isArray(tasks) ? tasks : []).filter(task => task?.productId === product?.id);
  const weightedProgress = TASK_PROGRESS_SEGMENTS.reduce((total, segment) => {
    if (productStage < segment.stage) return total;
    const stageTasks = productTasks.filter(task => Number(task?.stage) === segment.stage);
    if (!stageTasks.length) return total + (productStage > segment.stage ? segment.weight : 0);
    const completed = stageTasks.filter(task => Boolean(task?.done)).length;
    return total + completed / stageTasks.length * segment.weight;
  }, 0);
  return Math.max(0, Math.min(100, Math.round(weightedProgress)));
}

function scheduleForProduct(product, plan, today, percent) {
  const developmentStart = cleanDate(plan?.developmentStart);
  const launchDate = cleanDate(plan?.launchDate);
  if (!developmentStart || !launchDate) {
    return { state: "unplanned", percent, label: "未排期", developmentStart: "", launchDate: "", daysRemaining: null };
  }
  if (Number(product?.stage) >= 4) {
    return { state: "complete", percent, label: "已进入上市", developmentStart, launchDate, daysRemaining: 0 };
  }
  const start = dateTime(developmentStart);
  const end = dateTime(launchDate);
  const now = dateTime(today);
  if (![start, end, now].every(Number.isFinite) || end < start) {
    return { state: "unplanned", percent, label: "未排期", developmentStart: "", launchDate: "", daysRemaining: null };
  }
  const daysRemaining = Math.ceil((end - now) / DAY_MS);
  if (now < start) {
    return {
      state: "scheduled",
      percent,
      label: `${developmentStart.slice(5).replace("-", "/")} 开始`,
      developmentStart,
      launchDate,
      daysRemaining
    };
  }
  if (now > end) {
    return {
      state: "overdue",
      percent,
      label: `逾期 ${Math.ceil((now - end) / DAY_MS)} 天`,
      developmentStart,
      launchDate,
      daysRemaining
    };
  }
  return {
    state: daysRemaining <= 7 ? "upcoming" : "active",
    percent,
    label: daysRemaining === 0 ? "今天上线" : daysRemaining <= 7 ? `剩余 ${daysRemaining} 天` : `${launchDate.slice(5).replace("-", "/")} 上线`,
    developmentStart,
    launchDate,
    daysRemaining
  };
}

function priorityForLevel(level) {
  return LEVEL_PRIORITY.get(String(level || "").trim().slice(0, 2)) ?? 9;
}

export function buildDashboardProductSummaries(products = [], plans = [], demands = [], today = new Date(), tasks = []) {
  const normalizedToday = currentDate(today);
  return products
    .map(product => buildProductScheduleSummary(product, plans, demands, normalizedToday, tasks))
    .sort((left, right) => {
      const priority = priorityForLevel(left.product.level) - priorityForLevel(right.product.level);
      if (priority) return priority;
      const launch = (left.schedule.launchDate || "9999-12-31").localeCompare(right.schedule.launchDate || "9999-12-31");
      return launch || String(left.product.name || "").localeCompare(String(right.product.name || ""), "zh-CN");
    });
}

export function buildProductScheduleSummary(product, plans = [], demands = [], today = new Date(), tasks = []) {
  const plan = planForProduct(product, plans, demands);
  const percent = calculateProductTaskProgress(product, tasks);
  return {
    product,
    plan,
    schedule: scheduleForProduct(product, plan, currentDate(today), percent)
  };
}

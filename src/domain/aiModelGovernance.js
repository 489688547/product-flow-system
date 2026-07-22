const DAY_MS = 86_400_000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dateOnly(value) {
  const text = String(value || "").trim();
  if (!DATE_PATTERN.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return null;
  return { text, utcMs: utc.getTime() };
}

function formatUtcDate(value) {
  return value.toISOString().slice(0, 10);
}

export function shanghaiToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function aiUsagePresetRange(days, today = shanghaiToday()) {
  const end = dateOnly(today);
  const length = Number(days);
  if (!end || !Number.isInteger(length) || length < 1 || length > 366) {
    throw new TypeError("AI 用量日期预设无效。");
  }
  return {
    from: formatUtcDate(new Date(end.utcMs - (length - 1) * DAY_MS)),
    to: end.text
  };
}

export function defaultAiUsageRange(today = shanghaiToday()) {
  return aiUsagePresetRange(30, today);
}

export function validateAiUsageRange(range = {}) {
  if (!range.from || !range.to) return { valid: false, message: "请完整选择开始和截止日期。" };
  const from = dateOnly(range.from);
  const to = dateOnly(range.to);
  if (!from || !to) return { valid: false, message: "日期格式无效，请重新选择。" };
  const days = Math.floor((to.utcMs - from.utcMs) / DAY_MS) + 1;
  if (days < 1) return { valid: false, message: "截止日期不能早于开始日期。" };
  if (days > 366) return { valid: false, message: "单次最多查询 366 天。" };
  return { valid: true, message: "" };
}

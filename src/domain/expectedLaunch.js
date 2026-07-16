const EXPECTED_LAUNCH_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function normalizeExpectedLaunchMonth(value) {
  const month = String(value || "").trim();
  return EXPECTED_LAUNCH_MONTH.test(month) ? month : "";
}

export function currentExpectedLaunchMonth(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function isSelectableExpectedLaunchMonth(value, now = new Date()) {
  const month = normalizeExpectedLaunchMonth(value);
  return Boolean(month && month >= currentExpectedLaunchMonth(now));
}

export function expectedLaunchMonthOptions(now = new Date(), count = 36) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return Array.from({ length: Math.max(0, Number(count) || 0) }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    return { value, label: `${date.getFullYear()}年${date.getMonth() + 1}月` };
  });
}

export function formatExpectedLaunchMonth(value, fallback = "未填写") {
  const month = normalizeExpectedLaunchMonth(value);
  if (!month) return fallback;
  const [year, number] = month.split("-");
  return `${year}年${Number(number)}月`;
}

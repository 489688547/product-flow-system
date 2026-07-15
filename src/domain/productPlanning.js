const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDate(value) {
  const date = String(value || "").trim();
  if (!ISO_DATE.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? "" : date;
}

function cleanText(value) {
  return String(value || "").trim();
}

export function normalizeProductPlans(value) {
  if (!Array.isArray(value)) return [];
  return value.map((plan, index) => ({
    id: cleanText(plan?.id) || `plan-${index + 1}`,
    demandId: cleanText(plan?.demandId),
    demandSnapshot: {
      name: cleanText(plan?.demandSnapshot?.name || plan?.demandName) || "未命名产品",
      image: cleanText(plan?.demandSnapshot?.image || plan?.demandImage)
    },
    developmentStart: cleanDate(plan?.developmentStart),
    developmentEnd: cleanDate(plan?.developmentEnd),
    launchStart: cleanDate(plan?.launchStart),
    launchEnd: cleanDate(plan?.launchEnd),
    createdBy: cleanText(plan?.createdBy),
    createdAt: cleanText(plan?.createdAt),
    updatedAt: cleanText(plan?.updatedAt)
  }));
}

export function validateProductPlan(input = {}) {
  const developmentStart = cleanDate(input.developmentStart);
  const developmentEnd = cleanDate(input.developmentEnd);
  const launchStart = cleanDate(input.launchStart);
  const launchEnd = cleanDate(input.launchEnd);
  if (![developmentStart, developmentEnd, launchStart, launchEnd].every(Boolean)) {
    return { valid: false, reason: "请完整填写预计开发和上线时间。" };
  }
  if (developmentEnd < developmentStart) {
    return { valid: false, reason: "预计开发结束时间不能早于开始时间。" };
  }
  if (launchEnd < launchStart) {
    return { valid: false, reason: "预计上线结束时间不能早于开始时间。" };
  }
  return { valid: true, reason: "" };
}

function rangeIntersectsYear(start, end, year) {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  return Boolean(start && end && start <= yearEnd && end >= yearStart);
}

export function planIntersectsYear(plan, year) {
  const numericYear = Number(year);
  if (!Number.isInteger(numericYear)) return false;
  return rangeIntersectsYear(plan?.developmentStart, plan?.developmentEnd, numericYear)
    || rangeIntersectsYear(plan?.launchStart, plan?.launchEnd, numericYear);
}

export function timelineSegment(start, end, year) {
  const numericYear = Number(year);
  const rangeStart = cleanDate(start);
  const rangeEnd = cleanDate(end);
  if (!Number.isInteger(numericYear) || !rangeStart || !rangeEnd || rangeEnd < rangeStart || !rangeIntersectsYear(rangeStart, rangeEnd, numericYear)) {
    return { visible: false, start: "", end: "", left: 0, width: 0 };
  }
  const yearStart = `${numericYear}-01-01`;
  const yearEnd = `${numericYear}-12-31`;
  const visibleStart = rangeStart < yearStart ? yearStart : rangeStart;
  const visibleEnd = rangeEnd > yearEnd ? yearEnd : rangeEnd;
  const startTime = Date.parse(`${yearStart}T00:00:00Z`);
  const endTime = Date.parse(`${numericYear + 1}-01-01T00:00:00Z`);
  const visibleStartTime = Date.parse(`${visibleStart}T00:00:00Z`);
  const visibleEndExclusive = Date.parse(`${visibleEnd}T00:00:00Z`) + 86400000;
  const duration = endTime - startTime;
  const left = ((visibleStartTime - startTime) / duration) * 100;
  const width = Math.min(100 - left, ((visibleEndExclusive - visibleStartTime) / duration) * 100);
  return { visible: true, start: visibleStart, end: visibleEnd, left, width };
}

import { visibleDemandPool } from "./productFlow.js";
import { normalizeExpectedLaunchMonth } from "./expectedLaunch.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

function cleanDate(value) {
  const date = String(value || "").trim();
  if (!ISO_DATE.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? "" : date;
}

function cleanText(value) {
  return String(value || "").trim();
}

function firstCleanDate(...values) {
  for (const value of values) {
    const date = cleanDate(value);
    if (date) return date;
  }
  return "";
}

function dateTime(value) {
  return Date.parse(`${value}T00:00:00Z`);
}

function addCalendarDays(value, days) {
  return new Date(dateTime(value) + days * DAY_MS).toISOString().slice(0, 10);
}

function calendarDaysBetween(from, to) {
  return Math.round((dateTime(to) - dateTime(from)) / DAY_MS);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function productManagerIdentity(product = {}) {
  return {
    productManager: cleanText(product?.productManager),
    productManagerUserId: cleanText(product?.productManagerUserId),
    productManagerUnionId: cleanText(product?.productManagerUnionId)
  };
}

function updatedTime(plan) {
  const time = Date.parse(plan.updatedAt || plan.createdAt || "");
  return Number.isNaN(time) ? 0 : time;
}

function planningLevel(demand, product) {
  const confirmed = Boolean(product?.levelConfirmed);
  return {
    planningLevel: confirmed ? product.level : "未定级",
    planningLevelConfirmed: confirmed,
    planningLevelIsReference: false,
    expectedLaunchMonth: normalizeExpectedLaunchMonth(product?.expectedLaunchMonth || demand?.expectedLaunchMonth),
    ...productManagerIdentity(product)
  };
}

export function buildPlanningCandidates(demands = [], products = []) {
  const demandList = Array.isArray(demands) ? demands : [];
  const productList = Array.isArray(products) ? products : [];
  const candidates = visibleDemandPool(demandList).map(demand => ({
    ...demand,
    ...planningLevel(demand, null),
    planningSource: "demand"
  }));

  productList
    .filter(product => Number(product?.stage) >= 1 && Number(product?.stage) < 5)
    .forEach(product => {
      const sourceDemand = demandList.find(demand => demand?.productId === product.id) || null;
      candidates.push({
        ...(sourceDemand || {}),
        id: sourceDemand?.id || `product:${product.id}`,
        productId: product.id,
        name: product.name || sourceDemand?.name || "未命名产品",
        image: product.image || sourceDemand?.image || "",
        ...planningLevel(sourceDemand, product),
        planningSource: "progress"
      });
    });

  return candidates;
}

export function normalizeProductPlans(value) {
  if (!Array.isArray(value)) return [];
  const normalized = value.map((plan, index) => {
    const demandId = cleanText(plan?.demandId);
    return {
      id: cleanText(plan?.id) || `plan-${index + 1}`,
      demandId,
      demandSnapshot: {
        name: cleanText(plan?.demandSnapshot?.name || plan?.demandName) || "未命名产品",
        image: cleanText(plan?.demandSnapshot?.image || plan?.demandImage),
        level: cleanText(plan?.demandSnapshot?.level || plan?.level),
        levelConfirmed: Boolean(plan?.demandSnapshot?.levelConfirmed || (plan?.demandSnapshot?.level && plan?.demandSnapshot?.levelIsReference === false)),
        levelIsReference: false,
        expectedLaunchMonth: normalizeExpectedLaunchMonth(plan?.demandSnapshot?.expectedLaunchMonth || plan?.expectedLaunchMonth),
        productId: cleanText(plan?.demandSnapshot?.productId || plan?.productId),
        productManager: cleanText(plan?.demandSnapshot?.productManager || plan?.productManager),
        productManagerUserId: cleanText(plan?.demandSnapshot?.productManagerUserId || plan?.productManagerUserId),
        productManagerUnionId: cleanText(plan?.demandSnapshot?.productManagerUnionId || plan?.productManagerUnionId)
      },
      developmentStart: cleanDate(plan?.developmentStart),
      launchDate: firstCleanDate(plan?.launchDate, plan?.launchEnd, plan?.launchStart, plan?.developmentEnd),
      createdBy: cleanText(plan?.createdBy),
      createdAt: cleanText(plan?.createdAt),
      updatedAt: cleanText(plan?.updatedAt)
    };
  });
  const output = [];
  const demandIndexes = new Map();
  normalized.forEach(plan => {
    if (!plan.demandId) return output.push(plan);
    const existingIndex = demandIndexes.get(plan.demandId);
    if (existingIndex == null) {
      demandIndexes.set(plan.demandId, output.length);
      output.push(plan);
    } else if (updatedTime(plan) > updatedTime(output[existingIndex])) {
      output[existingIndex] = plan;
    }
  });
  return output;
}

export function validateProductPlan(input = {}) {
  const developmentStart = cleanDate(input.developmentStart);
  const launchDate = cleanDate(input.launchDate);
  if (!developmentStart || !launchDate) {
    return { valid: false, reason: "请填写开发开始日期和预计上线日期。" };
  }
  if (launchDate < developmentStart) {
    return { valid: false, reason: "预计上线日期不能早于开发开始日期。" };
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
  return rangeIntersectsYear(plan?.developmentStart, plan?.launchDate, numericYear);
}

export function formatPlanningDateRange(start, end) {
  const rangeStart = cleanDate(start);
  const rangeEnd = cleanDate(end);
  if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return "";
  const [startYear, startMonth, startDay] = rangeStart.split("-").map(Number);
  const [endYear, endMonth, endDay] = rangeEnd.split("-").map(Number);
  if (startYear !== endYear) {
    return `${startYear}年${startMonth}月${startDay}日—${endYear}年${endMonth}月${endDay}日`;
  }
  if (startMonth !== endMonth) {
    return `${startMonth}月${startDay}日—${endMonth}月${endDay}日`;
  }
  if (startDay === endDay) return `${startMonth}月${startDay}日`;
  return `${startMonth}月${startDay}日—${endDay}日`;
}

export function planningDaysFromPixels(pixelDelta, trackWidth, year) {
  const numericYear = Number(year);
  const width = Number(trackWidth);
  const delta = Number(pixelDelta);
  if (!Number.isInteger(numericYear) || !Number.isFinite(width) || width <= 0 || !Number.isFinite(delta)) return 0;
  const daysInYear = (Date.UTC(numericYear + 1, 0, 1) - Date.UTC(numericYear, 0, 1)) / DAY_MS;
  return Math.round((delta / width) * daysInYear);
}

export function movePlanningRange(start, end, deltaDays, year) {
  const rangeStart = cleanDate(start);
  const rangeEnd = cleanDate(end);
  const numericYear = Number(year);
  if (!rangeStart || !rangeEnd || rangeEnd < rangeStart || !Number.isInteger(numericYear) || !rangeIntersectsYear(rangeStart, rangeEnd, numericYear)) {
    return { developmentStart: rangeStart, launchDate: rangeEnd };
  }
  const yearStart = `${numericYear}-01-01`;
  const yearEnd = `${numericYear}-12-31`;
  const requestedDelta = Number.isFinite(Number(deltaDays)) ? Math.trunc(Number(deltaDays)) : 0;
  const minimumDelta = calendarDaysBetween(rangeEnd, yearStart);
  const maximumDelta = calendarDaysBetween(rangeStart, yearEnd);
  const appliedDelta = clamp(requestedDelta, minimumDelta, maximumDelta);
  return {
    developmentStart: addCalendarDays(rangeStart, appliedDelta),
    launchDate: addCalendarDays(rangeEnd, appliedDelta)
  };
}

export function resizePlanningRange(start, end, edge, deltaDays, year) {
  const rangeStart = cleanDate(start);
  const rangeEnd = cleanDate(end);
  const numericYear = Number(year);
  if (!rangeStart || !rangeEnd || rangeEnd < rangeStart || !Number.isInteger(numericYear)) {
    return { developmentStart: rangeStart, launchDate: rangeEnd };
  }
  const yearStart = `${numericYear}-01-01`;
  const yearEnd = `${numericYear}-12-31`;
  const requestedDelta = Number.isFinite(Number(deltaDays)) ? Math.trunc(Number(deltaDays)) : 0;
  if (edge === "start") {
    const latestStart = rangeEnd < yearEnd ? rangeEnd : yearEnd;
    const requestedStart = addCalendarDays(rangeStart, requestedDelta);
    return {
      developmentStart: requestedStart < yearStart ? yearStart : (requestedStart > latestStart ? latestStart : requestedStart),
      launchDate: rangeEnd
    };
  }
  if (edge === "end") {
    const earliestEnd = rangeStart > yearStart ? rangeStart : yearStart;
    const requestedEnd = addCalendarDays(rangeEnd, requestedDelta);
    return {
      developmentStart: rangeStart,
      launchDate: requestedEnd < earliestEnd ? earliestEnd : (requestedEnd > yearEnd ? yearEnd : requestedEnd)
    };
  }
  return { developmentStart: rangeStart, launchDate: rangeEnd };
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
  const visibleEndExclusive = Date.parse(`${visibleEnd}T00:00:00Z`) + DAY_MS;
  const duration = endTime - startTime;
  const left = ((visibleStartTime - startTime) / duration) * 100;
  const width = Math.min(100 - left, ((visibleEndExclusive - visibleStartTime) / duration) * 100);
  return { visible: true, start: visibleStart, end: visibleEnd, left, width };
}

const CHINA_TIME_ZONE = "Asia/Shanghai";
const LEGACY_SEED_DATES = {
  d1: "2026-07-03",
  d2: "2026-07-03",
  d3: "2026-06-30"
};

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function chinaDateKey(value) {
  const date = validDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function chinaMidnightIso(dateKey) {
  return validDate(`${dateKey}T00:00:00+08:00`)?.toISOString() || "";
}

export function createDemandRecord(input = {}, now = new Date()) {
  const requestedDate = validDate(now);
  const createdAt = (requestedDate || new Date()).toISOString();
  const timestamp = requestedDate?.getTime() || Date.now();
  const { created: _legacyCreated, createdAt: _incomingCreatedAt, id: _incomingId, ...demand } = input;
  const requester = demand.requester || "";
  return {
    ...demand,
    requester,
    owner: requester,
    id: `d-${timestamp}`,
    createdAt,
    productId: ""
  };
}

export function normalizeDemandCreatedAt(demand = {}) {
  const current = validDate(demand.createdAt);
  if (current) return current.toISOString();

  const timestampMatch = String(demand.id || "").match(/^d-(\d{13})$/);
  if (timestampMatch) {
    const fromId = validDate(Number(timestampMatch[1]));
    if (fromId) return fromId.toISOString();
  }

  const seedDate = LEGACY_SEED_DATES[demand.id];
  if (seedDate) return chinaMidnightIso(seedDate);

  const legacy = String(demand.created || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(legacy)) return chinaMidnightIso(legacy);
  if (/^\d{2}-\d{2}$/.test(legacy)) return chinaMidnightIso(`2026-${legacy}`);
  return "";
}

export function formatDemandCreatedAt(createdAt, now = new Date()) {
  const createdKey = chinaDateKey(createdAt);
  const todayKey = chinaDateKey(now);
  if (!createdKey || !todayKey) return "历史数据";

  const createdDay = Date.parse(`${createdKey}T00:00:00Z`) / 86400000;
  const today = Date.parse(`${todayKey}T00:00:00Z`) / 86400000;
  const difference = today - createdDay;
  if (difference === 0) return "今天";
  if (difference === 1) return "昨天";
  if (createdKey.slice(0, 4) === todayKey.slice(0, 4)) return createdKey.slice(5);
  return createdKey;
}

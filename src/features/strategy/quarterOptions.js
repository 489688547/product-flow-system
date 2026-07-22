const QUARTERS_PER_YEAR = 4;

export function currentQuarterValue(date = new Date()) {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

// 当前季度起的未来 count 个季度，如 ["2026-Q3", "2026-Q4", "2027-Q1", "2027-Q2"]
export function upcomingQuarterOptions(count = 4, date = new Date()) {
  const startIndex = date.getFullYear() * QUARTERS_PER_YEAR + Math.floor(date.getMonth() / 3);
  return Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;
    return `${Math.floor(index / QUARTERS_PER_YEAR)}-Q${(index % QUARTERS_PER_YEAR) + 1}`;
  });
}

// 编辑既有记录时，若其季度已落在动态范围外，保留原值避免下拉框丢值
export function quarterOptionsIncluding(value, count = 4, date = new Date()) {
  const options = upcomingQuarterOptions(count, date);
  return value && !options.includes(value) ? [value, ...options] : options;
}

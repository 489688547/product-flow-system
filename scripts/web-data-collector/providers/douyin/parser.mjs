import { createHash } from "node:crypto";
import { File } from "node:buffer";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

import { normalizeCommerceFact } from "../../../../src/domain/commerceFacts.js";
import { streamSpreadsheetRows } from "../../../../src/domain/xlsxLite.js";
import { PRIMARY_DIMENSIONS } from "../../../../src/domain/douyinSelfServiceExtract.js";
import {
  assertExtractComplete,
  parseExtractRows
} from "../../../../src/domain/douyinExtractRows.js";

const DATE_ALIASES = ["日期", "数据日期", "统计日期"];

const SCHEMAS = Object.freeze({
  store_daily: Object.freeze({
    reportVersion: "douyin-store-v1",
    required: Object.freeze(["businessDate", "transactionAmount", "transactionOrderCount"]),
    fields: Object.freeze({
      businessDate: { aliases: DATE_ALIASES, kind: "date" },
      transactionAmount: { aliases: ["成交金额", "成交GMV"], kind: "number" },
      transactionOrderCount: { aliases: ["成交订单数", "成交订单量"], kind: "number" },
      transactionBuyerCount: { aliases: ["成交人数", "成交用户数"], kind: "number" },
      userPaymentAmount: { aliases: ["用户支付金额", "支付金额"], kind: "number" },
      settlementAmount: { aliases: ["结算金额"], kind: "number" },
      refundAmountByPaymentDate: { aliases: ["退款金额（支付时间）", "退款金额(支付时间)", "支付口径退款金额"], kind: "number" },
      refundAmountByRefundDate: { aliases: ["退款金额（退款时间）", "退款金额(退款时间)", "退款口径退款金额"], kind: "number" },
      refundOrderCountByPaymentDate: { aliases: ["退款订单数（支付时间）", "退款订单数(支付时间)", "支付口径退款订单数"], kind: "number" },
      refundOrderCountByRefundDate: { aliases: ["退款订单数（退款时间）", "退款订单数(退款时间)", "退款口径退款订单数"], kind: "number" },
      productExposureUsers: { aliases: ["商品曝光人数", "商品曝光用户数"], kind: "number" },
      productClickUsers: { aliases: ["商品点击人数", "商品点击用户数"], kind: "number" }
    })
  }),
  product_daily: Object.freeze({
    reportVersion: "douyin-product-v1",
    required: Object.freeze(["productId", "transactionAmount"]),
    fields: Object.freeze({
      businessDate: { aliases: DATE_ALIASES, kind: "date" },
      productId: { aliases: ["商品ID", "商品id"], kind: "identity" },
      skuId: { aliases: ["SKU ID", "SKUID", "sku_id"], kind: "string" },
      productName: { aliases: ["商品名称", "商品标题"], kind: "string" },
      skuName: { aliases: ["SKU名称", "规格名称"], kind: "string" },
      merchantCode: { aliases: ["商家编码", "商品编码"], kind: "string" },
      exposureUsers: { aliases: ["商品曝光人数", "曝光人数", "商品卡曝光人数"], kind: "number" },
      clickUsers: { aliases: ["商品点击人数", "点击人数", "商品卡点击人数"], kind: "number" },
      transactionBuyers: { aliases: ["成交人数", "成交用户数", "商品卡成交人数"], kind: "number" },
      transactionOrderCount: { aliases: ["成交订单数", "商品卡成交订单数"], kind: "number" },
      transactionQuantity: { aliases: ["成交件数", "成交商品件数"], kind: "number" },
      transactionAmount: { aliases: ["成交金额", "商品卡用户支付金额"], kind: "number" },
      userPaymentAmount: { aliases: ["用户支付金额", "支付金额", "商品卡用户支付金额"], kind: "number" },
      refundOrderCount: { aliases: ["退款订单数"], kind: "number" },
      refundQuantity: { aliases: ["退款件数"], kind: "number" },
      refundAmount: { aliases: ["退款金额"], kind: "number" }
    })
  }),
  live_daily: Object.freeze({
    reportVersion: "douyin-live-v1",
    required: Object.freeze(["startedAt", "transactionAmount"]),
    fields: Object.freeze({
      businessDate: { aliases: DATE_ALIASES, kind: "date" },
      liveSessionId: { aliases: ["直播场次ID", "直播间ID", "场次ID"], kind: "identity" },
      accountId: { aliases: ["账号ID", "主播账号ID", "主播抖音号"], kind: "string" },
      startedAt: { aliases: ["开播时间", "直播开始时间"], kind: "timestamp" },
      endedAt: { aliases: ["结束时间", "直播结束时间"], kind: "timestamp" },
      durationSeconds: {
        aliases: ["开播时长", "直播时长", "直播时长(分钟)", "直播时长（分钟）"],
        minuteAliases: ["直播时长(分钟)", "直播时长（分钟）"],
        kind: "duration"
      },
      exposureUsers: { aliases: ["曝光人数", "直播曝光人数", "直播间曝光人数"], kind: "number" },
      entryUsers: { aliases: ["进入直播间人数", "进入人数"], kind: "number" },
      viewerUsers: { aliases: ["观看人数", "直播观看人数", "直播间观看人数"], kind: "number" },
      effectiveViewerUsers: { aliases: ["有效观看人数", "有效看播人数"], kind: "number" },
      productClickUsers: { aliases: ["商品点击人数", "直播间商品点击人数"], kind: "number" },
      addToCartUsers: { aliases: ["加购人数", "商品加购人数"], kind: "number" },
      transactionBuyers: { aliases: ["成交人数", "成交用户数", "直播间成交人数"], kind: "number" },
      transactionOrderCount: { aliases: ["成交订单数", "直播间成交订单数"], kind: "number" },
      transactionQuantity: { aliases: ["成交件数", "直播间成交件数"], kind: "number" },
      transactionAmount: { aliases: ["成交金额", "直播间成交金额"], kind: "number" },
      userPaymentAmount: { aliases: ["用户支付金额", "支付金额", "直播间用户支付金额"], kind: "number" },
      refundOrderCount: { aliases: ["退款订单数", "直播间退款订单数"], kind: "number" },
      refundAmount: { aliases: ["退款金额", "直播间退款金额"], kind: "number" }
    })
  }),
  video_daily: Object.freeze({
    reportVersion: "douyin-video-v1",
    required: Object.freeze(["videoId", "playCount", "transactionAmount"]),
    fields: Object.freeze({
      businessDate: { aliases: DATE_ALIASES, kind: "date" },
      videoId: { aliases: ["视频ID", "短视频ID"], kind: "identity" },
      accountId: { aliases: ["账号ID", "作者账号ID", "达人抖音号"], kind: "string" },
      publishedAt: { aliases: ["发布时间", "视频发布时间"], kind: "timestamp" },
      title: { aliases: ["视频标题", "标题"], kind: "string" },
      productId: { aliases: ["关联商品ID", "商品ID", "带货商品ID"], kind: "string" },
      materialId: { aliases: ["素材ID"], kind: "string" },
      playUsers: { aliases: ["播放人数"], kind: "number" },
      playCount: { aliases: ["播放次数", "播放量", "视频观看次数"], kind: "number" },
      effectivePlayCount: { aliases: ["有效播放次数", "有效播放量"], kind: "number" },
      likeCount: { aliases: ["点赞数", "点赞量"], kind: "number" },
      commentCount: { aliases: ["评论数", "评论量"], kind: "number" },
      shareCount: { aliases: ["分享数", "分享量"], kind: "number" },
      productExposureCount: { aliases: ["商品曝光次数", "商品曝光量"], kind: "number" },
      productClickCount: { aliases: ["商品点击次数", "商品点击量"], kind: "number" },
      transactionBuyers: { aliases: ["成交人数", "成交用户数"], kind: "number" },
      transactionOrderCount: { aliases: ["成交订单数"], kind: "number" },
      transactionQuantity: { aliases: ["成交件数"], kind: "number" },
      transactionAmount: { aliases: ["成交金额", "用户支付金额(元)", "用户支付金额（元）"], kind: "number" },
      refundOrderCount: { aliases: ["退款订单数"], kind: "number" },
      refundAmount: { aliases: ["退款金额", "退款金额(元)", "退款金额（元）"], kind: "number" }
    })
  })
});

const V2_SIGNATURES = Object.freeze({
  product_daily: Object.freeze(["商品标题", "商品卡用户支付金额"]),
  live_daily: Object.freeze(["主播抖音号", "直播间成交金额"]),
  video_daily: Object.freeze(["视频观看次数", "用户支付金额(元)"])
});

const DATE_ERROR_CODES = Object.freeze({
  store_daily: "DOUYIN_STORE_DATE_RANGE_NOT_APPLIED",
  product_daily: "DOUYIN_PRODUCT_DATE_RANGE_NOT_APPLIED",
  live_daily: "DOUYIN_LIVE_DATE_RANGE_NOT_APPLIED",
  video_daily: "DOUYIN_VIDEO_DATE_RANGE_NOT_APPLIED"
});

function reportError(code, message, details) {
  const error = new Error(message);
  error.name = "DouyinReportError";
  error.code = code;
  error.retryable = false;
  if (details) error.details = details;
  return error;
}

function cleanHeader(value) {
  return String(value ?? "")
    .replace(/^\ufeff/, "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .trim();
}

function resolveColumns(headers, schema) {
  const normalized = headers.map(cleanHeader);
  const columns = {};
  for (const [field, definition] of Object.entries(schema.fields)) {
    columns[field] = definition.aliases
      .map(cleanHeader)
      .map(alias => normalized.indexOf(alias))
      .find(index => index >= 0) ?? -1;
  }
  return columns;
}

function signatureScore(headers, schema) {
  const columns = resolveColumns(headers, schema);
  const required = schema.required.filter(field => columns[field] >= 0).length;
  const mapped = Object.values(columns).filter(index => index >= 0).length;
  return { columns, required, mapped, complete: required === schema.required.length };
}

function reportVersion(resourceType, headers, fallback) {
  const normalized = new Set(headers.map(cleanHeader));
  const signature = V2_SIGNATURES[resourceType] || [];
  return signature.length && signature.every(header => normalized.has(cleanHeader(header)))
    ? `douyin-${resourceType.replace("_daily", "")}-v2`
    : fallback;
}

export function detectDouyinReport({ fileName = "", headers = [] } = {}) {
  let selected = null;
  for (const [resourceType, schema] of Object.entries(SCHEMAS)) {
    const score = signatureScore(headers, schema);
    if (!score.complete) continue;
    if (!selected || score.mapped > selected.mapped) {
      selected = {
        resourceType,
        reportVersion: reportVersion(resourceType, headers, schema.reportVersion),
        mapped: score.mapped
      };
    }
  }
  if (!selected) {
    throw reportError("DOUYIN_REPORT_SCHEMA_CHANGED", `无法识别抖店官方报表：${basename(String(fileName || "report"))}`);
  }
  return {
    resourceType: selected.resourceType,
    reportVersion: selected.reportVersion
  };
}

function valueText(value) {
  return String(value ?? "").trim();
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = valueText(value);
  if (!text || ["--", "-", "—", "N/A"].includes(text.toUpperCase())) return null;
  const normalized = text.replace(/[,\s￥¥元]/g, "").replace(/%$/, "");
  const number = Number(normalized);
  if (!Number.isFinite(number)) throw reportError("DOUYIN_REPORT_SCHEMA_CHANGED", "报表包含无法识别的数值。");
  return number;
}

function dateValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Math.round((value - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  const match = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(valueText(value));
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function timestampValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return `${date.toISOString().slice(0, 19)}+08:00`;
  }
  const match = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:\s+|T)(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(valueText(value));
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}T${match[4].padStart(2, "0")}:${match[5].padStart(2, "0")}:${(match[6] || "0").padStart(2, "0")}+08:00`;
}

function durationValue(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 1 ? Math.round(value * 86400) : Math.round(value);
  }
  const text = valueText(value);
  const clock = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(text);
  if (clock) {
    if (clock[3] === undefined) return Number(clock[1]) * 60 + Number(clock[2]);
    return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3]);
  }
  const hours = /(\d+(?:\.\d+)?)小时/.exec(text);
  const minutes = /(\d+(?:\.\d+)?)分钟/.exec(text);
  const seconds = /(\d+(?:\.\d+)?)秒/.exec(text);
  if (hours || minutes || seconds) {
    return Math.round(Number(hours?.[1] || 0) * 3600 + Number(minutes?.[1] || 0) * 60 + Number(seconds?.[1] || 0));
  }
  return numberValue(value);
}

function fieldValue(kind, value, { minutes = false } = {}) {
  if (kind === "number") return numberValue(value);
  if (kind === "date") return dateValue(value);
  if (kind === "timestamp") return timestampValue(value);
  if (kind === "duration") {
    const duration = durationValue(value);
    return minutes && duration !== null ? duration * 60 : duration;
  }
  return value === null || value === undefined || value === "" ? null : valueText(value);
}

function fileBusinessDates(fileName) {
  const dates = [];
  for (const match of String(fileName || "").matchAll(/(20\d{2})[_-]?(\d{2})[_-]?(\d{2})/g)) {
    dates.push(`${match[1]}-${match[2]}-${match[3]}`);
  }
  return [...new Set(dates)];
}

function derivedLiveSessionId(fact) {
  return `live-${createHash("sha256")
    .update(`${fact.accountId || "unknown"}\n${fact.startedAt || ""}`)
    .digest("hex")
    .slice(0, 24)}`;
}

async function sourceFile(input) {
  if (input?.arrayBuffer && input?.name) return input;
  const path = input instanceof URL ? fileURLToPath(input) : String(input || "");
  if (!path) throw reportError("DOUYIN_REPORT_FILE_REQUIRED", "请提供抖店官方 XLSX 或 CSV 文件。");
  return new File([await readFile(path)], basename(path));
}

function hashFile(file) {
  return file.arrayBuffer().then(buffer => createHash("sha256").update(new Uint8Array(buffer)).digest("hex"));
}

function detailIdentity(resourceType, fact) {
  if (resourceType === "product_daily") return `${fact.productId}:${fact.skuId || ""}`;
  if (resourceType === "live_daily") return fact.liveSessionId;
  if (resourceType === "video_daily") return fact.videoId;
  return `${fact.storeId}:${fact.businessDate}`;
}

export async function readDouyinReport(input, { resourceType, businessDate, storeId } = {}) {
  const schema = SCHEMAS[resourceType];
  if (!schema) throw reportError("DOUYIN_RESOURCE_NOT_COVERED", "抖店报表资源尚未登记。");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(businessDate || ""))) {
    throw reportError(DATE_ERROR_CODES[resourceType], "抖店报表任务日期无效。");
  }
  if (!/^[-_a-zA-Z0-9]{1,160}$/.test(String(storeId || ""))) {
    throw reportError("DOUYIN_STORE_IDENTITY_MISMATCH", "抖店任务缺少稳定店铺标识。");
  }
  const file = await sourceFile(input);
  const rows = [];
  await streamSpreadsheetRows(file, row => {
    if (row.some(value => valueText(value))) rows.push(row);
  });
  if (!rows.length) throw reportError("DOUYIN_REPORT_SCHEMA_CHANGED", "抖店官方报表为空或无法读取。");

  let headerIndex = 0;
  let best = { required: -1, mapped: -1, columns: {} };
  for (let index = 0; index < Math.min(30, rows.length); index += 1) {
    const score = signatureScore(rows[index], schema);
    if (score.required > best.required || (score.required === best.required && score.mapped > best.mapped)) {
      best = score;
      headerIndex = index;
    }
  }
  const missing = schema.required.filter(field => best.columns[field] < 0);
  if (missing.length) {
    throw reportError("DOUYIN_REQUIRED_FIELDS_MISSING", `抖店报表缺少必需字段：${missing.join("、")}`);
  }
  const parsedReportVersion = reportVersion(resourceType, rows[headerIndex], schema.reportVersion);
  const fileDates = fileBusinessDates(file.name);
  const dateFromFile = best.columns.businessDate < 0;
  if (dateFromFile && (!fileDates.length || fileDates.some(date => date !== businessDate))) {
    throw reportError(DATE_ERROR_CODES[resourceType], `抖店报表文件日期与任务日期 ${businessDate} 不一致。`);
  }

  const facts = [];
  const identities = new Set();
  let sourceRowCount = 0;
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row.some(value => valueText(value))) continue;
    sourceRowCount += 1;
    const mapped = {
      providerId: "douyin-ecommerce",
      storeId,
      sourceVersion: parsedReportVersion
    };
    for (const [field, definition] of Object.entries(schema.fields)) {
      const column = best.columns[field];
      if (field === "businessDate" && column < 0) {
        mapped[field] = businessDate;
        continue;
      }
      const header = column >= 0 ? cleanHeader(rows[headerIndex][column]) : "";
      const minutes = definition.minuteAliases?.map(cleanHeader).includes(header) || false;
      mapped[field] = column >= 0 ? fieldValue(definition.kind, row[column], { minutes }) : null;
    }
    if (resourceType === "live_daily" && !mapped.liveSessionId) {
      mapped.liveSessionId = derivedLiveSessionId(mapped);
    }
    if (mapped.businessDate !== businessDate) {
      throw reportError(DATE_ERROR_CODES[resourceType], `抖店报表日期 ${mapped.businessDate || "无法识别"} 与任务日期 ${businessDate} 不一致。`);
    }
    try {
      const fact = normalizeCommerceFact(resourceType, mapped);
      const identity = detailIdentity(resourceType, fact);
      if (identities.has(identity)) {
        throw reportError("DOUYIN_REPORT_DUPLICATE_ID", `抖店报表包含重复稳定标识：${identity}`);
      }
      identities.add(identity);
      facts.push(fact);
    } catch (error) {
      if (error?.code === "DOUYIN_REPORT_DUPLICATE_ID") throw error;
      throw reportError(
        error?.code === "COMMERCE_FACT_SCHEMA_INVALID" ? "DOUYIN_REQUIRED_FIELDS_MISSING" : "DOUYIN_REPORT_SCHEMA_CHANGED",
        `抖店报表第 ${index + 1} 行未通过标准事实校验。`
      );
    }
  }

  const mappedFields = new Set(
    Object.entries(best.columns).filter(([, column]) => column >= 0).map(([field]) => field)
  );
  if (dateFromFile) mappedFields.add("businessDate");
  if (resourceType === "live_daily" && best.columns.liveSessionId < 0) mappedFields.add("liveSessionId");
  const coverage = mappedFields.size / Object.keys(schema.fields).length;
  return {
    resourceType,
    reportVersion: parsedReportVersion,
    contentHash: await hashFile(file),
    mappedFields: [...mappedFields],
    sourceRowCount,
    rejectedCount: 0,
    coverage,
    confidence: coverage >= 0.7 ? "high" : coverage >= 0.5 ? "medium" : "low",
    facts
  };
}

export const douyinReportInternals = Object.freeze({
  SCHEMAS,
  cleanHeader,
  dateValue,
  durationValue,
  numberValue,
  timestampValue
});

// 自助取数的文件走独立解析，不能套用上面那套别名匹配。
//
// 两个原因，都会静默出错：
// 一是 DATE_ALIASES 把「统计日期」也当日期别名，而自助取数的文件里「统计日期」是
//    区间（20260725-20260729）、「日期」才是业务日，两列同时存在，先命中谁用谁；
// 二是直播维度这边没有「成交金额」列（只有用户支付金额），required 直接判缺字段。
//
// 列名映射与业务日的取法都在 src/domain/douyinExtractRows.js 里按维度登记，
// 那里也是唯一知道「直播要用开播时间定业务日」的地方。
export const SELF_SERVICE_REPORT_VERSION = "douyin-self-service-v1";

// 导出文件的字段 → 入库事实的字段。两边名字并不总是一样：买家数在店铺口径叫
// transactionBuyerCount，在直播口径叫 transactionBuyers，照抄一边会被事实校验挡下。
//
// 直播是一行一场，不能合并成一条日事实——live_daily 的事实以 liveSessionId 为身份，
// 合并后没有身份，也丢掉了场次粒度。
const SELF_SERVICE_FACT_MAP = Object.freeze({
  store_daily: Object.freeze({
    perRow: false,
    identity: Object.freeze({}),
    numbers: Object.freeze({
      transactionAmount: "transactionAmount",
      transactionOrderCount: "transactionOrderCount",
      transactionBuyerCount: "transactionBuyerCount",
      userPaymentAmount: "userPaymentAmount"
    })
  }),
  live_daily: Object.freeze({
    perRow: true,
    identity: Object.freeze({ liveRoomId: "liveSessionId", liveStartedAt: "startedAt" }),
    numbers: Object.freeze({
      userPaymentAmount: "userPaymentAmount",
      transactionOrderCount: "transactionOrderCount",
      transactionBuyerCount: "transactionBuyers"
    })
  }),
  video_daily: Object.freeze({
    perRow: true,
    identity: Object.freeze({ videoId: "videoId" }),
    // 短视频给的是「短视频用户支付金额」，与成交金额是两个口径，绝不能填进 transactionAmount。
    numbers: Object.freeze({
      userPaymentAmount: "userPaymentAmount",
      transactionOrderCount: "transactionOrderCount"
    })
  })
});

export async function readDouyinSelfServiceReport(input, { resourceType, businessDate, storeId } = {}) {
  const dimension = PRIMARY_DIMENSIONS[resourceType];
  const mapping = SELF_SERVICE_FACT_MAP[resourceType];
  if (!dimension || !mapping) {
    throw reportError("DOUYIN_RESOURCE_NOT_COVERED", `自助取数尚未登记 ${resourceType} 的入库口径。`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(businessDate || ""))) {
    throw reportError(DATE_ERROR_CODES[resourceType], "抖店报表任务日期无效。");
  }
  if (!/^[-_a-zA-Z0-9]{1,160}$/.test(String(storeId || ""))) {
    throw reportError("DOUYIN_STORE_IDENTITY_MISMATCH", "抖店任务缺少稳定店铺标识。");
  }

  const file = await sourceFile(input);
  const rows = [];
  await streamSpreadsheetRows(file, row => {
    if (row.some(value => valueText(value))) rows.push(row);
  });
  if (!rows.length) throw reportError("DOUYIN_REPORT_SCHEMA_CHANGED", "自助取数文件为空或无法读取。");

  const parsed = assertExtractComplete(
    parseExtractRows(rows[0], rows.slice(1), { dimension, businessDates: [businessDate] }),
    [businessDate]
  );

  // 任务是按天建的，文件里出现别的业务日就说明取回来的不是这一天——整批拒绝。
  // 「返回了数据」不等于「返回了这一天的数据」，这个错今天在快麦上犯过一次。
  const foreign = parsed.rows.filter(row => row.businessDate !== businessDate);
  if (foreign.length) {
    throw reportError(
      DATE_ERROR_CODES[resourceType],
      `自助取数文件含 ${foreign.length} 行非 ${businessDate} 的数据。`
    );
  }

  const facts = parsed.rows.map(row => {
    const mapped = {
      providerId: "douyin-ecommerce",
      storeId,
      businessDate,
      sourceVersion: SELF_SERVICE_REPORT_VERSION
    };
    for (const [from, to] of Object.entries(mapping.identity)) {
      if (row[from]) mapped[to] = row[from];
    }
    for (const [from, to] of Object.entries(mapping.numbers)) {
      if (typeof row[from] === "number") mapped[to] = row[from];
    }
    return normalizeCommerceFact(resourceType, mapped);
  });

  return {
    reportVersion: SELF_SERVICE_REPORT_VERSION,
    facts,
    coverage: { sourceRowCount: parsed.rows.length, factCount: facts.length },
    confidence: "high"
  };
}

import assert from "node:assert/strict";
import test from "node:test";
import {
  EXTRACT_COLUMNS,
  assertExtractComplete,
  parseExtractRows
} from "../src/domain/douyinExtractRows.js";

// 取自 2026-07-30 实际导出的文件（店铺维度 / 自然日累计 / 07-25~07-29 / 成交金额）
const 真实表头 = ["统计日期", "日期", "店铺名称", "成交金额"];
const 真实数据 = [
  ["20260725-20260729", "20260725", "TIYES提野星宠物用品旗舰店", "67159.12"],
  ["20260725-20260729", "20260726", "TIYES提野星宠物用品旗舰店", "64545.91"],
  ["20260725-20260729", "20260727", "TIYES提野星宠物用品旗舰店", "61447.45"],
  ["20260725-20260729", "20260728", "TIYES提野星宠物用品旗舰店", "66404.55"],
  ["20260725-20260729", "20260729", "TIYES提野星宠物用品旗舰店", "65741.59"]
];

test("真实导出文件解析为一行一天", () => {
  const result = parseExtractRows(真实表头, 真实数据);
  assert.equal(result.rows.length, 5);
  assert.equal(result.rows[0].businessDate, "2026-07-25");
  assert.equal(result.rows[0].transactionAmount, 67159.12);
  assert.equal(result.rows.at(-1).businessDate, "2026-07-29");
  // 07-28 应与罗盘首页显示的「昨日 ¥66,404.55」一致
  assert.equal(result.rows[3].transactionAmount, 66404.55);
});

test("金额是字符串也要转成数", () => {
  // 导出文件里所有单元格都是 t="s"，连金额都是字符串。
  const result = parseExtractRows(真实表头, 真实数据);
  assert.equal(typeof result.rows[0].transactionAmount, "number");
});

test("按列名映射，换一组指标不会错位", () => {
  // 勾选的指标不同，列顺序就不同；按列序取值会在换指标后悄悄错位，而错位不报错。
  const header = ["统计日期", "日期", "店铺名称", "成交人数", "成交金额"];
  const rows = [["20260725-20260725", "20260725", "店", "123", "456.78"]];
  const result = parseExtractRows(header, rows);
  assert.equal(result.rows[0].transactionBuyerCount, 123);
  assert.equal(result.rows[0].transactionAmount, 456.78);
});

test("缺少日期列直接失败", () => {
  assert.throws(
    () => parseExtractRows(["统计日期", "店铺名称", "成交金额"], []),
    error => error.code === "DOUYIN_EXTRACT_DATE_COLUMN_MISSING"
  );
});

test("请求的业务日少一天就整批不入库", () => {
  // 少一天而不报错，页面会显示成「这天没生意」——比缺数更糟的谎。
  const result = parseExtractRows(真实表头, 真实数据.slice(0, 4), {
    businessDates: ["2026-07-25", "2026-07-26", "2026-07-27", "2026-07-28", "2026-07-29"]
  });
  assert.deepEqual(result.missing, ["2026-07-29"]);
  assert.throws(
    () => assertExtractComplete(result, ["2026-07-25", "2026-07-26", "2026-07-27", "2026-07-28", "2026-07-29"]),
    error => error.code === "DOUYIN_EXTRACT_DAYS_MISSING"
  );
});

test("订单数与人数已登记，可补回面板撤下的两列", () => {
  assert.equal(EXTRACT_COLUMNS.成交订单数, "transactionOrderCount");
  assert.equal(EXTRACT_COLUMNS.成交人数, "transactionBuyerCount");
});

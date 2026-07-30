import assert from "node:assert/strict";
import test from "node:test";
import {
  buildKuaimaiOrderRecord,
  buildKuaimaiOrderRecords,
  businessDayOfTrade,
  orderCost,
  orderQuantity
} from "../chrome-extension/company-data-collector/providers/kuaimaiOrderRecords.js";

// 2026-07-25 08:00:01 (+08:00)
const CREATED = Date.parse("2026-07-25T08:00:01+08:00");

function trade(overrides = {}) {
  return {
    sid: "5946267426494495",
    tid: "6954752314772690019",
    shortId: "5300550",
    shopName: "TIYES提野星宠物用品旗舰店",
    shopSourceName: "抖店(放心购)",
    source: "fxg",
    chStatus: "已发货",
    sysStatus: "SELLER_SEND_GOODS",
    payment: 34.9,
    created: CREATED,
    payTime: CREATED + 3000,
    orders: [{ outerId: "6978705011352", num: 1, price: 34.9, payment: 34.9, cost: 11.3 }],
    ...overrides
  };
}

test("成本按单价乘数量，不能直接累加", () => {
  // 实测：同一条码在 num=1/2/3/4 下 cost 恒定，说明 cost 是单价。
  // 直接累加会把 2 件商品的成本算成 1 件，严重低估。
  assert.equal(orderCost([{ num: 2, cost: 7.5 }]), 15);
  assert.equal(orderCost([{ num: 3, cost: 7.5 }, { num: 1, cost: 13 }]), 35.5);
  assert.equal(orderCost([]), 0);
});

test("数量只能由子表求和，主表没有数量字段", () => {
  assert.equal(orderQuantity([{ num: 2 }, { num: 3 }]), 5);
  assert.equal(orderQuantity([]), 0);
});

test("业务日按订单创建时间的 Asia/Shanghai 自然日判定", () => {
  assert.equal(businessDayOfTrade(trade()), "2026-07-25");
  // 北京时间 00:00:01 创建，UTC 仍是前一天，业务日必须是 07-25。
  assert.equal(businessDayOfTrade(trade({ created: Date.parse("2026-07-25T00:00:01+08:00") })), "2026-07-25");
  // 北京时间 23:59:59 同理，不能滚到次日。
  assert.equal(businessDayOfTrade(trade({ created: Date.parse("2026-07-25T23:59:59+08:00") })), "2026-07-25");
});

test("记录字段沿用导出文件列名，接口与文件两条路线产出同一形状", () => {
  const record = buildKuaimaiOrderRecord(trade());
  assert.equal(record.sourceKey, "5946267426494495");
  assert.equal(record.payload.系统订单号, "5946267426494495");
  assert.equal(record.payload.平台, "抖店(放心购)");
  assert.equal(record.payload.商品数量, 1);
  assert.equal(record.payload.订单成本, 11.3);
  assert.equal(record.payload.下单时间, "2026-07-25 08:00:01");
  assert.equal(record.payload.商品信息[0].条码, "6978705011352");
});

test("不推导毛利润", () => {
  // 导出文件的「毛利润」是否扣运费尚未核实，凭「已付 - 成本」填一个数字
  // 会造出看起来权威的错值。缺就是缺。
  const record = buildKuaimaiOrderRecord(trade());
  assert.equal("毛利润" in record.payload, false);
});

test("缺少系统订单号的行直接丢弃", () => {
  assert.equal(buildKuaimaiOrderRecord({ created: CREATED, orders: [] }), null);
});

test("业务日不符的订单被挡在源头，不进记录", () => {
  // 07-26 的一次网页采集导出了别的日期却当成功，被下游守卫拦下。
  // 这里在生成记录时就拦，失败得更早也更清楚。
  const result = buildKuaimaiOrderRecords(
    [trade(), trade({ sid: "999", created: Date.parse("2026-07-24T10:00:00+08:00") })],
    { businessDate: "2026-07-25" }
  );
  assert.equal(result.records.length, 1);
  assert.deepEqual(result.mismatched, ["999"]);
});

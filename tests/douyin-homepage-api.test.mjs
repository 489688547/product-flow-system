import assert from "node:assert/strict";
import test from "node:test";
import {
  HOMEPAGE_DATE_TYPE,
  buildHomepageFacts,
  convertUnit,
  homepageQuery,
  parseHomepageModule,
  withinHomepageWindow
} from "../src/domain/douyinHomepageApi.js";

// 照抄 2026-07-31 真实返回的结构。
function cell(name, unit, value, benchmark) {
  return {
    [name]: {
      index_value: {
        value: { unit, value },
        benchmark: { unit, value: benchmark },
        last_value: { unit, value: value * 2 }
      }
    }
  };
}

function payload(...cells) {
  return {
    data: {
      module_data: {
        homepage_core_index: {
          compass_general_multi_index_card_value: { data: [Object.assign({}, ...cells)] }
        }
      }
    }
  };
}

test("只用近1天口径：7天/30天口径传单日返回的是窗口累计", () => {
  // 实测 07-28：date_type=21 给 21382、date_type=23 给 97899，而那天真实约 3000。
  // 拿它们「扩大可查范围」，落库的就是 7 天或 30 天合计冒充某一天。
  assert.equal(HOMEPAGE_DATE_TYPE, 20);
  assert.match(homepageQuery("core_index", "2026-07-30"), /date_type=20/);
  assert.match(homepageQuery("core_index", "2026-07-30"), /begin_date=2026%2F07%2F30\+00%3A00%3A00/);
  assert.throws(() => homepageQuery("core_index", "20260730"), error => error.code === "DOUYIN_HOMEPAGE_DATE_INVALID");
});

test("单位按接口给的换算，没见过的单位直接拒绝", () => {
  // 把分当成元会差 100 倍，而 100 倍的错值在页面上看着仍像个正常数字。
  assert.equal(convertUnit(6544976, 3), 65449.76);
  assert.equal(convertUnit(3265, 5), 3265);
  assert.equal(convertUnit(0.0707, 4), 0.0707);
  assert.throws(() => convertUnit(1, 9), error => error.code === "DOUYIN_HOMEPAGE_UNIT_UNKNOWN");
});

test("只取 value，不碰 benchmark——314 万单就是抓到了别人的数", () => {
  // 卡片里本店值、同行顶尖、上期三个数挨在一起；接口里各有其名，取错不会报错，
  // 只会得到一个别人的数字。
  const values = parseHomepageModule(payload(cell("income_amt", 3, 6544976, 4253007)));
  assert.equal(values.income_amt, 65449.76);
  assert.equal(Object.values(values).includes(42530.07), false, "同行顶尖不得混进来");
});

test("组装店铺日事实，广告费来自投放消耗", () => {
  // 数值取自 2026-07-30 真实返回，与自助取数导出、页面截图三方一致。
  const values = parseHomepageModule(payload(
    cell("income_amt", 3, 6544976, 1),
    cell("pay_cnt", 5, 3265, 1),
    cell("pay_ucnt", 5, 2676, 1),
    cell("ad_costed_amt", 3, 1311602, 1),
    cell("cost_amt", 3, 1511793, 1)
  ));
  const fact = buildHomepageFacts(values, { businessDate: "2026-07-30", storeId: "90862283" });
  assert.equal(fact.transactionAmount, 65449.76);
  assert.equal(fact.transactionOrderCount, 3265);
  assert.equal(fact.transactionBuyerCount, 2676);
  assert.equal(fact.adCostAmount, 13116.02);
  assert.equal(fact.expenseAmount, 15117.93);
  assert.equal(fact.sourceVersion, "douyin-homepage-v1");
});

test("拿不到核心字段就整条不入库，不落一条全 null 的记录", () => {
  // 落了页面上会显示成「这天没生意」，比缺数更糟。
  assert.throws(
    () => buildHomepageFacts({}, { businessDate: "2026-07-28", storeId: "90862283" }),
    error => error.code === "DOUYIN_HOMEPAGE_FIELDS_MISSING" && /自助取数/.test(error.message)
  );
});

test("回溯窗口约两天，超出的日期不该走这条路", () => {
  assert.equal(withinHomepageWindow("2026-07-30", "2026-07-31"), true);
  assert.equal(withinHomepageWindow("2026-07-29", "2026-07-31"), true);
  assert.equal(withinHomepageWindow("2026-07-28", "2026-07-31"), false);
});

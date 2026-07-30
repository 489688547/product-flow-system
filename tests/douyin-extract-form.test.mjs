import assert from "node:assert/strict";
import test from "node:test";
import { createDouyinExtractForm } from "../scripts/web-data-collector/browser/providers/douyinExtractForm.js";

function harness({ months = ["2026 年 7 月", "2026 年 8 月"], errors = [] } = {}) {
  const clicks = [];
  const typed = [];
  let monthList = [...months];
  const controller = {
    async trustedClickElement(expr, code, message) {
      if (/prev-btn|next-btn/.test(expr)) {
        monthList = monthList.map(text => {
          const [, y, m] = text.match(/(\d{4}) 年 (\d+) 月/);
          const shift = /prev/.test(expr) ? -1 : 1;
          const date = new Date(Date.UTC(Number(y), Number(m) - 1 + shift, 1));
          return `${date.getUTCFullYear()} 年 ${date.getUTCMonth() + 1} 月`;
        });
      }
      clicks.push({ expr, code, message });
      return { x: 1, y: 1 };
    },
    async trustedClearAndType(expr, text) { typed.push(text); }
  };
  const evaluate = async expr => {
    if (expr.includes("picker-panel")) return monthList;
    if (expr.includes("errors")) return { values: ["2026-07-25", "2026-07-29"], errors };
    return null;
  };
  return { controller, evaluate, clicks, typed, form: createDouyinExtractForm({ controller, evaluate, wait: async () => {} }) };
}

test("任务名称用可信输入写入，不改 value", async () => {
  const h = harness();
  await h.form.createTask({ resourceType: "live_daily", from: "2026-07-25", to: "2026-07-29" });
  assert.deepEqual(h.typed, ["采集-live-20260725-20260729"]);
});

test("日期通过日历格子选中，且限定当月可选格", async () => {
  const h = harness();
  await h.form.createTask({ resourceType: "live_daily", from: "2026-07-25", to: "2026-07-29" });
  const cellClicks = h.clicks.filter(c => c.code === "DOUYIN_EXTRACT_DATE_CELL_MISSING");
  assert.equal(cellClicks.length, 2, "开始与结束各点一次");
  for (const click of cellClicks) {
    assert.match(click.expr, /in-view/, "必须限定当月，否则会点到相邻月份的同号日期");
    assert.match(click.expr, /disabled/, "必须排除不可选日期");
  }
});

test("目标月份不在视图时先翻月", async () => {
  const h = harness({ months: ["2026 年 7 月", "2026 年 8 月"] });
  await h.form.createTask({ resourceType: "store_daily", from: "2026-05-10", to: "2026-05-12" });
  assert.ok(h.clicks.some(c => c.code === "DOUYIN_EXTRACT_CALENDAR_NAV_MISSING"), "应触发翻月");
});

test("翻不到目标月份必须失败，不得继续点日期", async () => {
  // 继续点只会选中错误的一天，而错误的一天不报错，会悄悄采回别人日子的数据。
  const h = harness({ months: ["2026 年 7 月"] });
  await assert.rejects(
    () => h.form.createTask({ resourceType: "store_daily", from: "2020-01-01", to: "2020-01-02" }),
    error => error.code === "DOUYIN_EXTRACT_MONTH_UNREACHABLE"
  );
});

test("表单报「请输入时间」时不提交", async () => {
  // 日期是唯一会「显示对了但没进模型」的字段，必须以校验为准，不能只看输入框文字。
  const h = harness({ errors: ["请输入时间"] });
  await assert.rejects(
    () => h.form.createTask({ resourceType: "live_daily", from: "2026-07-25", to: "2026-07-29" }),
    error => error.code === "DOUYIN_EXTRACT_DATE_NOT_APPLIED"
  );
  assert.equal(h.clicks.some(c => c.code === "DOUYIN_EXTRACT_SUBMIT_MISSING"), false, "校验未过不得点创建");
});

test("超过单次上限的区间在发起前就拒绝", async () => {
  const h = harness();
  await assert.rejects(
    () => h.form.createTask({ resourceType: "store_daily", from: "2026-01-01", to: "2026-07-29" }),
    error => error.code === "DOUYIN_EXTRACT_RANGE_TOO_LONG"
  );
  assert.equal(h.clicks.length, 0, "不得触碰页面");
});

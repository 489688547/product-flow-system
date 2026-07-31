import assert from "node:assert/strict";
import test from "node:test";
import { createDouyinExtractApi } from "../scripts/web-data-collector/browser/providers/douyinExtractApi.js";

// 假的页面 fetch：按路径回放响应，并记下发出的请求。
// existing:true 表示「查什么名字都查得到」——任务名带指纹，测试没法预先写死。
function harness({ submit, tasks = [], groups = null, existing = false } = {}) {
  const calls = [];
  const opened = [];
  const evaluate = async expression => {
    const path = String(expression.match(/fetch\("([^"]+)"/)?.[1] || "");
    calls.push(path);
    if (path.includes("/download/config")) {
      return {
        ok: true, status: 200, text: "",
        json: {
          BaseResp: { StatusCode: 0 },
          data: {
            date_type: [{ key: "day" }, { key: "all" }],
            metrics: Object.entries(groups || { 1: ["income_amt", "pay_amt", "pay_cnt", "pay_ucnt", "net_income_amt", "ad_receive_amt", "ad_receive_amt_ratio"] })
              .map(([key, list]) => ({ key, childrens: list.map(metric => ({ key: metric })) }))
          }
        }
      };
    }
    if (path.includes("/download/preview")) {
      // preview 报的是指标列，用来在建任务前核对列名有没有变。
      return {
        ok: true, status: 200, text: "",
        json: {
          BaseResp: { StatusCode: 0 },
          meta: ["日期", "成交金额", "成交订单数", "成交人数"].map(label => ({ index_name: label, index_display: label }))
        }
      };
    }
    if (path.includes("/download/submit")) {
      return { ok: true, status: 200, text: "", json: submit || { BaseResp: { StatusCode: 0 } } };
    }
    const queried = decodeURIComponent(String(path.split("task_name=")[1] || ""));
    const rows = existing && queried ? [{ name: queried, status: "0" }] : tasks;
    return {
      ok: true, status: 200, text: "",
      json: {
        BaseResp: { StatusCode: 0 },
        data: rows.map(item => ({
          cell_info: Object.fromEntries(Object.entries({
            task_id: "1", task_name: item.name, task_status: item.status, pending_rank: "", download_url: "https://compass.jinritemai.com/data_factory/download_file?task_id=1", create_time: ""
          }).map(([key, value]) => [key, { [`${key}_value`]: { value: { value_str: value } } }]))
        }))
      }
    };
  };
  const controller = { async open(url) { opened.push(url); } };
  return { api: createDouyinExtractApi({ controller, evaluate }), calls, opened };
}

const 任务 = { resourceType: "store_daily", from: "2026-07-30", to: "2026-07-30" };
// 任务名带指标集指纹，测试里按实际生成值回填。
const 任务名前缀 = "采集-shop-20260730-20260730-";

test("提交前先核对平台配置，再建任务", async () => {
  const { api, calls } = harness();
  await api.createTask(任务);
  assert.ok(calls[0].includes("/download/config"), "配置核对必须排在提交之前");
  assert.ok(calls[1].includes("/download/preview"), "列名核对也必须排在提交之前");
  assert.ok(calls[2].includes("/download/submit"));
});

test("重名视为「这条我已经建过」，接着等它，不再新建", async () => {
  // 任务名是确定性的，同名只可能是我们自己为同一请求建的。
  // 每天只有 5 条配额，重复建既撞名又白耗。
  const { api } = harness({
    submit: { BaseResp: { StatusCode: 30000, StatusMessage: "任务名称重复" } },
    existing: true
  });
  const plan = await api.createTask(任务);
  assert.ok(plan.taskName.startsWith(任务名前缀));
});

test("配额用尽但任务已在队列里，接着等——崩溃重启后就是这种情形", async () => {
  // 平台先查配额再查重名：重跑时收到的是「配额用尽」，
  // 而之前建的那条其实正排着队。直接放弃就白等一天。
  const { api } = harness({
    submit: { BaseResp: { StatusCode: 30000, StatusMessage: "每天仅支持创建5条任务" } },
    existing: true
  });
  assert.ok((await api.createTask(任务)).taskName.startsWith(任务名前缀));
});

test("配额用尽且任务不在队列里，明确报配额，不假装建成了", async () => {
  const { api } = harness({
    submit: { BaseResp: { StatusCode: 30000, StatusMessage: "每天仅支持创建5条任务" } },
    tasks: []
  });
  await assert.rejects(api.createTask(任务), error => error.code === "DOUYIN_EXTRACT_QUOTA_EXHAUSTED");
});

test("HTTP 200 但接口自己报错时不当成功", async () => {
  // 只看 HTTP 状态会把「未登录」当成功，然后一路等一个根本不存在的任务。
  const { api } = harness({ submit: { BaseResp: { StatusCode: 40000, StatusMessage: "未登录" } }, tasks: [] });
  await assert.rejects(api.createTask(任务), error => error.code === "DOUYIN_EXTRACT_API_REJECTED");
});

test("未完成的任务不给下载", async () => {
  const { api } = harness({ tasks: [{ name: "甲", status: "0" }] });
  await assert.rejects(api.downloadTask("甲"), error => error.code === "DOUYIN_EXTRACT_NOT_READY");
});

test("下完把标签页带回自助取数页，否则下一次调用会超时", async () => {
  // 标签页导航到文件地址后停在一个没有文档的状态上，下一次 evaluate 直接超时，
  // 报的却是「Runtime.evaluate 超时」——跟真正的原因毫无关系。
  const { api, opened } = harness({ tasks: [{ name: "甲", status: "2" }] });
  await api.downloadTask("甲");
  assert.match(opened[0], /download_file\?task_id=/);
  assert.match(opened[1], /appcustom-access/, "下完必须回到自助取数页");
});

test("指标集变了任务名就要变，否则会复用内容不同的旧任务", async () => {
  // 平台按名称判重，而我们的名字是确定性的。名字若只有维度与区间，改了指标集之后
  // 重名逻辑会把旧任务当成「同一个请求」接着等——实测中过一次：提交的是全选，
  // 下回来的却是旧的 10 列窄表，而且不报错。同名 ≠ 同内容。
  const 建 = async groups => {
    const { api } = harness({ groups });
    return (await api.createTask(任务)).taskName;
  };
  const 窄 = await 建({ 1: ["income_amt", "pay_amt", "pay_cnt", "pay_ucnt"] });
  const 宽 = await 建({ 1: ["income_amt", "pay_amt", "pay_cnt", "pay_ucnt"], 3: ["refund_cnt"] });
  assert.notEqual(窄, 宽, "指标集不同，任务名必须不同");
  assert.match(窄, /^采集-shop-20260730-20260730-/);
  assert.ok(窄.length <= 40, "平台的任务名上限是 40 字符");
});

test("同一份指标集重复调用，任务名稳定", async () => {
  // 否则崩溃重启后就会因为名字变了而重复建任务，每天只有 5 条配额。
  const 建 = async () => {
    const { api } = harness({ groups: { 1: ["income_amt", "pay_amt", "pay_cnt", "pay_ucnt"] } });
    return (await api.createTask(任务)).taskName;
  };
  assert.equal(await 建(), await 建());
});

import assert from "node:assert/strict";
import test from "node:test";
import { createDouyinExtractApi } from "../scripts/web-data-collector/browser/providers/douyinExtractApi.js";

// 假的页面 fetch：按路径回放响应，并记下发出的请求。
function harness({ submit, tasks = [] } = {}) {
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
            metrics: [{ key: "1", childrens: ["income_amt", "pay_amt", "pay_cnt", "pay_ucnt", "net_income_amt", "ad_receive_amt", "ad_receive_amt_ratio"].map(key => ({ key })) }]
          }
        }
      };
    }
    if (path.includes("/download/submit")) {
      return { ok: true, status: 200, text: "", json: submit || { BaseResp: { StatusCode: 0 } } };
    }
    return {
      ok: true, status: 200, text: "",
      json: {
        BaseResp: { StatusCode: 0 },
        data: tasks.map(item => ({
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
const 任务名 = "采集-shop-20260730-20260730";

test("提交前先核对平台配置，再建任务", async () => {
  const { api, calls } = harness();
  await api.createTask(任务);
  assert.ok(calls[0].includes("/download/config"), "配置核对必须排在提交之前");
  assert.ok(calls[1].includes("/download/submit"));
});

test("重名视为「这条我已经建过」，接着等它，不再新建", async () => {
  // 任务名是确定性的，同名只可能是我们自己为同一请求建的。
  // 每天只有 5 条配额，重复建既撞名又白耗。
  const { api } = harness({
    submit: { BaseResp: { StatusCode: 30000, StatusMessage: "任务名称重复" } },
    tasks: [{ name: 任务名, status: "0" }]
  });
  const plan = await api.createTask(任务);
  assert.equal(plan.taskName, 任务名);
});

test("配额用尽但任务已在队列里，接着等——崩溃重启后就是这种情形", async () => {
  // 平台先查配额再查重名：重跑时收到的是「配额用尽」，
  // 而之前建的那条其实正排着队。直接放弃就白等一天。
  const { api } = harness({
    submit: { BaseResp: { StatusCode: 30000, StatusMessage: "每天仅支持创建5条任务" } },
    tasks: [{ name: 任务名, status: "0" }]
  });
  assert.equal((await api.createTask(任务)).taskName, 任务名);
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
  const { api } = harness({ tasks: [{ name: 任务名, status: "0" }] });
  await assert.rejects(api.downloadTask(任务名), error => error.code === "DOUYIN_EXTRACT_NOT_READY");
});

test("下完把标签页带回自助取数页，否则下一次调用会超时", async () => {
  // 标签页导航到文件地址后停在一个没有文档的状态上，下一次 evaluate 直接超时，
  // 报的却是「Runtime.evaluate 超时」——跟真正的原因毫无关系。
  const { api, opened } = harness({ tasks: [{ name: 任务名, status: "2" }] });
  await api.downloadTask(任务名);
  assert.match(opened[0], /download_file\?task_id=/);
  assert.match(opened[1], /appcustom-access/, "下完必须回到自助取数页");
});

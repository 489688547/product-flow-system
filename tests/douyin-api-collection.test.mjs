import assert from "node:assert/strict";
import test from "node:test";
import {
  DOUYIN_API_ENDPOINTS,
  SIGNATURE_PARAMS,
  buildDouyinApiUrl,
  interpretDouyinApiResponse
} from "../chrome-extension/company-data-collector/providers/douyinApi.js";

test("请求不得携带页面原请求的一次性签名参数", () => {
  // 生产实测：带旧签名返回 code 11001「当前网络不稳定」，去掉才正常。
  const url = buildDouyinApiUrl({
    endpoint: DOUYIN_API_ENDPOINTS.store_daily[0],
    businessDate: "2026-07-27",
    sourceParams: { msToken: "x", a_bogus: "y", verifyFp: "z", fp: "w", _lid: "1", date_type: "1" }
  });
  const params = new URL(url).searchParams;
  for (const key of SIGNATURE_PARAMS) {
    assert.equal(params.has(key), false, `${key} 不得出现在请求中`);
  }
});

test("日期参数按业务日写入，date_type 固定为 1", () => {
  // date_type 传 3 会返回 st:0 但 data 为空，是最容易被误判成功的坑。
  const url = buildDouyinApiUrl({
    endpoint: DOUYIN_API_ENDPOINTS.store_daily[0],
    businessDate: "2026-07-27",
    sourceParams: { date_type: "3" }
  });
  const params = new URL(url).searchParams;
  assert.equal(params.get("begin_date"), "2026-07-27");
  assert.equal(params.get("end_date"), "2026-07-27");
  assert.equal(params.get("date_type"), "1");
});

test("保留来源请求里的业务参数，因为它们决定返回哪些指标", () => {
  const url = buildDouyinApiUrl({
    endpoint: DOUYIN_API_ENDPOINTS.store_daily[0],
    businessDate: "2026-07-27",
    sourceParams: { select_ad_cost: "1", has_deposit_pay_amt: "true", msToken: "drop" }
  });
  const params = new URL(url).searchParams;
  assert.equal(params.get("select_ad_cost"), "1");
  assert.equal(params.get("has_deposit_pay_amt"), "true");
});

test("成功判据是 st 为 0 且 module_data 非空", () => {
  const ok = interpretDouyinApiResponse({ st: 0, msg: "", data: { module_data: { core_data_0: {} } } });
  assert.equal(ok.ok, true);
});

test("st 为 0 但 data 为空视为失败，不得当作采集成功", () => {
  // 这是 date_type 传错时的真实响应形态：接口返回成功，但没有任何数据。
  const empty = interpretDouyinApiResponse({ st: 0, msg: "", data: {} });
  assert.equal(empty.ok, false);
  assert.equal(empty.code, "DOUYIN_API_EMPTY_DATA");
  const noModule = interpretDouyinApiResponse({ st: 0, msg: "", data: { module_data: {} } });
  assert.equal(noModule.ok, false);
  assert.equal(noModule.code, "DOUYIN_API_EMPTY_DATA");
});

test("风控拒绝有独立错误码，便于与普通失败区分", () => {
  const blocked = interpretDouyinApiResponse({ code: 11001, msg: "当前网络不稳定，请稍后再试" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "DOUYIN_API_RISK_CONTROL");
});

test("登录失效有独立错误码，需要人工处理而不是重试", () => {
  const unauth = interpretDouyinApiResponse({ st: 8, msg: "未登录" });
  assert.equal(unauth.ok, false);
  assert.equal(unauth.code, "DOUYIN_LOGIN_REQUIRED");
});

test("响应结构不符时如实报错，不猜测", () => {
  assert.equal(interpretDouyinApiResponse(null).code, "DOUYIN_API_MALFORMED");
  assert.equal(interpretDouyinApiResponse("not json").code, "DOUYIN_API_MALFORMED");
});

test("四类资源都登记了接口", () => {
  for (const resource of ["store_daily", "product_daily", "live_daily", "video_daily"]) {
    assert.ok(DOUYIN_API_ENDPOINTS[resource]?.length, `${resource} 缺少接口登记`);
    for (const endpoint of DOUYIN_API_ENDPOINTS[resource]) {
      assert.match(endpoint, /^\/compass_api\//, "接口必须是罗盘同源路径");
    }
  }
});

test("接口清单不得包含页面从未请求过的路径", () => {
  // core_index_v3 曾被误写入：它不存在，请求返回 st:0 但 data 为空，
  // 会被当成「采集成功但当天没数据」，是最难察觉的一类故障。
  const all = Object.values(DOUYIN_API_ENDPOINTS).flat();
  assert.equal(
    all.includes("/compass_api/shop/common/homepage/core_index_v3"),
    false,
    "该路径经生产实测不存在，不得登记"
  );
  assert.ok(all.includes("/compass_api/shop/common/homepage/summary_core_index_v3"));
});

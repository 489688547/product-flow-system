import assert from "node:assert/strict";
import test from "node:test";
import {
  DOUYIN_API_ENDPOINTS,
  SIGNATURE_PARAMS,
  buildDouyinApiUrl,
  collectDouyinProductDaily,
  interpretDouyinApiResponse,
  projectDouyinProductApiPage
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

test("日期参数按业务日写入，date_type 固定为自定义单日 21", () => {
  // date_type 传 3 会返回 st:0 但 data 为空，是最容易被误判成功的坑。
  const url = buildDouyinApiUrl({
    endpoint: DOUYIN_API_ENDPOINTS.store_daily[0],
    businessDate: "2026-07-27",
    sourceParams: { date_type: "3" }
  });
  const params = new URL(url).searchParams;
  assert.equal(params.get("begin_date"), "2026-07-27");
  assert.equal(params.get("end_date"), "2026-07-27");
  assert.equal(params.get("date_type"), "21");
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

function textCell(indexName, values) {
  return {
    [`${indexName}_${Object.keys(values)[0]}_value`]: {
      value: { unit: "string", value_str: Object.values(values)[0] }
    },
    ...Object.fromEntries(Object.entries(values).slice(1).map(([key, value]) => [
      `${indexName}_${key}_value`,
      { value: { unit: "string", value_str: value } }
    ]))
  };
}

function metricCell(indexName, value, unit = "number") {
  return {
    [`${indexName}_index_values`]: {
      index_values: {
        value: {
          value,
          unit,
          value_str: String(value)
        }
      }
    }
  };
}

function productApiRow({
  productId,
  productName,
  paymentFen,
  orders,
  buyers,
  exposureUsers,
  clickUsers
}) {
  return {
    cell_info: {
      product: textCell("product", { id: productId, name: productName }),
      pay_amt: metricCell("pay_amt", paymentFen, "price"),
      pay_cnt: metricCell("pay_cnt", orders),
      pay_ucnt: metricCell("pay_ucnt", buyers),
      product_show_ucnt: metricCell("product_show_ucnt", exposureUsers),
      product_show_click_ucnt: metricCell("product_show_click_ucnt", clickUsers)
    }
  };
}

test("商品接口页只投影已登记字段，并把平台分金额转换为元", () => {
  const projected = projectDouyinProductApiPage({
    st: 0,
    data: [
      productApiRow({
        productId: "3718502021305860341",
        productName: "莓果冻干主粮",
        paymentFen: 1_519_911,
        orders: 593,
        buyers: 575,
        exposureUsers: 48_100,
        clickUsers: 3_346
      })
    ],
    page_result: { total: 1 }
  });

  assert.deepEqual(projected, {
    facts: [{
      productId: "3718502021305860341",
      skuId: null,
      productName: "莓果冻干主粮",
      skuName: null,
      merchantCode: null,
      exposureUsers: 48_100,
      clickUsers: 3_346,
      transactionBuyers: 575,
      transactionOrderCount: 593,
      transactionQuantity: null,
      transactionAmount: null,
      userPaymentAmount: 15_199.11,
      refundOrderCount: null,
      refundQuantity: null,
      refundAmount: null
    }],
    total: 1
  });
  assert.doesNotMatch(JSON.stringify(projected), /cell_info|index_values|detail_h5_url|tags/);
});

test("商品接口缺稳定商品 ID 或空页时失败，不伪造事实", () => {
  assert.throws(
    () => projectDouyinProductApiPage({
      st: 0,
      data: [productApiRow({
        productId: "",
        productName: "不能靠名称造 ID",
        paymentFen: 100,
        orders: 1,
        buyers: 1,
        exposureUsers: 10,
        clickUsers: 2
      })],
      page_result: { total: 1 }
    }),
    error => error?.code === "DOUYIN_PRODUCT_ID_MISSING"
  );
  assert.throws(
    () => projectDouyinProductApiPage({ st: 0, data: [], page_result: { total: 0 } }),
    error => error?.code === "DOUYIN_API_EMPTY_DATA"
  );
});

test("商品日采集固定日期并分页到完整 total，重复商品会失败", async () => {
  const requested = [];
  const rows = [
    productApiRow({
      productId: "product-1",
      productName: "商品一",
      paymentFen: 1_000,
      orders: 1,
      buyers: 1,
      exposureUsers: 10,
      clickUsers: 2
    }),
    productApiRow({
      productId: "product-2",
      productName: "商品二",
      paymentFen: 2_000,
      orders: 2,
      buyers: 2,
      exposureUsers: 20,
      clickUsers: 4
    })
  ];
  const result = await collectDouyinProductDaily({
    businessDate: "2026-07-30",
    pageSize: 1,
    fetchImpl: async url => {
      const parsed = new URL(url);
      requested.push(parsed);
      const page = Number(parsed.searchParams.get("page_no"));
      return new Response(JSON.stringify({
        st: 0,
        data: [rows[page - 1]],
        page_result: { total: 2 }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });

  assert.equal(result.facts.length, 2);
  assert.equal(result.total, 2);
  assert.equal(requested.length, 2);
  for (const url of requested) {
    assert.equal(url.origin, "https://compass.jinritemai.com");
    assert.equal(url.pathname, DOUYIN_API_ENDPOINTS.product_daily[0]);
    assert.equal(url.searchParams.get("begin_date"), "2026-07-30");
    assert.equal(url.searchParams.get("end_date"), "2026-07-30");
    assert.equal(url.searchParams.get("date_type"), "21");
  }

  await assert.rejects(
    collectDouyinProductDaily({
      businessDate: "2026-07-30",
      pageSize: 1,
      fetchImpl: async url => new Response(JSON.stringify({
        st: 0,
        data: [rows[0]],
        page_result: { total: 2 }
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    }),
    error => error?.code === "DOUYIN_PRODUCT_DUPLICATE"
  );
});

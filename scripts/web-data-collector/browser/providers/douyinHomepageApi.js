// 罗盘首页取数的客户端。判定与换算都在 src/domain/douyinHomepageApi.js，这里只发请求。
//
// 它是自助取数的即时补充：不排队、不占每日 5 条配额、可指定任意日期，秒级返回。
// 请求在页面上下文里发，登录态由浏览器自己带，采集器不接触任何凭据。

import {
  HOMEPAGE_MODULES,
  buildHomepageFacts,
  homepageQuery,
  parseHomepageModule
} from "../../../../src/domain/douyinHomepageApi.js";

const HOMEPAGE_URL = "https://compass.jinritemai.com/shop";

export function createDouyinHomepageApi({ controller, evaluate }) {
  async function request(path) {
    const result = await evaluate(`(async () => {
      try {
        const response = await fetch(${JSON.stringify(path)}, {
          credentials: "include", headers: { accept: "application/json" }
        });
        const text = await response.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (error) { /* 非 JSON 时保留原文 */ }
        return { ok: response.ok, status: response.status, json: parsed, text: parsed ? "" : text.slice(0, 300) };
      } catch (error) {
        return { ok: false, status: 0, json: null, text: String(error && error.message || error).slice(0, 300) };
      }
    })()`);
    if (!result) {
      throw Object.assign(new Error(`${path} 没有返回结果，页面可能已经关闭。`), { code: "DOUYIN_HOMEPAGE_NO_RESPONSE" });
    }
    if (!result.ok) {
      throw Object.assign(
        new Error(`${path} 返回 HTTP ${result.status}：${result.text || "(无正文)"}`),
        { code: "DOUYIN_HOMEPAGE_FAILED" }
      );
    }
    return result.json;
  }

  return Object.freeze({
    // 取某一天的店铺日事实。两个模块合并：经营概况给成交，收支概况给广告费与支出。
    async readStoreDaily({ businessDate, storeId }) {
      await controller.open(HOMEPAGE_URL);
      const values = {};
      for (const module of HOMEPAGE_MODULES) {
        Object.assign(values, parseHomepageModule(await request(homepageQuery(module, businessDate))));
      }
      return buildHomepageFacts(values, { businessDate, storeId });
    }
  });
}

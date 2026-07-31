// 自助取数的接口客户端。判定逻辑全在 src/domain/douyinExtractApi.js，这里只负责发请求。
//
// 请求一律在页面上下文里用 fetch 发出：登录态、CSRF、Origin、签名头都由浏览器按它
// 自己的规则带上，采集器既不读也不存任何凭据。这也是它比页面驱动稳的原因——
// 不依赖坐标、不依赖 class 名、不受页面缩放影响。

import {
  SUBMIT_PATH,
  TASK_LIST_PATH,
  buildSubmitPayload,
  parseTaskList,
  selectApiTask
} from "../../../../src/domain/douyinExtractApi.js";
import { buildExtractPlan } from "../../../../src/domain/douyinSelfServiceExtract.js";

function apiError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function createDouyinExtractApi({ controller, evaluate }) {
  // 页面内 fetch 的统一出口。把状态码与正文一起带回来，失败时能看清是什么失败，
  // 而不是只知道「没成功」。
  async function request(path, { method = "GET", body } = {}) {
    const result = await evaluate(`(async () => {
      try {
        const response = await fetch(${JSON.stringify(path)}, {
          method: ${JSON.stringify(method)},
          credentials: "include",
          headers: { "accept": "application/json"${body ? `, "content-type": "application/json"` : ""} }${body ? `,
          body: ${JSON.stringify(JSON.stringify(body))}` : ""}
        });
        const text = await response.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (error) { /* 非 JSON 时保留原文 */ }
        return { ok: response.ok, status: response.status, json: parsed, text: parsed ? "" : text.slice(0, 500) };
      } catch (error) {
        return { ok: false, status: 0, json: null, text: String(error && error.message || error).slice(0, 500) };
      }
    })()`);

    if (!result) throw apiError("DOUYIN_EXTRACT_API_NO_RESPONSE", `${path} 没有返回结果，页面可能已经关闭。`);
    if (!result.ok) {
      throw apiError("DOUYIN_EXTRACT_API_FAILED", `${path} 返回 HTTP ${result.status}：${result.text || "(无正文)"}`);
    }
    // 接口自己的错误码在 BaseResp 里，HTTP 200 不代表成功——只看 HTTP 状态会把
    // 「未登录」「参数不合法」当成功，然后一路等一个根本不存在的任务。
    const statusCode = result.json?.BaseResp?.StatusCode;
    if (statusCode !== undefined && statusCode !== 0) {
      throw apiError(
        "DOUYIN_EXTRACT_API_REJECTED",
        `${path} 被拒绝（StatusCode=${statusCode}）：${result.json?.BaseResp?.StatusMessage || "无说明"}`
      );
    }
    return result.json;
  }

  return Object.freeze({
    async createTask({ resourceType, from, to }) {
      const plan = buildExtractPlan({ resourceType, from, to });
      await request(SUBMIT_PATH, { method: "POST", body: buildSubmitPayload(plan) });
      return plan;
    },

    // 按名称精确过滤，不取「最新一条」——队列是全平台共用的，列表里随时有别人的任务。
    async findTask(taskName) {
      const query = `${TASK_LIST_PATH}?page_no=1&page_size=20&task_name=${encodeURIComponent(taskName)}`;
      return selectApiTask(parseTaskList(await request(query)), taskName);
    },

    // 下载地址由列表给出，不自己拼——task_id 与地址格式都是平台的事。
    async downloadTask(taskName) {
      const found = await this.findTask(taskName);
      if (found.state !== "ready") {
        throw apiError("DOUYIN_EXTRACT_NOT_READY", `任务「${taskName}」尚未完成（${found.status || found.state}），不能下载。`);
      }
      await controller.open(found.downloadUrl);
      return found;
    }
  });
}

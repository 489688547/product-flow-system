// 自助取数的接口客户端。判定逻辑全在 src/domain/douyinExtractApi.js，这里只负责发请求。
//
// 请求一律在页面上下文里用 fetch 发出：登录态、CSRF、Origin、签名头都由浏览器按它
// 自己的规则带上，采集器既不读也不存任何凭据。这也是它比页面驱动稳的原因——
// 不依赖坐标、不依赖 class 名、不受页面缩放影响。

import {
  SUBMIT_PATH,
  TASK_LIST_PATH,
  assertConfigSupportsPlan,
  buildSubmitPayload,
  configQuery,
  parseExtractConfig,
  parseTaskList,
  selectApiTask
} from "../../../../src/domain/douyinExtractApi.js";
import { buildExtractPlan } from "../../../../src/domain/douyinSelfServiceExtract.js";
import { SELF_SERVICE_URL } from "./douyin.mjs";

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
      const message = result.json?.BaseResp?.StatusMessage || result.json?.msg || "无说明";
      // 平台把各种拒绝都塞在同一个码（30000）里，靠文案区分。这两种的处置完全不同：
      // 重名是「这条任务我已经建过了」，接着等就行；配额用尽是「今天不能再建了」，
      // 重试只会白耗尝试次数。混成一个错误会让人以为要改代码。
      if (/名称重复/.test(message)) throw apiError("DOUYIN_EXTRACT_TASK_EXISTS", message);
      if (/仅支持创建|条任务/.test(message)) throw apiError("DOUYIN_EXTRACT_QUOTA_EXHAUSTED", message);
      throw apiError("DOUYIN_EXTRACT_API_REJECTED", `${path} 被拒绝（StatusCode=${statusCode}）：${message}`);
    }
    return result.json;
  }

  return Object.freeze({
    async createTask({ resourceType, from, to }) {
      const plan = buildExtractPlan({ resourceType, from, to });
      // 先问平台「这些还给不给」。一次 GET 换来的是：平台改了会当场说清改了什么，
      // 而不是排完二十分钟队、下回一个少列的文件，再由解析器报个离原因很远的错。
      assertConfigSupportsPlan(parseExtractConfig(await request(configQuery(plan))), plan);
      try {
        await request(SUBMIT_PATH, { method: "POST", body: buildSubmitPayload(plan) });
        return plan;
      } catch (error) {
        const recoverable = error.code === "DOUYIN_EXTRACT_TASK_EXISTS"
          || error.code === "DOUYIN_EXTRACT_QUOTA_EXHAUSTED";
        if (!recoverable) throw error;

        // 任务名是确定性的（维度+区间+视频类型），所以同名任务只可能是我们自己为同一个
        // 请求建的。先去看它在不在——在就接着等，不新建：每天只有 5 条配额。
        //
        // 配额用尽也要看：平台先查配额再查重名，采集器崩溃重启后重跑，收到的是「配额用尽」，
        // 而它之前建的那条其实正在队列里排着。直接放弃就白等一天。
        const existing = await this.findTask(plan.taskName);
        if (existing.state !== "missing") return plan;
        throw error;
      }
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

      // 下完必须把标签页带回自助取数页。把标签页导航到文件地址后，它停在一个没有文档
      // 的状态上，下一次 evaluate 会直接超时——一次只下一个文件时看不出来，
      // 连着下第二个就断在「Runtime.evaluate 超时」，而那句话跟真正的原因毫无关系。
      await controller.open(SELF_SERVICE_URL);
      return found;
    }
  });
}

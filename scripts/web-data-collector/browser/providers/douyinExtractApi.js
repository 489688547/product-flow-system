// 自助取数的接口客户端。判定逻辑全在 src/domain/douyinExtractApi.js，这里只负责发请求。
//
// 请求一律在页面上下文里用 fetch 发出：登录态、CSRF、Origin、签名头都由浏览器按它
// 自己的规则带上，采集器既不读也不存任何凭据。这也是它比页面驱动稳的原因——
// 不依赖坐标、不依赖 class 名、不受页面缩放影响。

import {
  PREVIEW_PATH,
  SUBMIT_PATH,
  TASK_LIST_PATH,
  assertConfigSupportsPlan,
  assertPreviewCovers,
  buildSubmitPayload,
  configQuery,
  parseExtractConfig,
  parsePreviewColumns,
  parseTaskList,
  selectMetrics,
  selectApiTask
} from "../../../../src/domain/douyinExtractApi.js";
import { PREVIEW_REQUIRED_COLUMNS } from "../../../../src/domain/douyinExtractRows.js";
import {
  buildExtractPlan,
  buildTaskName,
  fingerprintSelection
} from "../../../../src/domain/douyinSelfServiceExtract.js";
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

      // 建任务前两道免费的核对。每天只有 5 条配额，被拒的提交也算一条，
      // 所以宁可多两次请求，也不要白建一条任务。
      //
      // 一、配置接口：粒度还在不在（指标全选，不必逐个核对）。
      const config = parseExtractConfig(await request(configQuery(plan)));
      assertConfigSupportsPlan(config, plan);
      const selection = selectMetrics(config, plan.dimension);

      // 名字要等指标选定后才能定：它必须编码这次到底要什么。平台按名称判重，
      // 名字不变就会把内容不同的旧任务当成同一个接着等——实测中过一次，
      // 提交的是全选，下回来的却是旧的 10 列窄表，而且不报错。
      plan.taskName = buildTaskName({
        resourceType,
        from: plan.from,
        to: plan.to,
        videoType: plan.videoType,
        fingerprint: fingerprintSelection({
          granularityValue: plan.granularityValue,
          videoType: plan.videoType,
          ...selection
        })
      });

      // 二、preview 接口：这次取数会生成哪些列。指标 key 还在不代表列名没变，
      // 而解析是按中文列名做的——列名一改，解析出来是一列静默的 null。
      // preview 不建任务、不耗配额。
      const payload = buildSubmitPayload(plan, selection);
      const preview = await request(PREVIEW_PATH, { method: "POST", body: payload });
      assertPreviewCovers(parsePreviewColumns(preview), plan.dimension, PREVIEW_REQUIRED_COLUMNS[plan.dimension] || []);

      // 返回 created 让调用方分得清「刚建的」和「本来就在」。
      // 两者混成一个结果，日志里就都是「提交成功」——实测因此误判过一次：
      // 以为选定的指标集提交上去了，其实撞上同名旧任务被静默复用，
      // 后面拿到的是旧内容的文件。
      try {
        await request(SUBMIT_PATH, { method: "POST", body: payload });
        return { ...plan, created: true };
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
        if (existing.state !== "missing") return { ...plan, created: false, reusedReason: error.code };
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

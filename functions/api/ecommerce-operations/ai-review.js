import { jsonResponse, optionsResponse } from "../dingtalk/_shared/dingtalk.js";
import { validateStorePlan } from "../../../src/domain/ecommerceOperations.js";
import { canViewOperations } from "./_shared/access.js";

function fallbackReview(plan) {
  const missing = validateStorePlan(plan);
  const suggestions = [];
  if (missing.length) suggestions.push(`先补全：${missing.join("、")}`);
  if ((plan.issues || []).length > 3) suggestions.push("核心问题建议收敛到 1–3 个，优先解决对目标影响最大的障碍。");
  if ((plan.monitors || []).length < (plan.countermeasures || []).length) suggestions.push("每项对策至少配置一个可按日或按周检查的领先指标。");
  if (!suggestions.length) suggestions.push("结构完整；下一步请补充每项对策的负责人、截止日和失败止损线。", "复盘时同时记录结果、原因和下一轮调整，不只记录完成状态。");
  return { mode: "rule_fallback", summary: missing.length ? "方案结构尚未完整，暂不建议提交主管审批。" : "方案逻辑已闭环，可结合数据基线进一步量化。", suggestions };
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);
  if (!data.session) return jsonResponse({ message: "请先使用钉钉登录。" }, 401);
  if (!canViewOperations(data.session)) return jsonResponse({ message: "无权使用经营点评。" }, 403);
  const body = await request.json().catch(() => ({})); const plan = body.plan;
  if (!plan || typeof plan !== "object") return jsonResponse({ message: "缺少打品方案。" }, 400);
  const safePlan = Object.fromEntries(["product", "platform", "store", "evidence", "goals", "issues", "countermeasures", "monitors"].map(key => [key, plan[key]]));
  if (!env.OPENAI_API_KEY) return jsonResponse(fallbackReview(safePlan));
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: env.OPENAI_MODEL || "gpt-5-mini", store: false, input: [{ role: "system", content: "你是电商运营方案教练。只提供优化建议，不替代主管决策。用中文输出一段总结，再列出3条可执行建议。" }, { role: "user", content: JSON.stringify(safePlan) }] }),
      signal: AbortSignal.timeout(20000)
    });
    const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message || "AI provider failed");
    const output = String(payload.output_text || payload.output?.flatMap(item => item.content || []).find(item => item.type === "output_text")?.text || "").trim();
    if (!output) throw new Error("AI returned no content");
    return jsonResponse({ mode: "ai", summary: output, suggestions: [] });
  } catch { return jsonResponse(fallbackReview(plan)); }
}

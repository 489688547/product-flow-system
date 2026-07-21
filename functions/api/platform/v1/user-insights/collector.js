import { assertExecutive, requireInsightActor } from "./_shared/access.js";
import { errorResponse, jsonResponse, methodNotAllowed, optionsResponse, readJson, requireD1 } from "./_shared/http.js";
import { authenticateRunner, listInsightRecords, registerRunner, runnerAllows } from "./_shared/storage.js";

async function handleGet(context) {
  const db = requireD1(context.env);
  const runner = await authenticateRunner(db, context.request);
  const mappings = await listInsightRecords(db, "categoryMappings");
  const tasks = mappings
    .filter(mapping => mapping.status === "confirmed" && runnerAllows(runner, mapping))
    .map(mapping => ({
      id: mapping.id,
      platform: mapping.platform,
      shopId: mapping.shopId || "",
      productId: mapping.productId || "",
      skuId: mapping.skuId || "",
      categoryId: mapping.categoryId,
      categoryName: mapping.categoryName || "",
      categoryPath: mapping.categoryPath || "",
      pageUrl: mapping.pageUrl || "",
      dimensions: Array.isArray(mapping.dimensions) && mapping.dimensions.length ? mapping.dimensions : ["audience", "product", "video", "live"],
      schemaVersion: mapping.schemaVersion || "v1",
      collectorConfig: mapping.collectorConfig || {}
    }));
  return jsonResponse({ synced: true, runner: { id: runner.id, name: runner.name }, tasks });
}

async function handlePost(context) {
  const actor = requireInsightActor(context.data);
  assertExecutive(actor);
  const db = requireD1(context.env);
  const body = await readJson(context.request);
  const registration = await registerRunner(db, body, actor);
  return jsonResponse({ synced: true, ...registration, tokenNotice: "令牌只显示一次，请保存到公司 Mac 的安全配置。" }, 201);
}

export async function onRequest(context) {
  try {
    if (context.request.method === "OPTIONS") return optionsResponse("GET, POST, OPTIONS");
    if (context.request.method === "GET") return await handleGet(context);
    if (context.request.method === "POST") return await handlePost(context);
    return methodNotAllowed();
  } catch (error) { return errorResponse(error); }
}

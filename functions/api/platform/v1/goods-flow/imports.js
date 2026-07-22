import { projectLegacyGoodsFlow } from "./_shared/legacyProjection.js";
import { readJson, requireIdempotencyKey, successResponse } from "./_shared/http.js";
import { runGoodsFlowRoute } from "./_shared/route.js";
import {
  appendGoodsFlowEvents,
  saveGoodsFlowExceptions,
  saveInventoryDaily
} from "./_shared/storage.js";
import { readProductCatalog } from "../product-catalog/_shared/storage.js";

export async function onRequest(context) {
  return runGoodsFlowRoute(context, {
    action: "import",
    methods: ["POST"],
    handler: async ({ request, db, actor, requestId }) => {
      const batchId = requireIdempotencyKey(request);
      const body = await readJson(request);
      const catalog = await readProductCatalog(db);
      const projection = projectLegacyGoodsFlow({ ...body, catalogItems: catalog.items });
      const now = new Date().toISOString();
      await appendGoodsFlowEvents(db, projection.events.map(row => ({ ...row, createdBy: actor.actor })));
      await saveInventoryDaily(db, projection.inventoryDaily, now);
      await saveGoodsFlowExceptions(db, projection.exceptions);
      const data = {
        batchId,
        asOf: projection.asOf,
        success: { events: projection.events.length, inventoryDaily: projection.inventoryDaily.length },
        failed: projection.exceptions.length,
        exceptions: projection.exceptions.map(row => ({ id: row.id, code: row.code, message: row.message }))
      };
      return successResponse(data, { id: requestId, status: projection.exceptions.length ? 207 : 201, version: 1 });
    }
  });
}

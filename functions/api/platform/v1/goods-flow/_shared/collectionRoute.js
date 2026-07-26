import { hideGoodsFlowAmounts } from "./authorization.js";
import { jsonResponse } from "./http.js";
import { runGoodsFlowRoute } from "./route.js";
import { readGoodsFlowFactCollection } from "./factCollections.js";

function safeOffset(value) {
  const number = value ? Number(value) : 0;
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function goodsFlowCollectionRoute(resource) {
  return context => runGoodsFlowRoute(context, {
    handler: async ({ request, db, actor, requestId }) => {
      const url = new URL(request.url);
      const cursor = safeOffset(url.searchParams.get("cursor"));
      if (cursor === null) {
        throw Object.assign(new Error("货流集合游标无效。"), {
          code: "GOODS_FLOW_QUERY_INVALID",
          status: 400
        });
      }
      const source = await readGoodsFlowFactCollection(db, resource);
      const pageSize = 500;
      const filtered = source.items.filter(item => {
        for (const key of ["supplierId", "purchaseId", "productId", "status"]) {
          const expected = url.searchParams.get(key);
          if (expected && String(item[key] || "") !== expected) return false;
        }
        return true;
      });
      const items = filtered.slice(cursor, cursor + pageSize)
        .map(item => hideGoodsFlowAmounts(item, actor.canViewAmounts));
      return jsonResponse({
        synced: true,
        items,
        quality: source.quality,
        page: { nextCursor: cursor + items.length < filtered.length ? String(cursor + items.length) : null },
        meta: { requestId, resource, version: 1 }
      });
    }
  });
}

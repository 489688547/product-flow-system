import { normalizeRecognizedShops } from "../../../../../../src/domain/dataConnections.js";
import { DataConnectionHttpError } from "../../data-connections/_shared/http.js";

function randomId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now().toString(36)}`;
}

async function writeDouyinConnectionIdentity(db, task, input, timestamp) {
  const shops = normalizeRecognizedShops(input.shops);
  if (!shops.length) throw new DataConnectionHttpError(400, "BROWSER_AGENT_SHOPS_REQUIRED", "未识别到有效店铺。");
  for (const shop of shops) {
    await db.prepare(`INSERT INTO data_connection_shops
      (id, connection_id, platform_id, shop_id, shop_name, shop_avatar_url, status, last_verified_at, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'connected', ?7, ?7, ?7)
      ON CONFLICT(platform_id, shop_id) DO UPDATE SET connection_id = excluded.connection_id,
        shop_name = excluded.shop_name, shop_avatar_url = excluded.shop_avatar_url,
        status = 'connected', last_verified_at = excluded.last_verified_at, updated_at = excluded.updated_at`)
      .bind(randomId("shop"), task.connection_id, task.platform_id, shop.shopId, shop.shopName, shop.shopAvatarUrl || null, timestamp).run();
  }
  await db.prepare("UPDATE data_connections SET status = 'connected', last_verified_at = ?1, updated_at = ?1 WHERE id = ?2")
    .bind(timestamp, task.connection_id).run();
  return { recordCount: shops.length };
}

const WRITERS = new Map([
  ["douyin-ecommerce:connection_identity", writeDouyinConnectionIdentity]
]);

export async function writeAcquisitionResult(db, task, input, timestamp) {
  const writer = WRITERS.get(`${task.platform_id}:${task.resource_type}`);
  if (!writer) throw new DataConnectionHttpError(400, "BROWSER_AGENT_RESULT_WRITER_UNAVAILABLE", "该平台的数据写入器尚未登记。");
  return writer(db, task, input, timestamp);
}

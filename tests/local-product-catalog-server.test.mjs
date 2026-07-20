import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("local helper persists the shared product catalog and can read Kuaimai products", () => {
  assert.match(server, /LOCAL_PRODUCT_CATALOG_PATH/);
  assert.match(server, /normalizeCatalogPayload/);
  assert.match(server, /pullKuaimaiProductCatalog/);
  assert.match(server, /writeLocalProductCatalog/);
  assert.match(server, /\/api\/platform\/v1\/product-catalog\/sync\/kuaimai/);
  assert.match(server, /12 \* 1024 \* 1024/);
});

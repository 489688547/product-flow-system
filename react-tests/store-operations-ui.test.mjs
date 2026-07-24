import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panel = readFileSync(new URL("../src/features/data-center/StoreOperationsPanel.jsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../src/features/data-center/DataOverview.jsx", import.meta.url), "utf8");
const appPage = readFileSync(new URL("../src/features/data-center/DataCenterAppPage.jsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/state/useStoreOperations.js", import.meta.url), "utf8");

test("store operations panel covers permission, empty, loading and unavailable states", () => {
  assert.match(panel, /permissionDenied/);
  assert.match(panel, /无权查看店铺经营数据/);
  assert.match(panel, /尚无已登记的抖店店铺/);
  assert.match(panel, /等待抖店罗盘采集/);
  assert.match(panel, /is-spinning/);
});

test("store operations panel offers a store switcher and day-over-day change badges", () => {
  assert.match(panel, /select value=\{selectedStore/);
  assert.match(panel, /onSelectStore/);
  assert.match(panel, /切换店铺查看经营数据/);
  assert.match(panel, /ChangeBadge/);
  assert.match(panel, /环比上升/);
  assert.match(panel, /环比下降/);
  assert.match(panel, /个百分点/); // 比率指标同比用百分点
  assert.match(panel, /favorable \? "up" : "down"/);
  assert.match(panel, /重点商品 Top/);
  assert.match(panel, /直播 \/ 短视频/);
});

test("overview mounts the panel and the page wires the scoped store-operations hook", () => {
  assert.match(overview, /StoreOperationsPanel/);
  assert.match(overview, /storeOperations \? <StoreOperationsPanel/);
  assert.match(appPage, /useStoreOperations\(\{ enabled: section === "overview" \}\)/);
  assert.match(appPage, /storeOperations=\{storeOperations\}/);
});

test("hook degrades gracefully on 403 and discards stale store switches", () => {
  assert.match(hook, /status === 403/);
  assert.match(hook, /setPermissionDenied\(true\)/);
  assert.match(hook, /requestToken/);
  assert.match(hook, /token !== requestToken\.current/);
  assert.match(hook, /douyin-ecommerce/);
});

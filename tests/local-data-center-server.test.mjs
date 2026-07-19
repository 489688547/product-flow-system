import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("local helper persists data center metadata without pretending local sales are shared", () => {
  assert.match(server, /LOCAL_DATA_CENTER_STATE_PATH/);
  assert.match(server, /normalizeDataCenterState/);
  assert.match(server, /readLocalDataCenterState/);
  assert.match(server, /writeLocalDataCenterState/);
  assert.match(server, /url\.pathname === "\/api\/data-center"/);
  assert.match(server, /url\.pathname === "\/api\/data-center\/sales"/);
  assert.match(server, /json\(res, 200, \{ synced: true, state, version: state\.version/);
  assert.match(server, /本地测试模式没有 D1 数据库/);
});

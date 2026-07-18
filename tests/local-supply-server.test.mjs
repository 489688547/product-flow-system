import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("local helper persists supply state and exposes the same approval sync boundary", () => {
  assert.match(server, /LOCAL_SUPPLY_STATE_PATH/);
  assert.match(server, /normalizeSupplyChainState/);
  assert.match(server, /syncSupplyApprovals/);
  assert.match(server, /url\.pathname === "\/api\/supply-chain"/);
  assert.match(server, /url\.pathname === "\/api\/supply-chain\/approvals\/sync"/);
});

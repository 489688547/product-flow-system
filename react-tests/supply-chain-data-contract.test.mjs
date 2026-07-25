import test from "node:test";
import assert from "node:assert/strict";
import {
  loadSupplyChainInventory,
  loadSupplyChainSalesDaily,
  loadSupplyChainWorkspaceData
} from "../src/state/supplyChainDataApi.js";
import {
  executeSupplyChainWorkflowAction,
  loadSupplyChainWorkflowCollection
} from "../src/state/supplyChainApi.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("inventory client sends current snapshot filters to the shared goods-flow API", async () => {
  const calls = [];
  const payload = await loadSupplyChainInventory({
    mode: "current",
    asOf: "2026-07-24",
    skuId: "sku:1001",
    warehouseId: "warehouse:shanghai",
    cursor: "next page",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({
        data: [{ skuId: "sku:1001", warehouseId: "warehouse:shanghai", calibratedQuantity: 18 }],
        quality: { status: "trusted", latestSnapshotDate: "2026-07-24", coverage: 1 },
        page: { nextCursor: null }
      });
    }
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/platform/v1/goods-flow/inventory?mode=current&asOf=2026-07-24&skuId=sku%3A1001&warehouseId=warehouse%3Ashanghai&cursor=next+page");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(payload.items[0].calibratedQuantity, 18);
  assert.equal(payload.quality.status, "trusted");
});

test("daily sales client rejects a response that drifts from the company demand contract", async () => {
  await assert.rejects(
    loadSupplyChainSalesDaily({
      from: "2026-07-01",
      to: "2026-07-24",
      fetchImpl: async () => jsonResponse({
        contract: {
          timeBasis: "pay_time",
          timezone: "UTC",
          excludeOther: false,
          grain: ["date", "inventoryUnitId", "platform"]
        },
        items: []
      })
    }),
    error => error.code === "SUPPLY_CHAIN_CONTRACT_INVALID"
  );
});

test("daily sales client preserves atomic demand fields and missing promotion coverage", async () => {
  const payload = await loadSupplyChainSalesDaily({
    from: "2026-07-01",
    to: "2026-07-24",
    productId: "product:1",
    fetchImpl: async () => jsonResponse({
      contract: {
        timeBasis: "create_time",
        timezone: "Asia/Shanghai",
        excludeOther: true,
        grain: ["date", "inventoryUnitId", "platform"]
      },
      items: [{
        date: "2026-07-24",
        productId: "product:1",
        inventoryUnitId: "sku:1",
        platform: "抖音",
        grossQuantity: 12,
        returnQuantity: 2,
        netQuantity: 10,
        grossSales: 300,
        netSales: 260,
        promotionIds: null
      }],
      quality: {
        status: "partial",
        latestDate: "2026-07-24",
        coverage: 0.98,
        missing: ["promotionIds"]
      },
      page: { nextCursor: "cursor-2" }
    })
  });

  assert.deepEqual(payload.items[0], {
    date: "2026-07-24",
    productId: "product:1",
    inventoryUnitId: "sku:1",
    platform: "抖音",
    grossQuantity: 12,
    returnQuantity: 2,
    netQuantity: 10,
    grossSales: 300,
    netSales: 260,
    promotionIds: null
  });
  assert.equal(payload.quality.status, "partial");
  assert.deepEqual(payload.quality.missing, ["promotionIds"]);
  assert.equal(payload.page.nextCursor, "cursor-2");
});

test("workspace loader keeps trusted inventory when another shared contract is unavailable", async () => {
  const fetchImpl = async url => {
    if (url.startsWith("/api/platform/v1/goods-flow/inventory")) {
      return jsonResponse({
        data: [{ skuId: "sku:1", warehouseId: "warehouse:1", calibratedQuantity: 20 }],
        quality: { status: "trusted", latestSnapshotDate: "2026-07-24", coverage: 1 }
      });
    }
    if (url.startsWith("/api/platform/v1/data-services/sales/daily")) {
      return jsonResponse({
        error: { code: "DATA_STORAGE_UNAVAILABLE", retryable: true, requestId: "req-sales" }
      }, 503);
    }
    throw new Error(`unexpected URL ${url}`);
  };

  const payload = await loadSupplyChainWorkspaceData({
    workspace: "workbench",
    filters: { from: "2026-07-01", to: "2026-07-24" },
    fetchImpl
  });

  assert.equal(payload.data.inventory.items.length, 1);
  assert.equal(payload.data.sales, undefined);
  assert.equal(payload.quality.status, "partial");
  assert.deepEqual(payload.quality.missing, ["sales"]);
  assert.equal(payload.errors[0].code, "DATA_STORAGE_UNAVAILABLE");
  assert.equal(payload.errors[0].requestId, "req-sales");
});

test("workspace loader does not downgrade an expired company session into an empty workspace", async () => {
  await assert.rejects(
    loadSupplyChainWorkspaceData({
      workspace: "inventory",
      fetchImpl: async () => jsonResponse({
        error: { code: "AUTH_SESSION_REQUIRED", retryable: false }
      }, 401)
    }),
    error => error.code === "AUTH_SESSION_REQUIRED"
  );
});

test("workflow client reads versioned collections without inventing missing coverage", async () => {
  const payload = await loadSupplyChainWorkflowCollection({
    resource: "procurement-suggestions",
    filters: { status: "draft", cursor: "next page" },
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/platform/v1/supply-chain-workflows/procurement-suggestions?status=draft&cursor=next+page");
      assert.equal(options.credentials, "include");
      return jsonResponse({
        synced: true,
        items: [{ suggestionId: "suggestion:1", version: 2, status: "draft" }],
        nextCursor: "",
        coverage: { status: "partial", asOf: "2026-07-25", sourceVersions: ["inventory:v1"] }
      });
    }
  });

  assert.equal(payload.items[0].version, 2);
  assert.equal(payload.coverage.status, "partial");
  assert.deepEqual(payload.coverage.sourceVersions, ["inventory:v1"]);
});

test("workflow action requires idempotency version and keeps actor server-owned", async () => {
  const calls = [];
  await assert.rejects(
    executeSupplyChainWorkflowAction({
      resource: "procurement-suggestions",
      id: "suggestion:1",
      action: "confirm",
      expectedVersion: 2,
      idempotencyKey: "idem-1",
      fields: { actorId: "forged-user" },
      fetchImpl: async () => jsonResponse({})
    }),
    error => error.code === "SUPPLY_WORKFLOW_INPUT_INVALID"
  );

  const payload = await executeSupplyChainWorkflowAction({
    resource: "procurement-suggestions",
    id: "suggestion:1",
    action: "adjust",
    expectedVersion: 2,
    reason: "平台活动量增加",
    fields: { adjustedQuantity: 800 },
    idempotencyKey: "idem-2",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse({
        synced: true,
        entity: { suggestionId: "suggestion:1", version: 3, adjustedQuantity: 800 },
        event: { eventId: "event:1", action: "adjust", fromStatus: "draft", toStatus: "draft" },
        idempotentReplay: false
      });
    }
  });

  assert.equal(calls[0].url, "/api/platform/v1/supply-chain-workflows/procurement-suggestions/suggestion%3A1/actions");
  assert.equal(calls[0].options.headers["Idempotency-Key"], "idem-2");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    expectedVersion: 2,
    action: "adjust",
    reason: "平台活动量增加",
    fields: { adjustedQuantity: 800 }
  });
  assert.equal(payload.entity.version, 3);
});

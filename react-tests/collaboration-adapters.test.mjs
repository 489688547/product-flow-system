import test from "node:test";
import assert from "node:assert/strict";
import {
  collaborationDraftFromBrandIssue,
  collaborationDraftFromDataIssue,
  collaborationDraftFromProductTask,
  collaborationDraftFromSupplyIssue
} from "../src/domain/collaborationAdapters.js";

function assertSafeDraft(draft, appId, entityId) {
  assert.equal(draft.source.appId, appId);
  assert.equal(draft.source.entityId, entityId);
  assert.ok(draft.idempotencyKey.startsWith(`${appId}:`));
  assert.ok(draft.title);
  assert.ok(draft.requestedAction);
  assert.ok(draft.businessImpact);
  assert.ok(draft.ownerDepartment.name);
  assert.ok(draft.dueAt.endsWith("+08:00"));
  assert.doesNotMatch(JSON.stringify(draft), /password|cookie|token|mobile|phone|accountNumber|rawResponse/i);
}

test("product task adapter keeps product and stage evidence without copying the whole product", () => {
  const draft = collaborationDraftFromProductTask({ id: "p1", name: "鹦鹉谷物棒", stage: 4, password: "secret" }, { id: "t1", title: "确认包装到货", ownerDept: "供应链", due: "2026-07-25", required: true, rawResponse: "secret" });
  assertSafeDraft(draft, "product-flow", "p1");
  assert.equal(draft.source.sourceRecordId, "t1");
  assert.deepEqual(draft.evidence.map(item => item.label), ["产品阶段", "任务属性"]);
});

test("supply data and brand adapters produce governed issue drafts", () => {
  const supply = collaborationDraftFromSupplyIssue({ id: "q1", productId: "p1", content: "连续差评", category: "质量", supplierName: "某供应商", status: "open", accountNumber: "123" }, { productName: "鹦鹉谷物棒" });
  const data = collaborationDraftFromDataIssue({ id: "d1", title: "抖音订单同步过期", type: "stale", owner: "运营部", status: "open", token: "secret" });
  const brand = collaborationDraftFromBrandIssue({ id: "b1", title: "素材 ID 缺失", type: "missing_id", ownerRole: "operator", severity: "high", scope: "抖音官旗", action: "补齐映射", cookie: "secret" });
  assertSafeDraft(supply, "supply-chain", "q1");
  assertSafeDraft(data, "data-center", "d1");
  assertSafeDraft(brand, "brand-content", "b1");
  assert.equal(supply.kind, "risk");
  assert.equal(data.kind, "data_issue");
  assert.equal(brand.kind, "data_issue");
});

test("four real app pages expose the shared collaboration entry instead of calling the API directly", async () => {
  const fs = await import("node:fs");
  const paths = [
    "src/features/progress/ProductProgressPage.jsx",
    "src/features/supply-chain/QualityWorkspace.jsx",
    "src/features/data-center/DataGovernanceWorkspaces.jsx",
    "src/features/brand-content/BrandDataIssuesPage.jsx"
  ];
  for (const path of paths) {
    const source = fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.match(source, /AppCollaborationButton/);
    assert.doesNotMatch(source, /\/api\/platform\/v1\/collaboration-items/);
  }
});

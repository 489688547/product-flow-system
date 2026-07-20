import test from "node:test";
import assert from "node:assert/strict";

const registryUrl = new URL("../functions/api/platform/v1/ai/_shared/skill-registry.js", import.meta.url);
const domainUrl = new URL("../src/domain/aiAssistant.js", import.meta.url);

function aggregateDb(fixtures = {}) {
  return {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() { return { success: true }; },
        async all() { return { results: [] }; },
        async first() {
          if (/from ecommerce_operation_state/i.test(sql)) return fixtures.operations ? { revision: 1, payload: JSON.stringify(fixtures.operations) } : null;
          if (/from brand_content_state/i.test(sql)) return fixtures.brand ? { id: "company", version: 1, payload: JSON.stringify(fixtures.brand), updated_at: "2026-07-19T08:00:00Z", updated_by: "test" } : null;
          if (/from performance_management_state/i.test(sql)) return fixtures.performance ? { revision: 1, payload: JSON.stringify(fixtures.performance) } : null;
          return null;
        }
      };
      return statement;
    }
  };
}

test("AI data domains include the three deployed business Apps", async () => {
  const { AI_DATA_DOMAINS } = await import(domainUrl);
  for (const id of ["ecommerce_operations", "brand_content", "performance_management"]) {
    assert.ok(AI_DATA_DOMAINS.some(item => item.id === id), `${id} must be governed`);
  }
});

test("store operations Skill applies the existing employee projection", async () => {
  const { executeSkill } = await import(registryUrl);
  const db = aggregateDb({ operations: {
    schemaVersion: 1,
    revision: 1,
    updatedAt: "2026-07-19T08:00:00Z",
    cycles: [{ id: "mine", ownerId: "u-1", productName: "莓果粮", status: "active" }, { id: "hidden", ownerId: "u-2", productName: "隐藏商品", status: "active" }],
    plans: [], executions: [], collaborations: [], responsibilities: [], playbooks: [], aiReviews: [], auditLogs: [{ id: "private" }]
  } });
  const result = await executeSkill({
    db,
    session: { userId: "u-1", name: "运营一", department: "运营部", title: "运营" },
    access: { allowed: ["ecommerce_operations"] },
    skillId: "ecommerce_operations_query",
    argumentsText: "{}"
  });
  assert.deepEqual(result.records.cycles.map(item => item.id), ["mine"]);
  assert.equal(result.records.auditLogs, undefined);
  assert.doesNotMatch(JSON.stringify(result.records), /隐藏商品/);
});

test("brand and performance Skills expose non-financial read projections only", async () => {
  const { executeSkill } = await import(registryUrl);
  const db = aggregateDb({
    brand: {
      contents: [{ id: "c-1", title: "开袋反应", productName: "莓果粮", productionStatus: "published", directorName: "编导", updatedAt: "2026-07-19" }],
      assetVersions: [{ id: "a-1", contentId: "c-1", nasRelativePath: "private/path.mp4", reviewStatus: "approved" }],
      publications: [{ id: "p-1", contentId: "c-1", platform: "douyin", publishedAt: "2026-07-18" }],
      performanceSnapshots: [{ id: "s-1", contentId: "c-1", spend: 99, gmv: 999, roi: 10, contentViews: 1000, completionRate: 0.4 }],
      decisions: [], accounts: [], auditLogs: [], settings: {}
    },
    performance: {
      schemaVersion: 1,
      revision: 1,
      updatedAt: "2026-07-19T08:00:00Z",
      templates: [], managerAssignments: [], reviewRequests: [], auditLogs: [],
      assessments: [{ id: "pa-1", employeeId: "u-1", employeeName: "员工一", status: "self_review", finalScore: 95, bonus: 2000, evidenceRefs: [{ sourceAppId: "ecommerce-operations", entityId: "x" }] }]
    }
  });
  const brand = await executeSkill({ db, session: { department: "品牌部" }, access: { allowed: ["brand_content"] }, skillId: "brand_content_query", argumentsText: "{}" });
  assert.match(JSON.stringify(brand.records), /contentViews/);
  assert.doesNotMatch(JSON.stringify(brand.records), /private\/path|spend|gmv|roi/i);

  const performance = await executeSkill({ db, session: { userId: "u-1", department: "运营部", title: "运营" }, access: { allowed: ["performance_management"] }, skillId: "performance_management_query", argumentsText: "{}" });
  assert.equal(performance.records.assessments[0].id, "pa-1");
  assert.doesNotMatch(JSON.stringify(performance.records), /finalScore|bonus|salary|奖金|薪资/i);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  collectorTemplateContentHash,
  collectorRunTrustLevel,
  createCollectorTemplateVersion,
  normalizeCollectorTemplate,
  verifyCollectorExecutionBundle
} from "../src/domain/collectorTemplates.js";

const allowedOrigins = ["https://erp.superboss.cc"];

function templateInput(overrides = {}) {
  return {
    templateId: "kuaimai-inventory-research",
    version: 2,
    mode: "experimental",
    providerId: "kuaimai",
    profileId: "kuaimai-main",
    timeoutSeconds: 600,
    limits: {
      maxOutputBytes: 1_048_576,
      maxChildProcesses: 4,
      maxLoopIterations: 1000,
      maxFiles: 20
    },
    status: "draft",
    steps: [
      {
        id: "open",
        type: "browser.open",
        url: "https://erp.superboss.cc/index.html#/stock/warehouse_status/"
      },
      {
        id: "inspect",
        type: "browser.javascript",
        code: "return { ready: true };",
        timeoutSeconds: 20
      },
      {
        id: "parse",
        type: "local.python",
        script: "parse_inventory.py",
        args: ["${download.path}"],
        timeoutSeconds: 120
      }
    ],
    ...overrides
  };
}

test("template normalization rejects unknown fields, unsafe origins and sensitive material", () => {
  const normalized = normalizeCollectorTemplate(templateInput(), { allowedOrigins });
  assert.equal(normalized.templateId, "kuaimai-inventory-research");
  assert.equal(normalized.steps.length, 3);
  assert.equal(normalized.steps[2].script, "parse_inventory.py");

  assert.throws(
    () => normalizeCollectorTemplate(templateInput({ cookie: "secret" }), { allowedOrigins }),
    error => error?.code === "COLLECTOR_TEMPLATE_FIELD_NOT_ALLOWED"
  );
  assert.throws(
    () => normalizeCollectorTemplate(templateInput({
      steps: [{ id: "open", type: "browser.open", url: "https://evil.example/report" }]
    }), { allowedOrigins }),
    error => error?.code === "COLLECTOR_TEMPLATE_ORIGIN_NOT_ALLOWED"
  );
  assert.throws(
    () => normalizeCollectorTemplate(templateInput({
      steps: [{ id: "steal", type: "browser.javascript", code: "return document.cookie;" }]
    }), { allowedOrigins }),
    error => error?.code === "COLLECTOR_TEMPLATE_SENSITIVE_ACCESS"
  );
});

test("formal templates reject free JavaScript, Python and command steps", () => {
  for (const step of [
    { id: "javascript", type: "browser.javascript", code: "return 1;" },
    { id: "python", type: "local.python", script: "parse.py", args: [] },
    { id: "command", type: "local.command", command: ["file", "report.xlsx"] }
  ]) {
    assert.throws(
      () => normalizeCollectorTemplate(templateInput({
        mode: "formal",
        steps: [
          {
            id: "open",
            type: "browser.open",
            url: "https://erp.superboss.cc/index.html#/stock/warehouse_status/"
          },
          step
        ]
      }), { allowedOrigins }),
      error => error?.code === "COLLECTOR_TEMPLATE_STEP_NOT_REGISTERED"
    );
  }
});

test("condition and loop steps normalize nested steps within the template limit", () => {
  const normalized = normalizeCollectorTemplate(templateInput({
    steps: [
      {
        id: "choose-parser",
        type: "flow.condition",
        when: { variable: "reportType", operator: "equals", value: "inventory" },
        then: [
          {
            id: "set-parser",
            type: "flow.setVariable",
            name: "parser",
            value: "inventory"
          }
        ],
        else: []
      },
      {
        id: "parse-files",
        type: "flow.loop",
        items: "${downloads}",
        itemVariable: "download",
        maxIterations: 20,
        steps: [
          {
            id: "parse-file",
            type: "local.python",
            script: "parse_inventory.py",
            args: ["${download.path}"]
          }
        ]
      }
    ]
  }), { allowedOrigins });

  assert.equal(normalized.steps[0].then[0].name, "parser");
  assert.deepEqual(normalized.steps[0].else, []);
  assert.equal(normalized.steps[1].steps[0].script, "parse_inventory.py");
});

test("template content hash is stable across key order and changes with executable content", async () => {
  const first = normalizeCollectorTemplate(templateInput(), { allowedOrigins });
  const reordered = normalizeCollectorTemplate({
    steps: templateInput().steps,
    status: "draft",
    limits: {
      maxFiles: 20,
      maxLoopIterations: 1000,
      maxChildProcesses: 4,
      maxOutputBytes: 1_048_576
    },
    timeoutSeconds: 600,
    profileId: "kuaimai-main",
    providerId: "kuaimai",
    mode: "experimental",
    version: 2,
    templateId: "kuaimai-inventory-research"
  }, { allowedOrigins });
  const changed = normalizeCollectorTemplate(templateInput({
    steps: [
      ...templateInput().steps.slice(0, 2),
      {
        id: "parse",
        type: "local.python",
        script: "parse_inventory_v2.py",
        args: ["${download.path}"],
        timeoutSeconds: 120
      }
    ]
  }), { allowedOrigins });

  assert.equal(await collectorTemplateContentHash(first), await collectorTemplateContentHash(reordered));
  assert.notEqual(await collectorTemplateContentHash(first), await collectorTemplateContentHash(changed));
});

test("editing creates a new immutable draft version and enforces the editor role", () => {
  const current = normalizeCollectorTemplate(templateInput({ status: "published" }), { allowedOrigins });
  const next = createCollectorTemplateVersion(current, {
    timeoutSeconds: 900
  }, {
    actor: { role: "data_admin", userId: "user-1" },
    allowedOrigins
  });

  assert.equal(current.version, 2);
  assert.equal(current.timeoutSeconds, 600);
  assert.equal(current.status, "published");
  assert.equal(next.version, 3);
  assert.equal(next.timeoutSeconds, 900);
  assert.equal(next.status, "draft");
  assert.throws(
    () => createCollectorTemplateVersion(current, {}, {
      actor: { role: "operator", userId: "user-2" },
      allowedOrigins
    }),
    error => error?.code === "COLLECTOR_TEMPLATE_ACTION_DENIED"
  );
});

test("execution bundles fail closed for expiry, runner mismatch and template tampering", async () => {
  const template = normalizeCollectorTemplate(templateInput(), { allowedOrigins });
  const contentHash = await collectorTemplateContentHash(template);
  const bundle = {
    runId: "run-20260730-1",
    runnerId: "runner-company-mac",
    templateId: template.templateId,
    version: template.version,
    contentHash,
    expiresAt: "2026-07-30T10:15:00.000Z",
    template
  };

  const verified = await verifyCollectorExecutionBundle(bundle, {
    runnerId: "runner-company-mac",
    now: new Date("2026-07-30T10:00:00.000Z"),
    allowedOrigins
  });
  assert.equal(verified.runId, "run-20260730-1");
  assert.equal(verified.contentHash, contentHash);

  await assert.rejects(
    verifyCollectorExecutionBundle(bundle, {
      runnerId: "runner-other",
      now: new Date("2026-07-30T10:00:00.000Z"),
      allowedOrigins
    }),
    error => error?.code === "COLLECTOR_TEMPLATE_ACTION_DENIED"
  );
  await assert.rejects(
    verifyCollectorExecutionBundle(bundle, {
      runnerId: "runner-company-mac",
      now: new Date("2026-07-30T10:16:00.000Z"),
      allowedOrigins
    }),
    error => error?.code === "COLLECTOR_EXECUTION_BUNDLE_EXPIRED"
  );
  await assert.rejects(
    verifyCollectorExecutionBundle({
      ...bundle,
      template: { ...template, timeoutSeconds: 601 }
    }, {
      runnerId: "runner-company-mac",
      now: new Date("2026-07-30T10:00:00.000Z"),
      allowedOrigins
    }),
    error => error?.code === "COLLECTOR_TEMPLATE_HASH_MISMATCH"
  );
});

test("experimental runs can be validated but only published formal runs can become trusted", () => {
  const completeQuality = {
    requiredFieldsComplete: true,
    storeMatched: true,
    businessDateMatched: true,
    schemaMatched: true,
    coverage: 1
  };
  assert.equal(collectorRunTrustLevel({
    template: templateInput(),
    quality: completeQuality,
    ingestCompleted: true
  }), "validated");
  assert.equal(collectorRunTrustLevel({
    template: templateInput({ mode: "formal", status: "published" }),
    quality: completeQuality,
    ingestCompleted: true
  }), "trusted");
  assert.equal(collectorRunTrustLevel({
    template: templateInput({ mode: "formal", status: "published" }),
    quality: { ...completeQuality, coverage: 0.7 },
    ingestCompleted: true
  }), "untrusted");
});

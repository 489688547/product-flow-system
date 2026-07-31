import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  collectorTemplateContentHash,
  normalizeCollectorTemplate
} from "../src/domain/collectorTemplates.js";
import { executeExperimentalRun } from "../scripts/web-data-collector/experimental/executor.mjs";
import { createExperimentalRunStore } from "../scripts/web-data-collector/experimental/store.mjs";

test("experimental SQLite persists untrusted and validated runs across restart", () => {
  const rootDir = mkdtemp(join(tmpdir(), "collector-experimental-store-"));
  return rootDir.then(directory => {
    const databasePath = join(directory, "runs.sqlite");
    const store = createExperimentalRunStore({
      databasePath,
      now: () => new Date("2026-07-30T10:00:00.000Z")
    });
    store.saveRun({
      runId: "run-1",
      templateId: "kuaimai-inventory",
      templateVersion: 3,
      contentHash: "a".repeat(64),
      status: "completed",
      trustLevel: "untrusted",
      outputs: { parse: { rowCount: 12 } },
      quality: null
    });
    assert.equal(store.getRun("run-1").trustLevel, "untrusted");
    store.markValidated("run-1", {
      requiredFieldsComplete: true,
      storeMatched: true,
      businessDateMatched: true,
      schemaMatched: true,
      coverage: 1
    });
    store.close();

    const reopened = createExperimentalRunStore({ databasePath });
    const saved = reopened.getRun("run-1");
    assert.equal(saved.trustLevel, "validated");
    assert.deepEqual(saved.outputs, { parse: { rowCount: 12 } });
    assert.equal(saved.quality.coverage, 1);
    reopened.close();
  });
});

test("experimental SQLite rejects trusted or sensitive results", async () => {
  const directory = await mkdtemp(join(tmpdir(), "collector-experimental-store-"));
  const store = createExperimentalRunStore({ databasePath: join(directory, "runs.sqlite") });

  assert.throws(
    () => store.saveRun({
      runId: "run-trusted",
      templateId: "kuaimai-inventory",
      templateVersion: 1,
      contentHash: "a".repeat(64),
      status: "completed",
      trustLevel: "trusted",
      outputs: {}
    }),
    error => error?.code === "COLLECTOR_RESULT_UNTRUSTED"
  );
  assert.throws(
    () => store.saveRun({
      runId: "run-sensitive",
      templateId: "kuaimai-inventory",
      templateVersion: 1,
      contentHash: "a".repeat(64),
      status: "completed",
      trustLevel: "untrusted",
      outputs: { browser: { accessToken: "secret" } }
    }),
    error => error?.code === "COLLECTOR_RESULT_SENSITIVE"
  );
  store.close();
});

test("experimental executor persists a completed run locally as untrusted", async () => {
  const directory = await mkdtemp(join(tmpdir(), "collector-experimental-store-"));
  const workspace = await mkdtemp(join(tmpdir(), "collector-experimental-workspace-"));
  const store = createExperimentalRunStore({ databasePath: join(directory, "runs.sqlite") });
  const template = normalizeCollectorTemplate({
    templateId: "persist-contract",
    version: 1,
    mode: "experimental",
    providerId: "kuaimai",
    profileId: "kuaimai-main",
    timeoutSeconds: 10,
    limits: {
      maxOutputBytes: 16_384,
      maxChildProcesses: 2,
      maxLoopIterations: 10,
      maxFiles: 10
    },
    status: "draft",
    steps: [
      {
        id: "seed",
        type: "flow.setVariable",
        name: "result",
        value: 12
      }
    ]
  }, { allowedOrigins: ["https://erp.superboss.cc"] });
  const contentHash = await collectorTemplateContentHash(template);

  await executeExperimentalRun({
    bundle: {
      runId: "run-persist-1",
      runnerId: "runner-company-mac",
      templateId: template.templateId,
      version: template.version,
      contentHash,
      template
    },
    workspace,
    browser: {},
    runStore: store
  });

  const saved = store.getRun("run-persist-1");
  assert.equal(saved.status, "completed");
  assert.equal(saved.trustLevel, "untrusted");
  assert.equal(saved.outputs.seed, 12);
  store.close();
});

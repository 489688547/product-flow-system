import assert from "node:assert/strict";
import test from "node:test";

import {
  collectorTemplateContentHash,
  normalizeCollectorTemplate,
  signCollectorExecutionBundle
} from "../src/domain/collectorTemplates.js";
import { createWebCollectionApi } from "../scripts/web-data-collector/api.mjs";

const runnerToken = `wdc_${"a".repeat(48)}`;
const allowedOrigins = ["https://erp.superboss.cc"];

async function sha256(value) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value))
  );
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function executionBundle() {
  const template = normalizeCollectorTemplate({
    templateId: "kuaimai-research",
    version: 1,
    mode: "experimental",
    providerId: "kuaimai",
    profileId: "kuaimai-main",
    timeoutSeconds: 60,
    limits: {
      maxOutputBytes: 1024,
      maxChildProcesses: 1,
      maxLoopIterations: 2,
      maxFiles: 1
    },
    steps: [{
      id: "open",
      type: "browser.open",
      url: "https://erp.superboss.cc/index.html#/stock/warehouse_status/"
    }],
    status: "draft"
  }, { allowedOrigins });
  const bundle = {
    runId: "run-1",
    runnerId: "runner-1",
    templateId: template.templateId,
    version: template.version,
    contentHash: await collectorTemplateContentHash(template),
    expiresAt: "2030-07-30T10:15:00.000Z",
    targetEnvironment: "production",
    targetEnvironmentVersion: 1,
    template
  };
  return {
    ...bundle,
    signature: await signCollectorExecutionBundle(bundle, {
      verificationKey: await sha256(runnerToken)
    })
  };
}

function fetchResult(bundle) {
  return async () => new Response(JSON.stringify({
    data: {
      runs: [{
        run: { id: "run-1", version: 1, status: "queued" },
        executionBundle: bundle
      }]
    }
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

test("runner API verifies the signed execution bundle before returning work", async () => {
  const bundle = await executionBundle();
  const api = createWebCollectionApi({
    baseUrl: "https://flow.example.com",
    token: runnerToken,
    fetchImpl: fetchResult(bundle)
  });

  const assigned = await api.assignedExperimentalRuns();

  assert.equal(assigned.runs.length, 1);
  assert.equal(assigned.runs[0].executionBundle.signature, bundle.signature);
  assert.equal(assigned.runs[0].executionBundle.targetEnvironment, "production");
});

test("runner API rejects a signed bundle whose target environment was changed", async () => {
  const bundle = await executionBundle();
  const api = createWebCollectionApi({
    baseUrl: "https://flow.example.com",
    token: runnerToken,
    fetchImpl: fetchResult({ ...bundle, targetEnvironmentVersion: 2 })
  });

  await assert.rejects(
    api.assignedExperimentalRuns(),
    error => error?.code === "COLLECTOR_EXECUTION_SIGNATURE_INVALID"
  );
});

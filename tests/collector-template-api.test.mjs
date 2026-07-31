import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { onRequest as onTemplates } from "../functions/api/platform/v1/web-collection/templates.js";
import { onRequest as onTemplate } from "../functions/api/platform/v1/web-collection/templates/[id].js";
import { onRequest as onTemplateVersions } from "../functions/api/platform/v1/web-collection/templates/[id]/versions.js";
import { onRequest as onTemplatePublish } from "../functions/api/platform/v1/web-collection/templates/[id]/publish.js";
import { onRequest as onRuns } from "../functions/api/platform/v1/web-collection/runs.js";
import { onRequest as onRun } from "../functions/api/platform/v1/web-collection/runs/[id].js";
import { onRequest as onRunActions } from "../functions/api/platform/v1/web-collection/runs/[id]/actions.js";
import { registerWebCollectionRunner } from "../functions/api/platform/v1/web-collection/_shared/storage.js";
import { createSqliteD1 } from "./helpers/sqlite-d1.mjs";

const migration = readFileSync(new URL("../migrations/0018_collector_templates.sql", import.meta.url), "utf8");
const baseSchema = readFileSync(new URL("../migrations/0009_web_collection.sql", import.meta.url), "utf8");
const executive = { userId: "exec-1", name: "负责人", role: "executive", department: "总经办" };
const dataAdmin = { userId: "data-1", name: "数据管理员", role: "data_admin", department: "数据中心" };
const operator = { userId: "ops-1", name: "运营", role: "operations", department: "运营部" };

function database() {
  return createSqliteD1({ schema: `${baseSchema}\n${migration}` });
}

function template(overrides = {}) {
  return {
    templateId: "kuaimai-inventory-research",
    version: 1,
    mode: "experimental",
    providerId: "kuaimai",
    profileId: "kuaimai-main",
    timeoutSeconds: 600,
    limits: {
      maxOutputBytes: 1_048_576,
      maxChildProcesses: 2,
      maxLoopIterations: 20,
      maxFiles: 10
    },
    steps: [{
      id: "open",
      type: "browser.open",
      url: "https://erp.superboss.cc/index.html#/stock/warehouse_status/"
    }, {
      id: "inspect",
      type: "browser.javascript",
      code: "return { ready: true };"
    }],
    status: "draft",
    ...overrides
  };
}

function formalTemplate(overrides = {}) {
  return template({
    mode: "formal",
    steps: [{
      id: "open",
      type: "browser.open",
      url: "https://erp.superboss.cc/index.html#/stock/warehouse_status/"
    }, {
      id: "download",
      type: "browser.download",
      selectors: ["button[data-action='export']"],
      filePattern: "*.xlsx"
    }],
    ...overrides
  });
}

async function call(handler, path, {
  method = "GET",
  db,
  session = executive,
  token,
  key,
  experimental = true,
  params = {},
  body
} = {}) {
  const request = new Request(`https://flow.example.com${path}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(key ? { "idempotency-key": key } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const response = await handler({
    request,
    env: db ? {
      PRODUCT_FLOW_DB: db,
      ...(experimental ? { COLLECTOR_EXPERIMENTAL_MODE: "1" } : {})
    } : {},
    data: session ? { session } : {},
    params
  });
  return { response, body: await response.json() };
}

test("template routes require a company session and restrict writes to data admins", async () => {
  const db = database();
  const anonymous = await call(onTemplates, "/api/platform/v1/web-collection/templates", {
    db,
    session: null
  });
  const denied = await call(onTemplates, "/api/platform/v1/web-collection/templates", {
    method: "POST",
    db,
    session: operator,
    key: "template-create-1",
    body: { template: template() }
  });

  assert.equal(anonymous.response.status, 401);
  assert.equal(anonymous.body.error.code, "AUTH_SESSION_REQUIRED");
  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.error.code, "COLLECTOR_TEMPLATE_ACTION_DENIED");
  db.close();
});

test("experimental run creation is disabled unless the server switch is explicit", async () => {
  const db = database();
  const runner = await registerWebCollectionRunner(db, { name: "公司 Mac" }, executive);
  await call(onTemplates, "/api/platform/v1/web-collection/templates", {
    method: "POST",
    db,
    session: dataAdmin,
    key: "template-create-1",
    body: { template: template() }
  });
  const disabled = await call(onRuns, "/api/platform/v1/web-collection/runs", {
    method: "POST",
    db,
    experimental: false,
    key: "run-create-disabled",
    body: {
      templateId: "kuaimai-inventory-research",
      templateVersion: 1,
      runnerId: runner.id
    }
  });

  assert.equal(disabled.response.status, 503);
  assert.equal(disabled.body.error.code, "COLLECTOR_EXPERIMENT_DISABLED");
  db.close();
});

test("template creation is idempotent and never accepts unregistered origins", async () => {
  const db = database();
  const created = await call(onTemplates, "/api/platform/v1/web-collection/templates", {
    method: "POST",
    db,
    session: dataAdmin,
    key: "template-create-1",
    body: { template: template() }
  });
  const replay = await call(onTemplates, "/api/platform/v1/web-collection/templates", {
    method: "POST",
    db,
    session: dataAdmin,
    key: "template-create-1",
    body: { template: template() }
  });
  const unsafe = await call(onTemplates, "/api/platform/v1/web-collection/templates", {
    method: "POST",
    db,
    session: dataAdmin,
    key: "template-create-2",
    body: {
      template: template({
        templateId: "unsafe",
        steps: [{ id: "open", type: "browser.open", url: "https://evil.example/" }]
      })
    }
  });
  const conflictingReplay = await call(onTemplates, "/api/platform/v1/web-collection/templates", {
    method: "POST",
    db,
    session: dataAdmin,
    key: "template-create-1",
    body: { template: template({ timeoutSeconds: 901 }) }
  });

  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.template.currentVersion, 1);
  assert.equal(created.body.data.version.contentHash.length, 64);
  assert.equal(replay.response.status, 200);
  assert.equal(replay.body.data.idempotentReplay, true);
  const detail = await call(
    onTemplate,
    "/api/platform/v1/web-collection/templates/kuaimai-inventory-research",
    {
      db,
      session: operator,
      params: { id: "kuaimai-inventory-research" }
    }
  );
  assert.equal(detail.response.status, 200);
  assert.equal(detail.body.data.template.templateId, "kuaimai-inventory-research");
  assert.equal(detail.body.data.versions.length, 1);
  assert.equal(detail.body.data.versions[0].template.steps[1].type, "browser.javascript");
  assert.equal(unsafe.response.status, 400);
  assert.equal(unsafe.body.error.code, "COLLECTOR_TEMPLATE_ORIGIN_NOT_ALLOWED");
  assert.equal(conflictingReplay.response.status, 409);
  assert.equal(conflictingReplay.body.error.code, "COLLECTOR_IDEMPOTENCY_CONFLICT");
  db.close();
});

test("new versions require the current optimistic version and publishing rejects free execution", async () => {
  const db = database();
  await call(onTemplates, "/api/platform/v1/web-collection/templates", {
    method: "POST",
    db,
    session: dataAdmin,
    key: "template-create-1",
    body: { template: template() }
  });
  const changed = await call(
    onTemplateVersions,
    "/api/platform/v1/web-collection/templates/kuaimai-inventory-research/versions",
    {
      method: "POST",
      db,
      session: dataAdmin,
      key: "template-version-2",
      params: { id: "kuaimai-inventory-research" },
      body: { expectedVersion: 1, patch: { timeoutSeconds: 900 } }
    }
  );
  const stale = await call(
    onTemplateVersions,
    "/api/platform/v1/web-collection/templates/kuaimai-inventory-research/versions",
    {
      method: "POST",
      db,
      session: dataAdmin,
      key: "template-version-stale",
      params: { id: "kuaimai-inventory-research" },
      body: { expectedVersion: 1, patch: { timeoutSeconds: 1000 } }
    }
  );
  const publish = await call(
    onTemplatePublish,
    "/api/platform/v1/web-collection/templates/kuaimai-inventory-research/publish",
    {
      method: "POST",
      db,
      session: executive,
      key: "template-publish-2",
      params: { id: "kuaimai-inventory-research" },
      body: { expectedVersion: 2 }
    }
  );

  assert.equal(changed.response.status, 201);
  assert.equal(changed.body.data.template.currentVersion, 2);
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.error.code, "COLLECTOR_TEMPLATE_VERSION_CONFLICT");
  assert.equal(publish.response.status, 409);
  assert.equal(publish.body.error.code, "COLLECTOR_TEMPLATE_PROMOTION_REQUIRED");
  db.close();
});

test("template version and publish idempotency keys cannot be replayed with different requests", async () => {
  const db = database();
  await call(onTemplates, "/api/platform/v1/web-collection/templates", {
    method: "POST",
    db,
    session: dataAdmin,
    key: "formal-template-create-1",
    body: { template: formalTemplate({ templateId: "formal-inventory" }) }
  });
  const version = await call(
    onTemplateVersions,
    "/api/platform/v1/web-collection/templates/formal-inventory/versions",
    {
      method: "POST",
      db,
      session: dataAdmin,
      key: "formal-template-version-2",
      params: { id: "formal-inventory" },
      body: { expectedVersion: 1, patch: { timeoutSeconds: 900 } }
    }
  );
  const changedReplay = await call(
    onTemplateVersions,
    "/api/platform/v1/web-collection/templates/formal-inventory/versions",
    {
      method: "POST",
      db,
      session: dataAdmin,
      key: "formal-template-version-2",
      params: { id: "formal-inventory" },
      body: { expectedVersion: 1, patch: { timeoutSeconds: 901 } }
    }
  );
  const published = await call(
    onTemplatePublish,
    "/api/platform/v1/web-collection/templates/formal-inventory/publish",
    {
      method: "POST",
      db,
      session: executive,
      key: "formal-template-publish-2",
      params: { id: "formal-inventory" },
      body: { expectedVersion: 2 }
    }
  );
  const publishReplay = await call(
    onTemplatePublish,
    "/api/platform/v1/web-collection/templates/formal-inventory/publish",
    {
      method: "POST",
      db,
      session: executive,
      key: "formal-template-publish-2",
      params: { id: "formal-inventory" },
      body: { expectedVersion: 2 }
    }
  );
  const republish = await call(
    onTemplatePublish,
    "/api/platform/v1/web-collection/templates/formal-inventory/publish",
    {
      method: "POST",
      db,
      session: executive,
      key: "formal-template-publish-again",
      params: { id: "formal-inventory" },
      body: { expectedVersion: 2 }
    }
  );

  assert.equal(version.response.status, 201);
  assert.equal(changedReplay.response.status, 409);
  assert.equal(changedReplay.body.error.code, "COLLECTOR_IDEMPOTENCY_CONFLICT");
  assert.equal(published.response.status, 200);
  assert.equal(published.body.data.template.status, "published");
  assert.equal(publishReplay.response.status, 200);
  assert.equal(publishReplay.body.data.idempotentReplay, true);
  assert.equal(republish.response.status, 409);
  assert.equal(republish.body.error.code, "COLLECTOR_TEMPLATE_STATE_CONFLICT");
  db.close();
});

test("experimental runs bind a runner and can become validated but never trusted", async () => {
  const db = database();
  const runner = await registerWebCollectionRunner(db, { name: "公司 Mac" }, executive);
  await call(onTemplates, "/api/platform/v1/web-collection/templates", {
    method: "POST",
    db,
    session: dataAdmin,
    key: "template-create-1",
    body: { template: template() }
  });
  const created = await call(onRuns, "/api/platform/v1/web-collection/runs", {
    method: "POST",
    db,
    key: "run-create-1",
    body: {
      templateId: "kuaimai-inventory-research",
      templateVersion: 1,
      runnerId: runner.id
    }
  });
  const started = await call(
    onRunActions,
    `/api/platform/v1/web-collection/runs/${created.body.data.run.id}/actions`,
    {
      method: "POST",
      db,
      session: null,
      token: runner.token,
      key: "run-start-1",
      params: { id: created.body.data.run.id },
      body: { action: "start", expectedVersion: 1 }
    }
  );
  const completed = await call(
    onRunActions,
    `/api/platform/v1/web-collection/runs/${created.body.data.run.id}/actions`,
    {
      method: "POST",
      db,
      session: null,
      token: runner.token,
      key: "run-complete-1",
      params: { id: created.body.data.run.id },
      body: {
        action: "complete",
        expectedVersion: 2,
        quality: {
          requiredFieldsComplete: true,
          storeMatched: true,
          businessDateMatched: true,
          schemaMatched: true,
          coverage: 1
        },
        requestedTrustLevel: "trusted"
      }
    }
  );
  const read = await call(
    onRun,
    `/api/platform/v1/web-collection/runs/${created.body.data.run.id}`,
    { db, params: { id: created.body.data.run.id } }
  );

  assert.equal(created.response.status, 201);
  assert.equal(started.body.data.run.status, "running");
  assert.equal(created.body.data.executionBundle.runnerId, runner.id);
  assert.equal(created.body.data.executionBundle.contentHash.length, 64);
  assert.equal(created.body.data.executionBundle.signature.length, 64);
  assert.equal(created.body.data.executionBundle.targetEnvironment, "production");
  assert.equal(created.body.data.executionBundle.targetEnvironmentVersion, 1);
  assert.equal(completed.response.status, 200);
  assert.equal(completed.body.data.run.status, "completed");
  assert.equal(completed.body.data.run.trustLevel, "validated");
  assert.equal(read.body.data.run.trustLevel, "validated");
  assert.doesNotMatch(JSON.stringify(read.body), /password|cookie|authorization|bearer/i);
  db.close();
});

test("experimental run completion rejects unregistered quality fields before persistence", async () => {
  const db = database();
  const runner = await registerWebCollectionRunner(db, { name: "公司 Mac" }, executive);
  await call(onTemplates, "/api/platform/v1/web-collection/templates", {
    method: "POST",
    db,
    session: dataAdmin,
    key: "template-create-quality",
    body: { template: template() }
  });
  const created = await call(onRuns, "/api/platform/v1/web-collection/runs", {
    method: "POST",
    db,
    key: "run-create-quality",
    body: {
      templateId: "kuaimai-inventory-research",
      templateVersion: 1,
      runnerId: runner.id
    }
  });
  const runId = created.body.data.run.id;
  await call(onRunActions, `/api/platform/v1/web-collection/runs/${runId}/actions`, {
    method: "POST",
    db,
    session: null,
    token: runner.token,
    key: "run-quality-start",
    params: { id: runId },
    body: { action: "start", expectedVersion: 1 }
  });
  const rejected = await call(onRunActions, `/api/platform/v1/web-collection/runs/${runId}/actions`, {
    method: "POST",
    db,
    session: null,
    token: runner.token,
    key: "run-quality-complete",
    params: { id: runId },
    body: {
      action: "complete",
      expectedVersion: 2,
      quality: {
        requiredFieldsComplete: true,
        storeMatched: true,
        businessDateMatched: true,
        schemaMatched: true,
        coverage: 1,
        rawOutput: "must not persist"
      }
    }
  });
  const read = await call(onRun, `/api/platform/v1/web-collection/runs/${runId}`, {
    db,
    params: { id: runId }
  });

  assert.equal(rejected.response.status, 400);
  assert.equal(rejected.body.error.code, "COLLECTOR_RUN_QUALITY_INVALID");
  assert.equal(read.body.data.run.status, "running");
  assert.doesNotMatch(JSON.stringify(read.body), /must not persist/);
  db.close();
});

test("runner lists only its active execution bundle and starts it with optimistic locking", async () => {
  const db = database();
  const firstRunner = await registerWebCollectionRunner(db, { name: "公司 Mac" }, executive);
  const secondRunner = await registerWebCollectionRunner(db, { name: "备用 Mac" }, executive);
  await call(onTemplates, "/api/platform/v1/web-collection/templates", {
    method: "POST",
    db,
    session: dataAdmin,
    key: "template-create-1",
    body: { template: template() }
  });
  const created = await call(onRuns, "/api/platform/v1/web-collection/runs", {
    method: "POST",
    db,
    key: "run-create-1",
    body: {
      templateId: "kuaimai-inventory-research",
      templateVersion: 1,
      runnerId: firstRunner.id
    }
  });
  const conflictingReplay = await call(onRuns, "/api/platform/v1/web-collection/runs", {
    method: "POST",
    db,
    key: "run-create-1",
    body: {
      templateId: "kuaimai-inventory-research",
      templateVersion: 1,
      runnerId: secondRunner.id
    }
  });
  const assigned = await call(onRuns, "/api/platform/v1/web-collection/runs", {
    db,
    session: null,
    token: firstRunner.token
  });
  const other = await call(onRuns, "/api/platform/v1/web-collection/runs", {
    db,
    session: null,
    token: secondRunner.token
  });
  const started = await call(
    onRunActions,
    `/api/platform/v1/web-collection/runs/${created.body.data.run.id}/actions`,
    {
      method: "POST",
      db,
      session: null,
      token: firstRunner.token,
      key: "run-start-1",
      params: { id: created.body.data.run.id },
      body: { action: "start", expectedVersion: 1 }
    }
  );
  const stale = await call(
    onRunActions,
    `/api/platform/v1/web-collection/runs/${created.body.data.run.id}/actions`,
    {
      method: "POST",
      db,
      session: null,
      token: firstRunner.token,
      key: "run-start-stale",
      params: { id: created.body.data.run.id },
      body: { action: "start", expectedVersion: 1 }
    }
  );

  assert.equal(assigned.response.status, 200);
  assert.equal(assigned.body.data.runs.length, 1);
  assert.equal(assigned.body.data.runs[0].executionBundle.runnerId, firstRunner.id);
  assert.equal(assigned.body.data.runs[0].executionBundle.signature.length, 64);
  assert.deepEqual(other.body.data.runs, []);
  assert.equal(started.body.data.run.status, "running");
  assert.equal(started.body.data.run.version, 2);
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.error.code, "COLLECTOR_RUN_VERSION_CONFLICT");
  assert.equal(conflictingReplay.response.status, 409);
  assert.equal(conflictingReplay.body.error.code, "COLLECTOR_IDEMPOTENCY_CONFLICT");
  db.close();
});

test("run action idempotency protects result content and supports human wait, resume and cancel", async () => {
  const db = database();
  const runner = await registerWebCollectionRunner(db, { name: "公司 Mac" }, executive);
  await call(onTemplates, "/api/platform/v1/web-collection/templates", {
    method: "POST",
    db,
    session: dataAdmin,
    key: "template-create-1",
    body: { template: template() }
  });
  const created = await call(onRuns, "/api/platform/v1/web-collection/runs", {
    method: "POST",
    db,
    key: "run-create-human-wait",
    body: {
      templateId: "kuaimai-inventory-research",
      templateVersion: 1,
      runnerId: runner.id
    }
  });
  const runId = created.body.data.run.id;
  const started = await call(onRunActions, `/api/platform/v1/web-collection/runs/${runId}/actions`, {
    method: "POST",
    db,
    session: null,
    token: runner.token,
    key: "run-human-start",
    params: { id: runId },
    body: { action: "start", expectedVersion: 1 }
  });
  const waiting = await call(onRunActions, `/api/platform/v1/web-collection/runs/${runId}/actions`, {
    method: "POST",
    db,
    session: null,
    token: runner.token,
    key: "run-human-wait",
    params: { id: runId },
    body: {
      action: "wait_human",
      expectedVersion: 2,
      errorCode: "KUAIMAI_LOGIN_REQUIRED",
      safeSummary: "请在公司 Mac 登录快麦。"
    }
  });
  const changedReplay = await call(onRunActions, `/api/platform/v1/web-collection/runs/${runId}/actions`, {
    method: "POST",
    db,
    session: null,
    token: runner.token,
    key: "run-human-wait",
    params: { id: runId },
    body: {
      action: "wait_human",
      expectedVersion: 2,
      errorCode: "KUAIMAI_SMS_REQUIRED",
      safeSummary: "请完成短信验证。"
    }
  });
  const resumed = await call(onRunActions, `/api/platform/v1/web-collection/runs/${runId}/actions`, {
    method: "POST",
    db,
    session: null,
    token: runner.token,
    key: "run-human-resume",
    params: { id: runId },
    body: { action: "resume", expectedVersion: 3 }
  });
  const cancelled = await call(onRunActions, `/api/platform/v1/web-collection/runs/${runId}/actions`, {
    method: "POST",
    db,
    session: null,
    token: runner.token,
    key: "run-human-cancel",
    params: { id: runId },
    body: { action: "cancel", expectedVersion: 4 }
  });

  assert.equal(started.body.data.run.status, "running");
  assert.equal(waiting.body.data.run.status, "waiting_human");
  assert.equal(waiting.body.data.run.trustLevel, "untrusted");
  assert.equal(changedReplay.response.status, 409);
  assert.equal(changedReplay.body.error.code, "COLLECTOR_IDEMPOTENCY_CONFLICT");
  assert.equal(resumed.body.data.run.status, "running");
  assert.equal(cancelled.body.data.run.status, "cancelled");
  db.close();
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  createD1RefreshData,
  createD1RefreshRepository,
  createDisplayRefreshJob,
  runDisplayRefreshStep
} from "../functions/api/platform/_shared/demoDataRefresh.js";
import {
  DEMO_DATA_CATALOG,
  demoTablePolicy
} from "../functions/api/platform/_shared/demoDataCatalog.js";
import { scaleSalesFact } from "../src/domain/demoSalesTransform.js";

function memoryRefreshHarness({ failValidation = false } = {}) {
  const state = {
    status: "ready",
    version: 7,
    activeJobId: "",
    jobs: new Map(),
    targetRows: new Map()
  };
  const sourceRows = new Map([
    ["product_flow_state", [{ id: "company", payload: "{}", version: "1" }]],
    ["product_flow_state_parts", [{ state_id: "company", part_key: "products", part_index: 0, payload: "{}" }]],
    ["product_sales_daily", [
      { code: "6900000000000", date: "2026-07-22", platform: "天猫", qty: 3, sales: 90, net_sales: 81, refund: 9, cost: 30, gross_profit: 51 }
    ]],
    ["product_sales_meta", [{ id: "company", payload: "{}", updated_at: "2026-07-23T00:00:00.000Z" }]]
  ]);
  let leaseHeld = false;

  const repository = {
    async findActiveJob() {
      return [...state.jobs.values()].find(job => ["queued", "running"].includes(job.status)) || null;
    },
    async createJob(job) {
      state.jobs.set(job.id, { ...job });
      state.status = "refreshing";
      state.activeJobId = job.id;
      return state.jobs.get(job.id);
    },
    async getJob(id) {
      return state.jobs.get(id) || null;
    },
    async acquireLease(id) {
      if (leaseHeld) return false;
      leaseHeld = true;
      const job = state.jobs.get(id);
      job.status = "running";
      return true;
    },
    async saveJob(id, patch) {
      const job = state.jobs.get(id);
      Object.assign(job, patch);
      leaseHeld = false;
      return job;
    },
    async failJob(id, code) {
      const job = state.jobs.get(id);
      Object.assign(job, { status: "failed", lastErrorCode: code });
      state.status = "failed";
      state.activeJobId = "";
      leaseHeld = false;
      return job;
    },
    async activateJob(id, summary) {
      const job = state.jobs.get(id);
      Object.assign(job, { status: "succeeded", stage: "activate", validation: summary });
      state.status = "ready";
      state.version += 1;
      state.activeJobId = "";
      leaseHeld = false;
      return job;
    }
  };

  const data = {
    async preflightTable(entry) {
      return { available: sourceRows.has(entry.table), count: sourceRows.get(entry.table)?.length || 0 };
    },
    async clearTable(entry) {
      state.targetRows.set(entry.table, []);
    },
    async copyBatch(entry, cursor, { transform }) {
      const rows = sourceRows.get(entry.table) || [];
      const index = Number(cursor?.offset || 0);
      if (index >= rows.length) return { rows: 0, done: true, cursor };
      const source = rows[index];
      const next = await transform(source, index);
      const target = state.targetRows.get(entry.table) || [];
      const key = JSON.stringify(entry.primaryKey.map(field => next[field]));
      const existing = target.findIndex(row => row.key === key);
      const value = { key, value: next };
      if (existing >= 0) target[existing] = value;
      else target.push(value);
      state.targetRows.set(entry.table, target);
      return { rows: 1, done: index + 1 >= rows.length, cursor: { offset: index + 1 } };
    },
    async recalculateTable() {},
    async validate() {
      if (failValidation) return { valid: false, errorCode: "DEMO_DATA_SALES_VALIDATION_FAILED" };
      const source = sourceRows.get("product_sales_daily")[0];
      const target = state.targetRows.get("product_sales_daily")[0]?.value;
      return {
        valid: target?.sales === source.sales * 2 && target?.refund === source.refund * 2,
        sales: { source: source.sales, display: target?.sales }
      };
    }
  };
  return { state, repository, data };
}

async function runToTerminal(input, limit = 500) {
  let result;
  for (let index = 0; index < limit; index += 1) {
    result = await runDisplayRefreshStep(input);
    if (result.terminal) return result;
  }
  throw new Error("refresh did not reach a terminal state");
}

test("blocks display from refresh start and activates only after validation", async () => {
  const harness = memoryRefreshHarness();
  const job = await createDisplayRefreshJob({
    repository: harness.repository,
    actorId: "executive-1",
    sourceVersion: "source-1"
  });

  assert.equal(harness.state.status, "refreshing");
  const result = await runToTerminal({
    repository: harness.repository,
    data: harness.data,
    jobId: job.id,
    maskingKey: "test-masking-key-123456"
  });

  assert.equal(result.status, "succeeded");
  assert.equal(harness.state.status, "ready");
  assert.equal(harness.state.version, 8);
  assert.equal(harness.state.targetRows.get("product_sales_daily")[0].value.sales, 180);
  assert.equal(harness.state.targetRows.get("product_sales_daily")[0].value.refund, 18);
});

test("validation failure keeps the display environment unavailable", async () => {
  const harness = memoryRefreshHarness({ failValidation: true });
  const job = await createDisplayRefreshJob({
    repository: harness.repository,
    actorId: "executive-1",
    sourceVersion: "source-1"
  });
  const result = await runToTerminal({
    repository: harness.repository,
    data: harness.data,
    jobId: job.id,
    maskingKey: "test-masking-key-123456"
  });

  assert.equal(result.status, "failed");
  assert.equal(harness.state.status, "failed");
  assert.equal(harness.state.version, 7);
});

test("repeated and resumed steps remain idempotent instead of producing four times sales", async () => {
  const harness = memoryRefreshHarness();
  const job = await createDisplayRefreshJob({
    repository: harness.repository,
    actorId: "executive-1",
    sourceVersion: "source-1"
  });
  await runDisplayRefreshStep({
    repository: harness.repository,
    data: harness.data,
    jobId: job.id,
    maskingKey: "test-masking-key-123456"
  });
  await runToTerminal({
    repository: harness.repository,
    data: harness.data,
    jobId: job.id,
    maskingKey: "test-masking-key-123456"
  });
  const terminal = await runDisplayRefreshStep({
    repository: harness.repository,
    data: harness.data,
    jobId: job.id,
    maskingKey: "test-masking-key-123456"
  });

  assert.equal(terminal.status, "succeeded");
  assert.equal(harness.state.targetRows.get("product_sales_daily")[0].value.sales, 180);
});

test("returns an existing active job instead of creating a second refresh", async () => {
  const harness = memoryRefreshHarness();
  const first = await createDisplayRefreshJob({
    repository: harness.repository,
    actorId: "executive-1",
    sourceVersion: "source-1"
  });
  const second = await createDisplayRefreshJob({
    repository: harness.repository,
    actorId: "executive-1",
    sourceVersion: "source-2"
  });

  assert.equal(second.id, first.id);
  assert.equal(harness.state.jobs.size, 1);
});

test("real D1 adapter replays a transformed batch without duplicating or multiplying it again", async t => {
  const { Miniflare } = await import("miniflare");
  const runtime = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: { SOURCE: "source", TARGET: "target", CONTROL: "control" }
  });
  t.after(() => runtime.dispose());
  const sourceDb = await runtime.getD1Database("SOURCE");
  const targetDb = await runtime.getD1Database("TARGET");
  const controlDb = await runtime.getD1Database("CONTROL");
  const schema = "CREATE TABLE product_sales_daily (code TEXT NOT NULL, date TEXT NOT NULL, platform TEXT NOT NULL, qty REAL NOT NULL DEFAULT 0, sales REAL NOT NULL DEFAULT 0, net_sales REAL NOT NULL DEFAULT 0, gross_profit REAL NOT NULL DEFAULT 0, refund REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, pre_ship_refund REAL NOT NULL DEFAULT 0, post_ship_refund REAL NOT NULL DEFAULT 0, PRIMARY KEY (code, date, platform));";
  await sourceDb.exec(schema);
  await targetDb.exec(schema);
  await sourceDb.prepare(`INSERT INTO product_sales_daily
    (code, date, platform, qty, sales, net_sales, gross_profit, refund, cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind("6900000000000", "2026-07-22", "天猫", 3, 90, 81, 51, 9, 30)
    .run();

  const data = createD1RefreshData({ sourceDb, targetDb });
  const entry = demoTablePolicy("product_sales_daily");
  assert.deepEqual(await data.preflightTable(entry), { available: true, count: 1 });
  const transform = row => scaleSalesFact(row);
  const first = await data.copyBatch(entry, {}, { transform });
  const replay = await data.copyBatch(entry, {}, { transform });
  assert.equal(first.rows, 1);
  assert.equal(replay.rows, 1);
  const stored = await targetDb.prepare("SELECT COUNT(*) AS count, SUM(sales) AS sales, SUM(refund) AS refund FROM product_sales_daily").first();
  assert.deepEqual(
    { count: Number(stored.count), sales: Number(stored.sales), refund: Number(stored.refund) },
    { count: 1, sales: 180, refund: 18 }
  );

  const counts = {
    tables: Object.fromEntries(DEMO_DATA_CATALOG
      .filter(item => item.policy !== "skip")
      .map(item => [item.table, { available: item.table === entry.table }]))
  };
  const validation = await data.validate(counts);
  assert.equal(validation.valid, true);
  assert.equal(validation.sales.factor, 2);

  await controlDb.exec("CREATE TABLE demo_data_environment_state (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL, active_job_id TEXT, rule_version TEXT NOT NULL, source_updated_at TEXT, coverage_json TEXT NOT NULL DEFAULT '{}', validation_json TEXT NOT NULL DEFAULT '{}', last_error_code TEXT, updated_by TEXT, updated_at TEXT NOT NULL);");
  await controlDb.exec("INSERT INTO demo_data_environment_state (id, enabled, status, version, rule_version, updated_at) VALUES ('display', 1, 'ready', 7, 'sales-2x-v1', '2026-07-23T00:00:00.000Z');");
  await controlDb.exec("CREATE TABLE demo_data_refresh_jobs (id TEXT PRIMARY KEY, status TEXT NOT NULL, stage TEXT NOT NULL, current_table TEXT, cursor_json TEXT NOT NULL DEFAULT '{}', source_version TEXT NOT NULL, rule_version TEXT NOT NULL, counts_json TEXT NOT NULL DEFAULT '{}', validation_json TEXT NOT NULL DEFAULT '{}', last_error_code TEXT, lease_expires_at TEXT, actor_id TEXT NOT NULL, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, updated_at TEXT NOT NULL);");
  await controlDb.exec("CREATE UNIQUE INDEX demo_data_refresh_jobs_single_active ON demo_data_refresh_jobs ((1)) WHERE status IN ('queued', 'running');");
  const repository = createD1RefreshRepository(controlDb);
  const job = await createDisplayRefreshJob({
    repository,
    actorId: "executive-1",
    sourceVersion: "source-1"
  });
  assert.equal((await controlDb.prepare("SELECT status FROM demo_data_environment_state WHERE id = 'display'").first()).status, "refreshing");
  assert.equal(await repository.acquireLease(job.id, new Date("2026-07-23T01:00:00.000Z"), new Date("2026-07-23T01:00:30.000Z")), true);
  await repository.saveJob(job.id, { stage: "activate", cursor: {}, counts: { tables: {} } }, new Date("2026-07-23T01:00:01.000Z"));
  await repository.activateJob(job.id, { valid: true }, new Date("2026-07-23T01:00:02.000Z"));
  const state = await controlDb.prepare("SELECT status, version FROM demo_data_environment_state WHERE id = 'display'").first();
  assert.deepEqual({ status: state.status, version: Number(state.version) }, { status: "ready", version: 8 });
});

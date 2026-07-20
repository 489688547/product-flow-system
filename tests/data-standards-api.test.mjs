import assert from "node:assert/strict";
import test from "node:test";
import { onRequest as collectionRequest } from "../functions/api/platform/v1/data-standards.js";
import { onRequest as itemRequest } from "../functions/api/platform/v1/data-standards/[id].js";
import { onRequest as archiveRequest } from "../functions/api/platform/v1/data-standards/[id]/archive.js";

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function createD1Mock() {
  const definitions = new Map();
  const versions = new Map();
  const audits = [];
  const results = new Map();

  function definitionRow(values) {
    const [id, metricCode, category, name, ownerDepartment, unit, period, currentVersion, status,
      archivedAt, archivedBy, createdAt, createdBy, updatedAt, updatedBy] = values;
    return { id, metric_code: metricCode, category, name, owner_department: ownerDepartment, unit, period,
      current_version: currentVersion, status, archived_at: archivedAt, archived_by: archivedBy,
      created_at: createdAt, created_by: createdBy, updated_at: updatedAt, updated_by: updatedBy };
  }

  function versionRow(values) {
    const expanded = values.length >= 16;
    const [definitionId, version, name, category, ownerDepartment, unit, period, effectiveFrom, displayFormula, formulaAst, sourceFields, dependencies,
      executable, coverageStatus, createdAt, createdBy] = expanded
      ? values
      : [values[0], values[1], undefined, undefined, undefined, undefined, undefined, ...values.slice(2)];
    return { definition_id: definitionId, version, name, category, owner_department: ownerDepartment, unit, period, effective_from: effectiveFrom, display_formula: displayFormula,
      formula_ast: formulaAst, source_fields: sourceFields, dependencies, executable,
      coverage_status: coverageStatus, created_at: createdAt, created_by: createdBy };
  }

  function snapshot() {
    return { definitions: structuredClone(definitions), versions: structuredClone(versions), audits: structuredClone(audits) };
  }

  function restore(saved) {
    definitions.clear();
    saved.definitions.forEach((value, key) => definitions.set(key, value));
    versions.clear();
    saved.versions.forEach((value, key) => versions.set(key, value));
    audits.splice(0, audits.length, ...saved.audits);
  }

  const db = {
    definitions,
    versions,
    audits,
    results,
    prepare(sql) {
      const normalized = normalizeSql(sql);
      const statement = {
        normalized,
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() {
          if (normalized.startsWith("create table") || normalized.startsWith("create index")) return { success: true, meta: { changes: 0 } };
          if (normalized.startsWith("insert into data_metric_definitions")) {
            const row = definitionRow(statement.values);
            if ([...definitions.values()].some(item => item.metric_code === row.metric_code)) {
              throw new Error("UNIQUE constraint failed: data_metric_definitions.metric_code");
            }
            definitions.set(row.id, row);
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into data_metric_definition_versions") && normalized.includes("select")) {
            const row = versionRow(statement.values);
            const current = definitions.get(row.definition_id);
            const expectedVersion = statement.values.at(-1);
            if (!current || current.current_version !== expectedVersion || current.status !== "active") return { success: true, meta: { changes: 0 } };
            if ([...versions.values()].some(item => item.definition_id === row.definition_id && item.effective_from === row.effective_from)) {
              throw new Error("UNIQUE constraint failed: data_metric_definition_versions.definition_id, data_metric_definition_versions.effective_from");
            }
            versions.set(`${row.definition_id}:${row.version}`, row);
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into data_metric_definition_versions")) {
            const row = versionRow(statement.values);
            versions.set(`${row.definition_id}:${row.version}`, row);
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("update data_metric_definitions set current_version")
            || normalized.startsWith("update data_metric_definitions set name")) {
            const expanded = statement.values.length >= 10;
            const [name, category, ownerDepartment, unit, period, nextVersion, updatedAt, updatedBy, id, expectedVersion] = expanded
              ? statement.values
              : [undefined, undefined, undefined, undefined, undefined, ...statement.values];
            const current = definitions.get(id);
            if (!current || current.current_version !== expectedVersion || current.status !== "active") return { success: true, meta: { changes: 0 } };
            definitions.set(id, {
              ...current,
              ...(expanded ? { name, category, owner_department: ownerDepartment, unit, period } : {}),
              current_version: nextVersion,
              updated_at: updatedAt,
              updated_by: updatedBy
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("update data_metric_definitions set status")) {
            const [status, archivedAt, archivedBy, updatedAt, updatedBy, id, expectedVersion] = statement.values;
            const current = definitions.get(id);
            if (!current || current.current_version !== expectedVersion || current.status !== "active") return { success: true, meta: { changes: 0 } };
            definitions.set(id, { ...current, status, archived_at: archivedAt, archived_by: archivedBy, updated_at: updatedAt, updated_by: updatedBy });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into data_metric_audit_logs")) {
            const [id, definitionId, action, actorId, actorName, definitionVersion, changedFields,
              rangeStart, rangeEnd, createdAt] = statement.values;
            const guardId = statement.values[10];
            const guardVersion = statement.values[11];
            if (normalized.includes("select")) {
              const current = definitions.get(guardId);
              if (!current || current.current_version !== guardVersion) return { success: true, meta: { changes: 0 } };
              if (normalized.includes("status = 'active'") && current.status !== "active") return { success: true, meta: { changes: 0 } };
              if (normalized.includes("status = 'archived'") && current.status !== "archived") return { success: true, meta: { changes: 0 } };
            }
            audits.push({ id, definition_id: definitionId, action, actor_id: actorId, actor_name: actorName,
              definition_version: definitionVersion, changed_fields: changedFields, range_start: rangeStart,
              range_end: rangeEnd, created_at: createdAt });
            return { success: true, meta: { changes: 1 } };
          }
          throw new Error(`Unexpected run SQL: ${sql}`);
        },
        async first() {
          if (normalized.includes("from data_metric_definition_versions") && normalized.includes("order by effective_from desc")) {
            return [...versions.values()].filter(row => row.definition_id === statement.values[0])
              .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] || null;
          }
          if (normalized.includes("from data_metric_definitions") && normalized.includes("where id = ?")) return definitions.get(statement.values[0]) || null;
          return null;
        },
        async all() {
          if (normalized.includes("from data_metric_definitions") && !normalized.includes("join")) {
            let rows = [...definitions.values()];
            let offset = 0;
            for (const condition of ["category = ?", "owner_department = ?", "status = ?"]) {
              if (normalized.includes(condition)) {
                const column = condition.split(" ")[0];
                rows = rows.filter(row => row[column] === statement.values[offset++]);
              }
            }
            return { results: rows };
          }
          if (normalized.includes("from data_metric_definition_versions")) {
            return { results: [...versions.values()].filter(row => row.definition_id === statement.values[0]).sort((a, b) => b.version - a.version) };
          }
          if (normalized.includes("from data_metric_audit_logs")) {
            return { results: audits.filter(row => row.definition_id === statement.values[0]) };
          }
          if (normalized.includes("from data_metric_results")) {
            let rows = [...results.values()].filter(row => row.is_current === 1);
            if (normalized.includes("definition_id = ?")) rows = rows.filter(row => row.definition_id === statement.values[0]);
            return { results: rows };
          }
          return { results: [] };
        }
      };
      return statement;
    },
    async batch(statements) {
      const saved = snapshot();
      try {
        const output = [];
        for (const statement of statements) output.push(await statement.run());
        return output;
      } catch (error) {
        restore(saved);
        throw error;
      }
    }
  };
  return db;
}

const sessions = {
  executive: { userId: "exec-1", name: "总经理", department: "总经办" },
  operations: { userId: "ops-1", name: "运营", department: "运营部" },
  finance: { userId: "finance-1", name: "财务", department: "财务部" },
  supply: { userId: "supply-1", name: "采购", department: "采购部" },
  product: { userId: "product-1", name: "产品", department: "产品部" },
  outsider: { userId: "brand-1", name: "品牌", department: "品牌部" },
  readonly: { userId: "readonly-1", name: "只读", department: "财务部", role: "readonly" }
};

function request(path = "", method = "GET", body) {
  return new Request(`https://flow.example.com/api/platform/v1/data-standards${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

function definitionDraft(overrides = {}) {
  return {
    metricCode: "sales.order_value",
    name: "客单价总额",
    category: "sales",
    ownerDepartment: "运营部",
    unit: "CNY",
    period: "day",
    effectiveFrom: "2026-07-21",
    displayFormula: "净销售额求和",
    formulaAst: { type: "aggregate", operation: "sum", input: { type: "field", field: "sales.net_sales" }, filters: [] },
    sourceFields: ["sales.net_sales"],
    ...overrides
  };
}

async function call(handler, { db, session, path = "", method = "GET", body, id } = {}) {
  return handler({ request: request(path, method, body), env: db ? { PRODUCT_FLOW_DB: db } : {}, data: session ? { session } : {}, params: id ? { id } : {} });
}

async function body(response) {
  return response.json();
}

async function createDefinition(db, session = sessions.operations, overrides = {}) {
  const response = await call(collectionRequest, { db, session, method: "POST", body: definitionDraft(overrides) });
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  return body(response);
}

test("data standards require authentication and data center view permission", async () => {
  const db = createD1Mock();
  const anonymous = await call(collectionRequest, { db });
  assert.equal(anonymous.status, 401);
  assert.equal((await body(anonymous)).error.code, "AUTH_SESSION_REQUIRED");

  const forbidden = await call(collectionRequest, { db, session: sessions.outsider });
  assert.equal(forbidden.status, 403);
  assert.equal((await body(forbidden)).error.code, "PERMISSION_VIEW_DENIED");
});

test("all responses disable caching and errors carry a request id and retryability", async () => {
  const response = await call(collectionRequest, { db: createD1Mock() });
  const payload = await body(response);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(typeof payload.error.requestId, "string");
  assert.equal(payload.error.retryable, false);
});

test("readonly sessions may read but cannot write", async () => {
  const db = createD1Mock();
  assert.equal((await call(collectionRequest, { db, session: sessions.readonly })).status, 200);
  const response = await call(collectionRequest, { db, session: sessions.readonly, method: "POST", body: definitionDraft({ ownerDepartment: "财务部" }) });
  assert.equal(response.status, 403);
  assert.equal((await body(response)).error.code, "PERMISSION_WRITE_DENIED");
});

test("operations finance and supply chain create only their normalized department standards", async () => {
  for (const [session, ownerDepartment, metricCode] of [
    [sessions.operations, "运营部", "sales.ops_metric"],
    [sessions.finance, "财务部", "sales.finance_metric"],
    [sessions.supply, "供应链部", "sales.supply_metric"]
  ]) {
    const db = createD1Mock();
    const created = await call(collectionRequest, {
      db, session, method: "POST",
      body: definitionDraft({ metricCode, ownerDepartment, actor: { id: "spoof" }, createdBy: "spoof", publishedAt: "1900-01-01", audit: { actorId: "spoof" } })
    });
    assert.equal(created.status, 201, `${ownerDepartment}: ${JSON.stringify(await created.clone().json())}`);
    const payload = await body(created);
    assert.equal(payload.definition.ownerDepartment, ownerDepartment);
    assert.equal(payload.definition.createdBy, session.userId);
    assert.equal(db.audits[0].actor_id, session.userId);
    assert.notEqual(payload.definition.createdAt, "1900-01-01");
  }
});

test("non-executives cannot assign or update another department", async () => {
  const db = createD1Mock();
  const createDenied = await call(collectionRequest, { db, session: sessions.operations, method: "POST", body: definitionDraft({ ownerDepartment: "财务部" }) });
  assert.equal(createDenied.status, 403);
  assert.equal((await body(createDenied)).error.code, "PERMISSION_WRITE_DENIED");

  const created = await createDefinition(db, sessions.finance, { ownerDepartment: "财务部", metricCode: "sales.finance_owned" });
  const id = created.definition.id;
  const updateDenied = await call(itemRequest, {
    db, session: sessions.operations, id, path: `/${id}`, method: "PUT",
    body: definitionDraft({ metricCode: "sales.finance_owned", ownerDepartment: "财务部", expectedVersion: 1, effectiveFrom: "2026-07-22" })
  });
  assert.equal(updateDenied.status, 403);
  assert.equal((await body(updateDenied)).error.code, "PERMISSION_WRITE_DENIED");
});

test("executives can create for another governed department", async () => {
  const response = await call(collectionRequest, { db: createD1Mock(), session: sessions.executive, method: "POST", body: definitionDraft({ ownerDepartment: "财务部" }) });
  assert.equal(response.status, 201);
  assert.equal((await body(response)).definition.ownerDepartment, "财务部");
});

test("duplicate metricCode and stale versions return stable conflicts", async () => {
  const db = createD1Mock();
  const created = await createDefinition(db);
  const duplicate = await call(collectionRequest, { db, session: sessions.operations, method: "POST", body: definitionDraft() });
  assert.equal(duplicate.status, 409);
  assert.equal((await body(duplicate)).error.code, "DATA_STANDARD_VERSION_CONFLICT");

  const id = created.definition.id;
  const stale = await call(itemRequest, {
    db, session: sessions.operations, id, path: `/${id}`, method: "PUT",
    body: definitionDraft({ expectedVersion: 2, effectiveFrom: "2026-07-22" })
  });
  assert.equal(stale.status, 409);
  assert.equal((await body(stale)).error.code, "DATA_STANDARD_VERSION_CONFLICT");
});

test("invalid ASTs and unknown request fields are rejected without persisting", async () => {
  const db = createD1Mock();
  const invalid = await call(collectionRequest, {
    db, session: sessions.operations, method: "POST",
    body: definitionDraft({ formulaAst: { type: "sql", statement: "select 1" } })
  });
  assert.equal(invalid.status, 400);
  assert.equal((await body(invalid)).error.code, "DATA_STANDARD_INVALID");

  const unknown = await call(collectionRequest, { db, session: sessions.operations, method: "POST", body: definitionDraft({ rawSql: "select 1" }) });
  assert.equal(unknown.status, 400);
  assert.equal((await body(unknown)).error.code, "DATA_STANDARD_INVALID");
  assert.equal(db.definitions.size, 0);
});

test("PUT appends a version and rejects a duplicate effective date", async () => {
  const db = createD1Mock();
  const created = await createDefinition(db);
  const id = created.definition.id;
  const updated = await call(itemRequest, {
    db, session: sessions.operations, id, path: `/${id}`, method: "PUT",
    body: definitionDraft({ expectedVersion: 1, effectiveFrom: "2026-07-22", displayFormula: "净销售额按新版规则求和" })
  });
  assert.equal(updated.status, 200, JSON.stringify(await updated.clone().json()));
  assert.equal((await body(updated)).definition.currentVersion, 2);
  assert.equal(db.versions.size, 2);

  const sameDate = await call(itemRequest, {
    db, session: sessions.operations, id, path: `/${id}`, method: "PUT",
    body: definitionDraft({ expectedVersion: 2, effectiveFrom: "2026-07-22" })
  });
  assert.equal(sameDate.status, 409);
  assert.equal((await body(sameDate)).error.code, "DATA_STANDARD_EFFECTIVE_DATE_CONFLICT");
});

test("archive preserves definitions and versions", async () => {
  const db = createD1Mock();
  const created = await createDefinition(db);
  const id = created.definition.id;
  const response = await call(archiveRequest, {
    db, session: sessions.operations, id, path: `/${id}/archive`, method: "POST", body: { expectedVersion: 1, actor: { id: "spoof" }, audit: { actorId: "spoof" } }
  });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const payload = await body(response);
  assert.equal(payload.definition.status, "archived");
  assert.equal(db.definitions.size, 1);
  assert.equal(db.versions.size, 1);
  assert.equal(db.audits.at(-1).actor_id, sessions.operations.userId);
});

test("detail includes version dependencies and current recent results", async () => {
  const db = createD1Mock();
  const created = await createDefinition(db);
  const id = created.definition.id;
  db.results.set("result-1", {
    id: "result-1", definition_id: id, definition_version: 1, metric_code: "sales.order_value",
    period_start: "2026-07-20", period_end: "2026-07-20", dimensions_json: "{}", value: 123,
    unit: "CNY", coverage_rate: 1, confidence: "high", estimated: 0, status: "ready", reason: null,
    data_cutoff_at: "2026-07-20T23:59:59.000Z", calculation_run_id: "run-1", is_current: 1,
    created_at: "2026-07-21T00:10:00.000Z"
  });
  const response = await call(itemRequest, { db, session: sessions.product, id, path: `/${id}` });
  assert.equal(response.status, 200);
  const detail = (await body(response)).definition;
  assert.equal(detail.versions.length, 1);
  assert.deepEqual(detail.dependencies, []);
  assert.equal(detail.recentResults[0].definitionVersion, 1);
  assert.equal(detail.recentResults[0].value, 123);
});

test("missing storage is retryable and uses the data standards error contract", async () => {
  const response = await call(collectionRequest, { session: sessions.operations });
  assert.equal(response.status, 501);
  const payload = await body(response);
  assert.equal(payload.error.code, "DATA_STANDARD_STORAGE_UNAVAILABLE");
  assert.equal(payload.error.retryable, true);
});

test("supply chain aliases are normalized in ownership and list filters", async () => {
  const db = createD1Mock();
  const created = await call(collectionRequest, {
    db,
    session: { ...sessions.supply, department: "供应链团队" },
    method: "POST",
    body: definitionDraft({ metricCode: "sales.supply_alias", ownerDepartment: "供应链" })
  });
  assert.equal(created.status, 201);
  assert.equal((await body(created)).definition.ownerDepartment, "供应链部");
  const listed = await call(collectionRequest, {
    db,
    session: sessions.supply,
    path: "?ownerDepartment=%E9%87%87%E8%B4%AD%E9%83%A8"
  });
  assert.equal((await body(listed)).definitions.length, 1);
});

test("publishing rejects circular and archived metric dependencies", async () => {
  const db = createD1Mock();
  const first = await createDefinition(db, sessions.operations, { metricCode: "sales.first_metric" });
  await createDefinition(db, sessions.operations, {
    metricCode: "sales.second_metric",
    formulaAst: { type: "metric", metricCode: "sales.first_metric" },
    sourceFields: []
  });
  const firstId = first.definition.id;
  const cycle = await call(itemRequest, {
    db,
    session: sessions.operations,
    id: firstId,
    path: `/${firstId}`,
    method: "PUT",
    body: definitionDraft({
      metricCode: "sales.first_metric",
      expectedVersion: 1,
      effectiveFrom: "2026-07-22",
      formulaAst: { type: "metric", metricCode: "sales.second_metric" },
      sourceFields: []
    })
  });
  assert.equal(cycle.status, 400);
  assert.equal((await body(cycle)).error.code, "DATA_STANDARD_CYCLE");

  const archivedId = [...db.definitions.values()].find(row => row.metric_code === "sales.second_metric").id;
  const archived = await call(archiveRequest, {
    db, session: sessions.operations, id: archivedId, path: `/${archivedId}/archive`, method: "POST", body: { expectedVersion: 1 }
  });
  assert.equal(archived.status, 200);
  const archivedDependency = await call(itemRequest, {
    db,
    session: sessions.operations,
    id: firstId,
    path: `/${firstId}`,
    method: "PUT",
    body: definitionDraft({
      metricCode: "sales.first_metric",
      expectedVersion: 1,
      effectiveFrom: "2026-07-22",
      formulaAst: { type: "metric", metricCode: "sales.second_metric" },
      sourceFields: []
    })
  });
  assert.equal(archivedDependency.status, 400);
  assert.equal((await body(archivedDependency)).error.code, "DATA_STANDARD_DEPENDENCY_ARCHIVED");
});

test("executives can change versioned metadata while metricCode remains immutable", async () => {
  const db = createD1Mock();
  const created = await createDefinition(db, sessions.operations, { metricCode: "sales.versioned_metadata" });
  const id = created.definition.id;
  const changed = await call(itemRequest, {
    db,
    session: sessions.executive,
    id,
    path: `/${id}`,
    method: "PUT",
    body: {
      expectedVersion: 1,
      name: "财务口径",
      ownerDepartment: "财务部",
      effectiveFrom: "2026-07-22",
      displayFormula: "净销售额求和",
      formulaAst: definitionDraft().formulaAst,
      sourceFields: ["sales.net_sales"]
    }
  });
  assert.equal(changed.status, 200, JSON.stringify(await changed.clone().json()));
  const detail = (await body(changed)).definition;
  assert.equal(detail.name, "财务口径");
  assert.equal(detail.ownerDepartment, "财务部");
  assert.equal(detail.versions[0].ownerDepartment, "财务部");
  assert.equal(detail.versions[1].ownerDepartment, "运营部");

  const metricCodeChanged = await call(itemRequest, {
    db,
    session: sessions.executive,
    id,
    path: `/${id}`,
    method: "PUT",
    body: { ...definitionDraft({ metricCode: "sales.changed_code", ownerDepartment: "财务部", expectedVersion: 2, effectiveFrom: "2026-07-23" }) }
  });
  assert.equal(metricCodeChanged.status, 400);
  assert.equal((await body(metricCodeChanged)).error.code, "DATA_STANDARD_INVALID");
});

test("department writers may omit unchanged metadata but cannot transfer ownership", async () => {
  const db = createD1Mock();
  const created = await createDefinition(db, sessions.operations, { metricCode: "sales.partial_update" });
  const id = created.definition.id;
  const partial = await call(itemRequest, {
    db,
    session: sessions.operations,
    id,
    path: `/${id}`,
    method: "PUT",
    body: {
      expectedVersion: 1,
      effectiveFrom: "2026-07-22",
      displayFormula: "净销售额新版求和",
      formulaAst: definitionDraft().formulaAst,
      sourceFields: ["sales.net_sales"]
    }
  });
  assert.equal(partial.status, 200, JSON.stringify(await partial.clone().json()));
  assert.equal((await body(partial)).definition.name, "客单价总额");

  const transfer = await call(itemRequest, {
    db,
    session: sessions.operations,
    id,
    path: `/${id}`,
    method: "PUT",
    body: {
      expectedVersion: 2,
      ownerDepartment: "财务部",
      effectiveFrom: "2026-07-23",
      displayFormula: "净销售额第三版",
      formulaAst: definitionDraft().formulaAst,
      sourceFields: ["sales.net_sales"]
    }
  });
  assert.equal(transfer.status, 403);
  assert.equal((await body(transfer)).error.code, "PERMISSION_WRITE_DENIED");
});

test("PUT merges every omitted unchanged field from the current version", async () => {
  const db = createD1Mock();
  const created = await createDefinition(db, sessions.operations, { metricCode: "sales.minimal_patch" });
  const id = created.definition.id;
  const response = await call(itemRequest, {
    db,
    session: sessions.operations,
    id,
    path: `/${id}`,
    method: "PUT",
    body: { expectedVersion: 1, name: "最小更新", effectiveFrom: "2026-07-22" }
  });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  const detail = (await body(response)).definition;
  assert.equal(detail.name, "最小更新");
  assert.equal(detail.versions[0].displayFormula, "净销售额求和");
  assert.deepEqual(detail.versions[0].formulaAst, definitionDraft().formulaAst);
  assert.deepEqual(detail.versions[0].sourceFields, ["sales.net_sales"]);
});

test("multi-department non-executives cannot transfer a definition between their departments", async () => {
  const db = createD1Mock();
  const multiDepartment = {
    userId: "multi-1",
    name: "多部门员工",
    departments: ["运营部", "财务部"]
  };
  const created = await createDefinition(db, multiDepartment, { metricCode: "sales.multi_department" });
  const id = created.definition.id;
  const response = await call(itemRequest, {
    db,
    session: multiDepartment,
    id,
    path: `/${id}`,
    method: "PUT",
    body: { expectedVersion: 1, ownerDepartment: "财务部", effectiveFrom: "2026-07-22" }
  });
  assert.equal(response.status, 403);
  assert.equal((await body(response)).error.code, "PERMISSION_WRITE_DENIED");
  assert.equal(db.definitions.get(id).owner_department, "运营部");
});

test("server-trusted goods-flow drafts publish null formulas as uncovered while client flags and sales null formulas fail", async () => {
  const db = createD1Mock();
  const goodsFlowDraft = definitionDraft({
    metricCode: "goods_flow.manual_balance",
    name: "人工校准余额",
    category: "goods_flow",
    ownerDepartment: "供应链部",
    unit: "DAY",
    period: "month",
    displayFormula: "等待货流事实接入",
    formulaAst: null,
    sourceFields: []
  });
  const created = await call(collectionRequest, {
    db,
    session: sessions.supply,
    method: "POST",
    body: goodsFlowDraft
  });
  assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
  const createdDefinition = (await body(created)).definition;
  assert.equal(createdDefinition.versions[0].executable, false);
  assert.equal(createdDefinition.versions[0].coverageStatus, "DATA_NOT_COVERED");

  const updated = await call(itemRequest, {
    db,
    session: sessions.supply,
    id: createdDefinition.id,
    path: `/${createdDefinition.id}`,
    method: "PUT",
    body: { expectedVersion: 1, name: "人工校准余额新版", effectiveFrom: "2026-08-01" }
  });
  assert.equal(updated.status, 200, JSON.stringify(await updated.clone().json()));
  const updatedDefinition = (await body(updated)).definition;
  assert.equal(updatedDefinition.versions[0].formulaAst, null);
  assert.equal(updatedDefinition.versions[0].executable, false);
  assert.equal(updatedDefinition.versions[0].coverageStatus, "DATA_NOT_COVERED");

  const clientFlag = await call(collectionRequest, {
    db: createD1Mock(),
    session: sessions.supply,
    method: "POST",
    body: { ...goodsFlowDraft, allowUncoveredSourceCoverage: true }
  });
  assert.equal(clientFlag.status, 400);
  assert.equal((await body(clientFlag)).error.code, "DATA_STANDARD_INVALID");

  const salesNull = await call(collectionRequest, {
    db: createD1Mock(),
    session: sessions.operations,
    method: "POST",
    body: definitionDraft({ metricCode: "sales.null_formula", formulaAst: null, sourceFields: [] })
  });
  assert.equal(salesNull.status, 400);
  assert.equal((await body(salesNull)).error.code, "DATA_STANDARD_INVALID");
});

test("PUT rejects malformed expectedVersion before checking staleness", async () => {
  for (const expectedVersion of [undefined, null, 0, 1.5, "1"]) {
    const db = createD1Mock();
    const created = await createDefinition(db, sessions.operations, { metricCode: `sales.version_${String(expectedVersion).replace(".", "_")}` });
    const id = created.definition.id;
    const response = await call(itemRequest, {
      db,
      session: sessions.operations,
      id,
      path: `/${id}`,
      method: "PUT",
      body: { expectedVersion, effectiveFrom: "2026-07-22" }
    });
    assert.equal(response.status, 400, String(expectedVersion));
    assert.equal((await body(response)).error.code, "DATA_STANDARD_INVALID");
    assert.equal(db.definitions.get(id).current_version, 1);
  }

  const db = createD1Mock();
  const created = await createDefinition(db, sessions.operations, { metricCode: "sales.valid_stale" });
  const id = created.definition.id;
  const stale = await call(itemRequest, {
    db,
    session: sessions.operations,
    id,
    path: `/${id}`,
    method: "PUT",
    body: { expectedVersion: 2, effectiveFrom: "2026-07-22" }
  });
  assert.equal(stale.status, 409);
  assert.equal((await body(stale)).error.code, "DATA_STANDARD_VERSION_CONFLICT");
});

test("list rejects category and ownerDepartment filters longer than forty characters", async () => {
  for (const key of ["category", "ownerDepartment"]) {
    const response = await call(collectionRequest, {
      db: createD1Mock(),
      session: sessions.operations,
      path: `?${key}=${"a".repeat(41)}`
    });
    assert.equal(response.status, 400, key);
    assert.equal((await body(response)).error.code, "DATA_STANDARD_INVALID");
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/brand-content.js";

const executive = { userId: "u-exec", name: "品牌负责人", role: "executive", department: "总经办", title: "总经理" };
const editor = { userId: "u-editor", name: "张煜雷", role: "employee", department: "品牌部", title: "剪辑师" };
const outsider = { userId: "u-finance", name: "财务同事", role: "employee", department: "财务部", title: "会计" };

function createD1Mock() {
  let row = null;
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          calls.push({ type: "run", sql, values: statement.values });
          if (/insert into brand_content_state/i.test(sql)) {
            const [id, version, payload, updatedAt, updatedBy] = statement.values;
            row = { id, version, payload, updated_at: updatedAt, updated_by: updatedBy };
          }
          return { success: true, meta: { changes: 1 } };
        },
        async first() {
          calls.push({ type: "first", sql, values: statement.values });
          if (/from brand_content_state/i.test(sql)) return row;
          return null;
        }
      };
      return statement;
    }
  };
}

function request(method = "GET", body) {
  return new Request("https://flow.example.com/api/brand-content", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

async function call({ db, session = executive, method = "GET", body }) {
  return onRequest({ request: request(method, body), env: db ? { PRODUCT_FLOW_DB: db } : {}, data: session ? { session } : {} });
}

const contentInput = {
  productId: "p-berry",
  productName: "莓果冻干主粮",
  purpose: "product_sale",
  title: "新内容",
  contentDirection: "真实反应",
  directorId: "u-director",
  directorName: "陈悦桐",
  editorId: "u-editor",
  editorName: "张煜雷",
  operatorId: "u-operator",
  operatorName: "官旗运营",
  dueAt: "2026-07-22"
};

test("brand content API requires a session and D1", async () => {
  const unauthenticated = await call({ db: createD1Mock(), session: null });
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).error.code, "AUTH_SESSION_REQUIRED");

  const noDb = await call({ db: null });
  assert.equal(noDb.status, 501);
  assert.equal((await noDb.json()).error.code, "BRAND_CONTENT_STORAGE_UNAVAILABLE");
});

test("empty storage returns no demo business records", async () => {
  const response = await call({ db: createD1Mock() });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.synced, false);
  assert.equal(payload.state, null);
  assert.equal(payload.version, 0);
});

test("brand content API persists one domain action and reads it back", async () => {
  const db = createD1Mock();
  const post = await call({ db, method: "POST", body: { version: 0, action: { type: "create_content", record: contentInput } } });
  const posted = await post.json();
  assert.equal(post.status, 200);
  assert.equal(posted.version, 1);
  assert.equal(posted.state.contents.length, 1);
  assert.equal(posted.state.contents[0].productName, "莓果冻干主粮");

  const get = await call({ db });
  const stored = await get.json();
  assert.equal(get.status, 200);
  assert.equal(stored.synced, true);
  assert.equal(stored.state.contents[0].directorName, "陈悦桐");
});

test("brand content API detects concurrent writes", async () => {
  const db = createD1Mock();
  const first = await call({ db, method: "POST", body: { version: 0, action: { type: "create_content", record: contentInput } } });
  assert.equal(first.status, 200);
  const stale = await call({ db, method: "POST", body: { version: 0, action: { type: "update_settings", patch: { idPrefix: "CONTENT" } } } });
  const payload = await stale.json();
  assert.equal(stale.status, 409);
  assert.equal(payload.error.code, "BRAND_CONTENT_VERSION_CONFLICT");
  assert.equal(payload.version, 1);
});

test("brand content API rejects readonly users and non-brand writers", async () => {
  const readonly = await call({ db: createD1Mock(), session: { ...executive, role: "readonly" }, method: "POST", body: { version: 0, action: { type: "create_content", record: contentInput } } });
  assert.equal(readonly.status, 403);

  const forbidden = await call({ db: createD1Mock(), session: outsider, method: "POST", body: { version: 0, action: { type: "create_content", record: contentInput } } });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, "BRAND_CONTENT_WRITE_DENIED");
});

test("brand content API enforces action roles and rejects unknown actions", async () => {
  const db = createD1Mock();
  const editorCreate = await call({ db, session: editor, method: "POST", body: { version: 0, action: { type: "create_content", record: contentInput } } });
  assert.equal(editorCreate.status, 403);
  assert.equal((await editorCreate.json()).error.code, "BRAND_CONTENT_ACTION_DENIED");

  const unknown = await call({ db, method: "POST", body: { version: 0, action: { type: "delete_everything" } } });
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error.code, "BRAND_CONTENT_ACTION_INVALID");
});

test("OPTIONS advertises GET and POST", async () => {
  const response = await onRequest({ request: request("OPTIONS"), env: {}, data: {} });
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-methods"), /GET/);
  assert.match(response.headers.get("access-control-allow-methods"), /POST/);
});

import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  DeveloperAccessError,
  developerAccessPath,
  loadDeveloperAccess,
  selectLocalRuntime
} from "../scripts/core-developer-access.mjs";
import {
  applyCoreDeveloperProxyHeaders,
  coreDeveloperProxyDecision
} from "../scripts/core-developer-proxy.mjs";
import {
  CoreDeveloperIssuanceError,
  issueCoreDeveloperAccess
} from "../scripts/issue-core-developer-access.mjs";
import { createD1Database } from "../server/aliyun/sqlite-d1.mjs";

async function accessFixture(source, mode = 0o600) {
  const homeDir = await mkdtemp(join(tmpdir(), "pfs-core-access-"));
  const path = developerAccessPath(homeDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source, { mode: 0o600 });
  await chmod(path, mode);
  return loadDeveloperAccess({ homeDir });
}

const validSource = [
  "PRODUCTION_DATA_API_URL=https://deshan-tiyes.cn",
  "PRODUCTION_DATA_ACCESS_TOKEN=test-only-personal-token",
  ""
].join("\n");

test("personal developer access loads only from the fixed 0600 file", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "pfs-core-access-"));
  const path = developerAccessPath(homeDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, validSource, { mode: 0o600 });

  const access = await loadDeveloperAccess({ homeDir });

  assert.equal(path, join(homeDir, ".config", "product-flow-system", "developer.env"));
  assert.equal(access.path, path);
  assert.equal(access.apiUrl, "https://deshan-tiyes.cn");
  assert.equal(access.token.length > 20, true);
  assert.equal(selectLocalRuntime({ access }), "core");
});

test("missing developer access selects the zero-secret sandbox", async () => {
  const homeDir = await mkdtemp(join(tmpdir(), "pfs-core-access-"));
  const access = await loadDeveloperAccess({ homeDir });

  assert.equal(access, null);
  assert.equal(selectLocalRuntime({ access }), "sandbox");
});

test("developer access rejects unsafe files and values", async () => {
  const cases = [
    ["file mode", validSource, 0o644],
    ["HTTP origin", validSource.replace("https://", "http://"), 0o600],
    ["URL path", validSource.replace("deshan-tiyes.cn", "deshan-tiyes.cn/api"), 0o600],
    ["empty Token", validSource.replace("test-only-personal-token", ""), 0o600]
  ];

  for (const [label, source, mode] of cases) {
    await assert.rejects(
      () => accessFixture(source, mode),
      error => error instanceof DeveloperAccessError,
      label
    );
  }
});

test("local core proxy allows the fixed localhost origin and rejects external mutation origins", () => {
  assert.deepEqual(coreDeveloperProxyDecision({
    method: "POST",
    host: "127.0.0.1:8127",
    origin: "http://127.0.0.1:8127"
  }), { allowed: true, status: 200, code: "" });

  assert.deepEqual(coreDeveloperProxyDecision({
    method: "POST",
    host: "127.0.0.1:8127",
    origin: "https://evil.example"
  }), { allowed: false, status: 403, code: "CORE_DEVELOPER_PROXY_ORIGIN_FORBIDDEN" });

  assert.deepEqual(coreDeveloperProxyDecision({
    method: "POST",
    host: "127.0.0.1:8127",
    origin: ""
  }), { allowed: false, status: 403, code: "CORE_DEVELOPER_PROXY_ORIGIN_REQUIRED" });
});

test("local core proxy injects the private token upstream and removes browser origin metadata", () => {
  const headers = new Map([
    ["origin", "http://127.0.0.1:8127"],
    ["referer", "http://127.0.0.1:8127/#dashboard"]
  ]);
  const proxyRequest = {
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    removeHeader(name) { headers.delete(name.toLowerCase()); }
  };

  applyCoreDeveloperProxyHeaders(proxyRequest, "server-only-test-token");

  assert.equal(headers.get("x-pfs-core-developer-token"), "server-only-test-token");
  assert.equal(headers.has("origin"), false);
  assert.equal(headers.has("referer"), false);
});

async function issuanceFixture({ active = 1, unionId = "union-dev-1" } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "pfs-core-issue-"));
  const db = createD1Database({ file: join(directory, "control.sqlite") });
  await db.exec(`CREATE TABLE product_flow_org_members (
    corp_id TEXT NOT NULL, user_id TEXT NOT NULL, union_id TEXT, name TEXT NOT NULL,
    department TEXT, title TEXT, role TEXT NOT NULL, active INTEGER NOT NULL, synced_at TEXT NOT NULL,
    PRIMARY KEY (corp_id, user_id)
  )`);
  await db.prepare(`INSERT INTO product_flow_org_members
    (corp_id, user_id, union_id, name, department, title, role, active, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    "corp-main", "developer-1", unionId, "测试开发者", "产品部", "产品经理", "product", active,
    "2026-08-07T08:00:00.000Z"
  ).run();
  return { directory, db, outputPath: join(directory, "delivery", "developer.env") };
}

test("controlled issuance stores only a hash and writes one private developer file", async () => {
  const fixture = await issuanceFixture();
  try {
    const result = await issueCoreDeveloperAccess({
      db: fixture.db,
      userId: "developer-1",
      outputPath: fixture.outputPath,
      apiUrl: "https://deshan-tiyes.cn",
      now: new Date("2026-08-07T08:30:00.000Z"),
      randomBytes: () => Buffer.alloc(32, 7),
      repositoryRoots: []
    });
    const tokenRow = await fixture.db.prepare("SELECT * FROM production_data_access_tokens WHERE user_id = ?")
      .bind("developer-1").first();
    const source = await readFile(fixture.outputPath, "utf8");

    assert.deepEqual(JSON.parse(tokenRow.capabilities), ["read", "write", "core_developer"]);
    assert.match(tokenRow.token_hash, /^[a-f0-9]{64}$/);
    assert.equal((await stat(fixture.outputPath)).mode & 0o777, 0o600);
    assert.match(source, /^PRODUCTION_DATA_API_URL=https:\/\/deshan-tiyes\.cn$/m);
    assert.match(source, /^PRODUCTION_DATA_ACCESS_TOKEN=pfs_dev_/m);
    assert.equal(JSON.stringify(result).includes("pfs_dev_"), false);
    assert.deepEqual(Object.keys(result).sort(), ["expiresAt", "fingerprint", "path"]);
  } finally {
    await fixture.db.close();
  }
});

test("controlled issuance rejects inactive, incomplete, duplicate, and repository-contained targets", async () => {
  for (const identity of [{ active: 0 }, { unionId: "" }]) {
    const fixture = await issuanceFixture(identity);
    try {
      await assert.rejects(() => issueCoreDeveloperAccess({
        db: fixture.db,
        userId: "developer-1",
        outputPath: fixture.outputPath,
        apiUrl: "https://deshan-tiyes.cn",
        repositoryRoots: []
      }), error => error instanceof CoreDeveloperIssuanceError);
    } finally {
      await fixture.db.close();
    }
  }

  const fixture = await issuanceFixture();
  try {
    const options = {
      db: fixture.db,
      userId: "developer-1",
      outputPath: fixture.outputPath,
      apiUrl: "https://deshan-tiyes.cn",
      repositoryRoots: []
    };
    await issueCoreDeveloperAccess(options);
    await assert.rejects(() => issueCoreDeveloperAccess({
      ...options,
      outputPath: join(fixture.directory, "delivery", "duplicate.env")
    }), error =>
      error instanceof CoreDeveloperIssuanceError && error.code === "CORE_DEVELOPER_TOKEN_EXISTS"
    );
    await assert.rejects(() => issueCoreDeveloperAccess({
      ...options,
      outputPath: join(fixture.directory, "inside-repo.env"),
      repositoryRoots: [fixture.directory]
    }), error => error instanceof CoreDeveloperIssuanceError && error.code === "CORE_DEVELOPER_OUTPUT_FORBIDDEN");
  } finally {
    await fixture.db.close();
  }
});

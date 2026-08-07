import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
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

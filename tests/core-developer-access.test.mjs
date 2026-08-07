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


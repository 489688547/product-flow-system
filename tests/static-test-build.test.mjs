import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const runtimeBuild = resolve(root, "scripts/prepare-runtime-build.mjs");

test("runtime build contract has one root entry and no Cloudflare function artifacts", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  assert.match(pkg.scripts.build, /prepare-runtime-build\.mjs/);
  assert.equal("release:pages" in pkg.scripts, false);
  assert.equal(readFileSync(resolve(root, "_redirects"), "utf8").trim(), "/* /index.html 200");
  assert.equal(existsSync(resolve(root, "cloudflare-entry.html")), false);
  assert.equal(existsSync(resolve(root, "public/_routes.json")), false);
  assert.equal(existsSync(resolve(root, "scripts/prepare-pages-release.mjs")), false);
});

test("runtime build injects commit metadata without producing Pages Functions routes", () => {
  const fixture = mkdtempSync(resolve(tmpdir(), "pfs-runtime-build-"));
  mkdirSync(resolve(fixture, "dist"));
  writeFileSync(resolve(fixture, "dist/index.html"), "<!doctype html><html><head></head><body></body></html>");
  writeFileSync(resolve(fixture, "_headers"), "/*\n  Cache-Control: no-store\n");
  writeFileSync(resolve(fixture, "_redirects"), "/* /index.html 200\n");

  const result = spawnSync(process.execPath, [runtimeBuild], {
    cwd: fixture,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_SHA: "1111111111111111",
      PFS_BUILD_COMMIT: "abcdef1234567890",
      VITE_PFS_API_ORIGIN: "https://api-test.deshan-tiyes.cn"
    }
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(resolve(fixture, "dist/index.html"), "utf8"), /pfs-release-commit" content="abcdef1234567890"/);
  assert.equal(existsSync(resolve(fixture, "dist/_headers")), true);
  assert.equal(existsSync(resolve(fixture, "dist/_redirects")), true);
  assert.equal(existsSync(resolve(fixture, "dist/cloudflare-entry.html")), false);
  assert.equal(existsSync(resolve(fixture, "dist/_routes.json")), false);
});

test("static test build rejects a non-HTTPS API origin", () => {
  const fixture = mkdtempSync(resolve(tmpdir(), "pfs-runtime-build-invalid-"));
  mkdirSync(resolve(fixture, "dist"));
  writeFileSync(resolve(fixture, "dist/index.html"), "<!doctype html><html><head></head><body></body></html>");
  writeFileSync(resolve(fixture, "_headers"), "/*\n  Cache-Control: no-store\n");
  writeFileSync(resolve(fixture, "_redirects"), "/* /index.html 200\n");
  const result = spawnSync(process.execPath, [runtimeBuild], {
    cwd: fixture,
    encoding: "utf8",
    env: { ...process.env, GITHUB_SHA: "abcdef1234567890", VITE_PFS_API_ORIGIN: "http://api-test.deshan-tiyes.cn" }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /HTTPS/);
});

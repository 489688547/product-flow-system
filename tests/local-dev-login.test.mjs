import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("local previews expose a local-only executive login", () => {
  assert.match(html, /id="localDevLogin"/, "login screen should include a local test login button");
  assert.match(html, /function isLocalPreview\(\)/, "local test login should be gated by a local preview check");
  assert.match(html, /localDevLogin[\s\S]*?loginLocalDev/, "local test login button should call the local dev login handler");
  assert.match(html, /role:\s*"executive"/, "local test login should enter as executive for full local testing");
});

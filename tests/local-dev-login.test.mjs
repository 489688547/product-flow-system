import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("local previews expose a local-only executive login", () => {
  assert.doesNotMatch(html, /<button[^>]+id="localDevLogin"/, "production HTML should not render a static local test login button");
  assert.match(html, /function isLocalPreview\(\)/, "local test login should be gated by a local preview check");
  assert.match(html, /createLocalDevLoginButton/, "local test login button should be created only by local preview code");
  assert.match(html, /localDevButton\.onclick = loginLocalDev/, "local test login button should call the local dev login handler");
  assert.match(html, /role:\s*"executive"/, "local test login should enter as executive for full local testing");
});

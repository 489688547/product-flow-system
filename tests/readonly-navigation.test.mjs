import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("readonly users can view demand pool and workflow without edit permissions", () => {
  const roleMatch = html.match(/readonly:\s*\{([\s\S]*?)\n\s*\}/);
  assert.ok(roleMatch, "readonly role profile should exist");

  const screensMatch = roleMatch[1].match(/screens:\s*\[([^\]]+)\]/);
  assert.ok(screensMatch, "readonly role should define screens");

  const screens = [...screensMatch[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.ok(screens.includes("demands"), "readonly users should still see the demand pool");
  assert.ok(screens.includes("workflow"), "readonly users should still see product progress");
  assert.match(roleMatch[1], /permissions:\s*\{\s*\}/, "readonly users must not gain edit permissions");
});

test("stale DingTalk readonly cache is cleared so the user can be remapped", () => {
  assert.match(
    html,
    /parsed\.source === "dingtalk" && parsed\.role === "readonly"[\s\S]*?localStorage\.removeItem\("productFlowUser"\)/,
    "DingTalk readonly cache should be discarded after permission mapping changes"
  );
});

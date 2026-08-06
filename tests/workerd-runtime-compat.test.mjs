import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("ECS workerd runtime uses local SQLite bindings only", () => {
  const source = readFileSync(resolve("deploy/aliyun/wrangler.toml"), "utf8");

  assert.match(source, /binding = "PRODUCT_FLOW_DB"/);
  assert.match(source, /binding = "DEMO_FLOW_DB"/);
  assert.match(source, /remote = false/);
  assert.doesNotMatch(source, /remote = true/);
  assert.doesNotMatch(source, /\[.*secrets\]/);
  assert.doesNotMatch(source, /\bcompatibility_flags\s*=\s*\[[^\]]*"nodejs_compat"/);
});

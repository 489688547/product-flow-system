import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("display D1 binding uses the Pages-compatible Wrangler contract", () => {
  const source = readFileSync(resolve("wrangler.toml"), "utf8");

  assert.match(source, /binding = "PRODUCT_FLOW_DB"/);
  assert.match(source, /binding = "DEMO_FLOW_DB"/);
  assert.doesNotMatch(source, /\[.*secrets\]/);
  assert.doesNotMatch(source, /\bcompatibility_flags\s*=\s*\[[^\]]*"nodejs_compat"/);
});

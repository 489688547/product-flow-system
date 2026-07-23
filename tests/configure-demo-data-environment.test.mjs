import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { configureDemoDataEnvironment } from "../scripts/configure-demo-data-environment.mjs";

test("demo data environment configures one hidden masking key for local preview and production", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "pfs-demo-config-"));
  const envPath = resolve(directory, ".env");
  writeFileSync(envPath, "EXISTING=value\n", { mode: 0o600 });
  const calls = [];
  try {
    const result = configureDemoDataEnvironment({
      envPath,
      run: (_command, args, options) => {
        calls.push({ args, input: options.input });
        return "";
      },
      randomBytes: () => Buffer.alloc(32, 7)
    });
    const local = readFileSync(envPath, "utf8");
    const values = calls.map(call => call.input.trim());
    assert.match(local, /^DEMO_DATA_MASKING_KEY=[A-Za-z0-9_-]{43}$/m);
    assert.deepEqual(calls.map(call => call.args.at(-1)), ["preview", "production"]);
    assert.equal(new Set(values).size, 1);
    assert.equal(JSON.stringify(result).includes(values[0]), false);
    assert.deepEqual(result, {
      configuredEnvironments: ["preview", "production"],
      configuredNames: ["DEMO_DATA_MASKING_KEY"]
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

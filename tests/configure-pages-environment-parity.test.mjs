import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("scripts/configure-pages-environment-parity.mjs");
const providerValues = {
  DINGTALK_APP_KEY: "ding-key-value",
  DINGTALK_APP_SECRET: "ding-secret-value",
  KUAIMAI_ACCESS_TOKEN: "kuaimai-access-value",
  KUAIMAI_APP_KEY: "kuaimai-key-value",
  KUAIMAI_APP_SECRET: "kuaimai-secret-value",
  KUAIMAI_REFRESH_TOKEN: "kuaimai-refresh-value"
};

function envFile(values = providerValues) {
  const root = mkdtempSync(join(tmpdir(), "pfs-pages-secrets-"));
  const path = join(root, ".env");
  writeFileSync(path, Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
  return path;
}

function runner(vaultCount = 0) {
  const calls = [];
  const run = (command, args, options = {}) => {
    calls.push({ command, args: [...args], input: options.input || "" });
    if (args.includes("d1")) {
      return JSON.stringify([{ results: [{ count: vaultCount }], success: true }]);
    }
    return "ok";
  };
  return { calls, run };
}

test("an existing encrypted vault aborts before any secret or env write", async () => {
  const { configurePagesEnvironmentParity } = await import(scriptPath);
  const path = envFile();
  const before = readFileSync(path, "utf8");
  const fake = runner(1);

  assert.throws(() => configurePagesEnvironmentParity({
    envPath: path,
    projectName: "product-flow-system",
    run: fake.run,
    randomBytes: () => Buffer.alloc(32, 7)
  }), /已有密文/);

  assert.equal(readFileSync(path, "utf8"), before);
  assert.equal(fake.calls.filter(call => call.args.includes("secret")).length, 0);
});

test("empty vault configures one shared key and Preview provider secrets through stdin only", async () => {
  const { configurePagesEnvironmentParity } = await import(scriptPath);
  const path = envFile();
  const fake = runner(0);

  const result = configurePagesEnvironmentParity({
    envPath: path,
    projectName: "product-flow-system",
    run: fake.run,
    randomBytes: () => Buffer.alloc(32, 7)
  });

  const secretCalls = fake.calls.filter(call => call.args.includes("secret") && call.args.includes("put"));
  assert.equal(secretCalls.length, 8);
  assert.equal(secretCalls.filter(call => call.args.includes("preview")).length, 7);
  assert.equal(secretCalls.filter(call => call.args.includes("production")).length, 1);
  assert.equal(secretCalls.every(call => call.input.trim().length > 0), true);
  for (const value of Object.values(providerValues)) {
    assert.equal(secretCalls.some(call => call.args.includes(value)), false);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(value));
  }
  assert.deepEqual(result.configuredEnvironments, ["preview", "production"]);
  assert.equal(result.configuredNames.includes("PLATFORM_CREDENTIAL_MASTER_KEY"), true);
  assert.match(readFileSync(path, "utf8"), /^PLATFORM_CREDENTIAL_MASTER_KEY=[A-Za-z0-9_-]{43}$/m);
});

test("repeated configuration reuses one local key without duplicating the env entry", async () => {
  const { configurePagesEnvironmentParity } = await import(scriptPath);
  const path = envFile();
  const firstRunner = runner(0);
  configurePagesEnvironmentParity({ envPath: path, run: firstRunner.run, randomBytes: () => Buffer.alloc(32, 3) });
  const first = readFileSync(path, "utf8");
  const secondRunner = runner(0);
  configurePagesEnvironmentParity({ envPath: path, run: secondRunner.run, randomBytes: () => Buffer.alloc(32, 9) });
  const second = readFileSync(path, "utf8");

  assert.equal((second.match(/^PLATFORM_CREDENTIAL_MASTER_KEY=/gm) || []).length, 1);
  assert.equal(second.match(/^PLATFORM_CREDENTIAL_MASTER_KEY=(.*)$/m)[1], first.match(/^PLATFORM_CREDENTIAL_MASTER_KEY=(.*)$/m)[1]);
});

test("missing local provider values abort before changing Cloudflare", async () => {
  const { configurePagesEnvironmentParity } = await import(scriptPath);
  const path = envFile({ DINGTALK_APP_KEY: "only-one-value" });
  const fake = runner(0);

  assert.throws(() => configurePagesEnvironmentParity({ envPath: path, run: fake.run }), /DINGTALK_APP_SECRET/);
  assert.equal(fake.calls.filter(call => call.args.includes("secret")).length, 0);
});

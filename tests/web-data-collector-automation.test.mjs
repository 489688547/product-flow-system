import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EXTENSION_ID,
  collectorLaunchAgentPlist,
  installLaunchAgent,
  resolveStableCollectorPath,
  validatePairingKey,
  validateRunnerToken
} from "../scripts/web-data-collector/automation.mjs";

test("web collector validates separate runner and pairing secrets", () => {
  assert.equal(validateRunnerToken(`wdc_${"a".repeat(48)}`), true);
  assert.equal(validatePairingKey(`wcp_${"b".repeat(48)}`), true);
  assert.equal(validateRunnerToken(`wcp_${"b".repeat(48)}`), false);
  assert.match(EXTENSION_ID, /^[a-p]{32}$/);
});

test("LaunchAgent keeps the loopback runner alive and pins the repository entrypoint", () => {
  const plist = collectorLaunchAgentPlist({
    nodePath: "/usr/local/bin/node",
    collectorPath: "/repo/scripts/web-data-collector/index.mjs",
    root: "/Users/company/Desktop/company-data-archive",
    baseUrl: "https://flow.example.com",
    home: "/Users/company"
  });
  assert.match(plist, /com\.company\.web-data-collector/);
  assert.match(plist, /<string>serve<\/string>/);
  assert.match(plist, /<string>--browser-mode<\/string>\s*<string>extension<\/string>/);
  assert.match(plist, /<key>KeepAlive<\/key>/);
  assert.match(plist, /<true\/>/);
  assert.match(plist, /\/Users\/company\/Library\/Logs\/product-flow\/com\.company\.web-data-collector\.log/);
  assert.doesNotMatch(plist, /Desktop\/company-data-archive\/处理报告/);
  assert.doesNotMatch(plist, /pairing|wdc_|wcp_/i);
});

test("LaunchAgent resolves a temporary worktree entrypoint back to the primary checkout", () => {
  assert.equal(resolveStableCollectorPath({
    collectorPath: "/repo/.worktrees/data-sync-fix/scripts/web-data-collector/index.mjs",
    worktreeRoot: "/repo/.worktrees/data-sync-fix",
    gitCommonDir: "/repo/.git"
  }), "/repo/scripts/web-data-collector/index.mjs");

  assert.equal(resolveStableCollectorPath({
    collectorPath: "/repo/scripts/web-data-collector/index.mjs",
    worktreeRoot: "/repo",
    gitCommonDir: "/repo/.git"
  }), "/repo/scripts/web-data-collector/index.mjs");
});

test("LaunchAgent installer preserves the requested dedicated fallback mode", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "web-collector-agent-"));
  const commands = [];
  try {
    const result = await installLaunchAgent({
      nodePath: "/usr/local/bin/node",
      collectorPath: "/repo/scripts/web-data-collector/index.mjs",
      root: "/Users/company/Desktop/company-data-archive",
      baseUrl: "https://flow.example.com",
      browserMode: "dedicated",
      home,
      command: async (program, args) => {
        commands.push([program, args]);
        if (program === "/usr/bin/git") return { stdout: "/repo\n/repo/.git\n" };
        return { stdout: "" };
      }
    });
    const plist = await readFile(result.plistPath, "utf8");
    const logDirectory = path.join(home, "Library", "Logs", "product-flow");
    assert.match(plist, /<string>--browser-mode<\/string>\s*<string>dedicated<\/string>/);
    assert.equal((await stat(logDirectory)).mode & 0o777, 0o700);
    assert.equal(commands.some(([program, args]) => (
      program === "/bin/launchctl" && args[0] === "bootstrap"
    )), true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("LaunchAgent pins formal Ego mode and its absolute CLI without secrets", () => {
  const plist = collectorLaunchAgentPlist({
    nodePath: "/usr/local/bin/node",
    collectorPath: "/repo/scripts/web-data-collector/index.mjs",
    root: "/Users/company/Desktop/company-data-archive",
    baseUrl: "https://deshan-tiyes.cn",
    browserMode: "ego",
    egoCli: "/Applications/ego lite.app/Contents/MacOS/ego lite"
  });

  assert.match(plist, /<string>--browser-mode<\/string>\s*<string>ego<\/string>/);
  assert.match(plist, /<string>--ego-cli<\/string>\s*<string>\/Applications\/ego lite\.app\/Contents\/MacOS\/ego lite<\/string>/);
  assert.doesNotMatch(plist, /wdc_|wcp_|Cookie|Task Space/i);
});

test("Ego switch script gates Aliyun before changing the LaunchAgent", async () => {
  const script = await readFile(new URL("../scripts/switch-collector-to-ego.sh", import.meta.url), "utf8");
  const targetGate = script.indexOf('[ "$BASE_URL" = "https://deshan-tiyes.cn" ]');
  const reachabilityGate = script.indexOf("curl -fsS --max-time 10");
  const installStep = script.indexOf("index.mjs\" install");

  assert.ok(targetGate >= 0 && reachabilityGate > targetGate);
  assert.ok(installStep > reachabilityGate, "Aliyun checks must finish before installing the LaunchAgent");
  assert.match(script, /\/Users\/roger\/Desktop\/EC-management-system/);
  assert.match(script, /--browser-mode ego/);
  assert.match(script, /--ego-cli/);
  assert.match(script, /17653/);
  assert.match(script, /codeVersion/);
  assert.match(script, /probe-ego/);
});

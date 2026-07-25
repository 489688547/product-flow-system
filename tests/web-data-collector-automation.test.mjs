import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
    baseUrl: "https://flow.example.com"
  });
  assert.match(plist, /com\.company\.web-data-collector/);
  assert.match(plist, /<string>serve<\/string>/);
  assert.match(plist, /<string>--browser-mode<\/string>\s*<string>extension<\/string>/);
  assert.match(plist, /<key>KeepAlive<\/key>/);
  assert.match(plist, /<true\/>/);
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
    assert.match(plist, /<string>--browser-mode<\/string>\s*<string>dedicated<\/string>/);
    assert.equal(commands.some(([program, args]) => (
      program === "/bin/launchctl" && args[0] === "bootstrap"
    )), true);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

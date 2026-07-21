import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const scriptPath = resolve("scripts/check-branch-base.mjs");

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commit(cwd, name, content) {
  writeFileSync(join(cwd, name), content);
  git(cwd, "add", name);
  git(cwd, "commit", "-m", `test: ${name}`);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pfs-branch-base-"));
  const remote = join(root, "remote.git");
  const local = join(root, "local");
  const peer = join(root, "peer");
  git(root, "init", "--bare", remote);
  git(root, "clone", remote, local);
  git(local, "config", "user.email", "tests@example.com");
  git(local, "config", "user.name", "Tests");
  git(local, "checkout", "-b", "main");
  commit(local, "base.txt", "base\n");
  git(local, "push", "-u", "origin", "main");
  git(root, "clone", remote, peer);
  git(peer, "config", "user.email", "tests@example.com");
  git(peer, "config", "user.name", "Tests");
  git(peer, "checkout", "main");
  return { local, peer };
}

test("a local branch named main is stale when origin/main advances", async () => {
  const { checkBranchBase } = await import(scriptPath);
  const { local, peer } = fixture();
  commit(peer, "remote.txt", "new main\n");
  git(peer, "push", "origin", "main");

  const result = checkBranchBase(local, {}, { refresh: true });

  assert.equal(result.branch, "main");
  assert.equal(result.current, false);
  assert.match(result.reason, /没有包含最新 origin\/main/);
});

test("a feature branch containing fetched origin/main is current", async () => {
  const { checkBranchBase } = await import(scriptPath);
  const { local, peer } = fixture();
  commit(peer, "remote.txt", "new main\n");
  git(peer, "push", "origin", "main");
  git(local, "fetch", "origin", "main");
  git(local, "merge", "--ff-only", "origin/main");
  git(local, "checkout", "-b", "codex/current-feature");
  commit(local, "feature.txt", "feature\n");

  const result = checkBranchBase(local, {}, { refresh: true });

  assert.equal(result.branch, "codex/current-feature");
  assert.equal(result.current, true);
});

test("a refresh failure is reported without treating the branch as current", async () => {
  const { checkBranchBase } = await import(scriptPath);
  const { local } = fixture();
  git(local, "remote", "set-url", "origin", join(local, "missing.git"));

  const result = checkBranchBase(local, {}, { refresh: true });

  assert.equal(result.current, false);
  assert.match(result.reason, /无法获取最新 origin\/main/);
});

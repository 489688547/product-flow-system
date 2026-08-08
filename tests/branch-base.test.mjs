import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { checkBranchBase, isReleaseLane, requiredBaseRef } from "../scripts/check-branch-base.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commit(dir, file, content, message) {
  writeFileSync(join(dir, file), content);
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", message);
}

function createRepo(t) {
  const dir = mkdtempSync(join(tmpdir(), "branch-base-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "test");
  git(dir, "config", "commit.gpgsign", "false");
  commit(dir, "a.txt", "a\n", "初始提交");
  return dir;
}

// 复刻真实发布拓扑：dev 上有新提交，main 通过合并提交拿到其中一部分，dev 之后继续前进。
function releaseTopology(t) {
  const dir = createRepo(t);
  git(dir, "checkout", "-q", "-b", "dev");
  commit(dir, "b.txt", "b\n", "功能提交 B");
  const released = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "main");
  git(dir, "merge", "-q", "--no-ff", "-m", "Merge pull request from dev", "dev");
  git(dir, "checkout", "-q", "dev");
  commit(dir, "c.txt", "c\n", "功能提交 C");
  git(dir, "update-ref", "refs/remotes/origin/main", git(dir, "rev-parse", "main"));
  git(dir, "update-ref", "refs/remotes/origin/dev", git(dir, "rev-parse", "dev"));
  return { dir, released };
}

const RELEASE_ENV = { GITHUB_BASE_REF: "main", GITHUB_HEAD_REF: "dev" };

test("发布通道：main 只多出发布合并提交时通过，不再要求 dev 先回同步", t => {
  const { dir } = releaseTopology(t);

  // 前提：main 确实不是 dev 的祖先，旧的祖先判定必然失败。
  assert.throws(
    () => git(dir, "merge-base", "--is-ancestor", "origin/main", "HEAD"),
    "发布合并提交应当只存在于 main 上，否则这个用例没有覆盖到目标场景"
  );

  const result = checkBranchBase(dir, RELEASE_ENV);
  assert.equal(result.lane, "release");
  assert.equal(result.current, true, result.reason);
});

test("发布通道：main 上有 dev 缺失的真实改动时必须失败", t => {
  const { dir } = releaseTopology(t);
  git(dir, "checkout", "-q", "main");
  commit(dir, "hotfix.txt", "hotfix\n", "直接落在 main 的改动");
  git(dir, "update-ref", "refs/remotes/origin/main", git(dir, "rev-parse", "main"));
  git(dir, "checkout", "-q", "dev");

  const result = checkBranchBase(dir, RELEASE_ENV);
  assert.equal(result.lane, "release");
  assert.equal(result.current, false);
  assert.match(result.reason, /含有 dev 缺失的改动/);
});

test("发布通道：dev 与 main 完全一致时通过", t => {
  const dir = createRepo(t);
  git(dir, "checkout", "-q", "-b", "dev");
  git(dir, "update-ref", "refs/remotes/origin/main", git(dir, "rev-parse", "main"));
  git(dir, "update-ref", "refs/remotes/origin/dev", git(dir, "rev-parse", "dev"));

  const result = checkBranchBase(dir, RELEASE_ENV);
  assert.equal(result.current, true, result.reason);
});

test("功能通道保持严格祖先判定，落后 dev 的分支仍然被拒", t => {
  const dir = createRepo(t);
  const base = git(dir, "rev-parse", "HEAD");
  git(dir, "checkout", "-q", "-b", "dev");
  commit(dir, "b.txt", "b\n", "dev 前进");
  git(dir, "update-ref", "refs/remotes/origin/dev", git(dir, "rev-parse", "dev"));
  git(dir, "checkout", "-q", "-b", "codex/stale", base);

  const result = checkBranchBase(dir, { GITHUB_BASE_REF: "dev", GITHUB_HEAD_REF: "codex/stale" });
  assert.equal(result.lane, "feature");
  assert.equal(result.current, false);
  // 旧实现无论目标分支是什么都提示 rebase origin/main，照做并不能修好这个失败。
  assert.match(result.reason, /git rebase origin\/dev/);
  assert.doesNotMatch(result.reason, /origin\/main/);
});

test("功能通道：已包含最新 dev 的分支通过", t => {
  const dir = createRepo(t);
  git(dir, "checkout", "-q", "-b", "dev");
  commit(dir, "b.txt", "b\n", "dev 前进");
  git(dir, "update-ref", "refs/remotes/origin/dev", git(dir, "rev-parse", "dev"));
  git(dir, "checkout", "-q", "-b", "codex/fresh");
  commit(dir, "d.txt", "d\n", "功能提交");

  const result = checkBranchBase(dir, { GITHUB_BASE_REF: "dev", GITHUB_HEAD_REF: "codex/fresh" });
  assert.equal(result.current, true, result.reason);
});

test("缺少远端基线时给出对应分支的 fetch 指引", t => {
  const dir = createRepo(t);
  git(dir, "checkout", "-q", "-b", "codex/x");
  const result = checkBranchBase(dir, { GITHUB_BASE_REF: "dev", GITHUB_HEAD_REF: "codex/x" });
  assert.equal(result.current, false);
  assert.match(result.reason, /git fetch origin dev/);
});

test("本地运行时按分支名推断目标，功能分支默认对比 dev", () => {
  assert.equal(requiredBaseRef({}, "codex/x"), "origin/dev");
  assert.equal(requiredBaseRef({}, "claude/x"), "origin/dev");
  assert.equal(requiredBaseRef({}, "chore/x"), "origin/dev");
  assert.equal(requiredBaseRef({}, "dev"), "origin/main");
  assert.equal(requiredBaseRef({}, ""), "origin/main");
  // pull_request 事件里的显式声明始终优先。
  assert.equal(requiredBaseRef({ GITHUB_BASE_REF: "main" }, "codex/x"), "origin/main");
});

test("只有 dev → main 才是发布通道", () => {
  assert.equal(isReleaseLane("dev", "origin/main"), true);
  assert.equal(isReleaseLane("codex/x", "origin/main"), false);
  assert.equal(isReleaseLane("dev", "origin/dev"), false);
  assert.equal(isReleaseLane("main", "origin/main"), false);
});

test("quality 工作流在 PR 正文变更后重新校验声明门", () => {
  const workflow = readFileSync(resolve(".github/workflows/quality.yml"), "utf8");
  // CI 只读 pull_request 事件负载，不订阅 edited 就只能靠推空提交来纠正写错的声明。
  assert.match(workflow, /types:\s*\[opened,\s*synchronize,\s*reopened,\s*edited\]/);
});

test("分支基线检查只在 pull_request 事件运行", () => {
  const workflow = readFileSync(resolve(".github/workflows/quality.yml"), "utf8");
  const step = workflow.match(/- if: [^\n]*\n\s*run: npm run check:branch-base/);
  assert.ok(step, "check:branch-base 必须带 if 条件，push 事件上它没有防御价值");
  assert.match(step[0], /github\.event_name == 'pull_request'/);
});

test("回同步工作流已随发布通道判定一并移除", () => {
  assert.equal(existsSync(resolve(".github/workflows/sync-main-to-dev.yml")), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEFAULT_GRACE_MINUTES,
  checkProductionDrift,
  evaluateDrift
} from "../scripts/check-production-drift.mjs";

const MAIN = "b78a3ebf1062f0d5b0d3a2f1c4e5a6b7c8d9e0f1";
const PREVIOUS = "85393ce41c56f493ba2ef56f45606da3c6fb84fe";
const NOW = 1_770_000_000_000;

function minutesAgo(minutes) {
  return NOW - minutes * 60_000;
}

test("生产站已在 main 时不算漂移", () => {
  const result = evaluateDrift({
    deployedCommit: MAIN,
    expectedCommit: MAIN,
    commitTimestampMs: minutesAgo(5),
    nowMs: NOW
  });
  assert.equal(result.status, "current");
  assert.equal(result.drifted, false);
});

test("短 commit 与长 commit 互为前缀时视为同一版本", () => {
  const result = evaluateDrift({
    deployedCommit: MAIN.slice(0, 12),
    expectedCommit: MAIN,
    commitTimestampMs: minutesAgo(5),
    nowMs: NOW
  });
  assert.equal(result.status, "current");
});

test("发布刚完成、仍在宽限期内的落后不报警", () => {
  // 链路本身是异步的：构建镜像、推送 ACR、最多两分钟轮询、备份、换容器。
  const result = evaluateDrift({
    deployedCommit: PREVIOUS,
    expectedCommit: MAIN,
    commitTimestampMs: minutesAgo(10),
    nowMs: NOW
  });
  assert.equal(result.status, "deploying");
  assert.equal(result.drifted, false);
  assert.equal(result.ageMinutes, 10);
});

test("超过宽限期仍未部署则判定漂移并指出可能断点", () => {
  const result = evaluateDrift({
    deployedCommit: PREVIOUS,
    expectedCommit: MAIN,
    commitTimestampMs: minutesAgo(DEFAULT_GRACE_MINUTES + 30),
    nowMs: NOW
  });
  assert.equal(result.status, "stale");
  assert.equal(result.drifted, true);
  assert.match(result.message, /ACR/);
  assert.match(result.message, /rollout/);
});

test("宽限期边界按包含处理，恰好到点不报警", () => {
  const result = evaluateDrift({
    deployedCommit: PREVIOUS,
    expectedCommit: MAIN,
    commitTimestampMs: minutesAgo(DEFAULT_GRACE_MINUTES),
    nowMs: NOW
  });
  assert.equal(result.drifted, false);
});

test("生产站不返回 commit 时判定漂移而不是静默通过", () => {
  const result = evaluateDrift({
    deployedCommit: "",
    expectedCommit: MAIN,
    commitTimestampMs: minutesAgo(5),
    nowMs: NOW
  });
  assert.equal(result.status, "unknown");
  assert.equal(result.drifted, true);
});

test("缺少有效预期 commit 时失败关闭", () => {
  assert.throws(
    () => evaluateDrift({ deployedCommit: MAIN, expectedCommit: "", nowMs: NOW }),
    /缺少有效的预期 commit/
  );
});

test("站点不可访问时判定漂移，不把网络故障当成部署正常", async () => {
  const result = await checkProductionDrift({
    url: "https://deshan-tiyes.cn",
    expectedCommit: MAIN,
    commitTimestampMs: minutesAgo(5),
    nowMs: NOW,
    fetchImpl: async () => {
      throw new Error("ECONNRESET");
    }
  });
  assert.equal(result.status, "unreachable");
  assert.equal(result.drifted, true);
});

test("从生产站 HTML 读取部署 commit", async () => {
  const html = `<!doctype html><meta name="pfs-release-commit" content="${MAIN}">`;
  const result = await checkProductionDrift({
    url: "https://deshan-tiyes.cn/",
    expectedCommit: MAIN,
    commitTimestampMs: minutesAgo(5),
    nowMs: NOW,
    fetchImpl: async () => ({ ok: true, text: async () => html })
  });
  assert.equal(result.status, "current");
});

test("漂移检查工作流按计划运行并复用同一脚本", () => {
  const workflow = readFileSync(resolve(".github/workflows/production-drift.yml"), "utf8");
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /scripts\/check-production-drift\.mjs/);
  assert.match(workflow, /contents:\s*read/);
  // 漂移检查只读，不得具备改动仓库或部署的权限。
  assert.doesNotMatch(workflow, /contents:\s*write|packages:\s*write|id-token:\s*write/);
});

test("固定站点冒烟的等待窗口区分生产与测试", () => {
  const workflow = readFileSync(resolve(".github/workflows/deployed-smoke.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  // 生产链路是构建镜像 + 推 ACR + 最多两分钟轮询 + 备份 + 换容器，5 分钟窗口必然误报。
  assert.match(workflow, /SMOKE_ATTEMPTS/);
  assert.match(workflow, /SMOKE_INTERVAL/);
});

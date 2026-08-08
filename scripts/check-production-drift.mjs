import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { commitFromHtml, sameCommit } from "./check-deployed-smoke.mjs";

// 生产发布链路是异步的：镜像构建并推送到 ACR，ECS 上的 rollout timer 每两分钟轮询一次，
// 命中后还要先备份再替换容器。因此「生产 commit 落后 main」在发布刚完成时是正常状态，
// 只有持续超过宽限期才说明链路没有走通。
export const DEFAULT_GRACE_MINUTES = 60;

// undeployedSinceMs 必须是「生产缺失的最老那个提交」的时间，不能用 main HEAD 的时间。
// 用 HEAD 会让年龄在每次发布时重置：只要发布比宽限期来得频繁，一条永久断掉的链路
// 会被永远判成 deploying。实测中生产停在两小时前的提交，而 main 五分钟前刚动过。
export function evaluateDrift({
  deployedCommit,
  expectedCommit,
  undeployedSinceMs,
  nowMs,
  graceMinutes = DEFAULT_GRACE_MINUTES
} = {}) {
  const expected = String(expectedCommit || "").trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(expected)) {
    throw new Error("缺少有效的预期 commit。");
  }
  const deployed = String(deployedCommit || "").trim().toLowerCase();
  if (!deployed) {
    return {
      status: "unknown",
      drifted: true,
      message: "生产站没有返回 pfs-release-commit，无法确认部署版本。"
    };
  }
  if (sameCommit(deployed, expected)) {
    return {
      status: "current",
      drifted: false,
      message: `生产站已在 ${expected.slice(0, 12)}。`
    };
  }

  const ageMs = Number(nowMs) - Number(undeployedSinceMs);
  const graceMs = graceMinutes * 60_000;
  if (!Number.isFinite(ageMs)) {
    throw new Error("缺少有效的未部署提交时间。");
  }
  const ageMinutes = Math.floor(ageMs / 60_000);
  if (ageMs <= graceMs) {
    return {
      status: "deploying",
      drifted: false,
      ageMinutes,
      message:
        `生产站在 ${deployed.slice(0, 12)}，main 是 ${expected.slice(0, 12)}；` +
        `最老的未部署提交 ${ageMinutes} 分钟前产生，仍在 ${graceMinutes} 分钟宽限期内。`
    };
  }
  return {
    status: "stale",
    drifted: true,
    ageMinutes,
    message:
      `生产站停留在 ${deployed.slice(0, 12)}，main 已是 ${expected.slice(0, 12)}，` +
      `最老的未部署提交已经过去 ${ageMinutes} 分钟` +
      `（宽限期 ${graceMinutes} 分钟）。镜像构建、ACR 推送或 ECS rollout 至少有一环没有走通。`
  };
}

function argument(name, argv = process.argv) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] || "" : "";
}

// 最老未部署提交的时间只能在拿到生产站实际 commit 之后才算得出来，因此由调用方注入一个
// 解析器：CI 里用 git 历史，测试里直接给值，判定本身保持纯函数。
export function oldestUndeployedTimestampMs({ deployedCommit, expectedCommit, runGit }) {
  const range = `${deployedCommit}..${expectedCommit}`;
  try {
    // 生产报的 commit 不在历史里（浅克隆、极旧版本、元信息异常）时退回发布提交自身的时间，
    // 宁可早报也不要漏报。
    runGit(["cat-file", "-e", `${deployedCommit}^{commit}`]);
    const seconds = runGit(["log", range, "--format=%ct", "--reverse"]).split(/\r?\n/).filter(Boolean)[0];
    if (seconds) return Number(seconds) * 1000;
  } catch {
    // 落到下面的回退
  }
  return Number(runGit(["log", "-1", "--format=%ct", expectedCommit])) * 1000;
}

export async function checkProductionDrift({
  url,
  expectedCommit,
  undeployedSinceMs,
  resolveUndeployedSinceMs,
  graceMinutes = DEFAULT_GRACE_MINUTES,
  nowMs = Date.now(),
  fetchImpl = fetch
} = {}) {
  const baseUrl = String(url || "").trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("缺少生产站地址。");
  let deployedCommit = "";
  try {
    const response = await fetchImpl(`${baseUrl}/`, { redirect: "follow" });
    if (response.ok) deployedCommit = commitFromHtml(await response.text());
  } catch (error) {
    return {
      status: "unreachable",
      drifted: true,
      message: `无法访问生产站 ${baseUrl}：${error.message}`
    };
  }
  const since = deployedCommit && resolveUndeployedSinceMs
    ? resolveUndeployedSinceMs(deployedCommit)
    : undeployedSinceMs;
  return evaluateDrift({ deployedCommit, expectedCommit, undeployedSinceMs: since, nowMs, graceMinutes });
}

async function main() {
  const graceMinutes = Number(argument("--grace-minutes")) || DEFAULT_GRACE_MINUTES;
  const expectedCommit = argument("--commit") || process.env.GITHUB_SHA;
  const runGit = args => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const result = await checkProductionDrift({
    url: argument("--url"),
    expectedCommit,
    resolveUndeployedSinceMs: deployedCommit =>
      oldestUndeployedTimestampMs({ deployedCommit, expectedCommit, runGit }),
    graceMinutes
  });
  const line = `生产发布漂移检查：${result.status} — ${result.message}\n`;
  if (result.drifted) {
    process.stderr.write(line);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(line);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    process.stderr.write(`生产发布漂移检查失败：${error.message}\n`);
    process.exitCode = 1;
  });
}

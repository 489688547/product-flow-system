import { pathToFileURL } from "node:url";

import { commitFromHtml, sameCommit } from "./check-deployed-smoke.mjs";

// 生产发布链路是异步的：镜像构建并推送到 ACR，ECS 上的 rollout timer 每两分钟轮询一次，
// 命中后还要先备份再替换容器。因此「生产 commit 落后 main」在发布刚完成时是正常状态，
// 只有持续超过宽限期才说明链路没有走通。
export const DEFAULT_GRACE_MINUTES = 60;

export function evaluateDrift({
  deployedCommit,
  expectedCommit,
  commitTimestampMs,
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

  const ageMs = Number(nowMs) - Number(commitTimestampMs);
  const graceMs = graceMinutes * 60_000;
  if (!Number.isFinite(ageMs)) {
    throw new Error("缺少有效的发布提交时间。");
  }
  const ageMinutes = Math.floor(ageMs / 60_000);
  if (ageMs <= graceMs) {
    return {
      status: "deploying",
      drifted: false,
      ageMinutes,
      message:
        `生产站在 ${deployed.slice(0, 12)}，main 是 ${expected.slice(0, 12)}；` +
        `发布提交 ${ageMinutes} 分钟前产生，仍在 ${graceMinutes} 分钟宽限期内。`
    };
  }
  return {
    status: "stale",
    drifted: true,
    ageMinutes,
    message:
      `生产站停留在 ${deployed.slice(0, 12)}，main 已是 ${expected.slice(0, 12)} 且已过去 ${ageMinutes} 分钟` +
      `（宽限期 ${graceMinutes} 分钟）。镜像构建、ACR 推送或 ECS rollout 至少有一环没有走通。`
  };
}

function argument(name, argv = process.argv) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] || "" : "";
}

export async function checkProductionDrift({
  url,
  expectedCommit,
  commitTimestampMs,
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
  return evaluateDrift({ deployedCommit, expectedCommit, commitTimestampMs, nowMs, graceMinutes });
}

async function main() {
  const graceMinutes = Number(argument("--grace-minutes")) || DEFAULT_GRACE_MINUTES;
  const timestampSeconds = Number(argument("--commit-timestamp"));
  const result = await checkProductionDrift({
    url: argument("--url"),
    expectedCommit: argument("--commit") || process.env.GITHUB_SHA,
    commitTimestampMs: timestampSeconds * 1000,
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

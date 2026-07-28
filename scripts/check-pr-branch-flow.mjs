import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FEATURE_BRANCH_PREFIXES = Object.freeze(["codex/", "claude/", "feat/", "fix/", "chore/", "docs/"]);

function branch(value) {
  return String(value || "").trim();
}

export function validatePullRequestBranchFlow(event) {
  const base = branch(event?.pull_request?.base?.ref);
  const head = branch(event?.pull_request?.head?.ref);
  if (!base || !head) {
    throw new Error("缺少 pull_request 分支信息，无法验证发布流向。");
  }
  if (base !== "dev" && base !== "main") {
    throw new Error(`不支持的 PR 流向：${head} → ${base}。`);
  }

  // 功能分支前缀只用于区分「功能分支」与「发布分支 dev」，不限定作者或工具。
  // 原先只认 codex/，会把其他来源的分支挡在门外而没有任何安全收益。
  if (FEATURE_BRANCH_PREFIXES.some(prefix => head.startsWith(prefix))) {
    if (base !== "dev") {
      throw new Error(`功能分支必须提交到 dev；当前流向为 ${head} → ${base}。`);
    }
    return { valid: true, lane: "feature", base, head };
  }

  if (head === "dev") {
    if (base !== "main") {
      throw new Error(`发布分支 dev 只能提交到 main；当前目标为 ${base}。`);
    }
    return { valid: true, lane: "release", base, head };
  }

  if (base === "main" || head === "main") {
    throw new Error(`main 只能接收 dev 发布分支；当前流向为 ${head} → ${base}。`);
  }

  if (base === "dev") {
    throw new Error(`功能分支需使用 ${FEATURE_BRANCH_PREFIXES.join("、")} 之一作为前缀；当前来源为 ${head}。`);
  }

  throw new Error(`不支持的 PR 流向：${head} → ${base}。`);
}

async function main() {
  const eventPath = branch(process.env.GITHUB_EVENT_PATH);
  if (!eventPath) throw new Error("缺少 GITHUB_EVENT_PATH，无法读取 pull_request 事件。");
  const event = JSON.parse(readFileSync(resolve(eventPath), "utf8"));
  const result = validatePullRequestBranchFlow(event);
  console.log(`PR 分支流向检查通过：${result.head} → ${result.base}（${result.lane}）。`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch(error => {
    console.error(`PR 分支流向检查失败：${error.message}`);
    process.exitCode = 1;
  });
}

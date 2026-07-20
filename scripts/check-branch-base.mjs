import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function requiredBaseRef(env = process.env) {
  const base = String(env.GITHUB_BASE_REF || "main").trim() || "main";
  return `origin/${base}`;
}

export function checkBranchBase(cwd, env = process.env, options = {}) {
  const runGit = options.runGit || git;
  const branch = String(env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || "").trim() || runGit(["branch", "--show-current"], cwd);
  const baseRef = requiredBaseRef(env);
  if (options.refresh) {
    const baseBranch = baseRef.replace(/^origin\//, "");
    try {
      runGit(["fetch", "origin", baseBranch], cwd);
    } catch {
      return {
        branch,
        baseRef,
        current: false,
        reason: `无法获取最新 ${baseRef}，请检查网络或远端权限后重试。`
      };
    }
  }
  try {
    runGit(["rev-parse", "--verify", baseRef], cwd);
  } catch {
    return { branch, baseRef, current: false, reason: `缺少 ${baseRef}，请先执行 git fetch origin main。` };
  }

  try {
    runGit(["merge-base", "--is-ancestor", baseRef, "HEAD"], cwd);
    return { branch, baseRef, current: true };
  } catch {
    return {
      branch,
      baseRef,
      current: false,
      reason: `当前分支没有包含最新 ${baseRef}。请执行 git fetch origin main && git rebase origin/main，解决冲突并重新验证。`
    };
  }
}

const scriptPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";

if (invokedPath === scriptPath) {
  const root = resolve(dirname(scriptPath), "..");
  const result = checkBranchBase(root);
  if (!result.current) {
    console.error(`分支基线检查失败：${result.reason}`);
    process.exitCode = 1;
  } else {
    console.log(`分支基线检查通过：${result.branch || "HEAD"} 已包含 ${result.baseRef}。`);
  }
}

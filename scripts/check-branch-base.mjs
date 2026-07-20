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

export function checkBranchBase(cwd, env = process.env) {
  const branch = String(env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || "").trim() || git(["branch", "--show-current"], cwd);
  if (branch === "main") return { branch, baseRef: "origin/main", current: true };

  const baseRef = requiredBaseRef(env);
  try {
    git(["rev-parse", "--verify", baseRef], cwd);
  } catch {
    return { branch, baseRef, current: false, reason: `缺少 ${baseRef}，请先执行 git fetch origin main。` };
  }

  try {
    git(["merge-base", "--is-ancestor", baseRef, "HEAD"], cwd);
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

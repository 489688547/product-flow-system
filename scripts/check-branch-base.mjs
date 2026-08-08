import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FEATURE_BRANCH_PREFIXES = Object.freeze(["codex/", "claude/", "feat/", "fix/", "chore/", "docs/"]);

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

export function currentBranch(cwd, env = process.env, runGit = git) {
  const declared = String(env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || "").trim();
  return declared || runGit(["branch", "--show-current"], cwd);
}

export function requiredBaseRef(env = process.env, branch = "") {
  const declared = String(env.GITHUB_BASE_REF || "").trim();
  if (declared) return `origin/${declared}`;
  // 本地运行没有 pull_request 事件，只能按分支名推断它将要提交的目标。
  // 旧实现一律回落到 origin/main，于是每个基于 dev 的功能分支在本地都会被误判失败。
  if (FEATURE_BRANCH_PREFIXES.some(prefix => branch.startsWith(prefix))) return "origin/dev";
  return "origin/main";
}

// dev → main 是发布通道。发布用合并提交落到 main，该提交的树与被合并的那个 dev 提交完全相同，
// 因此 main 结构上不可能持有 dev 缺失的内容，要求 dev 包含该合并提交本身没有防御价值，
// 只会在每次发布后制造一轮回同步 PR。发布通道改为验证真正要保证的性质：
// main 相对共同祖先没有引入任何 dev 之外的改动。
export function isReleaseLane(branch, baseRef) {
  return branch === "dev" && baseRef === "origin/main";
}

export function checkBranchBase(cwd, env = process.env, options = {}) {
  const runGit = options.runGit || git;
  const branch = currentBranch(cwd, env, runGit);
  const baseRef = requiredBaseRef(env, branch);
  const baseBranch = baseRef.replace(/^origin\//, "");
  const lane = isReleaseLane(branch, baseRef) ? "release" : "feature";

  if (options.refresh) {
    try {
      runGit(["fetch", "origin", baseBranch], cwd);
    } catch {
      return {
        branch,
        baseRef,
        lane,
        current: false,
        reason: `无法获取最新 ${baseRef}，请检查网络或远端权限后重试。`
      };
    }
  }

  try {
    runGit(["rev-parse", "--verify", baseRef], cwd);
  } catch {
    return {
      branch,
      baseRef,
      lane,
      current: false,
      reason: `缺少 ${baseRef}，请先执行 git fetch origin ${baseBranch}。`
    };
  }

  if (lane === "release") {
    let mergeBase;
    try {
      mergeBase = runGit(["merge-base", baseRef, "HEAD"], cwd);
    } catch {
      return {
        branch,
        baseRef,
        lane,
        current: false,
        reason: `${baseRef} 与 ${branch} 没有共同祖先，无法判断发布基线。`
      };
    }
    try {
      // 有差异时 git diff --quiet 以非零退出，execFileSync 抛出。
      runGit(["diff", "--quiet", mergeBase, baseRef], cwd);
      return { branch, baseRef, lane, current: true };
    } catch {
      return {
        branch,
        baseRef,
        lane,
        current: false,
        reason:
          `${baseRef} 含有 ${branch} 缺失的改动，发布会覆盖它们。` +
          `请执行 git fetch origin ${baseBranch} && git merge origin/${baseBranch}，解决冲突并重新验证。`
      };
    }
  }

  try {
    runGit(["merge-base", "--is-ancestor", baseRef, "HEAD"], cwd);
    return { branch, baseRef, lane, current: true };
  } catch {
    return {
      branch,
      baseRef,
      lane,
      current: false,
      reason:
        `当前分支没有包含最新 ${baseRef}。` +
        `请执行 git fetch origin ${baseBranch} && git rebase origin/${baseBranch}，解决冲突并重新验证。`
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
  } else if (result.lane === "release") {
    console.log(`分支基线检查通过：${result.baseRef} 没有 ${result.branch || "HEAD"} 缺失的改动。`);
  } else {
    console.log(`分支基线检查通过：${result.branch || "HEAD"} 已包含 ${result.baseRef}。`);
  }
}

import path from "node:path";

// LaunchAgent 把入口路径写死在 plist 里，而 Git worktree 是临时目录：从 worktree 安装的
// 常驻采集器会在该 worktree 被删除后静默失效（node 报模块找不到，launchctl 只留退出码 1）。
// 因此安装前必须把入口路径还原到主仓库，写入 plist 的永远是稳定路径。
export function resolveStableCollectorPath({ collectorPath, worktreeRoot, gitCommonDir, errorCode }) {
  const checkoutRoot = path.resolve(String(worktreeRoot || ""));
  const entrypoint = path.resolve(String(collectorPath || ""));
  const relativeEntrypoint = path.relative(checkoutRoot, entrypoint);
  if (!relativeEntrypoint || relativeEntrypoint.startsWith("..") || path.isAbsolute(relativeEntrypoint)) {
    throw Object.assign(new Error("采集入口不在当前 Git 工作区内。"), { code: errorCode });
  }
  // 链接 worktree 的 --git-common-dir 指向主仓库的 .git，据此回到主仓库根目录。
  const resolvedCommonDir = path.resolve(checkoutRoot, String(gitCommonDir || ""));
  const repositoryRoot = path.basename(resolvedCommonDir) === ".git"
    ? path.dirname(resolvedCommonDir)
    : checkoutRoot;
  return path.join(repositoryRoot, relativeEntrypoint);
}

// 供安装流程查询当前 checkout 的根目录与主仓库 .git 位置。
export async function readCollectorGitLayout(command, collectorPath) {
  const git = await command("/usr/bin/git", [
    "-C",
    path.dirname(collectorPath),
    "rev-parse",
    "--path-format=absolute",
    "--show-toplevel",
    "--git-common-dir"
  ]);
  const [worktreeRoot, gitCommonDir] = String(git.stdout || "").trim().split(/\r?\n/);
  return { worktreeRoot, gitCommonDir };
}

import { spawn } from "node:child_process";

function command(program, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error("系统通知失败。")));
  });
}

export async function notifyCollectionIssue(issue, { run = command } = {}) {
  const title = "公司数据采集需要处理";
  const message = issue.kind === "waiting_human"
    ? `${issue.providerId} ${issue.resourceType} 需要登录或人工验证`
    : `${issue.providerId} ${issue.resourceType} 采集失败，请在数据同步查看`;
  const script = `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`;
  await run("/usr/bin/osascript", ["-e", script]);
  return { notified: true };
}

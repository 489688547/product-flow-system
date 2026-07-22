import { spawn } from "node:child_process";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KEYCHAIN_SERVICE = "com.company.kuaimai-erp-collector";
export const LAUNCH_AGENT_LABEL = "com.company.kuaimai-erp-collector";

function xml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function systemCommand(program, args, { input = "" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", chunk => stdout.push(chunk));
    child.stderr.on("data", chunk => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
      else {
        const error = new Error(`系统安全存储命令失败（${code}）。`);
        error.code = "KUAIMAI_KEYCHAIN_COMMAND_FAILED";
        reject(error);
      }
    });
    child.stdin.end(input);
  });
}

export async function storeCollectorToken(token, {
  command = systemCommand,
  account = os.userInfo().username,
  service = KEYCHAIN_SERVICE,
  helperPath = fileURLToPath(new URL("./keychain-helper.swift", import.meta.url))
} = {}) {
  const value = String(token || "").trim();
  if (!/^kec_[a-f0-9]{48}$/i.test(value) && value !== "kec_secret") {
    const error = new Error("采集器令牌格式无效。");
    error.code = "KUAIMAI_KEYCHAIN_TOKEN_INVALID";
    throw error;
  }
  await command("/usr/bin/xcrun", ["swift", helperPath, service, account], { input: `${value}\n` });
}

export async function readCollectorToken({
  command = systemCommand,
  account = os.userInfo().username,
  service = KEYCHAIN_SERVICE
} = {}) {
  const result = await command("/usr/bin/security", ["find-generic-password", "-w", "-a", account, "-s", service]);
  const token = String(result.stdout || "").trim();
  if (!token) {
    const error = new Error("macOS 钥匙串中没有快麦 ERP 采集令牌。");
    error.code = "KUAIMAI_KEYCHAIN_TOKEN_MISSING";
    throw error;
  }
  return token;
}

export function collectorLaunchAgentPlist({ nodePath, collectorPath, root, baseUrl }) {
  const argumentsList = [nodePath, collectorPath, "scan", "--root", root, "--base-url", baseUrl]
    .map(value => `      <string>${xml(value)}</string>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LAUNCH_AGENT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${argumentsList}
    </array>
    <key>StartInterval</key>
    <integer>900</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>ProcessType</key>
    <string>Background</string>
  </dict>
</plist>
`;
}

export async function installLaunchAgent({
  nodePath = process.execPath,
  collectorPath,
  root,
  baseUrl,
  home = os.homedir(),
  command = systemCommand
}) {
  const agentsDirectory = path.join(home, "Library", "LaunchAgents");
  const plistPath = path.join(agentsDirectory, `${LAUNCH_AGENT_LABEL}.plist`);
  await mkdir(agentsDirectory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${plistPath}.tmp`;
  await writeFile(temporaryPath, collectorLaunchAgentPlist({ nodePath, collectorPath, root, baseUrl }), { mode: 0o600 });
  await rename(temporaryPath, plistPath);
  await chmod(plistPath, 0o600);
  await command("/bin/launchctl", ["bootout", `gui/${process.getuid()}`, plistPath]).catch(() => {});
  await command("/bin/launchctl", ["bootstrap", `gui/${process.getuid()}`, plistPath]);
  return { label: LAUNCH_AGENT_LABEL, plistPath, intervalSeconds: 900 };
}

import { spawn } from "node:child_process";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXTENSION_ID = "hdmcandfaiolchakodkabdjjhfiojmae";
export const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;
export const RUNNER_KEYCHAIN_SERVICE = "com.company.web-data-collector.runner";
export const PAIRING_KEYCHAIN_SERVICE = "com.company.web-data-collector.pairing";
export const LAUNCH_AGENT_LABEL = "com.company.web-data-collector";

function xml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function systemCommand(program, args, { input = "" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    child.stdout.on("data", chunk => stdout.push(chunk));
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve({ stdout: Buffer.concat(stdout).toString("utf8") });
      else reject(Object.assign(new Error("macOS 安全存储命令失败。"), { code: "WEB_COLLECTION_KEYCHAIN_COMMAND_FAILED" }));
    });
    child.stdin.end(input);
  });
}

export function validateRunnerToken(value) {
  return /^wdc_[a-f0-9]{48}$/i.test(String(value || ""));
}

export function validatePairingKey(value) {
  return /^wcp_[a-f0-9]{48}$/i.test(String(value || ""));
}

async function storeSecret(value, { service, validate, command = systemCommand, account = os.userInfo().username } = {}) {
  const secret = String(value || "").trim();
  if (!validate(secret)) throw Object.assign(new Error("本机安全密钥格式无效。"), { code: "WEB_COLLECTION_SECRET_INVALID" });
  const helperPath = fileURLToPath(new URL("../kuaimai-erp-collector/keychain-helper.swift", import.meta.url));
  await command("/usr/bin/xcrun", ["swift", helperPath, service, account], { input: `${secret}\n` });
}

async function readSecret({ service, validate, command = systemCommand, account = os.userInfo().username } = {}) {
  const result = await command("/usr/bin/security", ["find-generic-password", "-w", "-a", account, "-s", service]);
  const secret = String(result.stdout || "").trim();
  if (!validate(secret)) throw Object.assign(new Error("macOS 钥匙串中没有有效的网页采集密钥。"), { code: "WEB_COLLECTION_KEYCHAIN_SECRET_MISSING" });
  return secret;
}

export const storeRunnerToken = (value, options = {}) => storeSecret(value, { service: RUNNER_KEYCHAIN_SERVICE, validate: validateRunnerToken, ...options });
export const readRunnerToken = (options = {}) => readSecret({ service: RUNNER_KEYCHAIN_SERVICE, validate: validateRunnerToken, ...options });
export const storePairingKey = (value, options = {}) => storeSecret(value, { service: PAIRING_KEYCHAIN_SERVICE, validate: validatePairingKey, ...options });
export const readPairingKey = (options = {}) => readSecret({ service: PAIRING_KEYCHAIN_SERVICE, validate: validatePairingKey, ...options });

export function collectorLaunchAgentPlist({ nodePath, collectorPath, root, baseUrl }) {
  const argumentsList = [nodePath, collectorPath, "serve", "--root", root, "--base-url", baseUrl]
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
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
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
  const directory = path.join(home, "Library", "LaunchAgents");
  const plistPath = path.join(directory, `${LAUNCH_AGENT_LABEL}.plist`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporaryPath = `${plistPath}.tmp`;
  await writeFile(temporaryPath, collectorLaunchAgentPlist({ nodePath, collectorPath, root, baseUrl }), { mode: 0o600 });
  await rename(temporaryPath, plistPath);
  await chmod(plistPath, 0o600);
  await command("/bin/launchctl", ["bootout", `gui/${process.getuid()}`, plistPath]).catch(() => {});
  await command("/bin/launchctl", ["bootstrap", `gui/${process.getuid()}`, plistPath]);
  return { label: LAUNCH_AGENT_LABEL, plistPath, keepAlive: true };
}

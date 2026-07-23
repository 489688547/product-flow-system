import { execFileSync } from "node:child_process";
import { randomBytes as secureRandomBytes } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLocalEnv, resolveSharedEnvPath } from "./shared-local-env.mjs";

const SECRET_NAME = "DEMO_DATA_MASKING_KEY";

function defaultRun(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: "utf8",
    stdio: [options.input == null ? "ignore" : "pipe", "pipe", "pipe"]
  });
}

function validMaskingKey(value) {
  return /^[A-Za-z0-9_-]{43}$/.test(String(value || ""));
}

function upsertEnvValue(path, name, value) {
  const source = readFileSync(path, "utf8");
  const lines = source.split(/\r?\n/);
  const pattern = new RegExp(`^(?:export\\s+)?${name}\\s*=`);
  const replacement = `${name}=${value}`;
  const index = lines.findIndex(line => pattern.test(line.trim()));
  if (index >= 0) lines[index] = replacement;
  else lines.unshift(replacement);
  writeFileSync(path, `${lines.join("\n").replace(/\n+$/, "")}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function putSecret(run, cwd, projectName, environment, value) {
  run("npx", [
    "wrangler", "pages", "secret", "put", SECRET_NAME,
    "--project-name", projectName,
    "--env", environment
  ], { cwd, input: `${value}\n` });
}

export function configureDemoDataEnvironment({
  envPath,
  projectName = "product-flow-system",
  run = defaultRun,
  randomBytes = secureRandomBytes
} = {}) {
  const resolvedEnvPath = resolve(envPath || ".env");
  const cwd = dirname(resolvedEnvPath);
  const current = parseLocalEnv(readFileSync(resolvedEnvPath, "utf8"));
  const maskingKey = validMaskingKey(current[SECRET_NAME])
    ? current[SECRET_NAME]
    : randomBytes(32).toString("base64url");
  if (!validMaskingKey(maskingKey)) throw new Error("无法生成有效的展示数据脱敏密钥。");

  upsertEnvValue(resolvedEnvPath, SECRET_NAME, maskingKey);
  for (const environment of ["preview", "production"]) {
    putSecret(run, cwd, projectName, environment, maskingKey);
  }
  return {
    configuredEnvironments: ["preview", "production"],
    configuredNames: [SECRET_NAME]
  };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const root = resolve(dirname(scriptPath), "..");
    const envFlag = process.argv.indexOf("--env-file");
    const requestedEnvPath = envFlag >= 0 ? process.argv[envFlag + 1] : "";
    const envPath = requestedEnvPath ? resolve(requestedEnvPath) : resolveSharedEnvPath(root);
    const result = configureDemoDataEnvironment({ envPath });
    console.log(`展示数据脱敏配置完成：${result.configuredEnvironments.join("、")}；已配置 ${result.configuredNames.join("、")}。`);
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}

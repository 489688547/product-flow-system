import { execFileSync } from "node:child_process";
import { randomBytes as secureRandomBytes } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLocalEnv, resolveSharedEnvPath } from "./shared-local-env.mjs";

const REQUIRED_PROVIDER_SECRETS = Object.freeze([
  "DINGTALK_APP_KEY",
  "DINGTALK_APP_SECRET",
  "KUAIMAI_ACCESS_TOKEN",
  "KUAIMAI_APP_KEY",
  "KUAIMAI_APP_SECRET"
]);
const OPTIONAL_PROVIDER_SECRETS = Object.freeze(["KUAIMAI_REFRESH_TOKEN"]);
const REQUIRED_SHARED_PROJECT_SECRETS = Object.freeze([
  "DEMO_DATA_MASKING_KEY",
  "DINGTALK_APP_KEY",
  "DINGTALK_APP_SECRET",
  "PLATFORM_CREDENTIAL_MASTER_KEY"
]);

function defaultRun(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd,
    input: options.input,
    encoding: "utf8",
    stdio: [options.input == null ? "ignore" : "pipe", "pipe", "pipe"]
  });
}

function vaultRowCount(run, cwd) {
  const output = run("npx", [
    "wrangler", "d1", "execute", "product-flow-system", "--remote",
    "--command", "SELECT COUNT(*) AS count FROM platform_credentials", "--json"
  ], { cwd });
  const payload = JSON.parse(output);
  return Number(payload?.[0]?.results?.[0]?.count ?? -1);
}

function validMasterKey(value) {
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
  const normalized = `${lines.join("\n").replace(/\n+$/, "")}\n`;
  writeFileSync(path, normalized, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function putSecret(run, cwd, projectName, environment, name, value) {
  run("npx", [
    "wrangler", "pages", "secret", "put", name,
    "--project-name", projectName,
    "--env", environment
  ], { cwd, input: `${value}\n` });
}

export function configurePagesEnvironmentParity({
  envPath,
  projectName = "product-flow-system",
  run = defaultRun,
  randomBytes = secureRandomBytes
} = {}) {
  const resolvedEnvPath = resolve(envPath || ".env");
  const cwd = dirname(resolvedEnvPath);
  const current = parseLocalEnv(readFileSync(resolvedEnvPath, "utf8"));
  const missing = REQUIRED_PROVIDER_SECRETS.filter(name => !String(current[name] || "").trim());
  if (missing.length) throw new Error(`本地 .env 缺少必要平台配置：${missing.join("、")}`);

  const count = vaultRowCount(run, cwd);
  if (count < 0) throw new Error("无法确认平台连接保险箱状态，未修改任何环境。");
  if (count > 0) throw new Error("平台连接保险箱已有密文，必须先执行密钥轮换，未修改任何环境。");

  const masterKey = validMasterKey(current.PLATFORM_CREDENTIAL_MASTER_KEY)
    ? current.PLATFORM_CREDENTIAL_MASTER_KEY
    : randomBytes(32).toString("base64url");
  if (!validMasterKey(masterKey)) throw new Error("无法生成有效的平台连接保险箱主密钥。");
  upsertEnvValue(resolvedEnvPath, "PLATFORM_CREDENTIAL_MASTER_KEY", masterKey);

  const previewNames = [
    ...REQUIRED_PROVIDER_SECRETS,
    ...OPTIONAL_PROVIDER_SECRETS.filter(name => String(current[name] || "").trim()),
    "PLATFORM_CREDENTIAL_MASTER_KEY"
  ];
  for (const name of previewNames) {
    putSecret(run, cwd, projectName, "preview", name, name === "PLATFORM_CREDENTIAL_MASTER_KEY" ? masterKey : current[name]);
  }
  putSecret(run, cwd, projectName, "production", "PLATFORM_CREDENTIAL_MASTER_KEY", masterKey);

  return {
    configuredEnvironments: ["preview", "production"],
    configuredNames: [...new Set(previewNames)].sort()
  };
}

export function configureDualPagesProjects({
  envPath,
  productionProject = "deshan-tiyes-system",
  developmentProject = "deshan-tiyes-system-dev",
  run = defaultRun
} = {}) {
  const resolvedEnvPath = resolve(envPath || ".env");
  const cwd = dirname(resolvedEnvPath);
  const current = parseLocalEnv(readFileSync(resolvedEnvPath, "utf8"));
  const missing = REQUIRED_SHARED_PROJECT_SECRETS.filter(name => !String(current[name] || "").trim());
  if (missing.length) {
    throw new Error(`本地 .env 缺少必要双项目配置：${missing.join("、")}`);
  }
  if (!validMasterKey(current.PLATFORM_CREDENTIAL_MASTER_KEY)) {
    throw new Error("本地平台连接保险箱主密钥无效，禁止生成或轮换后覆盖现有项目。");
  }
  const projects = [productionProject, developmentProject].map(value => String(value || "").trim());
  if (projects.some(value => !value) || new Set(projects).size !== projects.length) {
    throw new Error("正式与测试 Pages 项目名称必须存在且互不相同。");
  }
  for (const projectName of projects) {
    for (const environment of ["preview", "production"]) {
      for (const name of REQUIRED_SHARED_PROJECT_SECRETS) {
        putSecret(run, cwd, projectName, environment, name, current[name]);
      }
    }
  }
  return {
    configuredProjects: projects,
    configuredEnvironments: ["preview", "production"],
    configuredNames: [...REQUIRED_SHARED_PROJECT_SECRETS].sort()
  };
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    const root = resolve(dirname(scriptPath), "..");
    const envFlag = process.argv.indexOf("--env-file");
    const requestedEnvPath = envFlag >= 0 ? process.argv[envFlag + 1] : "";
    const envPath = requestedEnvPath ? resolve(requestedEnvPath) : resolveSharedEnvPath(root);
    const legacyFlag = process.argv.indexOf("--legacy-project");
    if (legacyFlag >= 0) {
      const projectName = String(process.argv[legacyFlag + 1] || "").trim();
      if (!projectName) throw new Error("--legacy-project 必须提供项目名。");
      const result = configurePagesEnvironmentParity({ envPath, projectName });
      console.log(`Pages Secret 配置完成：${projectName}；${result.configuredEnvironments.join("、")}；已配置名称 ${result.configuredNames.join("、")}。`);
    } else {
      const result = configureDualPagesProjects({ envPath });
      console.log(`Pages 双项目 Secret 配置完成：${result.configuredProjects.join("、")}；${result.configuredEnvironments.join("、")}；已配置名称 ${result.configuredNames.join("、")}。`);
    }
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}

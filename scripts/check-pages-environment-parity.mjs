import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_PAGES_SECRETS = Object.freeze([
  "DINGTALK_APP_KEY",
  "DINGTALK_APP_SECRET",
  "KUAIMAI_ACCESS_TOKEN",
  "KUAIMAI_APP_KEY",
  "KUAIMAI_APP_SECRET",
  "PLATFORM_CREDENTIAL_MASTER_KEY"
]);

function parseSections(source) {
  const sections = new Map([["root", []]]);
  let current = "root";
  for (const line of String(source || "").split(/\r?\n/)) {
    const header = line.trim().match(/^\[\[?([^\]]+)\]\]?$/);
    if (header) {
      current = header[1].trim();
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    sections.get(current).push(line);
  }
  return sections;
}

function sectionValue(sections, section, key) {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"\\s*$`);
  for (const line of sections.get(section) || []) {
    const match = line.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function environmentContract(source, { explicit = true } = {}) {
  const sections = parseSections(source);
  const localD1 = sectionValue(sections, "d1_databases", "database_id");
  const previewD1 = sectionValue(sections, "env.preview.d1_databases", "database_id") || (!explicit ? localD1 : "");
  const productionD1 = sectionValue(sections, "env.production.d1_databases", "database_id") || (!explicit ? localD1 : "");
  return { databaseIds: { local: localD1, preview: previewD1, production: productionD1 } };
}

function missingNames(actual = [], required = REQUIRED_PAGES_SECRETS) {
  const present = new Set(actual);
  return required.filter(name => !present.has(name));
}

export function assertPagesEnvironmentParity(source) {
  const contract = environmentContract(source, { explicit: true });
  const errors = [];
  const ids = Object.entries(contract.databaseIds);
  for (const [environment, id] of ids) {
    if (!id) errors.push(`${environment} 缺少 PRODUCT_FLOW_DB`);
  }
  const configuredIds = [...new Set(ids.map(([, id]) => id).filter(Boolean))];
  if (configuredIds.length > 1) errors.push("本地、Preview、Production 的 D1 database_id 不一致");
  if (errors.length) throw new Error(`Pages 环境契约不一致：${errors.join("；")}`);
  return { databaseId: configuredIds[0] };
}

export function requiredPagesSecrets(manifest = {}) {
  return [...new Set((manifest.capabilities || []).flatMap(capability => {
    const requiredIn = new Set(capability.requiredIn || []);
    return requiredIn.has("preview") && requiredIn.has("production") ? capability.envVars || [] : [];
  }))].sort();
}

export function parsePagesSecretList(output) {
  return [...new Set([...String(output || "").matchAll(/^\s*-\s+([A-Z][A-Z0-9_]*)\s*:/gm)].map(match => match[1]))].sort();
}

export function inspectRemotePagesParity({
  configSource,
  previewSecretOutput,
  productionSecretOutput,
  requiredSecrets = REQUIRED_PAGES_SECRETS
} = {}) {
  const contract = environmentContract(configSource, { explicit: false });
  const previewD1 = contract.databaseIds.preview;
  const productionD1 = contract.databaseIds.production;
  const missingSecrets = {
    preview: missingNames(parsePagesSecretList(previewSecretOutput), requiredSecrets),
    production: missingNames(parsePagesSecretList(productionSecretOutput), requiredSecrets)
  };
  const errors = [];
  if (!previewD1 || !productionD1 || previewD1 !== productionD1) {
    errors.push("Preview 与 Production 的远程 D1 不一致");
  }
  for (const environment of ["preview", "production"]) {
    if (missingSecrets[environment].length) {
      errors.push(`${environment} 缺少 Secret：${missingSecrets[environment].join("、")}`);
    }
  }
  if (errors.length) throw new Error(`Pages 远程环境不一致：${errors.join("；")}`);
  return { preview: previewD1, production: productionD1, sameDatabase: true, missingSecrets };
}

function wrangler(args, cwd) {
  return execFileSync("npx", ["wrangler", ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function remoteCheck(root, projectName, requiredSecrets) {
  const downloadDir = mkdtempSync(resolve(tmpdir(), "pfs-pages-config-"));
  try {
    wrangler(["pages", "download", "config", projectName], downloadDir);
    const configSource = readFileSync(resolve(downloadDir, "wrangler.toml"), "utf8");
    const previewSecretOutput = wrangler(["pages", "secret", "list", "--project-name", projectName, "--env", "preview"], root);
    const productionSecretOutput = wrangler(["pages", "secret", "list", "--project-name", projectName, "--env", "production"], root);
    return inspectRemotePagesParity({ configSource, previewSecretOutput, productionSecretOutput, requiredSecrets });
  } finally {
    rmSync(downloadDir, { recursive: true, force: true });
  }
}

const scriptPath = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const root = resolve(dirname(scriptPath), "..");
  try {
    assertPagesEnvironmentParity(readFileSync(resolve(root, "wrangler.toml"), "utf8"));
    const manifest = JSON.parse(readFileSync(resolve(root, "docs/platform/environment-capabilities.json"), "utf8"));
    const requiredSecrets = requiredPagesSecrets(manifest);
    if (process.argv.includes("--remote")) {
      remoteCheck(root, "product-flow-system", requiredSecrets);
      console.log("Pages 远程环境一致性检查通过：Preview 与 Production 使用同一 D1，必要 Secret 名称完整。");
    } else {
      console.log("Pages 环境契约检查通过：本地、Preview、Production 使用同一 D1 声明。");
    }
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}

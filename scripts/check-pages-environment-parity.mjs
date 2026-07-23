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
  const sections = new Map([["root", [[]]]]);
  let current = "root";
  let block = sections.get("root")[0];
  for (const line of String(source || "").split(/\r?\n/)) {
    const header = line.trim().match(/^(\[\[?)([^\]]+)\]\]?$/);
    if (header) {
      current = header[2].trim();
      if (!sections.has(current)) sections.set(current, []);
      block = [];
      sections.get(current).push(block);
      continue;
    }
    block.push(line);
  }
  return sections;
}

function blockValue(block, key) {
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"\\s*$`);
  for (const line of block || []) {
    const match = line.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function sectionBindings(sections, section) {
  return Object.fromEntries((sections.get(section) || []).flatMap(block => {
    const binding = blockValue(block, "binding");
    const databaseId = blockValue(block, "database_id");
    return binding ? [[binding, databaseId]] : [];
  }));
}

function mergeFallback(primary, fallback) {
  return { ...(fallback || {}), ...(primary || {}) };
}

export function inspectWranglerD1Bindings(source, { explicit = true } = {}) {
  const sections = parseSections(source);
  const local = sectionBindings(sections, "d1_databases");
  const preview = sectionBindings(sections, "env.preview.d1_databases");
  const production = sectionBindings(sections, "env.production.d1_databases");
  return {
    local,
    preview: explicit ? preview : mergeFallback(preview, local),
    production: explicit ? production : mergeFallback(production, local)
  };
}

export function validateD1Bindings(environments) {
  const errors = [];
  const requiredBindings = ["PRODUCT_FLOW_DB", "DEMO_FLOW_DB"];
  for (const environment of ["local", "preview", "production"]) {
    for (const binding of requiredBindings) {
      if (!environments?.[environment]?.[binding]) {
        errors.push(`${environment} 缺少 ${binding}`);
      }
    }
  }
  for (const binding of requiredBindings) {
    const ids = [...new Set(
      ["local", "preview", "production"]
        .map(environment => environments?.[environment]?.[binding])
        .filter(Boolean)
    )];
    if (ids.length > 1) {
      errors.push(`本地、Preview、Production 的 D1 binding ${binding} database_id 不一致`);
    }
  }
  for (const environment of ["local", "preview", "production"]) {
    const productId = environments?.[environment]?.PRODUCT_FLOW_DB;
    const displayId = environments?.[environment]?.DEMO_FLOW_DB;
    if (productId && displayId && productId === displayId) {
      errors.push("正式数据库与展示数据库必须使用不同 D1");
      break;
    }
  }
  return errors;
}

function missingNames(actual = [], required = REQUIRED_PAGES_SECRETS) {
  const present = new Set(actual);
  return required.filter(name => !present.has(name));
}

export function assertPagesEnvironmentParity(source) {
  const environments = inspectWranglerD1Bindings(source, { explicit: true });
  const errors = validateD1Bindings(environments);
  if (errors.length) throw new Error(`Pages 环境契约不一致：${errors.join("；")}`);
  const databaseIds = {
    PRODUCT_FLOW_DB: environments.local.PRODUCT_FLOW_DB,
    DEMO_FLOW_DB: environments.local.DEMO_FLOW_DB
  };
  return {
    databaseId: databaseIds.PRODUCT_FLOW_DB,
    databaseIds,
    environments
  };
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
  const environments = inspectWranglerD1Bindings(configSource, { explicit: false });
  const missingSecrets = {
    preview: missingNames(parsePagesSecretList(previewSecretOutput), requiredSecrets),
    production: missingNames(parsePagesSecretList(productionSecretOutput), requiredSecrets)
  };
  const errors = validateD1Bindings(environments);
  for (const environment of ["preview", "production"]) {
    if (missingSecrets[environment].length) {
      errors.push(`${environment} 缺少 Secret：${missingSecrets[environment].join("、")}`);
    }
  }
  if (errors.length) throw new Error(`Pages 远程环境不一致：${errors.join("；")}`);
  const databaseIds = {
    PRODUCT_FLOW_DB: environments.production.PRODUCT_FLOW_DB,
    DEMO_FLOW_DB: environments.production.DEMO_FLOW_DB
  };
  return {
    preview: environments.preview.PRODUCT_FLOW_DB,
    production: environments.production.PRODUCT_FLOW_DB,
    databaseIds,
    sameDatabase: true,
    missingSecrets
  };
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
      console.log("Pages 远程环境一致性检查通过：Preview 与 Production 的正式/展示 D1 绑定一致，必要 Secret 名称完整。");
    } else {
      console.log("Pages 环境契约检查通过：本地、Preview、Production 使用一致且相互隔离的正式/展示 D1 声明。");
    }
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

const CONTROL_PLANE_FILES = new Set([
  "functions/api/_middleware.js",
  "functions/api/auth/_shared/ding-user-token.js",
  "functions/api/auth/_shared/session.js",
  "functions/api/auth/dingtalk/callback.js",
  "functions/api/data-center/_shared/connectorStorage.js",
  "functions/api/dingtalk/groups/[groupId]/members.js",
  "functions/api/dingtalk/org/sync.js",
  "functions/api/platform/_shared/credentialVaultStorage.js",
  "functions/api/platform/_shared/dataEnvironment.js",
  "functions/api/platform/_shared/environmentReadiness.js",
  "functions/api/platform/_shared/platformCredentials.js",
  "functions/api/platform/v1/environment-readiness.js",
  "functions/api/platform/v1/integrations.js",
  "functions/api/platform/v1/platform-connections.js",
  "functions/api/platform/v1/production-write-session.js"
]);

const CONTROL_PLANE_PREFIXES = [
  "functions/api/platform/v1/ai/",
  "functions/api/platform/v1/browser-agent/",
  "functions/api/platform/v1/credential-vault/",
  "functions/api/platform/v1/data-connections/",
  "functions/api/platform/v1/erp-collection/",
  "functions/api/platform/v1/production-data/",
  "functions/api/platform/v1/web-collection/"
];

function sourceFiles(root) {
  const output = execFileSync("git", ["ls-files", "functions/api/**/*.js", "functions/api/*.js"], {
    cwd: root,
    encoding: "utf8"
  });
  return output.split(/\r?\n/).filter(Boolean);
}

function isControlPlane(file) {
  return CONTROL_PLANE_FILES.has(file)
    || CONTROL_PLANE_PREFIXES.some(prefix => file.startsWith(prefix));
}

export function findDirectProductionDbReferences({ root = ROOT } = {}) {
  const directReference = /\b(?:context\.)?env\.PRODUCT_FLOW_DB\b/g;
  return sourceFiles(root).flatMap(file => {
    if (isControlPlane(file) || file.includes("/_generated/")) return [];
    const source = readFileSync(resolve(root, file), "utf8");
    return source.split(/\r?\n/).flatMap((line, index) =>
      directReference.test(line)
        ? [{ file: relative(root, resolve(root, file)), line: index + 1 }]
        : []
    );
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const violations = findDirectProductionDbReferences();
  if (violations.length) {
    for (const item of violations) {
      process.stderr.write(`${item.file}:${item.line} 业务模块不得直接解析 PRODUCT_FLOW_DB\n`);
    }
    process.exitCode = 1;
  } else {
    process.stdout.write("数据环境路由检查通过：业务模块均使用统一 businessDb。\n");
  }
}

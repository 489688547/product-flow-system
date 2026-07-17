import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRED_REPOSITORY_FILES = [
  "AGENTS.md",
  "PRODUCT.md",
  "DESIGN.md",
  ".agents/skills/feature-workflow/SKILL.md",
  ".agents/skills/verification/SKILL.md",
  ".agents/skills/platform-capability-review/SKILL.md",
  "docs/templates/prd.md",
  "docs/templates/design.md",
  "docs/templates/plan.md",
  "docs/templates/tasks.md",
  "docs/templates/adr.md",
  "docs/templates/api-contract.md",
  "docs/platform/architecture.md",
  "docs/platform/components.md",
  "docs/platform/middleware.md",
  "docs/platform/api-catalog.md",
  "docs/platform/integrations.md",
  "docs/platform/error-codes.md"
];

const REQUIRED_FEATURE_FILES = ["prd.md", "design.md", "plan.md", "tasks.md"];
const UNFINISHED_MARKER = /\bT(?:BD|ODO)\b/;

function relativePath(rootDir, path) {
  return relative(rootDir, path).replaceAll("\\", "/");
}

function featureDirectories(rootDir) {
  const root = resolve(rootDir, "docs/features");
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map(name => resolve(root, name))
    .filter(path => statSync(path).isDirectory());
}

export function checkProjectGovernance(rootDir) {
  const root = resolve(rootDir);
  const errors = [];
  const documentsToScan = [];

  for (const file of REQUIRED_REPOSITORY_FILES) {
    const path = resolve(root, file);
    if (!existsSync(path)) {
      errors.push(`缺少必需文件：${file}`);
      continue;
    }
    if (file.endsWith(".md")) documentsToScan.push(path);
  }

  for (const featureDir of featureDirectories(root)) {
    for (const file of REQUIRED_FEATURE_FILES) {
      const path = resolve(featureDir, file);
      if (!existsSync(path)) errors.push(`功能文档不完整：${relativePath(root, path)}`);
      else documentsToScan.push(path);
    }
  }

  for (const path of documentsToScan) {
    const content = readFileSync(path, "utf8");
    if (UNFINISHED_MARKER.test(content)) {
      errors.push(`文档包含未完成标记：${relativePath(root, path)}`);
    }
  }

  return { errors };
}

const scriptPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";

if (invokedPath === scriptPath) {
  const root = resolve(dirname(scriptPath), "..");
  const result = checkProjectGovernance(root);
  if (result.errors.length) {
    console.error("治理检查失败：");
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("治理检查通过。");
  }
}

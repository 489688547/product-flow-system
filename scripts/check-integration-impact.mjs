import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkIntegrationImpact,
  loadIntegrationRegistry,
  matchIntegrationPlatforms,
  validateIntegrationRegistry
} from "./integration-registry.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(scriptPath), "..");

function argumentValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function changedPaths(baseSha, headSha) {
  if (!baseSha || !headSha) throw new Error("GitHub PR 事件缺少 base/head SHA");
  return execFileSync("git", ["diff", "--name-only", `${baseSha}...${headSha}`], {
    cwd: rootDir,
    encoding: "utf8"
  }).split(/\r?\n/).map(value => value.trim()).filter(Boolean);
}

function printRouting(result) {
  const payload = {
    ambiguous: result.ambiguous,
    direct: result.direct.map(match => ({
      id: match.id,
      name: match.name,
      status: match.status,
      required: match.required,
      evidence: match.evidence,
      publicDocs: match.publicDocs
    })),
    related: result.related.map(platform => ({ id: platform.id, name: platform.name, status: platform.status }))
  };
  console.log(JSON.stringify(payload, null, 2));
}

const registry = loadIntegrationRegistry(rootDir);
const registryErrors = validateIntegrationRegistry(registry);
if (registryErrors.length) {
  console.error("集成注册表校验失败：");
  registryErrors.forEach(error => console.error(`- ${error}`));
  process.exitCode = 1;
} else if (process.argv.includes("--route")) {
  const paths = argumentValue("--paths").split(",").map(value => value.trim()).filter(Boolean);
  printRouting(matchIntegrationPlatforms(registry, { text: argumentValue("--text"), paths }));
} else {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const event = eventPath && existsSync(eventPath) ? JSON.parse(readFileSync(eventPath, "utf8")) : null;
  if (!event?.pull_request) {
    console.log("集成注册表校验通过；当前不是 pull_request 事件，跳过 PR 影响声明检查。");
  } else {
    const paths = changedPaths(event.pull_request.base?.sha, event.pull_request.head?.sha);
    const body = event.pull_request.body || "";
    const result = checkIntegrationImpact(registry, { paths, body });
    const advisory = matchIntegrationPlatforms(registry, {
      text: `${event.pull_request.title || ""}\n${body}`,
      paths: [],
      expandRelated: false
    });

    if (advisory.direct.length) {
      console.log(`关键词建议检查平台：${advisory.direct.map(match => match.id).join(", ")}`);
    }
    if (result.errors.length) {
      console.error("集成影响检查失败：");
      result.errors.forEach(error => console.error(`- ${error}`));
      process.exitCode = 1;
    } else {
      console.log(`集成影响检查通过；路径要求：${result.requiredIds.join(", ") || "none"}。`);
    }
  }
}

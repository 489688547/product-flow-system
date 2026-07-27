import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkRuleWriteback,
  checkIntegrationImpact,
  isIntegrationCodePath,
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

function changedCode(baseSha, headSha, paths) {
  const codePaths = paths.filter(isIntegrationCodePath);
  if (!codePaths.length) return "";
  return execFileSync("git", ["diff", "--unified=0", "--no-color", `${baseSha}...${headSha}`, "--", ...codePaths], {
    cwd: rootDir,
    encoding: "utf8"
  });
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

function reportDeclarations(registry, { paths, content, body, title = "" }) {
  const result = checkIntegrationImpact(registry, { paths, content, body });
  const writeback = checkRuleWriteback({ paths, body });
  const advisory = matchIntegrationPlatforms(registry, {
    text: `${title}\n${body}`,
    paths: [],
    expandRelated: false
  });

  if (advisory.direct.length) {
    console.log(`关键词建议检查平台：${advisory.direct.map(match => match.id).join(", ")}`);
  }
  const errors = [...result.errors, ...writeback.errors];
  if (errors.length) {
    console.error("集成影响检查失败：");
    errors.forEach(error => console.error(`- ${error}`));
    return false;
  }
  console.log(`集成影响检查通过；路径要求：${result.requiredIds.join(", ") || "none"}；规则反写：${writeback.declaredPaths.join(", ")}。`);
  return true;
}

const registry = loadIntegrationRegistry(rootDir);
const registryErrors = validateIntegrationRegistry(registry);
if (registryErrors.length) {
  console.error("集成注册表校验失败：");
  registryErrors.forEach(error => console.error(`- ${error}`));
  process.exitCode = 1;
} else if (process.argv.includes("--route")) {
  const paths = argumentValue("--paths").split(",").map(value => value.trim()).filter(Boolean);
  printRouting(matchIntegrationPlatforms(registry, { text: argumentValue("--text"), paths, content: argumentValue("--content") }));
} else if (process.argv.includes("--preflight")) {
  // 本地预检：CI 只读 PR body，改错声明要 push 一轮才知道。这里用同一套规则先跑一遍。
  const base = argumentValue("--base") || "origin/main";
  const bodyFile = argumentValue("--body-file");
  const paths = changedPaths(base, "HEAD");
  if (!paths.length) {
    console.log(`集成影响预检跳过：${base}...HEAD 没有变更文件。预检只统计已提交内容，未提交的改动请先 commit。`);
  } else {
    const body = bodyFile
      ? readFileSync(resolve(rootDir, bodyFile), "utf8")
      : execFileSync("git", ["log", "--format=%B", `${base}..HEAD`], { cwd: rootDir, encoding: "utf8" });
    console.log(`集成影响预检：对比 ${base}，${paths.length} 个变更文件，声明取自 ${bodyFile || "分支提交信息"}。`);
    if (!reportDeclarations(registry, { paths, content: changedCode(base, "HEAD", paths), body })) process.exitCode = 1;
  }
} else {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const event = eventPath && existsSync(eventPath) ? JSON.parse(readFileSync(eventPath, "utf8")) : null;
  if (!event?.pull_request) {
    console.log("集成注册表校验通过；当前不是 pull_request 事件，跳过 PR 影响声明检查。");
  } else {
    const paths = changedPaths(event.pull_request.base?.sha, event.pull_request.head?.sha);
    const content = changedCode(event.pull_request.base?.sha, event.pull_request.head?.sha, paths);
    const ok = reportDeclarations(registry, {
      paths,
      content,
      body: event.pull_request.body || "",
      title: event.pull_request.title || ""
    });
    if (!ok) process.exitCode = 1;
  }
}

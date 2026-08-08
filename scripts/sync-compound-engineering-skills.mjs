import { execFileSync } from "node:child_process";
import { copyFileSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const ALLOWED_SKILLS = ["ce-compound", "ce-compound-refresh"];
const TAG_PATTERN = /^compound-engineering-v\d+\.\d+\.\d+$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const CONTENT_SHA_PATTERN = /^[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(`Compound Engineering 同步失败：${message}`);
}

function versionParts(tag) {
  if (!TAG_PATTERN.test(tag ?? "")) fail(`tag 不符合正式版本规则：${tag ?? ""}`);
  return tag.slice("compound-engineering-v".length).split(".").map(Number);
}

export function compareCompoundEngineeringTags(leftTag, rightTag) {
  const left = versionParts(leftTag);
  const right = versionParts(rightTag);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
}

export function decideCompoundEngineeringRelease({ latestTag, latestCommit, currentTag, currentCommit }) {
  if (!COMMIT_PATTERN.test(latestCommit ?? "") || !COMMIT_PATTERN.test(currentCommit ?? "")) {
    fail("release commit 必须为完整 SHA");
  }
  const comparison = compareCompoundEngineeringTags(latestTag, currentTag);
  if (comparison < 0) fail("latest release 低于当前固定版本，拒绝降级");
  if (comparison === 0 && latestCommit !== currentCommit) {
    fail("当前 release tag 的 commit 已漂移，拒绝移动固定 tag");
  }
  return { needed: comparison > 0, comparison };
}

function runGit(source, args) {
  try {
    return execFileSync("git", args, { cwd: source, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    fail(`无法读取上游 Git 元数据：git ${args.join(" ")}`);
  }
}

function isInside(root, path) {
  const candidate = relative(root, path);
  return candidate === "" || (!candidate.startsWith("..") && !isAbsolute(candidate));
}

function stat(path, description) {
  try {
    return lstatSync(path);
  } catch {
    fail(`缺少${description}：${path}`);
  }
}

function assertDirectory(path, description) {
  const info = stat(path, description);
  if (info.isSymbolicLink()) fail(`${description}不得是 symbolic link：${path}`);
  if (!info.isDirectory()) fail(`${description}必须是目录：${path}`);
}

function assertRegularFile(path, description) {
  const info = stat(path, description);
  if (info.isSymbolicLink()) fail(`${description}不得是 symbolic link：${path}`);
  if (!info.isFile()) fail(`${description}必须是普通文件：${path}`);
}

function walkSafeDirectory(root, path) {
  if (!isInside(root, path)) fail(`上游路径越界：${path}`);
  assertDirectory(path, "上游 Skill 目录");
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (!isInside(root, child)) fail(`上游路径越界：${child}`);
    const info = lstatSync(child);
    if (info.isSymbolicLink()) fail(`上游内容不得包含 symbolic link：${child}`);
    if (info.isDirectory()) walkSafeDirectory(root, child);
    else if (!info.isFile()) fail(`上游内容必须是普通文件或目录：${child}`);
  }
}

function listRegularFiles(root, path, files = []) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) listRegularFiles(root, child, files);
    else files.push(relative(root, child).replaceAll("\\", "/"));
  }
  return files;
}

function contentSha256FromSkillsRoot(skillsRoot, skillNames = ALLOWED_SKILLS) {
  const files = [];
  for (const name of skillNames) {
    const skill = resolve(skillsRoot, name);
    if (!isInside(skillsRoot, skill)) fail(`Skill digest 路径越界：${name}`);
    walkSafeDirectory(skillsRoot, skill);
    listRegularFiles(skillsRoot, skill, files);
  }
  const license = resolve(skillsRoot, "compound-engineering-LICENSE");
  if (!isInside(skillsRoot, license)) fail("许可证 digest 路径越界");
  assertRegularFile(license, "Compound Engineering MIT LICENSE");
  files.push("compound-engineering-LICENSE");

  const hash = createHash("sha256");
  for (const relativePath of files.sort()) {
    const path = resolve(skillsRoot, relativePath);
    if (!isInside(skillsRoot, path)) fail(`digest 文件路径越界：${relativePath}`);
    assertRegularFile(path, `digest 文件 ${relativePath}`);
    const content = readFileSync(path);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(String(content.byteLength));
    hash.update("\0");
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function computeCompoundEngineeringContentSha256(rootDir = resolve(dirname(scriptPath), "..")) {
  const { skills } = assertSafeTargetRoot(rootDir);
  return contentSha256FromSkillsRoot(skills);
}

function assertSourceMatchesHeadTree(sourceRoot, sourceSkillPaths, sourceLicense) {
  const paths = [...sourceSkillPaths.map(item => `skills/${item.name}`), "LICENSE"];
  const tracked = new Set(runGit(sourceRoot, ["ls-tree", "-r", "--name-only", "HEAD", "--", ...paths]).split("\n").filter(Boolean));
  const actual = new Set([
    ...sourceSkillPaths.flatMap(item => listRegularFiles(sourceRoot, item.path)),
    relative(sourceRoot, sourceLicense).replaceAll("\\", "/")
  ]);
  const unexpected = [...actual].find(path => !tracked.has(path));
  const missing = [...tracked].find(path => !actual.has(path));
  if (unexpected || missing) fail(`上游允许目录与固定 HEAD tree 不一致：${unexpected ?? missing}`);
}

function copySafeDirectory(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = resolve(source, entry.name);
    const to = resolve(target, entry.name);
    if (entry.isDirectory()) copySafeDirectory(from, to);
    else copyFileSync(from, to);
  }
}

function readManifest(rootDir) {
  const manifestPath = resolve(rootDir, ".agents/skills/compound-engineering-upstream.json");
  assertRegularFile(manifestPath, "固定来源清单");
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    fail("固定来源清单不是有效 JSON");
  }
  if (!TAG_PATTERN.test(manifest.tag ?? "")) fail("固定来源清单 tag 不符合正式版本规则");
  if (!COMMIT_PATTERN.test(manifest.commit ?? "")) fail("固定来源清单 commit 必须为完整 SHA");
  if (!CONTENT_SHA_PATTERN.test(manifest.contentSha256 ?? "")) fail("固定来源清单 contentSha256 必须为完整 SHA-256");
  if (manifest.repository !== "https://github.com/EveryInc/compound-engineering-plugin.git") fail("固定来源清单 repository 不受信任");
  if (manifest.license !== "MIT") fail("固定来源清单 license 必须为 MIT");
  if (!Array.isArray(manifest.skills) || manifest.skills.length !== ALLOWED_SKILLS.length || manifest.skills.some((name, index) => name !== ALLOWED_SKILLS[index])) {
    fail("固定来源清单 allowlist 不合法");
  }
  return manifest;
}

export function checkCompoundEngineeringSkills(rootDir = resolve(dirname(scriptPath), "..")) {
  const errors = [];
  try {
    const { root, skills } = assertSafeTargetRoot(rootDir);
    const manifest = readManifest(root);
    const license = resolve(skills, "compound-engineering-LICENSE");
    if (!isInside(skills, license)) fail("目标许可证路径越界");
    assertRegularFile(license, "Compound Engineering MIT LICENSE");
    if (!/^MIT License/m.test(readFileSync(license, "utf8"))) fail("Compound Engineering LICENSE 必须保留 MIT 原文");
    for (const name of manifest.skills) {
      const skill = resolve(skills, name);
      if (!isInside(skills, skill)) fail(`目标 Skill 路径越界：${name}`);
      assertDirectory(skill, `vendored Skill ${name}`);
      assertRegularFile(resolve(skill, "SKILL.md"), `vendored Skill ${name} 的 SKILL.md`);
      walkSafeDirectory(skills, skill);
    }
    const actualContentSha256 = contentSha256FromSkillsRoot(skills, manifest.skills);
    if (actualContentSha256 !== manifest.contentSha256) {
      fail(`vendored 内容完整性校验失败：expected ${manifest.contentSha256}, actual ${actualContentSha256}`);
    }
  } catch (error) {
    errors.push(error.message);
  }
  return { errors };
}

function assertSafeTargetRoot(rootDir) {
  const root = resolve(rootDir);
  assertDirectory(root, "目标仓库根目录");
  const agents = resolve(root, ".agents");
  const skills = resolve(agents, "skills");
  if (isInside(root, agents) === false || isInside(root, skills) === false) fail("目标路径越界");
  assertDirectory(agents, "目标 .agents 目录");
  assertDirectory(skills, "目标 .agents/skills 目录");
  return { root, skills };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || !["--source", "--tag", "--commit"].includes(flag)) fail(`未知或不完整参数：${flag ?? ""}`);
    options[flag.slice(2)] = value;
  }
  return options;
}

export async function syncCompoundEngineeringSkills({ rootDir = resolve(dirname(scriptPath), ".."), source, tag, commit }) {
  if (!source || !tag || !commit) fail("必须提供 --source、--tag 和 --commit");
  const { root, skills } = assertSafeTargetRoot(rootDir);
  const manifest = readManifest(root);
  const baseline = checkCompoundEngineeringSkills(root);
  if (baseline.errors.length > 0) {
    fail(`当前 vendored 基线未通过完整性校验：${baseline.errors.join("；")}`);
  }
  decideCompoundEngineeringRelease({
    latestTag: tag,
    latestCommit: commit,
    currentTag: manifest.tag,
    currentCommit: manifest.commit
  });

  const sourceRoot = resolve(source);
  assertDirectory(sourceRoot, "上游 checkout");
  const sourceSkills = resolve(sourceRoot, "skills");
  const sourceLicense = resolve(sourceRoot, "LICENSE");
  if (!isInside(sourceRoot, sourceSkills) || !isInside(sourceRoot, sourceLicense)) fail("上游路径越界");
  assertDirectory(sourceSkills, "上游 skills 目录");
  assertRegularFile(sourceLicense, "上游 LICENSE");
  if (runGit(sourceRoot, ["remote", "get-url", "origin"]) !== manifest.repository) fail("上游 repository 与固定来源清单不一致");
  if (runGit(sourceRoot, ["rev-parse", "HEAD"]) !== commit) fail("上游 HEAD commit 与固定来源清单不一致");
  if (runGit(sourceRoot, ["rev-parse", `refs/tags/${tag}^{commit}`]) !== commit) fail("上游 tag 与固定来源清单不一致");

  const sourceSkillPaths = manifest.skills.map(name => {
    const path = resolve(sourceSkills, name);
    if (!isInside(sourceSkills, path)) fail(`上游 allowlist 路径越界：${name}`);
    assertDirectory(path, `上游 Skill ${name}`);
    walkSafeDirectory(sourceSkills, path);
    return { name, path };
  });
  assertSourceMatchesHeadTree(sourceRoot, sourceSkillPaths, sourceLicense);
  if (runGit(sourceRoot, ["status", "--porcelain"]) !== "") fail("上游 checkout 存在未提交变更");

  const stage = resolve(skills, `.compound-engineering-staging-${randomUUID()}`);
  const backup = resolve(stage, "backup");
  try {
    mkdirSync(stage, { recursive: true });
    mkdirSync(backup, { recursive: true });
    for (const { name, path } of sourceSkillPaths) copySafeDirectory(path, resolve(stage, name));
    copyFileSync(sourceLicense, resolve(stage, "compound-engineering-LICENSE"));
    const nextManifest = {
      ...manifest,
      tag,
      commit,
      contentSha256: contentSha256FromSkillsRoot(stage, manifest.skills)
    };
    writeFileSync(resolve(stage, "compound-engineering-upstream.json"), `${JSON.stringify(nextManifest, null, 2)}\n`);

    const swapped = [];
    try {
      for (const name of [...manifest.skills, "compound-engineering-LICENSE", "compound-engineering-upstream.json"]) {
        const destination = resolve(skills, name);
        if (!isInside(skills, destination)) fail(`目标路径越界：${name}`);
        const backupPath = resolve(backup, name);
        let hadExisting = true;
        try {
          lstatSync(destination);
        } catch (error) {
          if (error.code === "ENOENT") hadExisting = false;
          else throw error;
        }
        if (hadExisting) renameSync(destination, backupPath);
        swapped.push({ destination, backupPath, hadExisting });
        renameSync(resolve(stage, name), destination);
      }
    } catch (error) {
      for (const item of swapped.reverse()) {
        rmSync(item.destination, { recursive: true, force: true });
        if (item.hadExisting) renameSync(item.backupPath, item.destination);
      }
      throw error;
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

if (resolve(process.argv[1] ?? "") === scriptPath) {
  const options = parseArguments(process.argv.slice(2));
  syncCompoundEngineeringSkills(options)
    .then(() => console.log("Compound Engineering Skills 已按固定来源同步。"))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

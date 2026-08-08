import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const upstreamManifestPath = resolve(root, ".agents/skills/compound-engineering-upstream.json");
const upstreamLicensePath = resolve(root, ".agents/skills/compound-engineering-LICENSE");
const verificationSkillPath = resolve(root, ".agents/skills/verification/SKILL.md");
const firstLearningPath = resolve(root, "docs/solutions/runtime-errors/replace-wrangler-pages-dev-with-node-hono-runtime.md");
const skillNames = ["ce-compound", "ce-compound-refresh"];

function write(path, content) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function command(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function createUpstreamFixture() {
  const source = mkdtempSync(join(tmpdir(), "compound-engineering-upstream-"));
  command(source, "init", "--quiet");
  command(source, "config", "user.email", "test@example.com");
  command(source, "config", "user.name", "Test");
  command(source, "remote", "add", "origin", "https://github.com/EveryInc/compound-engineering-plugin.git");
  for (const name of skillNames) {
    write(resolve(source, "skills", name, "SKILL.md"), `---\nname: ${name}\n---\n# ${name}\n`);
    write(resolve(source, "skills", name, "references", "guide.md"), "fixture guide\n");
  }
  write(resolve(source, "skills", "not-allowed", "SKILL.md"), "must not copy\n");
  write(resolve(source, "LICENSE"), "MIT fixture license\n");
  command(source, "add", ".");
  command(source, "commit", "--quiet", "-m", "fixture");
  command(source, "tag", "compound-engineering-v3.21.4");
  return { source, commit: command(source, "rev-parse", "HEAD") };
}

function createTargetFixture(commit, skills = skillNames) {
  const target = mkdtempSync(join(tmpdir(), "compound-engineering-target-"));
  write(resolve(target, ".agents/skills/compound-engineering-upstream.json"), JSON.stringify({
    repository: "https://github.com/EveryInc/compound-engineering-plugin.git",
    tag: "compound-engineering-v3.21.4",
    commit,
    license: "MIT",
    skills
  }, null, 2) + "\n");
  return target;
}

test("the repository vendors both pinned Compound Engineering skills and the MIT license", () => {
  const manifest = JSON.parse(readFileSync(upstreamManifestPath, "utf8"));
  assert.equal(manifest.repository, "https://github.com/EveryInc/compound-engineering-plugin.git");
  assert.equal(manifest.tag, "compound-engineering-v3.21.4");
  assert.equal(manifest.commit, "0a2957852e2034d04eb01120fd7da6ed5307dc56");
  assert.deepEqual(manifest.skills, skillNames);
  assert.match(readFileSync(upstreamLicensePath, "utf8"), /^MIT License/m);

  for (const name of skillNames) {
    const skill = resolve(root, ".agents/skills", name, "SKILL.md");
    assert.equal(existsSync(skill), true, `${name} must be discoverable without installation`);
    assert.equal(lstatSync(skill).isSymbolicLink(), false, `${name} must be vendored, not linked`);
  }
});

test("governance can independently reject an incomplete or linked vendored Skill", async () => {
  const { checkCompoundEngineeringSkills } = await import(new URL("../scripts/sync-compound-engineering-skills.mjs", import.meta.url));
  assert.deepEqual(checkCompoundEngineeringSkills(root).errors, []);

  const target = createTargetFixture("0".repeat(40));
  try {
    write(resolve(target, ".agents/skills/compound-engineering-LICENSE"), "MIT License\n");
    const result = checkCompoundEngineeringSkills(target);
    assert.ok(result.errors.some(error => /ce-compound/i.test(error)));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("the synchronizer copies only the manifest allowlist and never executes upstream scripts", async () => {
  const { syncCompoundEngineeringSkills } = await import(new URL("../scripts/sync-compound-engineering-skills.mjs", import.meta.url));
  const { source, commit } = createUpstreamFixture();
  const target = createTargetFixture(commit);
  try {
    write(resolve(target, ".agents/skills/ce-compound/SKILL.md"), "old vendored content\n");
    await syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v3.21.4", commit });
    for (const name of skillNames) {
      assert.equal(existsSync(resolve(target, ".agents/skills", name, "SKILL.md")), true);
      assert.equal(existsSync(resolve(target, ".agents/skills", name, "references/guide.md")), true);
    }
    assert.doesNotMatch(readFileSync(resolve(target, ".agents/skills/ce-compound/SKILL.md"), "utf8"), /old vendored content/);
    assert.equal(existsSync(resolve(target, ".agents/skills/not-allowed")), false);
    assert.equal(readFileSync(resolve(target, ".agents/skills/compound-engineering-LICENSE"), "utf8"), "MIT fixture license\n");
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("the synchronizer rejects version drift, missing directories, symlinks, and traversal before changing skills", async () => {
  const { syncCompoundEngineeringSkills } = await import(new URL("../scripts/sync-compound-engineering-skills.mjs", import.meta.url));
  const { source, commit } = createUpstreamFixture();
  const target = createTargetFixture(commit);
  const existingSkill = resolve(target, ".agents/skills/ce-compound/SKILL.md");
  write(existingSkill, "existing skill\n");
  try {
    await assert.rejects(
      () => syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v3.21.4", commit: "f".repeat(40) }),
      /commit/i
    );
    await assert.rejects(
      () => syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v9.99.9", commit }),
      /tag/i
    );
    rmSync(resolve(source, "skills/ce-compound-refresh"), { recursive: true, force: true });
    await assert.rejects(
      () => syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v3.21.4", commit }),
      /ce-compound-refresh/i
    );
    assert.equal(readFileSync(existingSkill, "utf8"), "existing skill\n");

    write(resolve(source, "skills/ce-compound-refresh/SKILL.md"), "restored\n");
    symlinkSync(resolve(source, "LICENSE"), resolve(source, "skills/ce-compound/linked-license"));
    await assert.rejects(
      () => syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v3.21.4", commit }),
      /symbolic link/i
    );

    write(resolve(target, ".agents/skills/compound-engineering-upstream.json"), JSON.stringify({
      repository: "https://github.com/EveryInc/compound-engineering-plugin.git",
      tag: "compound-engineering-v3.21.4",
      commit,
      license: "MIT",
      skills: ["ce-compound", "../escape"]
    }));
    await assert.rejects(
      () => syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v3.21.4", commit }),
      /allowlist|path/i
    );
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("the synchronizer rejects ignored source files outside the fixed HEAD tree before changing skills", async () => {
  const { syncCompoundEngineeringSkills } = await import(new URL("../scripts/sync-compound-engineering-skills.mjs", import.meta.url));
  const { source, commit } = createUpstreamFixture();
  const target = createTargetFixture(commit);
  const existingSkill = resolve(target, ".agents/skills/ce-compound/SKILL.md");
  write(existingSkill, "existing skill\n");
  try {
    write(resolve(source, "skills/ce-compound/ignored-extra.md"), "must never be copied\n");
    write(resolve(source, ".git/info/exclude"), "skills/ce-compound/ignored-extra.md\n");
    assert.equal(command(source, "status", "--porcelain"), "");

    await assert.rejects(
      () => syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v3.21.4", commit }),
      /HEAD|untracked|source/i
    );
    assert.equal(readFileSync(existingSkill, "utf8"), "existing skill\n");
    assert.equal(existsSync(resolve(target, ".agents/skills/ce-compound/ignored-extra.md")), false);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("the synchronizer validates the source checkout HEAD and tag instead of only manifest parameters", async () => {
  const { syncCompoundEngineeringSkills } = await import(new URL("../scripts/sync-compound-engineering-skills.mjs", import.meta.url));
  const { source, commit } = createUpstreamFixture();
  const target = createTargetFixture(commit);
  const existingSkill = resolve(target, ".agents/skills/ce-compound/SKILL.md");
  write(existingSkill, "existing skill\n");
  try {
    write(resolve(source, "skills/ce-compound/SKILL.md"), "changed HEAD\n");
    command(source, "add", ".");
    command(source, "commit", "--quiet", "-m", "drift head");
    await assert.rejects(
      () => syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v3.21.4", commit }),
      /HEAD commit/i
    );
    assert.equal(readFileSync(existingSkill, "utf8"), "existing skill\n");

    command(source, "tag", "-f", "compound-engineering-v3.21.4");
    command(source, "checkout", "--quiet", commit);
    await assert.rejects(
      () => syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v3.21.4", commit }),
      /tag/i
    );
    assert.equal(readFileSync(existingSkill, "utf8"), "existing skill\n");
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("verification conditionally compounds verified reusable learnings and refreshes drift", () => {
  const verification = readFileSync(verificationSkillPath, "utf8");

  assert.match(verification, /docs\/solutions\//i, "verification must search the learning store by documented metadata");
  assert.match(verification, /module.*tags.*problem_type|problem_type.*module.*tags/is, "learning searches must use module, tags, and problem type");
  assert.match(verification, /current code.*tests?.*PRODUCT.*design.*platform.*ADR|current code.*tests?.*durable/i, "durable project truth must outrank learning docs");
  assert.match(verification, /non-trivial.*resolved.*verified.*reusable|resolved.*verified.*reusable.*non-trivial/is, "only verified reusable problems may be compounded");
  assert.match(verification, /ce-compound/, "verification must name the capture skill");
  assert.match(verification, /ce-compound-refresh/, "verification must name the refresh skill");
  assert.match(verification, /contradic|overlap|drift/i, "contradictions, overlaps, and drift must trigger refresh");
  assert.match(verification, /stale/i, "insufficient evidence must preserve the current rule and mark learning stale");
  assert.doesNotMatch(verification, /every (?:delivery|handoff).*ce-compound|unconditionally.*ce-compound/is, "learning capture must stay conditional");
});

test("the first ECS runtime learning is parser-safe, grounded, and secret-free", () => {
  const learning = readFileSync(firstLearningPath, "utf8");
  const expectedBodyClaims = [
    "# ECS 502 应先区分运行时退出与内存不足",
    "不是“2 GiB 内存必然不足”",
    "Node/Hono",
    "docs/decisions/2026-08-07-aliyun-node-hono-runtime.md:10"
  ];

  assert.match(learning, /^---\n[\s\S]*?^---\n/m, "learning must include YAML frontmatter");
  assert.match(learning, /^category: runtime-errors$/m);
  assert.match(learning, /^problem_type: runtime_error$/m);
  for (const claim of expectedBodyClaims) {
    assert.ok(learning.includes(claim), `learning must retain verified claim: ${claim}`);
  }
  assert.doesNotMatch(learning, /(?:\b(?:token|secret|credential|password)\b|\bip\s*address\b|\b\d{1,3}(?:\.\d{1,3}){3}\b)/i, "learning must not contain credentials, tokens, or IP addresses");

  execFileSync("python3", [
    resolve(root, ".agents/skills/ce-compound/scripts/validate-frontmatter.py"),
    firstLearningPath
  ], { encoding: "utf8" });
  execFileSync("python3", [
    resolve(root, ".agents/skills/ce-compound/scripts/validate-doc-claims.py"),
    firstLearningPath
  ], { cwd: root, encoding: "utf8" });
});

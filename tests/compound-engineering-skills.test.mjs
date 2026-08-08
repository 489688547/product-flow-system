import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { load } from "js-yaml";
import { computeCompoundEngineeringContentSha256 } from "../scripts/sync-compound-engineering-skills.mjs";

const root = resolve(import.meta.dirname, "..");
const upstreamManifestPath = resolve(root, ".agents/skills/compound-engineering-upstream.json");
const upstreamLicensePath = resolve(root, ".agents/skills/compound-engineering-LICENSE");
const verificationSkillPath = resolve(root, ".agents/skills/verification/SKILL.md");
const firstLearningPath = resolve(root, "docs/solutions/runtime-errors/replace-wrangler-pages-dev-with-node-hono-runtime.md");
const compoundEngineeringAdrPath = resolve(root, "docs/decisions/2026-08-08-compound-engineering-skills.md");
const qualityWorkflowPath = resolve(root, ".github/workflows/quality.yml");
const updaterWorkflowPath = resolve(root, ".github/workflows/update-compound-engineering.yml");
const agentsPath = resolve(root, "AGENTS.md");
const skillNames = ["ce-compound", "ce-compound-refresh"];

function write(path, content) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function command(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function createUpstreamFixture(tag = "compound-engineering-v3.21.4") {
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
  write(resolve(source, "LICENSE"), "MIT License\nfixture license\n");
  command(source, "add", ".");
  command(source, "commit", "--quiet", "-m", "fixture");
  command(source, "tag", tag);
  return { source, commit: command(source, "rev-parse", "HEAD") };
}

function createTargetFixture(commit, skills = skillNames, tag = "compound-engineering-v3.21.4") {
  const target = mkdtempSync(join(tmpdir(), "compound-engineering-target-"));
  const manifestPath = resolve(target, ".agents/skills/compound-engineering-upstream.json");
  const manifest = {
    repository: "https://github.com/EveryInc/compound-engineering-plugin.git",
    tag,
    commit,
    license: "MIT",
    contentSha256: "0".repeat(64),
    skills
  };
  write(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  for (const name of skillNames) {
    write(resolve(target, ".agents/skills", name, "SKILL.md"), `---\nname: ${name}\n---\nold vendored content\n`);
    write(resolve(target, ".agents/skills", name, "references", "guide.md"), "old guide\n");
  }
  write(resolve(target, ".agents/skills/compound-engineering-LICENSE"), "MIT License\nold license\n");
  manifest.contentSha256 = computeCompoundEngineeringContentSha256(target);
  write(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return target;
}

function createGovernedTargetFixture() {
  const target = mkdtempSync(join(tmpdir(), "compound-engineering-governed-"));
  mkdirSync(resolve(target, ".agents/skills"), { recursive: true });
  for (const name of skillNames) {
    cpSync(resolve(root, ".agents/skills", name), resolve(target, ".agents/skills", name), { recursive: true });
  }
  cpSync(upstreamManifestPath, resolve(target, ".agents/skills/compound-engineering-upstream.json"));
  cpSync(upstreamLicensePath, resolve(target, ".agents/skills/compound-engineering-LICENSE"));
  return target;
}

function parseFrontmatter(markdown) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  assert.ok(match, "learning must include YAML frontmatter");
  return load(match[1]);
}

test("the repository vendors both pinned Compound Engineering skills and the MIT license", () => {
  const manifest = JSON.parse(readFileSync(upstreamManifestPath, "utf8"));
  assert.equal(manifest.repository, "https://github.com/EveryInc/compound-engineering-plugin.git");
  assert.match(manifest.tag, /^compound-engineering-v\d+\.\d+\.\d+$/);
  assert.match(manifest.commit, /^[0-9a-f]{40}$/);
  assert.match(manifest.contentSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(manifest.skills, skillNames);
  assert.match(readFileSync(upstreamLicensePath, "utf8"), /^MIT License/m);

  for (const name of skillNames) {
    const skill = resolve(root, ".agents/skills", name, "SKILL.md");
    assert.equal(existsSync(skill), true, `${name} must be discoverable without installation`);
    assert.equal(lstatSync(skill).isSymbolicLink(), false, `${name} must be vendored, not linked`);
  }
});

test("the updater compares releases and rejects a moved current tag", async () => {
  const { compareCompoundEngineeringTags, decideCompoundEngineeringRelease } = await import(new URL("../scripts/sync-compound-engineering-skills.mjs", import.meta.url));

  assert.equal(compareCompoundEngineeringTags("compound-engineering-v3.21.3", "compound-engineering-v3.21.4"), -1);
  assert.equal(compareCompoundEngineeringTags("compound-engineering-v3.21.4", "compound-engineering-v3.21.4"), 0);
  assert.equal(compareCompoundEngineeringTags("compound-engineering-v3.22.0", "compound-engineering-v3.21.4"), 1);
  assert.equal(typeof decideCompoundEngineeringRelease, "function");
  assert.deepEqual(decideCompoundEngineeringRelease({
    latestTag: "compound-engineering-v3.21.4",
    latestCommit: "a".repeat(40),
    currentTag: "compound-engineering-v3.21.4",
    currentCommit: "a".repeat(40)
  }), { needed: false, comparison: 0 });
  assert.deepEqual(decideCompoundEngineeringRelease({
    latestTag: "compound-engineering-v3.22.0",
    latestCommit: "b".repeat(40),
    currentTag: "compound-engineering-v3.21.4",
    currentCommit: "a".repeat(40)
  }), { needed: true, comparison: 1 });
  assert.throws(() => decideCompoundEngineeringRelease({
    latestTag: "compound-engineering-v3.21.3",
    latestCommit: "b".repeat(40),
    currentTag: "compound-engineering-v3.21.4",
    currentCommit: "a".repeat(40)
  }), /downgrade|低于|降级/i);
  assert.throws(() => decideCompoundEngineeringRelease({
    latestTag: "compound-engineering-v3.21.4",
    latestCommit: "b".repeat(40),
    currentTag: "compound-engineering-v3.21.4",
    currentCommit: "a".repeat(40)
  }), /tag.*(?:drift|移动|漂移)|commit/i);
});

test("governance can independently reject an incomplete or linked vendored Skill", async () => {
  const { checkCompoundEngineeringSkills } = await import(new URL("../scripts/sync-compound-engineering-skills.mjs", import.meta.url));
  assert.deepEqual(checkCompoundEngineeringSkills(root).errors, []);

  const target = createTargetFixture("0".repeat(40));
  try {
    rmSync(resolve(target, ".agents/skills/ce-compound"), { recursive: true, force: true });
    const result = checkCompoundEngineeringSkills(target);
    assert.ok(result.errors.some(error => /ce-compound/i.test(error)));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("governance rejects regular-file tampering against the pinned content digest", async () => {
  const { checkCompoundEngineeringSkills } = await import(new URL("../scripts/sync-compound-engineering-skills.mjs", import.meta.url));
  const target = createGovernedTargetFixture();
  try {
    write(resolve(target, ".agents/skills/ce-compound/SKILL.md"), "tampered regular file\n");
    const result = checkCompoundEngineeringSkills(target);
    assert.ok(result.errors.some(error => /content|sha|digest|完整性/i.test(error)), result.errors.join("\n"));
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("the synchronizer rejects a tampered current baseline before replacing any vendored bytes", async () => {
  const { syncCompoundEngineeringSkills } = await import(new URL("../scripts/sync-compound-engineering-skills.mjs", import.meta.url));
  const { source, commit } = createUpstreamFixture();
  const target = createTargetFixture(commit);
  const skillPath = resolve(target, ".agents/skills/ce-compound/SKILL.md");
  try {
    write(skillPath, "tampered current baseline\n");
    await assert.rejects(
      () => syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v3.21.4", commit }),
      /current|baseline|vendored|content|digest|完整性|基线/i
    );
    assert.equal(readFileSync(skillPath, "utf8"), "tampered current baseline\n");
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  }
});

test("the synchronizer copies only the manifest allowlist and never executes upstream scripts", async () => {
  const { checkCompoundEngineeringSkills, syncCompoundEngineeringSkills } = await import(new URL("../scripts/sync-compound-engineering-skills.mjs", import.meta.url));
  const { source, commit } = createUpstreamFixture();
  const target = createTargetFixture(commit);
  try {
    await syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v3.21.4", commit });
    for (const name of skillNames) {
      assert.equal(existsSync(resolve(target, ".agents/skills", name, "SKILL.md")), true);
      assert.equal(existsSync(resolve(target, ".agents/skills", name, "references/guide.md")), true);
    }
    assert.doesNotMatch(readFileSync(resolve(target, ".agents/skills/ce-compound/SKILL.md"), "utf8"), /old vendored content/);
    assert.equal(existsSync(resolve(target, ".agents/skills/not-allowed")), false);
    assert.equal(readFileSync(resolve(target, ".agents/skills/compound-engineering-LICENSE"), "utf8"), "MIT License\nfixture license\n");
    const syncedManifest = JSON.parse(readFileSync(
      resolve(target, ".agents/skills/compound-engineering-upstream.json"),
      "utf8"
    ));
    assert.match(syncedManifest.contentSha256, /^[a-f0-9]{64}$/);
    assert.notEqual(syncedManifest.contentSha256, "0".repeat(64));
    assert.deepEqual(checkCompoundEngineeringSkills(target).errors, []);
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
  const existingContent = readFileSync(existingSkill, "utf8");
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
    assert.equal(readFileSync(existingSkill, "utf8"), existingContent);

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
      skills: ["ce-compound", "../escape"],
      contentSha256: "0".repeat(64)
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
  const existingContent = readFileSync(existingSkill, "utf8");
  try {
    write(resolve(source, "skills/ce-compound/ignored-extra.md"), "must never be copied\n");
    write(resolve(source, ".git/info/exclude"), "skills/ce-compound/ignored-extra.md\n");
    assert.equal(command(source, "status", "--porcelain"), "");

    await assert.rejects(
      () => syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v3.21.4", commit }),
      /HEAD|untracked|source/i
    );
    assert.equal(readFileSync(existingSkill, "utf8"), existingContent);
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
  const existingContent = readFileSync(existingSkill, "utf8");
  try {
    write(resolve(source, "skills/ce-compound/SKILL.md"), "changed HEAD\n");
    command(source, "add", ".");
    command(source, "commit", "--quiet", "-m", "drift head");
    await assert.rejects(
      () => syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v3.21.4", commit }),
      /HEAD commit/i
    );
    assert.equal(readFileSync(existingSkill, "utf8"), existingContent);

    command(source, "tag", "-f", "compound-engineering-v3.21.4");
    command(source, "checkout", "--quiet", commit);
    await assert.rejects(
      () => syncCompoundEngineeringSkills({ rootDir: target, source, tag: "compound-engineering-v3.21.4", commit }),
      /tag/i
    );
    assert.equal(readFileSync(existingSkill, "utf8"), existingContent);
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
  assert.ok(
    verification.indexOf("Run `ce-compound`") < verification.indexOf("freshly run every Definition of Done"),
    "all learning writes must happen before the final Definition of Done run"
  );
});

test("repository instructions hard-gate direct learning capture and surface the store", () => {
  const agents = readFileSync(agentsPath, "utf8");
  assert.match(agents, /docs\/solutions\//);
  assert.match(agents, /module.*tags.*problem_type|problem_type.*module.*tags/is);
  assert.match(agents, /ce-compound/);
  assert.match(agents, /resolved.*verified.*non-trivial.*reusable|已解决.*已验证.*非简单.*可复用/is);
  assert.match(agents, /direct|直接/i, "the gate must also cover direct Skill invocation");
});

test("the first ECS runtime learning is parser-safe, grounded, and secret-free", () => {
  const learning = readFileSync(firstLearningPath, "utf8");
  const expectedBodyClaims = [
    "# ECS 502 应先区分运行时退出与内存不足",
    "不是“2 GiB 内存必然不足”",
    "Node/Hono",
    "docs/decisions/2026-08-07-aliyun-node-hono-runtime.md:10"
  ];

  const frontmatter = parseFrontmatter(learning);
  assert.equal(frontmatter.category, "runtime-errors");
  assert.equal(frontmatter.problem_type, "runtime_error");
  for (const claim of expectedBodyClaims) {
    assert.ok(learning.includes(claim), `learning must retain verified claim: ${claim}`);
  }
  assert.doesNotMatch(learning, /(?:\b(?:token|secret|credential|password)\b|\bip\s*address\b|\b\d{1,3}(?:\.\d{1,3}){3}\b)/i, "learning must not contain credentials, tokens, or IP addresses");
  for (const target of learning.matchAll(/\[[^\]]*\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
    assert.equal(existsSync(resolve(firstLearningPath, "..", target[1])), true, `relative learning link must resolve: ${target[1]}`);
  }
});

test("the controlled updater only proposes a pinned formal-release PR to dev", async () => {
  const workflowText = readFileSync(updaterWorkflowPath, "utf8");
  const workflow = load(workflowText);

  assert.ok(Array.isArray(workflow.on.schedule), "updater must run on a weekly schedule");
  assert.ok(workflow.on.schedule.some(item => typeof item.cron === "string"), "schedule must use cron");
  assert.deepEqual(workflow.on.workflow_dispatch, {}, "updater must be manually runnable");
  assert.equal(workflow.permissions.contents, "write");
  assert.equal(workflow.permissions["pull-requests"], "write");
  assert.equal(workflow.permissions.actions, "write");
  const updaterCheckout = workflow.jobs["propose-update"].steps.find(step => String(step.uses ?? "").startsWith("actions/checkout@"));
  assert.equal(updaterCheckout?.with?.["persist-credentials"], false, "write-capable checkout must not persist GITHUB_TOKEN in git config");
  assert.match(workflowText, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262\s+# v4/);
  assert.match(workflowText, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020\s+# v4/);
  assert.match(workflowText, /releases\/latest/);
  assert.match(workflowText, /draft/);
  assert.match(workflowText, /prerelease/);
  assert.ok(workflowText.includes("compound-engineering-v\\d+\\.\\d+\\.\\d+"));
  assert.match(workflowText, /decideCompoundEngineeringRelease/);
  assert.match(workflowText, /needed=\$\{decision\.needed\}/);
  assert.match(workflowText, /git clone --no-checkout/);
  assert.match(workflowText, /checkout --detach "refs\/tags\/\$TAG"/);
  assert.match(workflowText, /rev-parse HEAD/);
  assert.match(workflowText, /sync-compound-engineering-skills\.mjs/);
  assert.match(workflowText, /compound-engineering-upstream\.json/);
  assert.doesNotMatch(workflowText, /(?:python(?:3)?|node --test|npm test|npm run (?:lint|build|check:governance|check:integrations|check:environment-capabilities))/, "write-capable updater must never execute vendored files or project tests");
  assert.match(workflowText, /git diff --check/);
  assert.match(workflowText, /BRANCH="codex\/update-compound-engineering-/);
  assert.match(workflowText, /gh pr list --base dev --head "\$BRANCH" --state open/);
  assert.match(workflowText, /\^\{tree\}/);
  assert.match(workflowText, /候选 tree|candidate tree|tree 不一致/i);
  assert.match(workflowText, /复用.*远端分支|reuse.*remote branch/i);
  assert.match(workflowText, /git checkout -B "\$BRANCH" origin\/dev/);
  const candidateStep = workflow.jobs["propose-update"].steps.find(step => step.id === "candidate");
  const candidateRun = candidateStep?.run ?? "";
  assert.equal((candidateRun.match(/^auth_git\(\)/gm) ?? []).length, 1, "candidate step must define one command-scoped Git authenticator");
  assert.match(candidateRun, /auth_git\(\)[\s\S]*credential\.helper=![^']*\$GH_TOKEN/);
  const remoteOriginLines = candidateRun.split("\n").filter(line => /\b(?:fetch|ls-remote|push)\b.*\borigin\b/.test(line));
  assert.equal(remoteOriginLines.length, 4, "candidate step must have exactly four authenticated origin operations");
  for (const line of remoteOriginLines) {
    assert.match(line, /^\s*(?:if\s+)?auth_git\s+(?:fetch|ls-remote|push)\b/, `origin operation must use auth_git: ${line.trim()}`);
  }
  assert.doesNotMatch(candidateRun, /^\s*git fetch origin/m);
  assert.doesNotMatch(candidateRun, /^\s*(?:if\s+)?git ls-remote[^\n]*\borigin\b/m);
  assert.doesNotMatch(candidateRun, /^\s*git push\b/m);
  assert.doesNotMatch(workflowText, /git config[^\n]*(?:credential|extraheader|token)/i, "credentials must not be written to persistent git config");
  assert.match(workflowText, /gh workflow run quality\.yml[\s\S]*--ref "\$BRANCH"[\s\S]*candidate_sha/);
  assert.match(workflowText, /gh run watch "\$RUN_ID" --exit-status/);
  assert.match(workflowText, /gh pr create[\s\S]*--base dev[\s\S]*--head "\$BRANCH"/);
  assert.match(workflowText, /Integration-Impact: none/);
  assert.match(workflowText, /只更新仓库内开发 Skill，不触及 provider runtime/);
  assert.match(workflowText, /Rule-Writeback: docs\/decisions\/2026-08-08-compound-engineering-skills\.md/);
  assert.match(workflowText, /更新当前固定版本记录/);
  assert.match(workflowText, /当前固定版本/);
  assert.match(workflowText, /git add[^\n]*docs\/decisions\/2026-08-08-compound-engineering-skills\.md/);
  assert.match(workflowText, /npm run check:pr -- --base origin\/dev --body-file/);
  assert.ok(
    workflowText.indexOf("git commit") < workflowText.indexOf("compound-engineering-pr-body.md")
      && workflowText.indexOf("compound-engineering-pr-body.md") < workflowText.indexOf("npm run check:pr")
      && workflowText.indexOf("npm run check:pr") < workflowText.indexOf("push --set-upstream")
      && workflowText.indexOf("push --set-upstream") < workflowText.indexOf("gh workflow run quality.yml")
      && workflowText.indexOf("gh workflow run quality.yml") < workflowText.indexOf("gh pr create"),
    "the governed PR body must be checked after commit and before push"
  );
  assert.doesNotMatch(workflowText, /auto-merge|--auto/i);
  assert.doesNotMatch(workflowText, /--force(?:-with-lease)?/);
  assert.doesNotMatch(workflowText, /git push[^\n]*origin\s+(?:dev|main)(?:\s|$)/);
  assert.doesNotMatch(workflowText, /git checkout[^\n]*(?:origin\/main|\bmain\b)/);

  const updaterSteps = workflow.jobs["propose-update"].steps;
  const cleanupStep = updaterSteps.at(-1);
  assert.equal(cleanupStep?.if, "always()", "upstream cleanup must run after success, no-update, or failure paths");
  assert.equal(cleanupStep?.env?.UPSTREAM_DIR, "${{ steps.upstream.outputs.path }}");
  assert.match(cleanupStep?.run ?? "", /RUNNER_TEMP[^\n]*compound-engineering\./);
  assert.match(cleanupStep?.run ?? "", /rm -rf -- "\$UPSTREAM_DIR"/);
  assert.match(cleanupStep?.run ?? "", /拒绝清理|refus|reject/i, "cleanup must reject paths outside its dedicated RUNNER_TEMP child");
  assert.ok(workflowText.lastIndexOf("if: always()") > workflowText.indexOf("gh pr create"), "cleanup must stay after every cross-step consumer");

  const adr = readFileSync(compoundEngineeringAdrPath, "utf8");
  assert.match(adr, /自动化边界/);
  assert.match(adr, /失败/);
  assert.match(adr, /回滚/);
  assert.match(adr, /不自动合并/);
  const manifest = JSON.parse(readFileSync(upstreamManifestPath, "utf8"));
  const currentPin = /^- 当前固定版本：(?<tag>compound-engineering-v\d+\.\d+\.\d+)（commit (?<commit>[0-9a-f]{40})；内容 SHA-256 `(?<contentSha256>[0-9a-f]{64})`）。$/m.exec(adr);
  assert.ok(currentPin?.groups, "ADR must record the current pinned tag, complete commit, and content digest");
  assert.equal(currentPin.groups.tag, manifest.tag);
  assert.equal(currentPin.groups.commit, manifest.commit);
  assert.equal(currentPin.groups.contentSha256, manifest.contentSha256);
});

test("quality can be explicitly dispatched at an exact candidate SHA with read-only permissions", () => {
  const workflowText = readFileSync(qualityWorkflowPath, "utf8");
  const workflow = load(workflowText);

  assert.equal(workflow.permissions.contents, "read");
  assert.ok(workflow.on.workflow_dispatch, "quality must support explicit dispatch");
  assert.ok(workflow.on.workflow_dispatch.inputs.candidate_sha, "dispatch must carry the expected candidate SHA");
  assert.match(workflowText, /actions\/checkout@11d5960a326750d5838078e36cf38b85af677262\s+# v4/);
  assert.match(workflowText, /actions\/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020\s+# v4/);
  assert.match(workflowText, /GITHUB_SHA[\s\S]*candidate_sha|candidate_sha[\s\S]*GITHUB_SHA/);
  assert.match(workflowText, /GITHUB_BASE_REF:[^\n]*workflow_dispatch[^\n]*dev/);
  assert.match(workflowText, /node --test tests\/compound-engineering-skills\.test\.mjs/);
  assert.match(workflowText, /npm run lint/);
  assert.match(workflowText, /npm run check:governance/);
  assert.match(workflowText, /npm run check:integrations/);
  assert.match(workflowText, /npm run check:environment-capabilities/);
  assert.match(workflowText, /npm test/);
  assert.match(workflowText, /npm run build/);
});

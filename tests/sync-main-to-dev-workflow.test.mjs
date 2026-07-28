import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validatePullRequestBranchFlow } from "../scripts/check-pr-branch-flow.mjs";
import { checkRuleWriteback } from "../scripts/integration-registry.mjs";

const workflowPath = new URL("../.github/workflows/sync-main-to-dev.yml", import.meta.url);
const SYNC_BRANCH_PREFIX = "chore/sync-main-to-dev";

test("发布后回同步只在 main 推送时触发", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /on:\s*\n\s*push:\s*\n\s*branches:\s*\[main\]/);
  // dev 推送不得触发，否则会与功能分支合并互相打架。
  assert.equal(/branches:\s*\[main,\s*dev\]/.test(workflow), false);
});

test("回同步分支名满足仓库自身的流向检查", () => {
  const result = validatePullRequestBranchFlow({
    pull_request: { base: { ref: "dev" }, head: { ref: `${SYNC_BRANCH_PREFIX}-abc1234` } }
  });
  assert.equal(result.lane, "feature");
  assert.equal(result.base, "dev");
});

test("回同步 PR 正文带齐声明，否则会被 check:integrations 拒绝", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const bodyMatch = workflow.match(/<<'EOF'\n([\s\S]*?)\n\s*EOF/);
  assert.ok(bodyMatch, "workflow 必须以 heredoc 提供 PR 正文");
  // heredoc 在 YAML 里带缩进，声明校验按行首匹配，需先去掉统一缩进。
  const body = bodyMatch[1].replace(/^ {10}/gm, "");
  const { errors } = checkRuleWriteback({ paths: [], body });
  assert.deepEqual(errors, [], "回同步 PR 的规则反写声明必须自洽");
  assert.match(body, /^Integration-Impact:\s*none$/m);
  assert.match(body, /^Integration-Impact-Reason:\s*\S+/m);
});

test("dev 已包含 main 时不开 PR，避免每次发布都留下空 PR", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /merge-base --is-ancestor/);
  assert.match(workflow, /已包含|already contains/);
});

test("回同步分支按 main 的提交号命名，重复运行不会互相覆盖", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, new RegExp(`${SYNC_BRANCH_PREFIX}-\\$\\{?`));
  assert.match(workflow, /GITHUB_SHA|github\.sha/);
});

test("workflow 具备开 PR 所需的写权限，且不越权", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /pull-requests:\s*write/);
  // 回同步不需要这些权限，给了就是越权。
  assert.equal(/packages:\s*write|id-token:\s*write/.test(workflow), false);
});

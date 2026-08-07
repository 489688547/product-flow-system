import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { validatePullRequestBranchFlow } from "../scripts/check-pr-branch-flow.mjs";

function pullRequest(base, head) {
  return {
    pull_request: {
      base: { ref: base },
      head: { ref: head }
    }
  };
}

test("feature pull requests enter dev only from codex branches", () => {
  assert.deepEqual(validatePullRequestBranchFlow(pullRequest("dev", "codex/example")), {
    valid: true,
    lane: "feature",
    base: "dev",
    head: "codex/example"
  });
  assert.throws(
    () => validatePullRequestBranchFlow(pullRequest("main", "codex/example")),
    /功能分支必须提交到 dev/
  );
});

test("release pull requests enter main only from dev", () => {
  assert.deepEqual(validatePullRequestBranchFlow(pullRequest("main", "dev")), {
    valid: true,
    lane: "release",
    base: "main",
    head: "dev"
  });
  assert.throws(
    () => validatePullRequestBranchFlow(pullRequest("dev", "main")),
    /main 只能接收 dev/
  );
});

test("missing or unrelated pull request branches fail closed", () => {
  assert.throws(() => validatePullRequestBranchFlow({}), /缺少 pull_request/);
  assert.throws(
    () => validatePullRequestBranchFlow(pullRequest("release", "codex/example")),
    /不支持的 PR 流向/
  );
  // 前缀只用于区分功能分支与发布分支，不限定作者或工具；无前缀仍然拒绝。
  assert.throws(
    () => validatePullRequestBranchFlow(pullRequest("dev", "example")),
    /功能分支需使用/
  );
});

test("功能分支前缀不限定来源工具", () => {
  for (const head of ["codex/x", "claude/x", "feat/x", "fix/x", "chore/x", "docs/x"]) {
    const result = validatePullRequestBranchFlow(pullRequest("dev", head));
    assert.equal(result.lane, "feature", `${head} 应被识别为功能分支`);
  }
  // 功能分支仍然只能进 dev，不能直接进 main。
  assert.throws(() => validatePullRequestBranchFlow(pullRequest("main", "claude/x")), /功能分支必须提交到 dev/);
});

test("release workflows deploy only the static test frontend and verify Aliyun APIs", () => {
  const staticWorkflowPath = resolve(".github/workflows/deploy-test-static.yml");
  assert.equal(existsSync(staticWorkflowPath), true);
  const staticWorkflow = readFileSync(staticWorkflowPath, "utf8");
  const smokeWorkflow = readFileSync(resolve(".github/workflows/deployed-smoke.yml"), "utf8");

  assert.match(staticWorkflow, /deshan-tiyes-system-dev/);
  assert.match(staticWorkflow, /VITE_PFS_API_ORIGIN:\s*https:\/\/api-test\.deshan-tiyes\.cn/);
  assert.match(staticWorkflow, /github\.event\.workflow_run\.head_branch == 'dev'/);
  assert.match(staticWorkflow, /RUNNER_TEMP/);
  assert.match(staticWorkflow, /functions|_routes\.json/);
  assert.doesNotMatch(staticWorkflow, /PRODUCT_FLOW_DB|DEMO_FLOW_DB|DINGTALK_APP_SECRET/);

  assert.match(smokeWorkflow, /https:\/\/deshan-tiyes\.cn/);
  assert.match(smokeWorkflow, /https:\/\/test\.deshan-tiyes\.cn/);
  assert.match(smokeWorkflow, /https:\/\/api-test\.deshan-tiyes\.cn/);
  assert.match(smokeWorkflow, /aliyun,dingtalk/);
  assert.match(
    smokeWorkflow,
    /if \[ "\$GITHUB_REF_NAME" = "main" \]; then[\s\S]*ALLOWED_BROWSER_ORIGIN=""/
  );
  assert.doesNotMatch(smokeWorkflow, /deshan-tiyes-system\.pages\.dev|cloudflare-d1/);
});

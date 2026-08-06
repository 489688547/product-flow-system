# 阿里云生产与静态测试前端实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make Aliyun ECS the only production, backend and data runtime, keep Cloudflare Pages solely as the static test frontend, and deliver verified production and test URLs with DingTalk authentication.

**Architecture:** Production serves the React application and all APIs from https://deshan-tiyes.cn on ECS. Test serves static assets from Cloudflare Pages at https://test.deshan-tiyes.cn, while browser API traffic goes directly to the isolated ECS backend at https://api-test.deshan-tiyes.cn; the two ECS runtimes use separate env files, ports and SQLite directories. Wrangler/workerd remains only as an ECS/local compatibility executor and never connects to Cloudflare Workers or D1.

**Tech Stack:** React 19, Vite 7, Cloudflare Pages static assets, Wrangler/workerd local compatibility runtime, Docker Compose, Nginx Proxy Manager, SQLite, OSS, GitHub Actions, ACR, DingTalk OAuth.

## Global Constraints

- https://deshan-tiyes.cn is the only production user URL.
- https://test.deshan-tiyes.cn is the only test user URL; https://api-test.deshan-tiyes.cn is an internal browser API origin.
- Cloudflare may host only the test static build: no Pages Functions, Worker, D1 binding, business Secret or production traffic.
- Production and test use distinct env files, ports, containers, data directories and SQLite files; missing test configuration fails closed and never falls back to production.
- The test backend is on demand on the current 2 GiB ECS; 24-hour test availability requires at least 4 GiB memory.
- functions/api remains the business API source and Wrangler/workerd remains an ECS/local compatibility executor until a separate Node/RDS migration.
- Production rollback uses the previous ACR image plus the matching SQLite snapshot; Cloudflare is not a production rollback target.
- Feature branches start from current dev, target only dev, and preserve other developers' merged collector work.
- Every behavioral task begins with a failing test and ends with an explicit scoped commit.

---

## File Map

- src/state/runtimeApiOrigin.js: resolve browser API URLs to the configured test API origin.
- src/state/dataEnvironmentClient.js: apply URL resolution inside the existing global fetch and data-environment boundary.
- functions/api/platform/_shared/browserOriginPolicy.js: exact-origin credentialed CORS.
- functions/api/auth/_shared/browser-oauth-start.js and browser-oauth-finish.js: split API callback and frontend return origins.
- scripts/prepare-runtime-build.mjs: root entry, static-test artifacts and commit metadata.
- scripts/aliyun/runtime-config.mjs: production and test runtime validation.
- scripts/aliyun/recover-unhealthy-container.mjs: bounded health recovery.
- deploy/aliyun/docker-compose.yml: production and on-demand test API services.
- .github/workflows/deploy-test-static.yml: dev static deployment with no Functions bundle.
- .github/workflows/deployed-smoke.yml: fixed Aliyun production and split-test checks.
- docs/platform sources and generated modules: Aliyun backend and data source of truth.

---

### Task 1: Lock the New Platform Contract

**Files:**
- Modify: docs/features/aliyun-ecs-deployment/prd.md
- Modify: docs/features/aliyun-ecs-deployment/design.md
- Modify: docs/features/aliyun-ecs-deployment/plan.md
- Modify: docs/features/aliyun-ecs-deployment/tasks.md
- Modify: docs/decisions/2026-07-29-aliyun-ecs-sqlite-transition.md
- Modify: docs/platform/environment-capabilities.json
- Modify: docs/platform/integration-registry.json
- Modify: tests/aliyun-ecs-deployment.test.mjs
- Modify: tests/environment-capabilities.test.mjs
- Modify: tests/integration-registry.test.mjs
- Regenerate: functions/api/platform/_generated/environmentCapabilities.js
- Regenerate: functions/api/platform/_generated/integrationRegistry.js

**Interfaces:**
- Consumes: approved migration spec.
- Produces: capability IDs aliyun-ecs-production, aliyun-ecs-test-api and cloudflare-pages-static-test; env names PFS_PUBLIC_APP_ORIGIN, PFS_ALLOWED_BROWSER_ORIGIN and VITE_PFS_API_ORIGIN.

- [x] **Step 1: Write the failing contract assertions**

~~~js
assert.deepEqual(platform("cloudflare-pages").capabilities, ["测试静态前端"]);
assert.equal(platform("cloudflare-d1").status, "retired");
assert.deepEqual(capability("aliyun-ecs-production").requiredIn, ["production"]);
assert.deepEqual(capability("aliyun-ecs-test-api").requiredIn, ["preview"]);
assert.deepEqual(capability("cloudflare-pages-static-test").requiredIn, ["preview"]);
assert.ok(capability("aliyun-ecs-test-api").envVars.includes("PFS_PUBLIC_APP_ORIGIN"));
assert.ok(capability("aliyun-ecs-test-api").envVars.includes("PFS_ALLOWED_BROWSER_ORIGIN"));
~~~

- [x] **Step 2: Prove the old contract fails**

~~~bash
node --test tests/aliyun-ecs-deployment.test.mjs tests/environment-capabilities.test.mjs tests/integration-registry.test.mjs
~~~

Expected: FAIL because Cloudflare remains a backend and D1 platform and the new capabilities do not exist.

- [x] **Step 3: Update durable feature and decision documents**

Copy the approved boundaries exactly. Remove the old Cloudflare production fallback, D1 write source and non-goal that prohibited Cloudflare removal.

- [x] **Step 4: Update registries and regenerate modules**

Set cloudflare-pages to limited with static-test-only capability, set cloudflare-d1 to retired, and remove both from backend and data capabilities.

~~~bash
npm run generate:platform-manifests
npm run check:environment-capabilities
npm run check:integrations
~~~

Expected: PASS.

- [x] **Step 5: Re-run the Step 2 tests**

Expected: PASS.

- [x] **Step 6: Commit only this contract**

~~~bash
git add docs/features/aliyun-ecs-deployment docs/decisions/2026-07-29-aliyun-ecs-sqlite-transition.md docs/platform/environment-capabilities.json docs/platform/integration-registry.json functions/api/platform/_generated tests/aliyun-ecs-deployment.test.mjs tests/environment-capabilities.test.mjs tests/integration-registry.test.mjs
git commit -m "docs(platform): make aliyun the backend source of truth"
~~~

### Task 2: Add the Split-Test Browser API Boundary

**Files:**
- Create: src/state/runtimeApiOrigin.js
- Modify: src/state/dataEnvironmentClient.js
- Modify: src/features/auth/LoginPage.jsx
- Modify: src/domain/dingTalkGroups.js
- Create: react-tests/runtime-api-origin.test.mjs
- Modify: react-tests/data-environment-client.test.mjs
- Modify: react-tests/auth-gate.test.mjs

**Interfaces:**
- Consumes: public build value VITE_PFS_API_ORIGIN.
- Produces: resolveRuntimeApiUrl(input, options) and runtimeApiUrl(path); only same-page paths beginning /api/ are rewritten.

- [x] **Step 1: Write resolver and fetch-boundary tests**

~~~js
assert.equal(resolveRuntimeApiUrl("/api/auth/session", {
  apiOrigin: "https://api-test.deshan-tiyes.cn",
  pageOrigin: "https://test.deshan-tiyes.cn"
}), "https://api-test.deshan-tiyes.cn/api/auth/session");
assert.equal(resolveRuntimeApiUrl("/assets/app.js", options), "/assets/app.js");
assert.equal(resolveRuntimeApiUrl("https://example.com/api/x", options), "https://example.com/api/x");
assert.throws(() => resolveRuntimeApiUrl("/api/x", {
  apiOrigin: "http://api-test.deshan-tiyes.cn",
  pageOrigin: "https://test.deshan-tiyes.cn"
}), /HTTPS/);
~~~

Also assert that the existing boundary rewrites API URLs, sets credentials to include, preserves Request bodies and adds x-data-environment-version to writes.

- [x] **Step 2: Run and confirm failure**

~~~bash
node --test react-tests/runtime-api-origin.test.mjs react-tests/data-environment-client.test.mjs react-tests/auth-gate.test.mjs
~~~

Expected: FAIL because the resolver does not exist.

- [x] **Step 3: Implement the pure resolver**

Accept string, URL and Request inputs. Reject non-HTTPS remote origins, normalize trailing slashes, rewrite only same-page /api/ paths, and leave production same-origin requests untouched.

- [x] **Step 4: Integrate with the existing global fetch boundary**

Use credentials include for resolved API requests. Preserve the data-environment abort/version behavior. Use runtimeApiUrl for top-level DingTalk login and group reauthorization navigation. Do not mass-edit all API consumers.

- [x] **Step 5: Run the Step 2 tests**

Expected: PASS.

- [x] **Step 6: Commit**

~~~bash
git add src/state/runtimeApiOrigin.js src/state/dataEnvironmentClient.js src/features/auth/LoginPage.jsx src/domain/dingTalkGroups.js react-tests/runtime-api-origin.test.mjs react-tests/data-environment-client.test.mjs react-tests/auth-gate.test.mjs
git commit -m "feat(runtime): route static test frontend to ecs api"
~~~

### Task 3: Enforce Exact-Origin CORS and Split OAuth Redirects

**Files:**
- Create: functions/api/platform/_shared/browserOriginPolicy.js
- Modify: functions/api/_middleware.js
- Modify: functions/api/auth/_shared/browser-oauth-start.js
- Modify: functions/api/auth/_shared/browser-oauth-finish.js
- Create: tests/browser-origin-policy.test.mjs
- Modify: tests/dingtalk-oauth-resilience.test.mjs
- Modify: tests/dingtalk-web-auth.test.mjs

**Interfaces:**
- Consumes: PFS_ALLOWED_BROWSER_ORIGIN and PFS_PUBLIC_APP_ORIGIN.
- Produces: browserOriginPolicy(request, env) and withBrowserCors(response, policy).

- [x] **Step 1: Write CORS and OAuth tests**

~~~js
assert.equal(preflight("https://test.deshan-tiyes.cn").status, 204);
assert.equal(preflight("https://evil.example").status, 403);
assert.equal(response.headers.get("access-control-allow-origin"), "https://test.deshan-tiyes.cn");
assert.equal(response.headers.get("access-control-allow-credentials"), "true");
assert.equal(response.headers.get("vary"), "Origin");
assert.equal(oauthAuthorize.searchParams.get("redirect_uri"), "https://api-test.deshan-tiyes.cn/api/auth/dingtalk/callback");
assert.equal(callback.headers.get("location"), "https://test.deshan-tiyes.cn/?login=success");
~~~

Also assert invalid or non-HTTPS configured origins fail with BROWSER_ORIGIN_INVALID and OAuth state mismatch still returns 400.

- [x] **Step 2: Run and confirm failure**

~~~bash
node --test tests/browser-origin-policy.test.mjs tests/dingtalk-oauth-resilience.test.mjs tests/dingtalk-web-auth.test.mjs
~~~

Expected: FAIL because wildcard CORS and same-origin callback return remain.

- [x] **Step 3: Implement the origin policy**

Allow requests without Origin as same-origin/server traffic. For cross-origin browser traffic, compare against the single configured HTTPS origin. Reject mismatch before auth, answer allowed OPTIONS with the exact origin, and overwrite route-level wildcard headers on the final response.

- [x] **Step 4: Implement OAuth public-app return**

Keep DingTalk callback generation based on the ECS API request origin. After session creation, build the final browser redirect only from server-owned PFS_PUBLIC_APP_ORIGIN plus a validated relative return path.

- [x] **Step 5: Re-run the Step 2 tests**

Expected: PASS.

- [x] **Step 6: Commit**

~~~bash
git add functions/api/platform/_shared/browserOriginPolicy.js functions/api/_middleware.js functions/api/auth/_shared/browser-oauth-start.js functions/api/auth/_shared/browser-oauth-finish.js tests/browser-origin-policy.test.mjs tests/dingtalk-oauth-resilience.test.mjs tests/dingtalk-web-auth.test.mjs
git commit -m "feat(auth): support static test frontend on ecs api"
~~~

### Task 4: Produce Root and Static-Test Build Artifacts

**Files:**
- Rename: scripts/prepare-pages-build.mjs to scripts/prepare-runtime-build.mjs
- Delete: scripts/prepare-pages-release.mjs
- Delete: cloudflare-entry.html
- Delete: generated tracked root release artifacts after source audit
- Modify: package.json
- Modify: _redirects
- Modify: _headers
- Delete: public/_routes.json
- Rename and modify: tests/cloudflare-pages-compat.test.mjs to tests/workerd-runtime-compat.test.mjs
- Create: tests/static-test-build.test.mjs

**Interfaces:**
- Consumes: GITHUB_SHA and optional VITE_PFS_API_ORIGIN.
- Produces: dist/index.html, dist/_redirects, dist/_headers and release commit metadata; no cloudflare-entry.html or _routes.json.

- [x] **Step 1: Write failing artifact tests**

Assert root index metadata, SPA rule /* /index.html 200, no cloudflare-entry, no Pages Functions route manifest and valid fixed HTTPS test API origin.

- [x] **Step 2: Run and confirm failure**

~~~bash
node --test tests/static-test-build.test.mjs tests/workerd-runtime-compat.test.mjs
~~~

Expected: FAIL because the renamed files do not exist and the current build produces cloudflare-entry.html.

- [x] **Step 3: Implement prepare-runtime-build**

Preserve commit injection and copy only static headers and redirects. Update the build script to call scripts/prepare-runtime-build.mjs.

- [x] **Step 4: Remove only generated release files**

Prove each deletion is generated by the old release script before deleting it. Keep all source assets under public and src.

- [x] **Step 5: Verify a real static test build**

~~~bash
node --test tests/static-test-build.test.mjs tests/workerd-runtime-compat.test.mjs
VITE_PFS_API_ORIGIN=https://api-test.deshan-tiyes.cn npm run build
test -f dist/index.html
test ! -e dist/cloudflare-entry.html
test ! -e dist/_routes.json
~~~

Expected: PASS.

- [x] **Step 6: Commit the exact rename and deletion set**

~~~bash
git status --short
git commit -m "refactor(build): remove cloudflare production entry artifacts"
~~~

### Task 5: Add Isolated Production and On-Demand Test ECS Runtimes

**Files:**
- Modify: Dockerfile.aliyun
- Modify: deploy/aliyun/docker-compose.yml
- Modify: deploy/aliyun/runtime.env.example
- Create: deploy/aliyun/test-runtime.env.example
- Modify: deploy/aliyun/nginx-proxy-manager/deshan-tiyes.cn.conf
- Create: deploy/aliyun/nginx-proxy-manager/api-test.deshan-tiyes.cn.conf
- Modify: scripts/aliyun/runtime-config.mjs
- Modify: scripts/aliyun/start-runtime.mjs
- Modify: tests/aliyun-ecs-deployment.test.mjs

**Interfaces:**
- Consumes: production paths under /opt/product-flow and test paths under /opt/product-flow-test.
- Produces: product-flow-app on 8080 and Compose profile test service product-flow-test-api on 8081.

- [x] **Step 1: Extend isolation tests**

Assert different container names, loopback ports, env paths and host data mounts; profile test; LOCAL_ONLINE_ACCOUNT_MODE zero; production memory 768 MiB; test memory no more than 512 MiB.

- [x] **Step 2: Run and confirm failure**

~~~bash
node --test tests/aliyun-ecs-deployment.test.mjs
~~~

Expected: FAIL because the test profile does not exist.

- [x] **Step 3: Implement runtime identity and validation**

Add runtimeName production or test, port, absolute persistDir, absolute envFile, HTTPS publicAppOrigin and HTTPS allowedBrowserOrigin. Preserve the current CA certificate fix for DingTalk TLS.

- [x] **Step 4: Add test profile and Nginx host**

Start test only with:

~~~bash
docker compose -f deploy/aliyun/docker-compose.yml --profile test up -d product-flow-test-api
~~~

The test proxy targets only the test container. Production root serves index.html without a cloudflare-entry redirect.

- [x] **Step 5: Validate configurations**

Local Docker CLI was unavailable; the js-yaml compose contract suite passed. The same
`docker compose config` commands remain mandatory on ECS before starting either service.

~~~bash
node --test tests/aliyun-ecs-deployment.test.mjs
docker compose -f deploy/aliyun/docker-compose.yml config
docker compose -f deploy/aliyun/docker-compose.yml --profile test config
~~~

Expected: PASS and no Secret values printed.

- [x] **Step 6: Commit**

~~~bash
git add Dockerfile.aliyun deploy/aliyun scripts/aliyun/runtime-config.mjs scripts/aliyun/start-runtime.mjs tests/aliyun-ecs-deployment.test.mjs
git commit -m "feat(deploy): isolate production and test ecs runtimes"
~~~

### Task 6: Recover Unhealthy Containers Without a Restart Loop

**Files:**
- Create: scripts/aliyun/recover-unhealthy-container.mjs
- Create: deploy/aliyun/product-flow-health-recovery.service
- Create: deploy/aliyun/product-flow-health-recovery.timer
- Modify: deploy/aliyun/README.md
- Create: tests/aliyun-health-recovery.test.mjs

**Interfaces:**
- Consumes: allowlisted container name, Docker health status and state under /opt/product-flow/health-recovery.
- Produces: bounded restart and JSON audit fields checkedAt, container, commit, priorHealth, action and result without Secret output.

- [x] **Step 1: Write policy tests**

Cover healthy no-op, two consecutive unhealthy checks, one restart per 15 minutes, three failed cycles in one hour fail-closed, and unknown container rejection.

- [x] **Step 2: Run and confirm failure**

~~~bash
node --test tests/aliyun-health-recovery.test.mjs
~~~

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement the pure policy and CLI**

Call only formatted Docker health inspect, restart of an allowlisted container and a second health check. Never log full inspect output, env or Secret files.

- [x] **Step 4: Add systemd units**

Run each minute with NoNewPrivileges, ProtectSystem strict, one writable state directory and 45-second timeout. Check test only when its container exists.

- [x] **Step 5: Verify**

~~~bash
node --test tests/aliyun-health-recovery.test.mjs
~~~

On ECS also run systemd-analyze verify against both unit files. Expected: PASS.

- [x] **Step 6: Commit**

~~~bash
git add scripts/aliyun/recover-unhealthy-container.mjs deploy/aliyun/product-flow-health-recovery.service deploy/aliyun/product-flow-health-recovery.timer deploy/aliyun/README.md tests/aliyun-health-recovery.test.mjs
git commit -m "fix(deploy): restart unhealthy ecs runtime safely"
~~~

### Task 7: Replace Backend CI With Static-Test and Aliyun Readiness

**Files:**
- Create: .github/workflows/deploy-test-static.yml
- Modify: .github/workflows/deployed-smoke.yml
- Modify: .github/workflows/quality.yml
- Modify: scripts/check-deployed-smoke.mjs
- Modify: scripts/check-deployed-readiness.mjs
- Modify: package.json
- Modify: tests/deployed-readiness.test.mjs
- Modify: tests/pr-branch-flow.test.mjs
- Rename or delete: Pages environment parity scripts and tests

**Interfaces:**
- Consumes: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID only for static test upload; PRODUCTION_DATA_ACCESS_TOKEN for readiness.
- Produces: static dev deployment from an isolated directory and fixed Aliyun production/test smoke checks.

- [x] **Step 1: Write release-flow tests**

Assert the fixed production, test and test API URLs; the static Pages project name; VITE_PFS_API_ORIGIN; an isolated deploy directory; no old production pages.dev URL; no cloudflare-d1 readiness requirement.

- [x] **Step 2: Run and confirm failure**

~~~bash
node --test tests/deployed-readiness.test.mjs tests/pr-branch-flow.test.mjs tests/static-test-build.test.mjs
~~~

Expected: FAIL because deployed-smoke still targets old Pages backends.

- [x] **Step 3: Implement static-only dev deployment**

After quality, build with the fixed test API origin, copy only dist into RUNNER_TEMP, enter that directory and run the repository Wrangler CLI. Fail before upload if functions, _routes.json or .dev.vars exists there.

- [x] **Step 4: Implement split smoke lanes**

For dev verify static commit, test API readiness and credentialed CORS preflight. For main verify production commit, aliyun and dingtalk readiness, OAuth bootstrap concurrency and absence of x-server-env dev.

- [x] **Step 5: Run focused gates**

~~~bash
node --test tests/deployed-readiness.test.mjs tests/pr-branch-flow.test.mjs tests/static-test-build.test.mjs
npm run check:governance
npm run check:integrations
~~~

Expected: PASS.

- [x] **Step 6: Commit**

~~~bash
git status --short
git commit -m "ci(deploy): verify aliyun backend and static test frontend"
~~~

### Task 8: Remove Retired Cloudflare Backend and D1 Paths

**Files:**
- Delete: CLOUDFLARE_PAGES.md
- Modify: AGENTS.md
- Modify: .agents/skills/environment-parity/SKILL.md
- Modify: .agents/skills/verification/SKILL.md
- Modify: .agents/skills/integration-router/SKILL.md
- Modify: DINGTALK_SETUP.md
- Modify: .env.example
- Modify: docs/platform/architecture.md
- Modify: docs/platform/environment-readiness.md
- Modify: docs/platform/integrations.md
- Delete after migration evidence: scripts/aliyun/export-cloudflare-d1.mjs
- Localize: root Wrangler configuration
- Modify or rename: scripts/start-local-online.mjs and focused tests
- Create: tests/retired-cloudflare-backend.test.mjs

**Interfaces:**
- Consumes: verified ECS databases and archived migration hashes.
- Produces: Cloudflare static-test-only repository rule; local sandbox backend; no remote Worker or D1 execution path.

- [ ] **Step 1: Write the retirement audit**

Reject active old pages.dev backend URLs, remote D1 database IDs, wrangler dev --remote, Cloudflare production rollback, cloudflare-entry, and backend capabilities containing cloudflare-pages or cloudflare-d1. Allow only static test and historical ADR references.

- [ ] **Step 2: Run and confirm failure**

~~~bash
node --test tests/retired-cloudflare-backend.test.mjs
~~~

Expected: FAIL and list current retired paths.

- [ ] **Step 3: Archive migration evidence and remove proven-retired paths**

Record final D1 migration hashes and database verification in the feature task and ADR before deleting the export tool. Keep functions/api. Keep Wrangler only with local/ECS configuration containing no remote IDs, account routes or --remote commands.

- [ ] **Step 4: Replace local online workflow**

Make local sandbox the only locally executed backend. Direct shared acceptance to the fixed test URL and production checks to ECS scripts. Remove remote Cloudflare token transport.

- [ ] **Step 5: Run the audit and search**

~~~bash
node --test tests/retired-cloudflare-backend.test.mjs
rg -n "deshan-tiyes-system[.]pages[.]dev|cloudflare-entry|wrangler dev --remote|database_id" --glob "!docs/decisions/**" --glob "!docs/superpowers/**" .
~~~

Expected: audit PASS and no active backend path; only allowlisted static-test references remain.

- [ ] **Step 6: Commit**

~~~bash
git status --short
git commit -m "chore(platform): retire cloudflare backend and d1"
~~~

### Task 9: Run Full Gates and Publish the Feature Branch

**Files:**
- Modify: docs/features/aliyun-ecs-deployment/tasks.md
- No other planned source changes.

**Interfaces:**
- Consumes: Tasks 1 through 8.
- Produces: PR codex/aliyun-deployment to dev with required integration and rule writeback declarations.

- [ ] **Step 1: Inspect scope**

~~~bash
git status --short
git diff --stat origin/dev...HEAD
git diff --name-only origin/dev...HEAD
~~~

Expected: only migration files plus the preserved CA fix; no unrelated collector edits beyond the dev merge.

- [ ] **Step 2: Run the complete definition of done**

~~~bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
npm run check:pr -- --base origin/dev
~~~

Expected: every command exits zero.

- [ ] **Step 3: Run container verification**

~~~bash
docker compose -f deploy/aliyun/docker-compose.yml config
docker compose -f deploy/aliyun/docker-compose.yml --profile test config
docker build --build-arg PFS_BUILD_COMMIT="$(git rev-parse HEAD)" -f Dockerfile.aliyun -t product-flow-system:aliyun-test .
~~~

Expected: PASS; image reports the full current commit.

- [ ] **Step 4: Record and commit evidence**

~~~bash
git add docs/features/aliyun-ecs-deployment/tasks.md
git commit -m "docs(deploy): record aliyun migration verification"
~~~

- [ ] **Step 5: Push and open PR to dev**

~~~bash
git push origin codex/aliyun-deployment
gh pr create --base dev --head codex/aliyun-deployment --title "feat(deploy): move backend production to aliyun" --body-file /tmp/aliyun-pr-body.md
~~~

Expected: PR base dev and current CI payload.

### Task 10: Deploy and Accept the Test Environment

**Files:**
- External: AliDNS, Cloudflare Pages custom domain, ACR dev build, ECS config/systemd and DingTalk callback.
- Modify after evidence: docs/features/aliyun-ecs-deployment/tasks.md.

**Interfaces:**
- Consumes: merged dev commit and immutable ACR image.
- Produces: https://test.deshan-tiyes.cn plus https://api-test.deshan-tiyes.cn with the same dev commit and isolated test data.

- [ ] **Step 1: Configure DNS without touching production**

In the existing Ego task space, set api-test A to ECS and test CNAME to Pages. Read both records back and verify public DNS.

- [ ] **Step 2: Configure static-only Pages**

Disable the old Git deployment that bundles functions. Add the custom test domain. Confirm no Functions invocation, D1 binding or business Secret.

- [ ] **Step 3: Deploy isolated test API**

Create mode-600 test runtime env and owned test data directory on ECS, pull the dev ACR image, install test Nginx host and start only the test Compose profile. Never display env contents.

- [ ] **Step 4: Prove database isolation**

Record canonical paths, sizes, schema versions and non-sensitive row counts. Perform and remove a reversible test-only write through the app/API and prove production did not change.

- [ ] **Step 5: Verify test DingTalk OAuth in Ego**

Use a fresh session, complete login, verify return to test frontend, authenticated business read from test API and direct network requests to api-test.

- [ ] **Step 6: Exercise on-demand behavior**

Run commit, HTTPS, CORS, cold/warm and 20-concurrency checks. Stop test API and prove production remains 200; restart and prove test recovery.

### Task 11: Release and Accept Production

**Files:**
- External: dev to main PR, ACR main build, ECS production runtime, Nginx and DingTalk callback.
- Modify after evidence: feature tasks and DEV-000014 acceptance.

**Interfaces:**
- Consumes: user-accepted dev commit promoted unchanged.
- Produces: https://deshan-tiyes.cn on ECS with real DingTalk login and no Cloudflare production/backend dependency.

- [ ] **Step 1: Release the accepted commit**

Open the sole dev to main PR. Do not cherry-pick or rebuild from different source. Require quality, static-test, test-API readiness and user acceptance.

- [ ] **Step 2: Snapshot and deploy immutable main image**

Run SQLite Online Backup, verify both hashes and OSS upload, pull the main ACR image, retain the previous image and wait for health before traffic.

- [ ] **Step 3: Verify the simple production root**

Verify root 200, main commit, production environment metadata and no cloudflare-entry redirect. Verify www canonical behavior.

- [ ] **Step 4: Verify real DingTalk production login in Ego**

Use a fresh Ego session, complete OAuth, verify callback host, session, executive role and one authenticated business read. Re-run aliyun,dingtalk readiness and 20 OAuth bootstrap requests.

- [ ] **Step 5: Exercise recovery evidence**

Induce a bounded unhealthy state without corrupting data, observe one automatic restart and recovery log, then verify production remains writable. Confirm previous image and matching snapshot identifiers are selectable without rolling back healthy production.

- [ ] **Step 6: Complete control-plane acceptance**

Record URLs, commits, gates, DingTalk evidence, database isolation, backup and recovery in the feature tasks and DEV-000014. Mark complete only after the user confirms both URLs.

# 核心开发者访问实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authorized core developer place one personal file at a fixed macOS path and run local code against production business APIs without exposing the Token to the browser or Git.

**Architecture:** Extend the existing production-data token boundary with an explicit `core_developer` capability. A smart local launcher selects the existing SQLite sandbox when no file exists, or a Vite-only production proxy when a valid personal file exists; the proxy injects the Token server-side and the production middleware resolves the stable DingTalk identity.

**Tech Stack:** Node.js ES modules, Vite proxy, Cloudflare Pages Functions middleware, SQLite/D1-compatible storage, Node test runner.

## Global Constraints

- The fixed file path is `~/.config/product-flow-system/developer.env` with mode `0600`.
- One person receives one Token; raw Tokens never enter Git, browser code, URLs, logs, audits, test fixtures, or PR text.
- `npm start` selects core mode only for a present valid file; `npm run start:sandbox` always uses local SQLite.
- Only an explicit `core_developer` Token capability may elevate an active stable organization identity for local production-data access.
- Platform credential reveal/grant and external Provider secrets remain independent permissions.
- Production issuance requires a control-database snapshot and outputs files outside every Git worktree.

---

### Task 1: Personal file contract and launcher selection

**Files:**
- Create: `scripts/core-developer-access.mjs`
- Create: `scripts/start-local.mjs`
- Modify: `package.json`
- Modify: `scripts/shared-local-env.mjs`
- Test: `tests/core-developer-access.test.mjs`
- Test: `tests/local-online-start.test.mjs`
- Test: `tests/local-sandbox.test.mjs`

**Interfaces:**
- Produces: `developerAccessPath(homeDir)`, `loadDeveloperAccess({ homeDir, stat, readFile })`, and `selectLocalRuntime({ access }) -> "core" | "sandbox"`.
- Consumes: existing `parseLocalEnv(source)` and child-process lifecycle conventions.

- [ ] **Step 1: Write the failing fixed-path and permission tests**

```js
test("personal developer access loads only from the fixed 0600 file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pfs-home-"));
  const path = join(directory, ".config/product-flow-system/developer.env");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "PRODUCTION_DATA_API_URL=https://deshan-tiyes.cn\nPRODUCTION_DATA_ACCESS_TOKEN=personal\n", { mode: 0o600 });
  const access = await loadDeveloperAccess({ homeDir: directory });
  assert.equal(access.apiUrl, "https://deshan-tiyes.cn");
  assert.equal(access.token, "personal");
});
```

Add this table-driven rejection test:

```js
for (const [label, source, mode] of [
  ["file mode", "PRODUCTION_DATA_API_URL=https://deshan-tiyes.cn\nPRODUCTION_DATA_ACCESS_TOKEN=x\n", 0o644],
  ["HTTP origin", "PRODUCTION_DATA_API_URL=http://deshan-tiyes.cn\nPRODUCTION_DATA_ACCESS_TOKEN=x\n", 0o600],
  ["URL path", "PRODUCTION_DATA_API_URL=https://deshan-tiyes.cn/api\nPRODUCTION_DATA_ACCESS_TOKEN=x\n", 0o600],
  ["empty Token", "PRODUCTION_DATA_API_URL=https://deshan-tiyes.cn\nPRODUCTION_DATA_ACCESS_TOKEN=\n", 0o600]
]) await assert.rejects(() => accessFixture(source, mode), { name: "DeveloperAccessError" }, label);
```

`accessFixture` is a test-only helper declared in the same test file; it creates a temporary home,
writes the fixed-path file with the requested mode, and calls `loadDeveloperAccess`.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/core-developer-access.test.mjs`
Expected: FAIL because `scripts/core-developer-access.mjs` does not exist.

- [ ] **Step 3: Implement the minimal file parser**

```js
export function developerAccessPath(homeDir = homedir()) {
  return join(homeDir, ".config", "product-flow-system", "developer.env");
}

export async function loadDeveloperAccess({ homeDir = homedir() } = {}) {
  const path = developerAccessPath(homeDir);
  const metadata = await stat(path);
  if ((metadata.mode & 0o077) !== 0) throw new Error("开发权限文件必须设置为 0600。");
  const values = parseLocalEnv(await readFile(path, "utf8"));
  return validateDeveloperAccess(values, path);
}
```

Return `null` only for `ENOENT`; other filesystem errors fail closed. Validate exact HTTPS Origin and a non-empty Token without logging its value.

- [ ] **Step 4: Add the smart launcher**

Set `package.json` scripts to:

```json
{
  "start": "node scripts/start-local.mjs",
  "start:sandbox": "node scripts/start-local-sandbox.mjs"
}
```

`start-local.mjs` loads the fixed file and spawns `start-core-developer.mjs` when present, otherwise spawns the sandbox launcher; it forwards `SIGINT`/`SIGTERM` and the child exit code.

- [ ] **Step 5: Verify GREEN and commit**

Run: `node --test tests/core-developer-access.test.mjs tests/local-online-start.test.mjs tests/local-sandbox.test.mjs`
Expected: PASS with no Token text in output.

Commit:

```bash
git add package.json scripts/core-developer-access.mjs scripts/start-local.mjs scripts/shared-local-env.mjs tests/core-developer-access.test.mjs tests/local-online-start.test.mjs tests/local-sandbox.test.mjs
git commit -m "feat(dev): load personal developer access"
```

### Task 2: Core-developer production authentication

**Files:**
- Modify: `functions/api/platform/_shared/productionDataAccess.js`
- Modify: `functions/api/_middleware.js`
- Modify: `functions/api/auth/session.js`
- Test: `tests/production-data-access.test.mjs`
- Test: `tests/core-developer-access.test.mjs`

**Interfaces:**
- Consumes: `authorizeProductionToken(rawToken, db, { capability, now })`.
- Produces: `authorizeCoreDeveloperRequest(request, db, options)` and a server-owned session with `loginMode: "local-online-account"`.

- [ ] **Step 1: Write failing authorization tests**

Add a non-executive active organization member and assert explicit capability behavior:

```js
db.seedMember({ userId: "developer-1", unionId: "union-1", role: "product", active: 1 });
await db.seedToken("core-token", {
  userId: "developer-1", unionId: "union-1",
  capabilities: ["read", "write", "core_developer"]
});
const access = await authorizeProductionToken("core-token", db, { capability: "write" });
assert.equal(access.userId, "developer-1");
assert.equal(access.role, "executive");
assert.equal(access.organizationRole, "product");
await db.seedToken("ordinary-token", {
  userId: "developer-1", unionId: "union-1", capabilities: ["read", "write"]
});
await assert.rejects(
  () => authorizeProductionToken("ordinary-token", db, { capability: "read" }),
  error => error.code === "PRODUCTION_ROLE_REQUIRED"
);
```

`db.seedMember` and `db.seedToken` are test-only helpers added to the existing in-memory
production-access database fixture in `tests/production-data-access.test.mjs`.

In middleware tests, use GET/HEAD and POST/PATCH/PUT/DELETE requests and assert the authorizer receives `read` for the first pair and `write` for the second group.

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test tests/production-data-access.test.mjs tests/core-developer-access.test.mjs`
Expected: FAIL because non-executive identities are always rejected and middleware ignores the core-developer header.

- [ ] **Step 3: Extend the existing authorizer**

Keep current executive behavior unchanged and add:

```js
const coreDeveloper = capabilities.includes("core_developer");
if (!identity || !identity.active || identity.union_id !== row.union_id
    || (identity.role !== "executive" && !coreDeveloper)) {
  throw productionAccessError("当前钉钉身份不再具备生产数据权限。", 403, "PRODUCTION_ROLE_REQUIRED");
}
```

Return `role: coreDeveloper ? "executive" : identity.role`, `organizationRole: identity.role`, and `loginMode: coreDeveloper ? "local-online-account" : ""` so audit retains the actual organization role.

- [ ] **Step 4: Authenticate before normal session middleware**

Read only `x-pfs-core-developer-token`, resolve `read` for GET/HEAD and `write` for mutations, set `context.data.session`, then continue through the existing data-environment selection. Update `/api/auth/session` to prefer `context.data.session` before cookie lookup. Never return the raw header.

- [ ] **Step 5: Verify GREEN and commit**

Run: `node --test tests/production-data-access.test.mjs tests/core-developer-access.test.mjs tests/local-production-data-client.test.mjs`
Expected: PASS; existing executive and invalid-token cases remain green.

Commit:

```bash
git add functions/api/platform/_shared/productionDataAccess.js functions/api/_middleware.js functions/api/auth/session.js tests/production-data-access.test.mjs tests/core-developer-access.test.mjs
git commit -m "feat(auth): authorize core developers"
```

### Task 3: Local production proxy with no browser Token

**Files:**
- Create: `scripts/start-core-developer.mjs`
- Modify: `vite.config.js`
- Test: `tests/core-developer-access.test.mjs`
- Test: `tests/browser-origin-policy.test.mjs`

**Interfaces:**
- Consumes: validated `{ apiUrl, token, path }` from Task 1.
- Produces: Vite at `http://127.0.0.1:8127` with a server-side `/api` proxy.

- [ ] **Step 1: Write failing proxy-policy tests**

Assert the proxy contract with an injectable request recorder:

```js
const policy = createCoreDeveloperProxyPolicy({
  token: "server-only", localOrigin: "http://127.0.0.1:8127"
});
assert.deepEqual(policy.outgoingHeaders({ origin: "http://127.0.0.1:8127" }), {
  "x-pfs-core-developer-token": "server-only"
});
assert.throws(
  () => policy.outgoingHeaders({ origin: "https://attacker.example" }),
  error => error.code === "CORE_DEVELOPER_ORIGIN_REJECTED"
);
assert.equal(JSON.stringify(clientEnvironment({ token: "server-only" })).includes("server-only"), false);
```

`clientEnvironment` is a test-only serializer in the same test file. The production export under
test is `createCoreDeveloperProxyPolicy`.

- [ ] **Step 2: Run tests and confirm RED**

Run: `node --test tests/core-developer-access.test.mjs tests/browser-origin-policy.test.mjs`
Expected: FAIL because the core launcher and proxy hooks do not exist.

- [ ] **Step 3: Implement start-core-developer**

Validate the access file and production `/api/auth/session` reachability. Spawn Vite with
`PFS_CORE_DEVELOPER_API_URL` and `PRODUCTION_DATA_ACCESS_TOKEN` as server-only process variables,
wait for port 8127, and print only the local URL plus Token fingerprint. This mode runs the local
frontend against the deployed backend; it does not run undeployed Functions against production.

- [ ] **Step 4: Implement the proxy hook**

Use `changeOrigin: true`, delete the outgoing Origin, and set the private header inside `configure(proxy)`. On invalid incoming Origin, abort before any production request. Ensure proxy errors report only safe host/status details.

- [ ] **Step 5: Verify GREEN and commit**

Run: `node --test tests/core-developer-access.test.mjs tests/browser-origin-policy.test.mjs`
Expected: PASS and repository search finds no raw test Token outside fixtures.

Commit:

```bash
git add scripts/start-core-developer.mjs vite.config.js tests/core-developer-access.test.mjs tests/browser-origin-policy.test.mjs
git commit -m "feat(dev): proxy core developers to production"
```

### Task 4: Controlled issuance, README and deployment evidence

**Files:**
- Create: `scripts/issue-core-developer-access.mjs`
- Create: `README.md`
- Modify: `.env.example`
- Modify: `AGENTS.md`
- Modify: `docs/decisions/2026-07-18-production-data-access.md`
- Modify: `docs/platform/middleware.md`
- Modify: `docs/platform/error-codes.md`
- Modify: `docs/features/core-developer-access/tasks.md`
- Test: `tests/core-developer-access.test.mjs`

**Interfaces:**
- Consumes: ECS control SQLite path, stable user ID and a repository-external output directory.
- Produces: one `0600` file, one hashed Token row, one no-secret audit event, and a safe `{ path, fingerprint, expiresAt }` summary.

- [ ] **Step 1: Write failing issuance tests**

Use temporary SQLite and assert issuance safety:

```js
const result = await issueCoreDeveloperAccess({
  db, userId: "developer-1", outputPath, now: fixedNow, randomBytes: fixedRandom
});
assert.deepEqual(db.token.capabilities, ["read", "write", "core_developer"]);
assert.match(db.token.token_hash, /^[a-f0-9]{64}$/);
assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
assert.equal(JSON.stringify(result).includes("pfs_dev_"), false);
assert.equal(logs.join("\n").includes("pfs_dev_"), false);
for (const invalid of [missingUser, inactiveUser, missingUnionId, repositoryOutput, duplicateActiveToken]) {
  await assert.rejects(() => issueFixture(invalid), { name: "CoreDeveloperIssuanceError" });
}
```

`issueFixture` and each invalid case are test-only fixtures declared in the same test file.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/core-developer-access.test.mjs`
Expected: FAIL because the issuance export does not exist.

- [ ] **Step 3: Implement atomic issuance**

Generate 32 random bytes, prefix the Base64URL value with `pfs_dev_`, hash before database insertion, and atomically rename a mode-`0600` temporary file. Refuse any output whose real path is inside `git rev-parse --show-toplevel` or its common directory. Audit only user ID, action, fingerprint and timestamps.

- [ ] **Step 4: Write the onboarding documentation**

README first screen must show clone/fork, `npm ci`, fixed file placement and `npm start`; then
describe sandbox fallback, frontend-versus-backend testing, Token revocation, production warnings
and PR flow. `.env.example` states ordinary sandbox startup needs no copy. Durable docs record that
local production mode is an explicit personal-file capability, not a shared secret.

- [ ] **Step 5: Run complete local verification**

Run:

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
npm run check:pr -- --base origin/dev
```

Expected: all exit 0. Docker remains an ACR/ECS lane if unavailable locally.

- [ ] **Step 6: Publish through the fixed branch lane**

Push `codex/aliyun-deployment`, update PR #229 targeting `dev`, wait for CI, merge only after review, then deploy the `dev` candidate to the fixed test frontend/API. Do not create arbitrary Preview acceptance URLs.

- [ ] **Step 7: Issue the two operational files after ECS snapshot**

On ECS, snapshot the control SQLite, run the issuance command separately for each previously verified stable DingTalk user ID, and write files to a root-only temporary delivery directory outside the repository. Verify fingerprints differ, both identities can read, a controlled write uses the correct audit identity, and revoking one leaves the other valid. Never print the files in terminal output.

- [ ] **Step 8: Record evidence and commit documentation**

Update feature tasks with commit, image, snapshot, fingerprints only, fixed-site requests and revocation test. Commit only repository documentation; the two secret files remain outside Git.

Commit:

```bash
git add README.md .env.example AGENTS.md docs/decisions/2026-07-18-production-data-access.md docs/platform/middleware.md docs/platform/error-codes.md docs/features/core-developer-access scripts/issue-core-developer-access.mjs tests/core-developer-access.test.mjs
git commit -m "feat(dev): issue personal access files"
```

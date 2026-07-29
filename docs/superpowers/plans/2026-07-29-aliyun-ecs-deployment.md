# 阿里云服务器部署实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the existing Pages application and both D1 databases on the purchased Aliyun ECS with reproducible migration, backup, verification, and rollback.

**Architecture:** Keep one Functions implementation and execute it with Wrangler's local Pages runtime inside Docker. Persist the production and display D1 bindings in an ECS volume, front the container with the existing Nginx Proxy Manager, and upload consistent SQL backups to private OSS when its bucket and instance role are configured.

**Tech Stack:** React/Vite, Cloudflare Pages Functions, Wrangler 4, local D1/SQLite, Docker Compose, Nginx Proxy Manager, Aliyun ECS and OSS.

## Global Constraints

- Branch is `codex/aliyun-deployment`, based on latest `origin/dev`, and targets `dev`.
- DEV-000014 owns the repository scope before implementation.
- `LOCAL_ONLINE_ACCOUNT_MODE` is forbidden in the public ECS runtime.
- `PRODUCT_FLOW_DB` and `DEMO_FLOW_DB` remain physically separate.
- No Secret, AccessKey, cookie, raw provider response, or database export enters Git.
- Cloudflare stays available until Aliyun passes independent authentication and readiness checks.
- Test behavior first; configuration-only changes are validated through their executable consumers.

---

### Task 1: Environment and integration contract

**Files:**
- Modify: `docs/platform/environment-capabilities.json`
- Modify: `docs/platform/integration-registry.json`
- Modify: `docs/platform/architecture.md`
- Modify: `docs/platform/integrations.md`
- Modify: `functions/api/platform/_generated/environmentCapabilities.js`
- Modify: `functions/api/platform/_generated/integrationRegistry.js`
- Create: `tests/aliyun-ecs-deployment.test.mjs`

**Interfaces:**
- Consumes: accepted ADR and feature PRD.
- Produces: `aliyun-ecs-runtime` and `aliyun-oss-backup` capabilities and registered code paths.

- [ ] **Step 1: Write the failing contract test**

Add a test that loads both manifests and asserts the Aliyun runtime declares
`PRODUCT_FLOW_DB`, `DEMO_FLOW_DB`, `DINGTALK_APP_KEY`,
`DINGTALK_APP_SECRET`, `PLATFORM_CREDENTIAL_MASTER_KEY`, and
`DEMO_DATA_MASKING_KEY`; assert OSS declares only names/locations and no
AccessKey value.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/aliyun-ecs-deployment.test.mjs`

Expected: FAIL because the capability and code paths are absent.

- [ ] **Step 3: Update manifests and durable docs**

Add the two capabilities, extend the Aliyun registry entry with deployment,
database-migration and backup boundaries, and document Cloudflare rollback.

- [ ] **Step 4: Regenerate and verify**

Run:

```bash
npm run generate:platform-manifests
node --test tests/aliyun-ecs-deployment.test.mjs tests/environment-capabilities.test.mjs
npm run check:integrations
```

Expected: PASS with no generated drift.

- [ ] **Step 5: Commit**

```bash
git add docs/platform docs/features/aliyun-ecs-deployment docs/decisions/2026-07-29-aliyun-ecs-sqlite-transition.md docs/superpowers/plans/2026-07-29-aliyun-ecs-deployment.md functions/api/platform/_generated tests/aliyun-ecs-deployment.test.mjs
git commit -m "feat(platform): register aliyun runtime"
```

### Task 2: Runtime configuration and OAuth contract

**Files:**
- Create: `scripts/aliyun/runtime-config.mjs`
- Create: `scripts/aliyun/start-runtime.mjs`
- Create: `deploy/aliyun/wrangler.toml`
- Modify: `tests/aliyun-ecs-deployment.test.mjs`

**Interfaces:**
- Consumes: Aliyun environment capability names.
- Produces: `validateRuntimeEnvironment(env)` and `buildPagesDevArgs(config)`.

- [ ] **Step 1: Write failing runtime tests**

Test that the runtime rejects relative data/env paths and
`LOCAL_ONLINE_ACCOUNT_MODE=1`, includes both local D1 bindings, and creates
`https://deshan-tiyes.top/api/auth/dingtalk/callback` from the real OAuth
start function.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/aliyun-ecs-deployment.test.mjs`

Expected: FAIL because runtime modules/config do not exist.

- [ ] **Step 3: Implement minimal runtime**

Validate absolute paths and a 1024–65535 port, then spawn:

```text
wrangler pages dev <assets> --config <config> --ip 0.0.0.0 --port <port>
  --persist-to <data> --env-file <env> --show-interactive-dev-session=false
```

Forward SIGTERM/SIGINT and never print env contents.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/aliyun-ecs-deployment.test.mjs
npx wrangler pages functions build
```

Expected: PASS and Functions bundle success.

- [ ] **Step 5: Commit**

```bash
git add scripts/aliyun/runtime-config.mjs scripts/aliyun/start-runtime.mjs deploy/aliyun/wrangler.toml tests/aliyun-ecs-deployment.test.mjs
git commit -m "feat(deploy): add aliyun pages runtime"
```

### Task 3: D1 export, import, validation, and backup

**Files:**
- Create: `scripts/aliyun/d1-plan.mjs`
- Create: `scripts/aliyun/export-cloudflare-d1.mjs`
- Create: `scripts/aliyun/import-local-d1.mjs`
- Create: `scripts/aliyun/check-local-d1.mjs`
- Create: `scripts/aliyun/backup-local-d1.mjs`
- Modify: `tests/aliyun-ecs-deployment.test.mjs`

**Interfaces:**
- Consumes: Wrangler config and persistent volume.
- Produces: deterministic command plans and manifest
  `{ createdAt, databases: [{ name, file, bytes, sha256 }] }`.

- [ ] **Step 1: Write failing migration tests**

Using a temporary directory and injected command runner, assert two remote
exports, two isolated local imports, refusal to overwrite a non-empty state
marker, independent SHA-256 values, and validation of
`oss://bucket/prefix/`.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/aliyun-ecs-deployment.test.mjs`

Expected: FAIL because the migration modules do not exist.

- [ ] **Step 3: Implement the minimal migration modules**

Keep command arguments as arrays, create output directories with mode 0700,
write manifests atomically, and invoke `ossutil cp` only when an OSS URI is
present.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/aliyun-ecs-deployment.test.mjs`

Expected: PASS; no real remote export runs in unit tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/aliyun tests/aliyun-ecs-deployment.test.mjs
git commit -m "feat(deploy): add d1 migration tools"
```

### Task 4: Docker and Compose deployment

**Files:**
- Create: `Dockerfile.aliyun`
- Create: `deploy/aliyun/docker-compose.yml`
- Create: `deploy/aliyun/runtime.env.example`
- Create: `deploy/aliyun/README.md`
- Modify: `tests/aliyun-ecs-deployment.test.mjs`

**Interfaces:**
- Consumes: runtime script, config, external env file and data directory.
- Produces: image `product-flow-system:aliyun` and service
  `product-flow-app`.

- [ ] **Step 1: Write failing executable configuration test**

Run `docker compose config` with temporary non-secret variables and assert the
rendered service binds only `127.0.0.1:8080`, mounts the data directory, has a
memory limit and joins the proxy network.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/aliyun-ecs-deployment.test.mjs`

Expected: FAIL because Docker assets do not exist.

- [ ] **Step 3: Implement Docker assets**

Use Node 22, `npm ci`, `npm run build`, an unprivileged runtime user, a
read-only root filesystem where compatible, a writable data volume, 640 MiB
memory limit, 1.5 CPU limit, and a same-origin session health check.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test tests/aliyun-ecs-deployment.test.mjs
docker compose -f deploy/aliyun/docker-compose.yml config
docker build \
  --build-arg PFS_BUILD_COMMIT="$(git rev-parse HEAD)" \
  -f Dockerfile.aliyun \
  -t product-flow-system:aliyun \
  .
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add deploy/aliyun tests/aliyun-ecs-deployment.test.mjs
git commit -m "feat(deploy): add aliyun ecs container"
```

### Task 5: Full verification and private ECS deployment

**Files:**
- Modify: `docs/features/aliyun-ecs-deployment/tasks.md`
- Modify: `docs/features/aliyun-ecs-deployment/plan.md`

**Interfaces:**
- Consumes: tested image and migration tools.
- Produces: server-local healthy container and verification evidence.

- [ ] **Step 1: Run repository gates**

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
git diff --check
```

- [ ] **Step 2: Push the feature branch**

Push `codex/aliyun-deployment`; do not merge or change Cloudflare production.

- [ ] **Step 3: Export and stage data**

Create a fresh two-database export outside Git, verify hashes, transfer it to
`/opt/product-flow/import`, and import only into an empty ECS persist
directory.

- [ ] **Step 4: Start private runtime**

Build/start Compose, verify `127.0.0.1:8080`, restart persistence, anonymous
401 behavior, static assets, a critical read route, and 20 concurrent local
requests.

- [ ] **Step 5: Record evidence**

Update feature tasks and DEV-000014 with commands and results. Mark domain,
OSS and public OAuth checks blocked until their external prerequisites are
complete; do not claim production cutover.

# 阿里云自动发布与本地单份备份实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Automatically deploy a changed ACR `main` image to the Aliyun ECS every two minutes while keeping exactly one verified backup locally and retaining all historical backups in private OSS.

**Architecture:** An ECS `systemd` timer runs a repository-owned Node orchestrator. The orchestrator pulls the fixed private ACR image, exits without side effects when its image ID is unchanged, verifies the candidate Compose contract without executing candidate code, requires a successful SQLite-to-OSS backup, then replaces only the production container. Failed health checks restore the previous image; the independent test container is restored in every path.

**Tech Stack:** Node.js 22 ESM, Docker Compose, systemd, SQLite, ossutil, Node test runner, Aliyun ACR/ECS/OSS.

## Global constraints

- Work only on `codex/aliyun-auto-rollout-retention`, targeting `dev`.
- Do not add GitHub, ACR, ECS, OSS, or Cloudflare credentials.
- Do not expose Docker credentials, runtime env files, tokens, cookies, or provider responses.
- Do not execute code from the candidate image before its Compose contract is approved.
- Do not deploy until all repository gates pass and the user authorizes the release lane.
- Use the fixed production names already registered in the Aliyun deployment documentation.

### Task 1: Make local backup retention depend on successful OSS upload

**Files:**

- Modify: `scripts/aliyun/d1-transfer.mjs`
- Modify: `scripts/aliyun/backup-local-d1.mjs`
- Modify: `tests/aliyun-ecs-deployment.test.mjs`
- Modify: `package.json`

1. Add failing tests that prove:
   - two older direct child snapshot directories are removed after both SQLite files are verified and OSS upload succeeds;
   - the current snapshot remains;
   - files, symlinks, and nested unrelated content are not traversed;
   - an empty OSS destination, incomplete manifest, or failed `ossutil cp` preserves every local snapshot.
2. Run the focused test and require the new assertions to fail for the missing retention behavior:

   ```bash
   node --test tests/aliyun-ecs-deployment.test.mjs
   ```

3. Export a small `retainOnlyCurrentBackup` helper from `d1-transfer.mjs`. Validate that the current directory is an absolute child of the configured backup root, validate the OSS URI, and require the manifest to contain every database in `DATABASES`.
4. Extend `backupLocalD1` with `keepLocalBackups`. Call retention only after `ossutil cp --recursive --force` resolves successfully.
5. Pass `keepLocalBackups: 1` from `backup-local-d1.mjs` only when `OSS_BACKUP_URI` is configured. Preserve the old local-only behavior when OSS is absent.
6. Add `tests/aliyun-ecs-deployment.test.mjs` to the normal `test:api` command so the contract cannot be bypassed.
7. Run the focused test again and require all assertions to pass.

### Task 2: Build the fail-closed ACR rollout orchestrator

**Files:**

- Create: `scripts/aliyun/rollout-acr-main.mjs`
- Create: `tests/aliyun-auto-rollout.test.mjs`
- Modify: `package.json`

1. Write injected-runner tests for these states:
   - pull failure returns `PULL_FAILED` without backup or restart;
   - unchanged candidate returns `no_change` without backup, test-container stop, or production restart;
   - Compose mismatch returns `CONTRACT_MISMATCH` without executing candidate code or stopping containers;
   - backup failure returns `BACKUP_FAILED` and leaves both containers unchanged;
   - successful replacement backs up first, pauses only the test container when running, replaces only `product-flow-app`, waits for health, restores the test container, and returns `deployed`;
   - unhealthy replacement retags the saved image, recreates production, verifies rollback health, and restores the test container;
   - rollback failure surfaces `ROLLBACK_FAILED` and never hides the original failure context.
2. Run the new test and require a module-not-found or missing-behavior failure:

   ```bash
   node --test tests/aliyun-auto-rollout.test.mjs
   ```

3. Implement `rolloutAcrMain` with fixed constants for the registered private ACR image, host Compose path, production local tag, rollback tag, and two container names.
4. Compare the running production image ID with the pulled ACR image ID. Exit immediately when identical.
5. For a changed candidate, use `docker create`, `docker cp`, and `docker rm` to copy `/app/deploy/aliyun/docker-compose.yml` into a private temporary directory. Compare SHA-256 bytes with the host Compose file. Never start the candidate container for this check.
6. Start `product-flow-backup.service` and require success before any running container changes.
7. Preserve whether `product-flow-test-api` was running, stop it only when needed, tag the current production image as rollback, retag the candidate, and recreate only `product-flow-app`.
8. Poll container health every four seconds for at most sixty seconds. On failure, restore the rollback tag, recreate production, require healthy rollback, and restore the test container in `finally`.
9. After success, restore the test container and prune only unused Docker images.
10. Add the new test to `test:api`, rerun both Aliyun focused suites, and require pass.

### Task 3: Package the contract and install hardened systemd units

**Files:**

- Modify: `Dockerfile.aliyun`
- Create: `deploy/aliyun/product-flow-rollout.service`
- Create: `deploy/aliyun/product-flow-rollout.timer`
- Modify: `tests/aliyun-auto-rollout.test.mjs`

1. Add failing static contract tests proving:
   - the runtime image contains the canonical Compose file at `/app/deploy/aliyun/docker-compose.yml`;
   - the service is a root oneshot with Docker/network ordering, a five-minute timeout, private temp space, no-new-privileges, strict system protection, and read-only home access for existing Docker credentials;
   - the timer runs at every even two-minute calendar boundary with one-second accuracy and persistence;
   - neither unit contains secrets.
2. Run the focused test and require failure before adding the Dockerfile copy and units.
3. Copy the canonical Compose contract from the build stage into the Aliyun runtime image.
4. Add `product-flow-rollout.service` invoking the repository-owned rollout script with the existing Node 22 path.
5. Add `product-flow-rollout.timer` using `OnCalendar=*-*-* *:0/2:00`, `AccuracySec=1s`, and `Persistent=true`.
6. Rerun the focused test and require pass.

### Task 4: Write durable Aliyun operations rules

**Files:**

- Modify: `docs/features/aliyun-ecs-deployment/prd.md`
- Modify: `docs/features/aliyun-ecs-deployment/design.md`
- Modify: `docs/features/aliyun-ecs-deployment/plan.md`
- Modify: `docs/features/aliyun-ecs-deployment/tasks.md`
- Modify: `docs/decisions/2026-07-29-aliyun-ecs-sqlite-transition.md`
- Modify: `deploy/aliyun/README.md`

1. Document the two-minute pull model, no-change behavior, static candidate contract gate, backup-before-replace rule, sixty-second health window, rollback, and test-container restoration.
2. Document retention precisely: exactly one verified snapshot directory remains locally only after private OSS upload succeeds; all older history remains in OSS.
3. Add install, enable, inspect, disable, manual-run, and rollback commands for the systemd units. Include expected `no_change`, `deployed`, and safe error codes.
4. Document capacity impact, migration order, failure recovery, and rollback without inventing new environment variables or database bindings.
5. Mark feature tasks only after their matching tests and documentation are complete.

### Task 5: Verify, review, and prepare the `dev` pull request

**Files:**

- Create temporarily outside Git tracking: PR body file under `/tmp`

1. Inspect task-only status and diff:

   ```bash
   git status --short
   git diff --check
   git diff -- scripts/aliyun deploy/aliyun tests/aliyun-ecs-deployment.test.mjs tests/aliyun-auto-rollout.test.mjs Dockerfile.aliyun package.json docs/features/aliyun-ecs-deployment docs/decisions/2026-07-29-aliyun-ecs-sqlite-transition.md
   ```

2. Run the full Definition of Done from the worktree root:

   ```bash
   npm run lint
   npm run check:governance
   npm run check:integrations
   npm run check:environment-capabilities
   npm test
   npm run build
   ```

3. Prepare a PR body declaring:

   ```text
   Integration-Impact: aliyun
   Integration-Impact-Reason: ECS polls the registered ACR main image, requires private OSS backup before replacement, and enforces the existing production Compose contract.
   Rule-Writeback: docs/features/aliyun-ecs-deployment/prd.md, docs/features/aliyun-ecs-deployment/design.md, docs/features/aliyun-ecs-deployment/plan.md, docs/features/aliyun-ecs-deployment/tasks.md, docs/decisions/2026-07-29-aliyun-ecs-sqlite-transition.md
   Rule-Writeback-Reason: Automatic rollout, one-local/all-OSS retention, contract gating, health verification, and rollback are durable Aliyun production rules.
   ```

4. Run the PR preflight against the actual target branch:

   ```bash
   npm run check:pr -- --base origin/dev --body-file /tmp/aliyun-auto-rollout-pr.md
   ```

5. Review the final diff for secret leakage, candidate-code execution, destructive backup ordering, unbounded deletion, missing rollback, and unrelated changes.
6. Commit only task files. Push and open the PR to `dev` only after the user authorizes publishing.

### Task 6: Install on ECS and prove the complete release path

**Prerequisite:** The implementation has merged through `dev`, passed the fixed dev acceptance site, and reached `main` through the sole `dev -> main` release PR.

1. Through the existing logged-in Aliyun Cloud Assistant, install the repository-owned script and units under their documented host paths. Read back the final command before execution; never print secret files.
2. Run `systemd-analyze verify`, execute one manual backup, and verify exactly one local snapshot directory remains while the new prefix exists in private OSS.
3. Run the rollout service against the current image and require `no_change`. Enable and start the timer; verify its next trigger is within two calendar minutes.
4. Allow a later GitOps `main` image to be detected by the timer without manual `docker pull`. Verify the expected image ID and commit, production health, test-container restoration, and service logs.
5. Verify the public path separately:

   ```bash
   curl -fsS https://deshan-tiyes.cn/healthz
   curl -sS -o /dev/null -w '%{http_code}\n' https://deshan-tiyes.cn/api/auth/session
   npm run verify:production -- --require-platform aliyun --require-platform dingtalk --expect-environment production
   ```

6. Record evidence in DEV-000018 only after the fixed site reports the expected release and the local/OSS retention checks pass. Then mark the backlog item complete.

## Completion criteria

- Unchanged ACR state causes no backup and no restart.
- Changed ACR state cannot replace production until contract check and OSS-backed backup succeed.
- Local backup storage contains exactly one latest verified snapshot; historical snapshots remain in private OSS.
- Failed candidate health restores the previous healthy production image and the test container.
- Full repository gates, PR preflight, GitOps release, ECS timer observation, public health, anonymous session, Aliyun readiness, and DingTalk readiness all have fresh evidence.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("health recovery waits for two unhealthy checks and resets on healthy", async () => {
  const { decideHealthRecovery } = await import("../scripts/aliyun/recover-unhealthy-container.mjs");
  const first = decideHealthRecovery({
    container: "product-flow-app",
    health: "unhealthy",
    now: "2026-08-06T10:00:00.000Z",
    state: {}
  });
  assert.equal(first.action, "observe");
  const second = decideHealthRecovery({
    container: "product-flow-app",
    health: "unhealthy",
    now: "2026-08-06T10:01:00.000Z",
    state: first.state
  });
  assert.equal(second.action, "restart");
  const healthy = decideHealthRecovery({
    container: "product-flow-app",
    health: "healthy",
    now: "2026-08-06T10:02:00.000Z",
    state: second.state
  });
  assert.equal(healthy.action, "none");
  assert.equal(healthy.state.consecutiveUnhealthy, 0);
});

test("health recovery permits at most one restart per 15 minutes", async () => {
  const { decideHealthRecovery } = await import("../scripts/aliyun/recover-unhealthy-container.mjs");
  const result = decideHealthRecovery({
    container: "product-flow-app",
    health: "unhealthy",
    now: "2026-08-06T10:10:00.000Z",
    state: {
      consecutiveUnhealthy: 2,
      lastRestartAt: "2026-08-06T10:00:00.000Z",
      failedRestarts: []
    }
  });
  assert.equal(result.action, "cooldown");
});

test("three failed restart cycles in one hour fail closed", async () => {
  const { decideHealthRecovery } = await import("../scripts/aliyun/recover-unhealthy-container.mjs");
  const result = decideHealthRecovery({
    container: "product-flow-app",
    health: "unhealthy",
    now: "2026-08-06T10:55:00.000Z",
    state: {
      consecutiveUnhealthy: 2,
      lastRestartAt: "2026-08-06T10:30:00.000Z",
      failedRestarts: [
        "2026-08-06T10:00:00.000Z",
        "2026-08-06T10:20:00.000Z",
        "2026-08-06T10:40:00.000Z"
      ]
    }
  });
  assert.equal(result.action, "fail-closed");
});

test("unknown containers are rejected and an absent test container is a no-op", async () => {
  const { decideHealthRecovery } = await import("../scripts/aliyun/recover-unhealthy-container.mjs");
  assert.throws(() => decideHealthRecovery({
    container: "attacker-container",
    health: "healthy",
    state: {}
  }), /container/i);
  assert.equal(decideHealthRecovery({
    container: "product-flow-test-api",
    health: "missing",
    state: {}
  }).action, "absent");
});

test("health recovery systemd units are bounded and sandboxed", async () => {
  const service = await readFile(resolve(root, "deploy/aliyun/product-flow-health-recovery.service"), "utf8");
  const timer = await readFile(resolve(root, "deploy/aliyun/product-flow-health-recovery.timer"), "utf8");
  assert.match(service, /^ExecStart=.*recover-unhealthy-container\.mjs/m);
  assert.match(service, /^TimeoutStartSec=45s$/m);
  assert.match(service, /^NoNewPrivileges=true$/m);
  assert.match(service, /^ProtectSystem=strict$/m);
  assert.match(service, /^ReadWritePaths=\/opt\/product-flow\/health-recovery$/m);
  assert.match(timer, /^OnUnitActiveSec=1min$/m);
  assert.match(timer, /^Persistent=true$/m);
});

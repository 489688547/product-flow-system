import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

function commandKey(command, args) {
  return [command, ...args].join(" ");
}

function fakeRuntime({
  currentImage = "sha256:old",
  candidateImage = "sha256:new",
  contract = "services:\n  product-flow-app: {}\n",
  testRunning = true,
  health = ["healthy"],
  failPull = false,
  failCurrentInspect = false,
  failBackup = false,
  failTestStop = false,
  failComposeCount = 0
} = {}) {
  const calls = [];
  let composeFailures = failComposeCount;
  let healthIndex = 0;
  const run = async (command, args) => {
    calls.push(commandKey(command, args));
    if (command === "docker" && args[0] === "pull") {
      if (failPull) throw new Error("pull unavailable");
      return { stdout: "" };
    }
    if (command === "docker" && args[0] === "inspect" && args.at(-1) === "product-flow-app") {
      if (args.includes("{{.Image}}")) {
        if (failCurrentInspect) throw new Error("production missing");
        return { stdout: `${currentImage}\n` };
      }
      if (args.some(value => value.includes("State.Health"))) {
        const value = health[Math.min(healthIndex, health.length - 1)];
        healthIndex += 1;
        return { stdout: `${value}\n` };
      }
    }
    if (command === "docker" && args[0] === "image" && args[1] === "inspect") {
      return { stdout: `${candidateImage}\n` };
    }
    if (command === "docker" && args[0] === "create") return { stdout: "contract-container\n" };
    if (command === "docker" && args[0] === "cp") {
      await writeFile(args[2], contract);
      return { stdout: "" };
    }
    if (command === "docker" && args[0] === "inspect" && args.at(-1) === "product-flow-test-api") {
      return { stdout: `${testRunning ? "true" : "false"}\n` };
    }
    if (command === "systemctl" && args.join(" ") === "start product-flow-backup.service") {
      if (failBackup) throw new Error("backup unavailable");
      return { stdout: "" };
    }
    if (command === "docker" && args.join(" ") === "stop product-flow-test-api" && failTestStop) {
      throw new Error("test stop failed");
    }
    if (command === "docker" && args[0] === "compose" && args.includes("up")) {
      if (composeFailures > 0) {
        composeFailures -= 1;
        throw new Error("compose failed");
      }
      return { stdout: "" };
    }
    return { stdout: "" };
  };
  return { calls, run };
}

async function fixture(contract = "services:\n  product-flow-app: {}\n") {
  const tempRoot = await mkdtemp(join(tmpdir(), "pfs-rollout-test-"));
  const composePath = join(tempRoot, "docker-compose.yml");
  await writeFile(composePath, contract);
  return { tempRoot, composePath };
}

test("pull failure is fail-closed before backup or container changes", async () => {
  const { RolloutError, rolloutAcrMain } = await import("../scripts/aliyun/rollout-acr-main.mjs");
  const files = await fixture();
  const runtime = fakeRuntime({ failPull: true });

  await assert.rejects(
    () => rolloutAcrMain({ ...files, run: runtime.run, sleep: async () => {} }),
    error => error instanceof RolloutError && error.code === "PULL_FAILED"
  );
  assert.equal(runtime.calls.some(call => call.includes("product-flow-backup.service")), false);
  assert.equal(runtime.calls.some(call => call.includes("docker stop")), false);
});

test("missing production container returns a stable safe error before pull", async () => {
  const { RolloutError, rolloutAcrMain } = await import("../scripts/aliyun/rollout-acr-main.mjs");
  const files = await fixture();
  const runtime = fakeRuntime({ failCurrentInspect: true });

  await assert.rejects(
    () => rolloutAcrMain({ ...files, run: runtime.run, sleep: async () => {} }),
    error => error instanceof RolloutError && error.code === "START_FAILED"
  );
  assert.equal(runtime.calls.some(call => call.includes("docker pull")), false);
});

test("unchanged ACR image skips contract copy, backup, and restart", async () => {
  const { rolloutAcrMain } = await import("../scripts/aliyun/rollout-acr-main.mjs");
  const files = await fixture();
  const runtime = fakeRuntime({ currentImage: "sha256:same", candidateImage: "sha256:same" });

  const result = await rolloutAcrMain({ ...files, run: runtime.run, sleep: async () => {} });

  assert.equal(result.status, "no_change");
  assert.equal(runtime.calls.some(call => call.includes("docker create")), false);
  assert.equal(runtime.calls.some(call => call.includes("product-flow-backup.service")), false);
  assert.equal(runtime.calls.some(call => call.includes("docker compose")), false);
});

test("candidate Compose mismatch stops before backup and running containers", async () => {
  const { RolloutError, rolloutAcrMain } = await import("../scripts/aliyun/rollout-acr-main.mjs");
  const files = await fixture("host-contract\n");
  const runtime = fakeRuntime({ contract: "candidate-contract\n" });

  await assert.rejects(
    () => rolloutAcrMain({ ...files, run: runtime.run, sleep: async () => {} }),
    error => error instanceof RolloutError && error.code === "CONTRACT_MISMATCH"
  );
  assert.equal(runtime.calls.some(call => call.includes("docker create")), true);
  assert.equal(runtime.calls.some(call => call.includes("docker start contract-container")), false);
  assert.equal(runtime.calls.some(call => call.includes("product-flow-backup.service")), false);
  assert.equal(runtime.calls.some(call => call.includes("docker stop")), false);
});

test("backup failure preserves production and test containers", async () => {
  const { RolloutError, rolloutAcrMain } = await import("../scripts/aliyun/rollout-acr-main.mjs");
  const files = await fixture();
  const runtime = fakeRuntime({ failBackup: true });

  await assert.rejects(
    () => rolloutAcrMain({ ...files, run: runtime.run, sleep: async () => {} }),
    error => error instanceof RolloutError && error.code === "BACKUP_FAILED"
  );
  assert.equal(runtime.calls.some(call => call.includes("docker stop product-flow-test-api")), false);
  assert.equal(runtime.calls.some(call => call.includes("docker compose")), false);
});

test("test-container stop failure does not recreate untouched production", async () => {
  const { RolloutError, rolloutAcrMain } = await import("../scripts/aliyun/rollout-acr-main.mjs");
  const files = await fixture();
  const runtime = fakeRuntime({ failTestStop: true });

  await assert.rejects(
    () => rolloutAcrMain({ ...files, run: runtime.run, sleep: async () => {} }),
    error => error instanceof RolloutError && error.code === "START_FAILED"
  );
  assert.equal(runtime.calls.some(call => call.includes("docker compose")), false);
  assert.equal(runtime.calls.at(-1), "docker start product-flow-test-api");
});

test("healthy candidate deploys production and restores a running test container", async () => {
  const { rolloutAcrMain } = await import("../scripts/aliyun/rollout-acr-main.mjs");
  const files = await fixture();
  const runtime = fakeRuntime({ health: ["starting", "healthy"] });

  const result = await rolloutAcrMain({ ...files, run: runtime.run, sleep: async () => {} });

  assert.equal(result.status, "deployed");
  const backup = runtime.calls.findIndex(call => call.includes("product-flow-backup.service"));
  const stopTest = runtime.calls.findIndex(call => call === "docker stop product-flow-test-api");
  const replace = runtime.calls.findIndex(call => call.includes("compose") && call.includes("up -d"));
  const restoreTest = runtime.calls.findIndex(call => call === "docker start product-flow-test-api");
  assert.ok(backup >= 0 && backup < stopTest);
  assert.ok(stopTest < replace && replace < restoreTest);
  assert.equal(runtime.calls.filter(call => call.includes("compose") && call.includes("up -d")).length, 1);
  assert.equal(runtime.calls.some(call => call.includes("image prune -f")), true);
});

test("unhealthy candidate rolls production back and restores the test container", async () => {
  const { RolloutError, rolloutAcrMain } = await import("../scripts/aliyun/rollout-acr-main.mjs");
  const files = await fixture();
  const runtime = fakeRuntime({ health: [...Array(15).fill("unhealthy"), "healthy"] });

  await assert.rejects(
    () => rolloutAcrMain({ ...files, run: runtime.run, sleep: async () => {} }),
    error => error instanceof RolloutError && error.code === "HEALTH_FAILED"
  );
  assert.equal(runtime.calls.filter(call => call.includes("compose") && call.includes("up -d")).length, 2);
  assert.equal(runtime.calls.some(call => call === "docker image tag product-flow-system:rollback product-flow-system:aliyun"), true);
  assert.equal(runtime.calls.at(-1), "docker start product-flow-test-api");
});

test("failed rollback reports ROLLBACK_FAILED without losing the deployment cause", async () => {
  const { RolloutError, rolloutAcrMain } = await import("../scripts/aliyun/rollout-acr-main.mjs");
  const files = await fixture();
  const runtime = fakeRuntime({ failComposeCount: 2 });

  await assert.rejects(
    () => rolloutAcrMain({ ...files, run: runtime.run, sleep: async () => {} }),
    error => error instanceof RolloutError
      && error.code === "ROLLBACK_FAILED"
      && error.originalCode === "START_FAILED"
  );
  assert.equal(runtime.calls.at(-1), "docker start product-flow-test-api");
});

test("runtime image and hardened timer package the rollout contract without secrets", async () => {
  const [rollout, service, timer, dockerfile] = await Promise.all([
    readFile(resolve(root, "scripts/aliyun/rollout-acr-main.mjs"), "utf8"),
    readFile(resolve(root, "deploy/aliyun/product-flow-rollout.service"), "utf8"),
    readFile(resolve(root, "deploy/aliyun/product-flow-rollout.timer"), "utf8"),
    readFile(resolve(root, "Dockerfile.aliyun"), "utf8")
  ]);
  assert.match(dockerfile, /COPY --from=build --chown=node:node \/app\/deploy\/aliyun\/docker-compose\.yml \/app\/deploy\/aliyun\/docker-compose\.yml/);
  assert.match(service, /^User=root$/m);
  assert.match(service, /^Type=oneshot$/m);
  assert.match(service, /^After=.*docker\.service.*network-online\.target/m);
  assert.match(service, /^ExecStart=\/opt\/node-v22\.22\.3\/bin\/node \/opt\/product-flow\/app\/scripts\/aliyun\/rollout-acr-main\.mjs$/m);
  assert.match(service, /^TimeoutStartSec=5min$/m);
  assert.match(service, /^NoNewPrivileges=true$/m);
  assert.match(service, /^PrivateTmp=true$/m);
  assert.match(service, /^ProtectSystem=strict$/m);
  assert.match(service, /^ProtectHome=read-only$/m);
  assert.match(timer, /^OnCalendar=\*-\*-\* \*:0\/2:00$/m);
  assert.match(timer, /^AccuracySec=1s$/m);
  assert.match(timer, /^Persistent=true$/m);
  assert.match(timer, /^WantedBy=timers\.target$/m);
  assert.doesNotMatch([rollout, service, timer].join("\n"), /ACCESS_KEY|AccessKey|DINGTALK_APP_SECRET|PRODUCTION_DATA_ACCESS_TOKEN/);
});

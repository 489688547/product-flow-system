#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const ACR_MAIN_IMAGE = "crpi-0d6trrqx4i53366w-vpc.cn-hangzhou.personal.cr.aliyuncs.com/deshan-tiyes/product-flow-system-ecs:main";
export const PRODUCTION_IMAGE = "product-flow-system:aliyun";
export const ROLLBACK_IMAGE = "product-flow-system:rollback";
export const PRODUCTION_CONTAINER = "product-flow-app";
export const TEST_CONTAINER = "product-flow-test-api";
export const HOST_COMPOSE_PATH = "/opt/product-flow/app/deploy/aliyun/docker-compose.yml";

const CANDIDATE_COMPOSE_PATH = "/app/deploy/aliyun/docker-compose.yml";
const HEALTH_ATTEMPTS = 15;
const HEALTH_INTERVAL_MS = 4_000;

export class RolloutError extends Error {
  constructor(message, code, { cause, originalCode = "" } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "RolloutError";
    this.code = code;
    this.originalCode = originalCode;
  }
}

function output(result) {
  return String(result?.stdout || "").trim();
}

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function pullCandidate(run) {
  try {
    await run("docker", ["pull", ACR_MAIN_IMAGE]);
    return output(await run("docker", ["image", "inspect", "--format", "{{.Id}}", ACR_MAIN_IMAGE]));
  } catch (cause) {
    throw new RolloutError("无法拉取或检查 ACR main 镜像。", "PULL_FAILED", { cause });
  }
}

async function verifyCandidateContract({ run, composePath, tempRoot }) {
  const directory = await mkdtemp(join(tempRoot, "pfs-rollout-contract-"));
  const candidatePath = join(directory, "docker-compose.yml");
  let container = "";
  try {
    container = output(await run("docker", ["create", ACR_MAIN_IMAGE]));
    if (!container) throw new Error("候选镜像检查容器 ID 为空。");
    await run("docker", ["cp", `${container}:${CANDIDATE_COMPOSE_PATH}`, candidatePath]);
    const [hostContract, candidateContract] = await Promise.all([
      readFile(composePath),
      readFile(candidatePath)
    ]);
    if (hash(hostContract) !== hash(candidateContract)) {
      throw new Error("候选镜像 Compose 合同与 ECS 主机不一致。");
    }
  } catch (cause) {
    throw new RolloutError("候选镜像 Compose 合同校验失败。", "CONTRACT_MISMATCH", { cause });
  } finally {
    if (container) await run("docker", ["rm", "-f", container]).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
}

async function containerHealth(run) {
  try {
    return output(await run("docker", [
      "inspect",
      "--format",
      "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
      PRODUCTION_CONTAINER
    ])).toLowerCase();
  } catch {
    return "missing";
  }
}

async function waitForHealthy(run, sleep) {
  for (let attempt = 0; attempt < HEALTH_ATTEMPTS; attempt += 1) {
    if (await containerHealth(run) === "healthy") return true;
    if (attempt < HEALTH_ATTEMPTS - 1) await sleep(HEALTH_INTERVAL_MS);
  }
  return false;
}

async function testContainerIsRunning(run) {
  try {
    return output(await run("docker", ["inspect", "--format", "{{.State.Running}}", TEST_CONTAINER])) === "true";
  } catch {
    return false;
  }
}

function composeUpArgs(composePath) {
  return [
    "compose",
    "-f",
    composePath,
    "up",
    "-d",
    "--no-deps",
    "--force-recreate",
    PRODUCTION_CONTAINER
  ];
}

async function restoreProduction({ run, sleep, composePath, original }) {
  try {
    await run("docker", ["image", "tag", ROLLBACK_IMAGE, PRODUCTION_IMAGE]);
    await run("docker", composeUpArgs(composePath));
    if (!(await waitForHealthy(run, sleep))) throw new Error("回滚后的生产容器未恢复健康。");
  } catch (cause) {
    throw new RolloutError("自动回滚失败，需要立即人工恢复。", "ROLLBACK_FAILED", {
      cause,
      originalCode: original.code || "START_FAILED"
    });
  }
}

export async function rolloutAcrMain({
  run = execFileAsync,
  sleep = delay => new Promise(resolveSleep => setTimeout(resolveSleep, delay)),
  composePath = HOST_COMPOSE_PATH,
  tempRoot = tmpdir()
} = {}) {
  let currentImage;
  try {
    currentImage = output(await run("docker", ["inspect", "--format", "{{.Image}}", PRODUCTION_CONTAINER]));
  } catch (cause) {
    throw new RolloutError("当前生产容器不存在或无法检查。", "START_FAILED", { cause });
  }
  const candidateImage = await pullCandidate(run);
  if (currentImage && currentImage === candidateImage) {
    return { status: "no_change", image: candidateImage };
  }

  await verifyCandidateContract({ run, composePath, tempRoot });
  try {
    await run("systemctl", ["start", "product-flow-backup.service"]);
  } catch (cause) {
    throw new RolloutError("发布前 SQLite 私有 OSS 备份失败。", "BACKUP_FAILED", { cause });
  }

  const restoreTestContainer = await testContainerIsRunning(run);
  let deploymentError = null;
  let productionTouched = false;
  try {
    if (!currentImage) throw new RolloutError("当前生产镜像 ID 为空。", "START_FAILED");
    await run("docker", ["image", "tag", currentImage, ROLLBACK_IMAGE]);
    if (restoreTestContainer) await run("docker", ["stop", TEST_CONTAINER]);
    await run("docker", ["image", "tag", ACR_MAIN_IMAGE, PRODUCTION_IMAGE]);
    productionTouched = true;
    try {
      await run("docker", composeUpArgs(composePath));
    } catch (cause) {
      throw new RolloutError("无法创建候选生产容器。", "START_FAILED", { cause });
    }
    if (!(await waitForHealthy(run, sleep))) {
      throw new RolloutError("候选生产容器在 60 秒内未恢复健康。", "HEALTH_FAILED");
    }
  } catch (error) {
    const original = error instanceof RolloutError
      ? error
      : new RolloutError("候选生产容器启动失败。", "START_FAILED", { cause: error });
    if (productionTouched) {
      try {
        await restoreProduction({ run, sleep, composePath, original });
      } catch (rollbackError) {
        deploymentError = rollbackError;
      }
    }
    deploymentError ||= original;
  } finally {
    if (restoreTestContainer) {
      try {
        await run("docker", ["start", TEST_CONTAINER]);
      } catch (cause) {
        if (!deploymentError) {
          deploymentError = new RolloutError("测试容器恢复失败。", "START_FAILED", { cause });
        }
      }
    }
  }

  if (deploymentError) throw deploymentError;
  await run("docker", ["image", "prune", "-f"]).catch(() => {});
  return { status: "deployed", from: currentImage, to: candidateImage };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  rolloutAcrMain().then(result => {
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  }).catch(error => {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      code: error?.code || "ROLLOUT_FAILED",
      originalCode: error?.originalCode || "",
      message: error?.message || String(error)
    })}\n`);
    process.exitCode = 1;
  });
}

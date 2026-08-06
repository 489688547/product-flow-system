import { execFile } from "node:child_process";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const ALLOWED_CONTAINERS = new Set(["product-flow-app", "product-flow-test-api"]);
const RESTART_COOLDOWN_MS = 15 * 60 * 1000;
const FAILURE_WINDOW_MS = 60 * 60 * 1000;
const MAX_FAILED_RESTARTS = 3;

function checkedContainer(container) {
  const value = String(container || "").trim();
  if (!ALLOWED_CONTAINERS.has(value)) throw new Error(`container 不在恢复白名单：${value}`);
  return value;
}

function timestamp(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function normalizedState(state = {}, nowMs) {
  return {
    consecutiveUnhealthy: Math.max(0, Number(state.consecutiveUnhealthy || 0)),
    lastRestartAt: timestamp(state.lastRestartAt) ? new Date(timestamp(state.lastRestartAt)).toISOString() : "",
    failedRestarts: (Array.isArray(state.failedRestarts) ? state.failedRestarts : [])
      .filter(value => timestamp(value) > nowMs - FAILURE_WINDOW_MS)
      .map(value => new Date(timestamp(value)).toISOString())
  };
}

export function decideHealthRecovery({ container, health, state = {}, now = new Date().toISOString() }) {
  checkedContainer(container);
  const checkedAt = new Date(now).toISOString();
  const nowMs = timestamp(checkedAt);
  const next = normalizedState(state, nowMs);
  const priorHealth = String(health || "unknown").trim().toLowerCase();

  if (priorHealth === "missing") {
    return { action: "absent", checkedAt, priorHealth, state: next };
  }
  if (priorHealth === "healthy") {
    next.consecutiveUnhealthy = 0;
    return { action: "none", checkedAt, priorHealth, state: next };
  }
  if (priorHealth !== "unhealthy") {
    return { action: "observe", checkedAt, priorHealth, state: next };
  }

  next.consecutiveUnhealthy += 1;
  if (next.failedRestarts.length >= MAX_FAILED_RESTARTS) {
    return { action: "fail-closed", checkedAt, priorHealth, state: next };
  }
  if (next.consecutiveUnhealthy < 2) {
    return { action: "observe", checkedAt, priorHealth, state: next };
  }
  if (timestamp(next.lastRestartAt) > nowMs - RESTART_COOLDOWN_MS) {
    return { action: "cooldown", checkedAt, priorHealth, state: next };
  }
  return { action: "restart", checkedAt, priorHealth, state: next };
}

export function recordRestartOutcome(state, { checkedAt, health }) {
  const nowMs = timestamp(checkedAt);
  const next = normalizedState(state, nowMs);
  next.lastRestartAt = new Date(nowMs).toISOString();
  next.consecutiveUnhealthy = String(health).toLowerCase() === "healthy" ? 0 : 1;
  if (!["healthy", "starting"].includes(String(health).toLowerCase())) {
    next.failedRestarts.push(next.lastRestartAt);
  }
  return next;
}

async function dockerHealth(container, run) {
  try {
    const { stdout } = await run("docker", [
      "inspect",
      "--format",
      "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
      container
    ]);
    return String(stdout || "").trim().toLowerCase() || "unknown";
  } catch {
    return "missing";
  }
}

async function loadState(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

async function saveState(path, state) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

export async function recoverContainer({
  container,
  stateDir = "/opt/product-flow/health-recovery",
  commit = process.env.PFS_DEPLOY_COMMIT || "unknown",
  now = () => new Date().toISOString(),
  run = execFileAsync
}) {
  const safeContainer = checkedContainer(container);
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const statePath = join(stateDir, `${safeContainer}.json`);
  const auditPath = join(stateDir, "audit.jsonl");
  const priorHealth = await dockerHealth(safeContainer, run);
  const decision = decideHealthRecovery({
    container: safeContainer,
    health: priorHealth,
    state: await loadState(statePath),
    now: now()
  });
  let result = decision.action;
  let nextState = decision.state;

  if (decision.action === "restart") {
    await run("docker", ["restart", safeContainer]);
    const afterHealth = await dockerHealth(safeContainer, run);
    nextState = recordRestartOutcome(nextState, { checkedAt: decision.checkedAt, health: afterHealth });
    result = afterHealth;
  }
  await saveState(statePath, nextState);
  const audit = {
    checkedAt: decision.checkedAt,
    container: safeContainer,
    commit: String(commit || "unknown").slice(0, 40),
    priorHealth,
    action: decision.action,
    result
  };
  await appendFile(auditPath, `${JSON.stringify(audit)}\n`, { mode: 0o600 });
  return audit;
}

export async function recoverKnownContainers(options = {}) {
  const results = [];
  for (const container of ALLOWED_CONTAINERS) {
    results.push(await recoverContainer({ ...options, container }));
  }
  return results;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  recoverKnownContainers().then(results => {
    for (const result of results) process.stdout.write(`${JSON.stringify(result)}\n`);
    if (results.some(result => result.action === "fail-closed")) process.exitCode = 2;
  }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

import {
  DataEnvironmentError,
  controlDatabase
} from "./dataEnvironment.js";
import { getDisplayEnvironmentState } from "./dataEnvironmentStorage.js";

export function collectionTargetFromRequestData(data = {}) {
  const selected = data.dataEnvironment;
  if (selected?.id !== "display") {
    return { environmentId: "production", environmentVersion: 1 };
  }
  return {
    environmentId: "display",
    environmentVersion: Math.max(1, Number(selected.version || 1))
  };
}

export function collectionIdempotencyKey(baseKey, target) {
  return `${String(baseKey || "")}:env:${target.environmentId}:v${target.environmentVersion}`;
}

export async function resolveCollectionBusinessDatabase({
  env = {},
  controlDb = controlDatabase(env),
  target
}) {
  if (target.environmentId !== "display") return controlDb;
  if (!env.DEMO_FLOW_DB) {
    throw new DataEnvironmentError(
      503,
      "DATA_ENVIRONMENT_BINDING_MISSING",
      "展示数据库连接暂不可用。",
      true
    );
  }
  const state = await getDisplayEnvironmentState(controlDb);
  if (state.status !== "ready" || !state.enabled) {
    throw new DataEnvironmentError(
      409,
      "COLLECTION_TARGET_UNAVAILABLE",
      "采集任务对应的展示数据库当前不可用，请更新后重试。",
      true
    );
  }
  if (state.version !== Number(target.environmentVersion)) {
    throw new DataEnvironmentError(
      409,
      "COLLECTION_TARGET_VERSION_CONFLICT",
      "采集任务对应的展示数据库已经更新，请重新创建任务。"
    );
  }
  return env.DEMO_FLOW_DB;
}

export async function targetFromWebCollectionJob(controlDb, jobId) {
  if (!jobId) return null;
  const row = await controlDb.prepare(`SELECT target_environment, target_environment_version
    FROM web_collection_jobs WHERE id = ? LIMIT 1`).bind(jobId).first();
  if (!row) return null;
  return {
    environmentId: row.target_environment === "display" ? "display" : "production",
    environmentVersion: Math.max(1, Number(row.target_environment_version || 1))
  };
}

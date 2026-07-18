import environmentCapabilities from "../_generated/environmentCapabilities.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function detectRuntimeEnvironment(env = {}, requestUrl = "") {
  if (["development", "preview", "production"].includes(env.RUNTIME_ENV)) return env.RUNTIME_ENV;
  if (env.CF_PAGES_BRANCH) return env.CF_PAGES_BRANCH === "main" ? "production" : "preview";
  try {
    const hostname = new URL(requestUrl).hostname;
    if (LOCAL_HOSTS.has(hostname)) return "development";
    if (hostname === "product-flow-system.pages.dev") return "production";
    if (hostname.endsWith(".product-flow-system.pages.dev")) return "preview";
  } catch {
    // Invalid or absent request URL falls back to production-safe checks.
  }
  return "production";
}

export function readinessDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

async function existingTables(db, names) {
  if (!db || !names.length) return new Set();
  const placeholders = names.map(() => "?").join(", ");
  try {
    const result = await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`)
      .bind(...names)
      .all();
    return new Set((result?.results || []).map(row => row.name));
  } catch {
    return new Set();
  }
}

export async function inspectEnvironmentReadiness({ env = {}, requestUrl = "", manifest = environmentCapabilities } = {}) {
  const environment = detectRuntimeEnvironment(env, requestUrl);
  const required = (manifest.capabilities || []).filter(capability => capability.requiredIn.includes(environment));
  const db = readinessDatabase(env);
  const tableNames = [...new Set(required.flatMap(capability => capability.tables || []))];
  const tables = await existingTables(db, tableNames);
  const capabilities = required.map(capability => {
    const missing = [
      ...(capability.envVars || []).filter(name => !env[name]),
      ...(capability.bindings || []).filter(name => name === "PRODUCT_FLOW_DB" ? !db : !env[name]),
      ...(capability.tables || []).filter(name => !tables.has(name))
    ];
    return {
      id: capability.id,
      name: capability.name,
      description: capability.description,
      platforms: capability.platforms,
      level: capability.level,
      status: missing.length ? (capability.level === "blocking" ? "blocked" : "warning") : "ready",
      missing
    };
  });
  return {
    environment,
    ready: capabilities.every(capability => capability.status !== "blocked"),
    checkedAt: new Date().toISOString(),
    capabilities,
    dataAccess: {
      source: environment === "development" ? "production-gateway-or-local" : "current-environment",
      productionWrite: "locked"
    }
  };
}

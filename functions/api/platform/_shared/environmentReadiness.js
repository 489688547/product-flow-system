import environmentCapabilities from "../_generated/environmentCapabilities.js";
import { isValidPlatformCredentialMasterKey } from "./credentialCrypto.js";
import { configuredCredentialEnvVars } from "./platformCredentials.js";

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

export function readinessDatabase(env = {}, binding = "PRODUCT_FLOW_DB") {
  if (binding === "PRODUCT_FLOW_DB") {
    return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
  }
  return env[binding] || null;
}

function environmentVariableMissing(name, env, vaultEnvVars) {
  if (name === "PLATFORM_CREDENTIAL_MASTER_KEY") {
    return !isValidPlatformCredentialMasterKey(env[name]);
  }
  if (name === "DEMO_DATA_MASKING_KEY") {
    return String(env[name] || "").length < 16;
  }
  return !env[name] && !vaultEnvVars.has(name);
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
  const tableRequirements = new Map();
  for (const capability of required) {
    const defaultBinding = capability.bindings?.[0] || "PRODUCT_FLOW_DB";
    if ((capability.tables || []).length) {
      if (!tableRequirements.has(defaultBinding)) tableRequirements.set(defaultBinding, new Set());
      capability.tables.forEach(table => tableRequirements.get(defaultBinding).add(table));
    }
    for (const [binding, tables] of Object.entries(capability.bindingTables || {})) {
      if (!tableRequirements.has(binding)) tableRequirements.set(binding, new Set());
      tables.forEach(table => tableRequirements.get(binding).add(table));
    }
  }
  const tablesByBinding = new Map(await Promise.all(
    [...tableRequirements.entries()].map(async ([binding, names]) => [
      binding,
      await existingTables(readinessDatabase(env, binding), [...names])
    ])
  ));
  const vaultEnvVars = await configuredCredentialEnvVars(env);
  const capabilities = required.map(capability => {
    const defaultBinding = capability.bindings?.[0] || "PRODUCT_FLOW_DB";
    const missing = [
      ...(capability.envVars || []).filter(name => environmentVariableMissing(name, env, vaultEnvVars)),
      ...(capability.bindings || []).filter(name => !readinessDatabase(env, name)),
      ...(capability.tables || []).filter(name => !tablesByBinding.get(defaultBinding)?.has(name)),
      ...Object.entries(capability.bindingTables || {}).flatMap(([binding, tables]) =>
        tables
          .filter(name => !tablesByBinding.get(binding)?.has(name))
          .map(name => `${binding}:${name}`)
      )
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

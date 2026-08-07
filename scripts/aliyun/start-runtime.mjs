import { serve } from "@hono/node-server";
import { existsSync } from "node:fs";
import { once } from "node:events";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createAliyunApp } from "../../server/aliyun/app.mjs";
import { createD1Database } from "../../server/aliyun/sqlite-d1.mjs";
import { createStaticAssetBinding } from "../../server/aliyun/static-assets.mjs";
import { validateRuntimeEnvironment } from "./runtime-config.mjs";

function requirePath(path, label) {
  if (!existsSync(path)) throw new Error(`${label}不存在：${path}`);
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolvePromise, reject) => {
    server.close(error => error ? reject(error) : resolvePromise());
  });
}

export async function startAliyunRuntime({
  env = process.env,
  worker: injectedWorker,
  serveImpl = serve,
  logger = console,
  registerSignals = true
} = {}) {
  const config = validateRuntimeEnvironment(env);
  requirePath(config.envFile, "运行时环境文件");
  requirePath(config.assetsDir, "静态资源目录");
  requirePath(config.bundlePath, "Functions bundle");
  requirePath(config.productDatabasePath, "正式 SQLite");
  requirePath(config.demoDatabasePath, "展示 SQLite");

  const productDatabase = createD1Database({ file: config.productDatabasePath });
  const demoDatabase = createD1Database({ file: config.demoDatabasePath });
  let server;
  let closed = false;
  let signalHandler;
  try {
    const imported = injectedWorker ? null : await import(pathToFileURL(config.bundlePath).href);
    const worker = injectedWorker || imported?.default;
    const app = createAliyunApp({
      worker,
      env: {
        ...env,
        DB: productDatabase,
        PRODUCT_FLOW_DB: productDatabase,
        DEMO_FLOW_DB: demoDatabase,
        RUNTIME_ENV: env.RUNTIME_ENV || config.runtimeName
      },
      assets: createStaticAssetBinding({ root: config.assetsDir }),
      publicApiOrigin: config.publicApiOrigin,
      logger
    });
    server = serveImpl({ fetch: app.fetch, hostname: config.host, port: config.port });
    if (!server.listening) await once(server, "listening");
  } catch (error) {
    await Promise.allSettled([productDatabase.close(), demoDatabase.close()]);
    throw error;
  }

  const close = async () => {
    if (closed) return;
    closed = true;
    if (signalHandler) {
      process.removeListener("SIGINT", signalHandler);
      process.removeListener("SIGTERM", signalHandler);
    }
    await closeServer(server);
    await Promise.all([productDatabase.close(), demoDatabase.close()]);
  };
  if (registerSignals) {
    signalHandler = () => {
      close().catch(error => {
        logger.error(error?.message || String(error));
        process.exitCode = 1;
      });
    };
    process.once("SIGINT", signalHandler);
    process.once("SIGTERM", signalHandler);
  }
  logger.info(JSON.stringify({
    event: "runtime_started",
    runtime: config.runtimeName,
    host: config.host,
    port: config.port
  }));
  return Object.freeze({
    server,
    databases: Object.freeze([productDatabase, demoDatabase]),
    close
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  startAliyunRuntime().catch(error => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}

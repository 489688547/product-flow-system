import { randomUUID } from "node:crypto";
import { Hono } from "hono";

function publicRequest(request, publicApiOrigin) {
  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, publicApiOrigin);
  const hasBody = !["GET", "HEAD"].includes(request.method);
  return new Request(target, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? request.body : undefined,
    ...(hasBody && request.body ? { duplex: "half" } : {})
  });
}

function executionContext(logger, requestId) {
  return {
    waitUntil(promise) {
      Promise.resolve(promise).catch(error => {
        logger.error(JSON.stringify({
          event: "wait_until_failed",
          requestId,
          message: String(error?.message || error)
        }));
      });
    },
    passThroughOnException() {}
  };
}

function withRequestId(response, requestId) {
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export function createAliyunApp({ worker, env, assets, publicApiOrigin, logger = console }) {
  if (typeof worker?.fetch !== "function") throw new Error("Functions bundle must export fetch().");
  if (typeof assets?.fetch !== "function") throw new Error("Static asset binding must export fetch().");
  const app = new Hono();
  const runtimeEnv = Object.freeze({ ...env, ASSETS: assets });

  app.get("/healthz", c => c.json({ ok: true, runtime: "node-hono" }));
  app.all("*", async c => {
    const startedAt = performance.now();
    const requestId = c.req.header("x-request-id") || randomUUID();
    try {
      const response = await worker.fetch(
        publicRequest(c.req.raw, publicApiOrigin),
        runtimeEnv,
        executionContext(logger, requestId)
      );
      logger.info(JSON.stringify({
        event: "request",
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: response.status,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100
      }));
      return withRequestId(response, requestId);
    } catch (error) {
      logger.error(JSON.stringify({
        event: "request_failed",
        requestId,
        method: c.req.method,
        path: c.req.path,
        message: String(error?.message || error)
      }));
      return c.json({
        message: "服务暂时不可用，请稍后重试。",
        error: { code: "ALIYUN_RUNTIME_ERROR", retryable: true }
      }, 500, { "x-request-id": requestId });
    }
  });
  return app;
}

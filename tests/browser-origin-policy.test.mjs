import assert from "node:assert/strict";
import test from "node:test";

import { onRequest as apiMiddleware } from "../functions/api/_middleware.js";

const allowedOrigin = "https://test.deshan-tiyes.cn";
const apiOrigin = "https://api-test.deshan-tiyes.cn";

function context(method, origin, env = {}) {
  const headers = origin ? { origin } : {};
  return {
    request: new Request(`${apiOrigin}/api/auth/session`, { method, headers }),
    env: { PFS_ALLOWED_BROWSER_ORIGIN: allowedOrigin, ...env },
    data: {},
    next: async () => Response.json({ ok: true }, {
      headers: { "access-control-allow-origin": "*" }
    })
  };
}

test("allowed test frontend receives exact credentialed CORS headers", async () => {
  const response = await apiMiddleware(context("GET", allowedOrigin));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), allowedOrigin);
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.equal(response.headers.get("vary"), "Origin");
});

test("preflight allows only the configured browser origin", async () => {
  const allowed = await apiMiddleware(context("OPTIONS", allowedOrigin));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), allowedOrigin);

  const rejected = await apiMiddleware(context("OPTIONS", "https://evil.example"));
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
});

test("invalid configured browser origins fail closed", async () => {
  const response = await apiMiddleware(context("GET", allowedOrigin, {
    PFS_ALLOWED_BROWSER_ORIGIN: "http://test.deshan-tiyes.cn"
  }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "BROWSER_ORIGIN_INVALID");
});

test("server and same-origin traffic never retains route-level wildcard CORS", async () => {
  const response = await apiMiddleware(context("GET", null));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

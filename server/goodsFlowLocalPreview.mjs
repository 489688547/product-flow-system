import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { onRequest as dashboard } from "../functions/api/platform/v1/goods-flow/dashboard.js";
import { onRequest as imports } from "../functions/api/platform/v1/goods-flow/imports.js";
import { onRequest as inventory } from "../functions/api/platform/v1/goods-flow/inventory.js";
import { onRequest as terms } from "../functions/api/platform/v1/goods-flow/receivable-terms.js";
import { onRequest as stocktakes } from "../functions/api/platform/v1/goods-flow/stocktakes.js";
import { onRequest as transitions } from "../functions/api/platform/v1/goods-flow/stocktakes/[id]/transitions.js";
import { onRequest as ccc } from "../functions/api/platform/v1/goods-flow/ccc.js";
import { onRequest as recalculate } from "../functions/api/platform/v1/goods-flow/ccc/[month]/recalculate.js";
import { onRequest as freeze } from "../functions/api/platform/v1/goods-flow/ccc/[month]/freeze.js";
import { createGoodsFlowLocalDatabase } from "./goodsFlowLocalDatabase.mjs";

const LOCAL_SESSION = { userId: "local-executive", name: "本地测试", department: "总经办" };

function matchRoute(pathname) {
  const base = "/api/platform/v1/goods-flow";
  if (pathname === `${base}/dashboard`) return { handler: dashboard, params: {} };
  if (pathname === `${base}/inventory`) return { handler: inventory, params: {} };
  if (pathname === `${base}/imports`) return { handler: imports, params: {} };
  if (pathname === `${base}/receivable-terms`) return { handler: terms, params: {} };
  if (pathname === `${base}/stocktakes`) return { handler: stocktakes, params: {} };
  if (pathname === `${base}/ccc`) return { handler: ccc, params: {} };
  const stocktake = pathname.match(new RegExp(`^${base}/stocktakes/([^/]+)/transitions$`));
  if (stocktake) return { handler: transitions, params: { id: decodeURIComponent(stocktake[1]) } };
  const monthly = pathname.match(new RegExp(`^${base}/ccc/(\\d{4}-\\d{2})/(recalculate|freeze)$`));
  if (monthly) return { handler: monthly[2] === "freeze" ? freeze : recalculate, params: { month: monthly[1] } };
  return null;
}

async function requestBody(req) {
  if (["GET", "HEAD"].includes(req.method)) return undefined;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

export function createGoodsFlowLocalPreview({ storagePath }) {
  let databasePromise;
  async function database() {
    if (!databasePromise) {
      databasePromise = readFile(storagePath, "utf8")
        .then(raw => createGoodsFlowLocalDatabase(JSON.parse(raw)))
        .catch(() => createGoodsFlowLocalDatabase());
    }
    return databasePromise;
  }

  return async function handleGoodsFlowLocalPreview(req, res, url) {
    const route = matchRoute(url.pathname);
    if (!route) return false;
    const db = await database();
    const body = await requestBody(req);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (Array.isArray(value)) value.forEach(item => headers.append(key, item));
      else if (value !== undefined) headers.set(key, value);
    }
    const request = new Request(url, { method: req.method, headers, ...(body === undefined ? {} : { body }) });
    const response = await route.handler({
      request,
      env: { PRODUCT_FLOW_DB: db },
      data: { session: LOCAL_SESSION },
      params: route.params
    });
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      await mkdir(path.dirname(storagePath), { recursive: true });
      await writeFile(storagePath, JSON.stringify(db.snapshot(), null, 2));
    }
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(Buffer.from(await response.arrayBuffer()));
    return true;
  };
}

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";

const recoveryPath = new URL("../src/state/deploymentRecovery.js", import.meta.url);

test("旧版本动态分包失效时只自动刷新一次", async () => {
  assert.equal(existsSync(recoveryPath), true, "应提供部署版本恢复模块");

  const { installDeploymentRecovery } = await import(pathToFileURL(recoveryPath.pathname));
  const listeners = new Map();
  const values = new Map();
  let reloads = 0;
  let currentTime = 100_000;
  const windowRef = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const storage = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };

  const uninstall = installDeploymentRecovery({
    windowRef,
    storage,
    now: () => currentTime,
    reload: () => { reloads += 1; },
    cooldownMs: 60_000,
  });
  const preventions = [];
  const dispatchPreloadError = () => listeners.get("vite:preloadError")({
    preventDefault: () => preventions.push(true),
  });

  dispatchPreloadError();
  dispatchPreloadError();

  assert.equal(reloads, 1, "同一版本错误不能造成无限刷新");
  assert.equal(preventions.length, 2, "已接管的分包错误不应继续让应用崩溃");

  currentTime += 60_001;
  dispatchPreloadError();
  assert.equal(reloads, 2, "冷却期后再次出现的真实版本错误仍可恢复");

  uninstall();
  assert.equal(listeners.has("vite:preloadError"), false);
});

test("应用启动前安装恢复监听，Pages 发布包含顶层 404 页面", () => {
  const mainSource = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  const installAt = mainSource.indexOf("installDeploymentRecovery()");
  const renderAt = mainSource.indexOf("createRoot(");

  assert.ok(installAt >= 0, "应用入口应安装分包恢复监听");
  assert.ok(installAt < renderAt, "恢复监听必须先于 React 渲染安装");

  const releaseSource = readFileSync(new URL("../scripts/prepare-pages-release.mjs", import.meta.url), "utf8");
  assert.match(releaseSource, /404\.html/);
  assert.equal(
    existsSync(new URL("../404.html", import.meta.url)),
    true,
    "顶层 404.html 可阻止 Pages 把缺失 JS 伪装成首页 HTML",
  );
});

test("钉钉受限 WebView 禁用会话存储时也不会连续刷新", async () => {
  assert.equal(existsSync(recoveryPath), true);
  const { installDeploymentRecovery } = await import(pathToFileURL(recoveryPath.pathname));
  let listener;
  let reloads = 0;

  installDeploymentRecovery({
    windowRef: {
      addEventListener(_type, nextListener) { listener = nextListener; },
      removeEventListener() {},
    },
    storage: {
      getItem() { throw new Error("storage disabled"); },
      setItem() { throw new Error("storage disabled"); },
    },
    now: () => 100_000,
    reload: () => { reloads += 1; },
  });

  listener({ preventDefault() {} });
  listener({ preventDefault() {} });
  assert.equal(reloads, 1);
});

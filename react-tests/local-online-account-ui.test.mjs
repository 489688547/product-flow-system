import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path) {
  return readFileSync(resolve(path), "utf8");
}

test("local authentication never falls back to a hard-coded executive identity", () => {
  const authProvider = source("src/state/AuthProvider.jsx");

  assert.doesNotMatch(authProvider, /const LOCAL_USER/);
  assert.doesNotMatch(authProvider, /setAuth\(\{ status: "authenticated", user: LOCAL_USER/);
  assert.doesNotMatch(authProvider, /loginMode:\s*"local-dev"/);
});

test("every app shows the real account when local code is operating online", () => {
  const banner = source("src/ui/LocalOnlineEnvironmentBanner.jsx");
  const app = source("src/App.jsx");
  const styles = source("src/styles.css");

  assert.match(banner, /loginMode !== "local-online-account"/);
  assert.match(banner, /本地代码 · 线上真实环境/);
  assert.match(banner, /当前账号：\{sessionUser\.name\}/);
  assert.match(banner, /数据修改、钉钉和快麦操作都会立即在线上生效/);
  assert.match(banner, /role="status"/);
  assert.match(app, /LocalOnlineEnvironmentBanner/);
  assert.match(app, /<LocalOnlineEnvironmentBanner sessionUser=\{sessionUser\}/);
  assert.match(styles, /\.local-online-environment/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(styles, /\.local-online-environment[^}]*position:\s*fixed/s);
});

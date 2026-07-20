import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);

async function reservePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  server.close();
  await once(server, "close");
  return port;
}

async function waitForOk(url, isCancelled, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isCancelled()) return;
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The launcher may still be starting its child process.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForOutput(match, readOutput, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (match.test(readOutput())) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for launcher output:\n${readOutput()}`);
}

test("goods-flow preview launcher keeps the API and web app available together", { timeout: 20_000 }, async () => {
  const apiPort = await reservePort();
  let webPort = await reservePort();
  while (webPort === apiPort) webPort = await reservePort();

  const launcher = spawn(process.execPath, ["scripts/start-goods-flow-preview.mjs"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      GOODS_FLOW_API_PORT: String(apiPort),
      GOODS_FLOW_WEB_PORT: String(webPort)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  launcher.stdout.on("data", chunk => { output += chunk; });
  launcher.stderr.on("data", chunk => { output += chunk; });
  const exitPromise = once(launcher, "exit");
  let cancelled = false;

  try {
    const exitedBeforeReady = exitPromise.then(([code, signal]) => {
      throw new Error(`Launcher exited before ready (${code ?? signal})\n${output}`);
    });
    await Promise.race([
      Promise.all([
        waitForOk(`http://127.0.0.1:${apiPort}/api/platform/v1/goods-flow/dashboard`, () => cancelled),
        waitForOk(`http://127.0.0.1:${webPort}/#supply-overview`, () => cancelled)
      ]),
      exitedBeforeReady
    ]);
    await waitForOutput(/货流测试页已就绪/, () => output);
    assert.match(output, /货流测试页已就绪/);
  } finally {
    cancelled = true;
    if (launcher.exitCode === null && launcher.signalCode === null) launcher.kill("SIGTERM");
    await exitPromise;
  }
});

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const CHROME_BINARY = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function endpointReady(endpoint, fetchImpl = fetch) {
  try { return (await fetchImpl(`${endpoint.replace(/\/$/, "")}/json/version`)).ok; } catch { return false; }
}

export async function ensureCompanyChrome(endpoint = "http://127.0.0.1:9222", options = {}) {
  if (await endpointReady(endpoint, options.fetchImpl)) return;
  const profile = options.profile || join(homedir(), ".product-flow-browser");
  const process = spawn(options.binary || CHROME_BINARY, [
    "--remote-debugging-port=9222",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check"
  ], { detached: true, stdio: "ignore" });
  process.unref();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (await endpointReady(endpoint, options.fetchImpl)) return;
  }
  throw new Error("无法启动公司 Mac 的独立 Chrome 采集窗口。");
}

import { DataConnectionAgentApi } from "./api.mjs";
import { ensureCompanyChrome } from "./chrome.mjs";
import { runDataConnectionTasks } from "./core.mjs";
import { ChromeDevtoolsBrowser } from "../user-insights-collector/chrome-devtools.mjs";

const baseUrl = process.env.DATA_CONNECTION_AGENT_URL || "https://product-flow-system.pages.dev";
const token = process.env.DATA_CONNECTION_AGENT_TOKEN || process.env.USER_INSIGHT_COLLECTOR_TOKEN || "";
const endpoint = process.env.CHROME_DEBUG_ENDPOINT || "http://127.0.0.1:9222";
const once = process.argv.includes("--once");

if (!token) throw new Error("缺少 DATA_CONNECTION_AGENT_TOKEN。请先在数据中心登记公司 Mac 采集设备。");

const api = new DataConnectionAgentApi(baseUrl, token);
await ensureCompanyChrome(endpoint);
const browser = new ChromeDevtoolsBrowser(endpoint);

do {
  const tasks = await api.tasks();
  const summary = await runDataConnectionTasks(tasks, { api, browser });
  process.stdout.write(`${new Date().toISOString()} 采集任务：完成 ${summary.completed}，失败 ${summary.failed}，人工验证 ${summary.waitingHuman}\n`);
  if (!once) await new Promise(resolve => setTimeout(resolve, 30000));
} while (!once);

#!/usr/bin/env node
import { collectRegisteredTasks } from "./core.mjs";
import { ChromeDevtoolsBrowser } from "./chrome-devtools.mjs";

const baseUrl = String(process.env.USER_INSIGHTS_BASE_URL || "http://127.0.0.1:8132").replace(/\/$/, "");
const runnerToken = String(process.env.USER_INSIGHTS_RUNNER_TOKEN || "");
const cdpEndpoint = String(process.env.USER_INSIGHTS_CDP_ENDPOINT || "http://127.0.0.1:9222");
const force = process.argv.includes("--force");

if (!runnerToken) throw new Error("缺少 USER_INSIGHTS_RUNNER_TOKEN；令牌只应保存在公司 Mac 的安全进程环境中。");

const headers = { authorization: `Bearer ${runnerToken}`, "content-type": "application/json" };
const tasksResponse = await fetch(`${baseUrl}/api/platform/v1/user-insights/collector`, { headers });
const tasksPayload = await tasksResponse.json();
if (!tasksResponse.ok) throw new Error(tasksPayload.message || "无法读取已登记采集任务。");

const browser = new ChromeDevtoolsBrowser(cdpEndpoint);
const api = {
  async post(batch) {
    const response = await fetch(`${baseUrl}/api/platform/v1/user-insights/ingest`, { method: "POST", headers, body: JSON.stringify(batch) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "采集批次写入失败。");
    return payload;
  }
};

const result = await collectRegisteredTasks(tasksPayload.tasks || [], { browser, api, force });
process.stdout.write(`${JSON.stringify(result)}\n`);

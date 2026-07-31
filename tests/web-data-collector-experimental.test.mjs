import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";

import {
  collectorTemplateContentHash,
  normalizeCollectorTemplate
} from "../src/domain/collectorTemplates.js";
import { executeExperimentalRun } from "../scripts/web-data-collector/experimental/executor.mjs";

const allowedOrigins = ["https://erp.superboss.cc"];

function template(steps, limits = {}) {
  return normalizeCollectorTemplate({
    templateId: "runtime-contract",
    version: 1,
    mode: "experimental",
    providerId: "kuaimai",
    profileId: "kuaimai-main",
    timeoutSeconds: 10,
    limits: {
      maxOutputBytes: 16_384,
      maxChildProcesses: 3,
      maxLoopIterations: 20,
      maxFiles: 10,
      ...limits
    },
    status: "draft",
    steps
  }, { allowedOrigins });
}

async function bundleFor(inputTemplate) {
  return {
    runId: "run-experimental-1",
    runnerId: "runner-company-mac",
    templateId: inputTemplate.templateId,
    version: inputTemplate.version,
    contentHash: await collectorTemplateContentHash(inputTemplate),
    expiresAt: "2026-07-30T18:00:00.000Z",
    template: inputTemplate
  };
}

test("experimental executor runs browser JavaScript, Python and system commands in order", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "collector-experimental-"));
  await writeFile(
    join(workspace, "parse_inventory.py"),
    "import sys\nprint(sys.argv[1].upper(), end='')\n",
    { mode: 0o600 }
  );
  const inputTemplate = template([
    {
      id: "seed",
      type: "flow.setVariable",
      name: "greeting",
      value: "hello"
    },
    {
      id: "browser",
      type: "browser.javascript",
      code: "return variables.greeting + '-browser';",
      timeoutSeconds: 2
    },
    {
      id: "command",
      type: "local.command",
      command: [
        process.execPath,
        "-e",
        "process.stdout.write(process.argv[1])",
        "${greeting}-command"
      ],
      timeoutSeconds: 2
    },
    {
      id: "python",
      type: "local.python",
      script: "parse_inventory.py",
      args: ["${greeting}-python"],
      timeoutSeconds: 2
    }
  ]);

  const result = await executeExperimentalRun({
    bundle: await bundleFor(inputTemplate),
    workspace,
    browser: {
      async evaluate(code, context) {
        return Function("variables", code)(context.variables);
      }
    },
    pythonBinary: "/usr/bin/python3"
  });

  assert.equal(result.status, "completed");
  assert.equal(result.trustLevel, "untrusted");
  assert.equal(result.outputs.browser, "hello-browser");
  assert.equal(result.outputs.command.stdout, "hello-command");
  assert.equal(result.outputs.python.stdout, "HELLO-PYTHON");
  assert.equal(result.variables.greeting, "hello");
});

test("condition and loop steps evaluate registered variables without exceeding the loop limit", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "collector-experimental-"));
  const inputTemplate = template([
    {
      id: "enabled",
      type: "flow.setVariable",
      name: "enabled",
      value: true
    },
    {
      id: "items",
      type: "flow.setVariable",
      name: "items",
      value: ["a", "b"]
    },
    {
      id: "condition",
      type: "flow.condition",
      when: { variable: "enabled", operator: "equals", value: true },
      then: [
        {
          id: "selected",
          type: "flow.setVariable",
          name: "branch",
          value: "then"
        }
      ],
      else: []
    },
    {
      id: "loop",
      type: "flow.loop",
      items: "${items}",
      itemVariable: "item",
      maxIterations: 2,
      steps: [
        {
          id: "remember",
          type: "flow.setVariable",
          name: "lastItem",
          value: "${item}"
        }
      ]
    }
  ]);

  const result = await executeExperimentalRun({
    bundle: await bundleFor(inputTemplate),
    workspace,
    browser: {}
  });

  assert.equal(result.variables.branch, "then");
  assert.equal(result.variables.lastItem, "b");
  assert.deepEqual(result.outputs.loop, [
    { remember: "a" },
    { remember: "b" }
  ]);
});

test("registered browser actions pass a download handle to a local file parser", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "collector-experimental-"));
  await writeFile(join(workspace, "report.json"), JSON.stringify({ rows: 12 }), { mode: 0o600 });
  const inputTemplate = template([
    {
      id: "open",
      type: "browser.open",
      url: "https://erp.superboss.cc/index.html#/stock/warehouse_status/"
    },
    {
      id: "export",
      type: "browser.click",
      selectors: ["[data-action='export']", "text=导出"]
    },
    {
      id: "download",
      type: "browser.download",
      selectors: ["text=下载"],
      filePattern: "*.json"
    },
    {
      id: "parse",
      type: "file.parse",
      parser: "json",
      input: "${download.path}"
    }
  ]);

  const result = await executeExperimentalRun({
    bundle: await bundleFor(inputTemplate),
    workspace,
    browser: {
      async open(url) {
        return { url };
      },
      async click(selectors) {
        return { matchedSelector: selectors[0] };
      },
      async download() {
        return { path: "report.json", safeFileName: "report.json" };
      }
    },
    parsers: {
      async json({ input }) {
        assert.equal(input, "report.json");
        return { rowCount: 12, coverage: 1 };
      }
    }
  });

  assert.equal(result.outputs.open.url, "https://erp.superboss.cc/index.html#/stock/warehouse_status/");
  assert.equal(result.outputs.export.matchedSelector, "[data-action='export']");
  assert.equal(result.outputs.download.safeFileName, "report.json");
  assert.deepEqual(result.outputs.parse, { rowCount: 12, coverage: 1 });
});

test("command timeout terminates the step and returns a stable error", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "collector-experimental-"));
  const inputTemplate = template([
    {
      id: "slow",
      type: "local.command",
      command: [process.execPath, "-e", "setInterval(() => {}, 1000)"],
      timeoutSeconds: 1
    }
  ]);
  const startedAt = Date.now();

  await assert.rejects(
    executeExperimentalRun({
      bundle: await bundleFor(inputTemplate),
      workspace,
      browser: {}
    }),
    error => error?.code === "COLLECTOR_SCRIPT_TIMEOUT"
  );
  assert.ok(Date.now() - startedAt < 3_000);
});

test("command output stops at the template byte limit", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "collector-experimental-"));
  const inputTemplate = template([
    {
      id: "large",
      type: "local.command",
      command: [process.execPath, "-e", "process.stdout.write('x'.repeat(5000))"],
      timeoutSeconds: 2
    }
  ], { maxOutputBytes: 1_024 });

  await assert.rejects(
    executeExperimentalRun({
      bundle: await bundleFor(inputTemplate),
      workspace,
      browser: {}
    }),
    error => error?.code === "COLLECTOR_OUTPUT_LIMIT_EXCEEDED"
  );
});

test("browser results containing credential material are rejected before persistence", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "collector-experimental-"));
  const inputTemplate = template([
    {
      id: "browser",
      type: "browser.javascript",
      code: "return { ready: true };",
      timeoutSeconds: 2
    }
  ]);

  await assert.rejects(
    executeExperimentalRun({
      bundle: await bundleFor(inputTemplate),
      workspace,
      browser: {
        async evaluate() {
          return { cookie: "session-secret" };
        }
      }
    }),
    error => error?.code === "COLLECTOR_RESULT_SENSITIVE"
  );
});

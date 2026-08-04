import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Writable } from "node:stream";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  createEgoCliRunner,
  validateEgoExecutable
} from "../scripts/browser-runtime/ego-cli.mjs";

const safeTask = Object.freeze({
  jobId: "job-ego-1",
  providerId: "douyin-ecommerce",
  storeId: "90862283",
  resourceType: "video_daily",
  businessDate: "2026-08-03"
});

function fakeEgoProcess({ stdout = "", stderr = "", exitCode = 0, delayMs = 0 } = {}) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    child.kill = () => {};
    child.stdin.on("finish", () => {
      setTimeout(() => {
        if (stdout) child.stdout.end(stdout);
        else child.stdout.end();
        if (stderr) child.stderr.end(stderr);
        else child.stderr.end();
        child.emit("close", exitCode, null);
      }, delayMs);
    });
    return child;
  };
}

test("Ego runner rejects a relative executable path", () => {
  assert.throws(
    () => validateEgoExecutable("ego-browser"),
    error => error.code === "EGO_EXECUTABLE_INVALID" && /绝对路径/.test(error.message)
  );
});

test("Ego runner rejects output containing anything except one JSON result", async () => {
  const runner = createEgoCliRunner({
    executable: "/Users/company/.local/bin/ego-browser",
    moduleRoot: "/repo",
    spawn: fakeEgoProcess({ stdout: "noise\n{}\n" })
  });

  await assert.rejects(
    runner.run({ moduleUrl: "file:///repo/douyinEgoTask.mjs", input: safeTask }),
    error => error.code === "EGO_PROTOCOL_INVALID"
  );
});

test("Ego runner returns one registered safe result", async () => {
  const runner = createEgoCliRunner({
    executable: "/Users/company/.local/bin/ego-browser",
    moduleRoot: "/repo",
    spawn: fakeEgoProcess({
      stdout: `${JSON.stringify({
        kind: "waiting_human",
        jobId: "job-ego-1",
        errorCode: "DOUYIN_LOGIN_REQUIRED",
        safeSummary: "请在 Ego 登录抖店后重试。",
        stage: "opening"
      })}\n`
    })
  });

  assert.deepEqual(
    await runner.run({ moduleUrl: "file:///repo/douyinEgoTask.mjs", input: safeTask }),
    {
      kind: "waiting_human",
      jobId: "job-ego-1",
      errorCode: "DOUYIN_LOGIN_REQUIRED",
      safeSummary: "请在 Ego 登录抖店后重试。",
      stage: "opening"
    }
  );
});

test("Ego runner rejects sensitive task fields before spawning", async () => {
  let spawned = false;
  const runner = createEgoCliRunner({
    executable: "/Users/company/.local/bin/ego-browser",
    moduleRoot: "/repo",
    spawn() {
      spawned = true;
      return fakeEgoProcess()();
    }
  });

  await assert.rejects(
    runner.run({
      moduleUrl: "file:///repo/douyinEgoTask.mjs",
      input: { ...safeTask, cookie: "secret" }
    }),
    error => error.code === "EGO_INPUT_INVALID"
  );
  assert.equal(spawned, false);
});

test("Ego runner stops output overflow", async () => {
  const runner = createEgoCliRunner({
    executable: "/Users/company/.local/bin/ego-browser",
    moduleRoot: "/repo",
    maxOutputBytes: 32,
    spawn: fakeEgoProcess({ stdout: "x".repeat(33) })
  });

  await assert.rejects(
    runner.run({ moduleUrl: "file:///repo/douyinEgoTask.mjs", input: safeTask }),
    error => error.code === "EGO_OUTPUT_LIMIT_EXCEEDED"
  );
});

test("Ego runner stops a timed out process", async () => {
  const runner = createEgoCliRunner({
    executable: "/Users/company/.local/bin/ego-browser",
    moduleRoot: "/repo",
    timeoutMs: 5,
    spawn: fakeEgoProcess({ delayMs: 50 })
  });

  await assert.rejects(
    runner.run({ moduleUrl: "file:///repo/douyinEgoTask.mjs", input: safeTask }),
    error => error.code === "EGO_TIMEOUT"
  );
});

test("Ego runner reports a non-zero Ego exit without exposing stderr", async () => {
  const runner = createEgoCliRunner({
    executable: "/Users/company/.local/bin/ego-browser",
    moduleRoot: "/repo",
    spawn: fakeEgoProcess({ stderr: "token=secret", exitCode: 2 })
  });

  await assert.rejects(
    runner.run({ moduleUrl: "file:///repo/douyinEgoTask.mjs", input: safeTask }),
    error => error.code === "EGO_PROCESS_FAILED" && !error.message.includes("secret")
  );
});

test("Ego runner bootstrap executes one fixed local task module through stdin", async () => {
  const moduleRoot = await mkdtemp(join(tmpdir(), "ego-cli-runtime-"));
  const executable = join(moduleRoot, "ego-browser");
  const taskModule = join(moduleRoot, "task.mjs");
  await writeFile(executable, `#!/usr/bin/env node
let source = "";
for await (const chunk of process.stdin) source += chunk;
for (const name of ["listTaskSpaces", "useOrCreateTaskSpace", "claimTaskSpace", "handOffTaskSpace", "openOrReuseTab", "gotoAndWait", "pageInfo", "js", "cdp", "wait", "completeTaskSpace"]) globalThis[name] = async () => null;
globalThis.cliLog = value => process.stdout.write(String(value) + "\\n");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
await new AsyncFunction(source)();
`, { mode: 0o700 });
  await writeFile(taskModule, `export async function executeEgoCliTask(input, helpers) {
  return {
    kind: "failed",
    jobId: input.jobId,
    errorCode: "EGO_SMOKE_FAILED",
    safeSummary: helpers.openOrReuseTab ? "bootstrap-ok" : "bootstrap-missing-helper",
    stage: "opening"
  };
}
`, { mode: 0o600 });
  const runner = createEgoCliRunner({ executable, moduleRoot, timeoutMs: 2_000 });

  const result = await runner.run({
    moduleUrl: pathToFileURL(taskModule).href,
    input: safeTask
  });

  assert.equal(result.safeSummary, "bootstrap-ok");
  assert.equal(result.jobId, "job-ego-1");
});

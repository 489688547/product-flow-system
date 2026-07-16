import test from "node:test";
import assert from "node:assert/strict";
import { isLoopbackAddress, readDwsTodoPreview } from "../server/dwsTodoPreview.mjs";

test("DWS preview normalizes real todo cards without write commands", async () => {
  const calls = [];
  const result = await readDwsTodoPreview({
    status: false,
    execFileImpl: async (file, args, options) => {
      calls.push({ file, args, options });
      return {
        stdout: JSON.stringify({
          result: {
            todoCards: [{
              taskId: "real-1",
              subject: "真实待办",
              dueTime: 1784304000000,
              isDone: false,
              priority: 20,
              modifiedTime: 1784196000000
            }]
          }
        })
      };
    }
  });

  assert.equal(result.todos[0].taskId, "real-1");
  assert.equal(result.todos[0].subject, "真实待办");
  assert.equal(result.todos[0].isDone, false);
  assert.equal(result.readonly, true);
  assert.equal(result.source, "dws-current-account");
  assert.deepEqual(calls[0].args.slice(0, 3), ["todo", "task", "list"]);
  assert.deepEqual(calls[0].args.slice(-2), ["--format", "json"]);
  assert.equal(calls[0].args.includes("create"), false);
  assert.equal(calls[0].args.includes("update"), false);
  assert.equal(calls[0].args.includes("done"), false);
  assert.equal(calls[0].args.includes("delete"), false);
  assert.equal(calls[0].options.timeout, 30000);
});

test("DWS preview supports completed status without accepting arbitrary command input", async () => {
  let args = [];
  await readDwsTodoPreview({
    status: true,
    execFileImpl: async (_file, commandArgs) => {
      args = commandArgs;
      return { stdout: JSON.stringify({ todoCards: [] }) };
    }
  });
  assert.deepEqual(args.slice(args.indexOf("--status"), args.indexOf("--status") + 2), ["--status", "true"]);
});

test("loopback detection rejects LAN and public addresses", () => {
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackAddress("192.168.1.8"), false);
  assert.equal(isLoopbackAddress("8.8.8.8"), false);
});

test("DWS preview reports malformed command output", async () => {
  await assert.rejects(() => readDwsTodoPreview({
    execFileImpl: async () => ({ stdout: "not-json" })
  }), /无法解析/);
});

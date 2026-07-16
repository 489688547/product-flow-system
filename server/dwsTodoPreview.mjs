import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function isLoopbackAddress(address = "") {
  const value = String(address || "").toLowerCase();
  return value === "127.0.0.1" || value === "::1" || value === "::ffff:127.0.0.1";
}

function timestamp(value) {
  if (value === "" || value == null) return "";
  const date = new Date(typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function normalizeDwsTodoCard(card = {}) {
  return {
    taskId: String(card.taskId || card.id || ""),
    subject: String(card.subject || card.title || "未命名待办"),
    description: String(card.description || card.content || ""),
    dueTime: Number(card.dueTime || card.due || 0),
    isDone: Boolean(card.isDone ?? card.done ?? card.status === "done"),
    priority: Number(card.priority) || 0,
    modifiedTime: timestamp(card.modifiedTime || card.updatedAt || card.modifiedAt),
    creatorId: String(card.creatorId || card.creatorUnionId || ""),
    executorIds: Array.isArray(card.executorIds) ? card.executorIds.map(String) : []
  };
}

function todoCards(payload = {}) {
  const candidates = [
    payload.result?.todoCards,
    payload.result?.result?.todoCards,
    payload.todoCards,
    payload.data?.todoCards,
    payload.body?.todoCards
  ];
  return candidates.find(Array.isArray) || [];
}

export async function readDwsTodoPreview({ status = false, execFileImpl = execFileAsync } = {}) {
  const args = [
    "todo",
    "task",
    "list",
    "--page",
    "1",
    "--size",
    "50",
    "--status",
    String(Boolean(status)),
    "--format",
    "json"
  ];
  let stdout = "";
  try {
    const result = await execFileImpl("dws", args, { timeout: 30000, maxBuffer: 2_000_000 });
    stdout = String(result?.stdout || "");
  } catch (error) {
    const detail = String(error?.stderr || error?.message || "").trim();
    throw new Error(detail ? `DWS 待办查询失败：${detail}` : "DWS 待办查询失败。");
  }
  let payload;
  try {
    payload = JSON.parse(stdout || "{}");
  } catch {
    throw new Error("无法解析 DWS 待办查询结果。");
  }
  return {
    readonly: true,
    source: "dws-current-account",
    status: Boolean(status),
    fetchedAt: new Date().toISOString(),
    todos: todoCards(payload).map(normalizeDwsTodoCard).filter(todo => todo.taskId)
  };
}

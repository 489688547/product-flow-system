import sharp from "sharp";

const args = new Set(process.argv.slice(2));
const urlArgIndex = process.argv.indexOf("--url");
const baseUrl = String(
  urlArgIndex >= 0 ? process.argv[urlArgIndex + 1] : "http://127.0.0.1:8127"
).replace(/\/$/, "");
const apply = args.has("--apply");
const token = String(process.env.PRODUCTION_DATA_ACCESS_TOKEN || "").trim();
const IMAGE_LIMIT = 120_000;
const LEGACY_TODO_TITLE = "立项PRD同步";

if (!token) {
  console.error("缺少 PRODUCTION_DATA_ACCESS_TOKEN。");
  process.exit(1);
}

function requestHeaders(extra = {}) {
  return {
    authorization: `Bearer ${token}`,
    ...extra
  };
}

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: requestHeaders(options.headers)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || body?.message || `请求失败：${response.status}`);
    error.code = body?.error?.code || `HTTP_${response.status}`;
    throw error;
  }
  return body;
}

async function compressDataUrl(value) {
  const match = String(value || "").match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  if (!match) return value;
  const input = Buffer.from(match[1], "base64");
  for (const dimension of [640, 480, 360]) {
    for (const quality of [82, 68, 55]) {
      const output = await sharp(input)
        .rotate()
        .resize({
          width: dimension,
          height: dimension,
          fit: "inside",
          withoutEnlargement: true
        })
        .flatten({ background: "#ffffff" })
        .webp({ quality })
        .toBuffer();
      const candidate = `data:image/webp;base64,${output.toString("base64")}`;
      if (candidate.length <= IMAGE_LIMIT) return candidate;
    }
  }
  throw new Error("现有产品图片压缩后仍超过容量限制。");
}

function collectOversizedImages(value, found = new Set()) {
  if (typeof value === "string") {
    if (value.startsWith("data:image/") && value.length > IMAGE_LIMIT) found.add(value);
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectOversizedImages(item, found));
    return found;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach(item => collectOversizedImages(item, found));
  }
  return found;
}

function replaceExactValues(value, replacements, stats) {
  if (typeof value === "string") {
    if (!replacements.has(value)) return value;
    stats.imageReferences += 1;
    return replacements.get(value);
  }
  if (Array.isArray(value)) return value.map(item => replaceExactValues(item, replacements, stats));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceExactValues(item, replacements, stats)])
    );
  }
  return value;
}

function repairLegacyTodoVersion(state, stats) {
  return {
    ...state,
    tasks: (state.tasks || []).map(task => {
      const todo = task?.dingTodo || {};
      const eligible = task?.title === LEGACY_TODO_TITLE
        && todo.id
        && todo.sourceId
        && todo.snapshot
        && !todo.lastError
        && Number(todo.actionVersion || 0) < 2;
      if (!eligible) return task;
      stats.todoVersions += 1;
      return {
        ...task,
        dingTodo: {
          ...todo,
          actionVersion: 2
        }
      };
    })
  };
}

const current = await api("/api/platform/v1/production-data/state");
if (!current?.state || !current.updatedAt) throw new Error("生产共享状态或基线缺失。");

const originalChars = JSON.stringify(current.state).length;
const oversizedImages = [...collectOversizedImages(current.state)];
const replacements = new Map();
for (const image of oversizedImages) replacements.set(image, await compressDataUrl(image));

const stats = { imageReferences: 0, todoVersions: 0 };
let nextState = replaceExactValues(current.state, replacements, stats);
nextState = repairLegacyTodoVersion(nextState, stats);
const nextChars = JSON.stringify(nextState).length;

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  uniqueImages: replacements.size,
  imageReferences: stats.imageReferences,
  todoVersions: stats.todoVersions,
  beforeChars: originalChars,
  afterChars: nextChars,
  reductionPercent: originalChars ? Number(((originalChars - nextChars) / originalChars * 100).toFixed(1)) : 0
}, null, 2));

if (!apply) process.exit(0);
if (!stats.imageReferences && !stats.todoVersions) {
  console.log("没有需要写入的修复。");
  process.exit(0);
}

const unlock = await api("/api/platform/v1/production-write-session", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    reason: "压缩重复产品图片并修复旧待办动作版本",
    confirmation: "修改线上真实数据"
  })
});
const saved = await api("/api/platform/v1/production-data/state", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-pfs-production-unlock": unlock.unlockToken
  },
  body: JSON.stringify({
    state: nextState,
    baseUpdatedAt: current.updatedAt
  })
});

console.log(JSON.stringify({
  synced: true,
  auditId: saved.auditId,
  updatedAt: saved.updatedAt,
  version: saved.version
}, null, 2));

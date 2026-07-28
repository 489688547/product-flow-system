const STAGE_TEXT = {
  queued: "等待领取", claimed: "已领取", opening: "正在打开页面", collecting: "正在读取页面",
  exporting: "正在生成报表", downloading: "正在下载报表", validating: "正在校验文件", ingesting: "正在入库"
};

// 与网页端 stageText 同口径：stage 会落后于 status，落后时以 status 为准。
function stageLabel(job) {
  const stage = String(job?.stage || "");
  const status = String(job?.status || "");
  const effective = stage && !(stage === "queued" && status && status !== "queued") ? stage : status;
  return STAGE_TEXT[effective] || "";
}

const statusDot = document.querySelector("#status-dot");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const pairingForm = document.querySelector("#pairing-form");
const pairingInput = document.querySelector("#pairing-key");
const pairingError = document.querySelector("#pairing-error");

function renderStatus(status) {
  pairingForm.hidden = status.paired;
  statusDot.className = "dot";
  if (!status.paired) {
    statusTitle.textContent = "等待本机配对";
    statusDetail.textContent = "安装执行器后输入一次配对码";
    statusDot.classList.add("warning");
    return;
  }
  if (status.lastBridgeError) {
    statusTitle.textContent = "本机执行器未连接";
    statusDetail.textContent = "请确认公司 Mac 执行器正在运行";
    statusDot.classList.add("error");
    return;
  }
  statusTitle.textContent = status.activeJob ? "正在采集" : "本机执行器已连接";
  // 业务日期与阶段本来就在 activeJob 里，只是从前没渲染，用户看不出在采哪一天。
  // 扩展一次只领一个任务，不知道服务端队列还有多少，因此不显示队列总数。
  statusDetail.textContent = status.activeJob
    ? [
      `${status.activeJob.providerId} · ${status.activeJob.resourceType}`,
      [status.activeJob.businessDate, stageLabel(status.activeJob)].filter(Boolean).join(" · ")
    ].filter(Boolean).join("\n")
    : status.lastBridgeAt ? `最近检查：${new Date(status.lastBridgeAt).toLocaleTimeString("zh-CN")}` : "等待首次检查";
  statusDot.classList.add("success");
}

async function refresh() {
  renderStatus(await chrome.runtime.sendMessage({ type: "GET_STATUS" }));
}

pairingForm.addEventListener("submit", async event => {
  event.preventDefault();
  pairingError.textContent = "";
  const result = await chrome.runtime.sendMessage({ type: "SAVE_PAIRING", pairingKey: pairingInput.value });
  if (!result?.ok) {
    pairingError.textContent = "配对码格式不正确";
    pairingInput.focus();
    return;
  }
  pairingInput.value = "";
  await chrome.runtime.sendMessage({ type: "POLL_NOW" });
  await refresh();
});

document.querySelector("#sync-now").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "POLL_NOW" });
  await refresh();
});
document.querySelector("#open-kuaimai").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OPEN_KUAIMAI" });
});

void refresh();

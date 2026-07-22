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
  statusDetail.textContent = status.activeJob
    ? `${status.activeJob.providerId} · ${status.activeJob.resourceType}`
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

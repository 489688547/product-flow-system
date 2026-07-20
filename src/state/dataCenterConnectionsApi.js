import { inferConnectorCaptureMethod } from "../domain/dataCenterConnectors.js";

const CONNECTIONS_URL = "/api/data-center/connectors";
const CREDENTIALS_URL = "/api/platform/v1/credential-vault";

async function responsePayload(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.synced === false) {
    const error = new Error(payload.message || fallback);
    error.status = response.status;
    error.code = payload.error?.code || "";
    error.retryable = Boolean(payload.error?.retryable);
    error.requestId = payload.error?.requestId || "";
    throw error;
  }
  return payload;
}

function jsonOptions(method, body) {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  };
}

export async function loadDataCenterConnections(fetchImpl = fetch) {
  const response = await fetchImpl(CONNECTIONS_URL);
  const payload = await responsePayload(response, "连接器加载失败。");
  return { connectors: payload.connectors || [], vaultItems: payload.vaultItems || [] };
}

export async function loadCredentialMetadata(fetchImpl = fetch) {
  const response = await fetchImpl(CREDENTIALS_URL);
  const payload = await responsePayload(response, "加密凭证元数据加载失败。");
  return { entries: payload.entries || [] };
}

export async function saveConnectorInstance(instance, expectedVersion, fetchImpl = fetch) {
  const response = await fetchImpl(CONNECTIONS_URL, jsonOptions("PUT", { expectedVersion, instance }));
  const payload = await responsePayload(response, "连接器保存失败。");
  return payload.instance;
}

export async function saveInternalVaultItem(vaultItem, expectedVersion, fetchImpl = fetch) {
  const response = await fetchImpl(CONNECTIONS_URL, jsonOptions("PUT", { expectedVersion, vaultItem }));
  const payload = await responsePayload(response, "内部保险箱条目保存失败。");
  return payload.vaultItem;
}

export async function createCredential(input, fetchImpl = fetch) {
  const response = await fetchImpl(CREDENTIALS_URL, jsonOptions("POST", input));
  const payload = await responsePayload(response, "加密凭证保存失败。");
  return payload.entry;
}

export async function replaceCredential(id, input, fetchImpl = fetch) {
  const response = await fetchImpl(`${CREDENTIALS_URL}/${encodeURIComponent(id)}`, jsonOptions("PUT", input));
  const payload = await responsePayload(response, "加密凭证替换失败。");
  return payload.entry;
}

export async function archiveCredential(id, expectedVersion, fetchImpl = fetch) {
  const response = await fetchImpl(`${CREDENTIALS_URL}/${encodeURIComponent(id)}`, jsonOptions("PUT", { expectedVersion, action: "archive" }));
  const payload = await responsePayload(response, "加密凭证归档失败。");
  return payload.entry;
}

export async function revealCredential(id, purpose, confirmation, fetchImpl = fetch) {
  const response = await fetchImpl(`${CREDENTIALS_URL}/${encodeURIComponent(id)}/reveal`, jsonOptions("POST", { purpose, confirmation }));
  return responsePayload(response, "加密凭证查看失败。");
}

export async function persistConnectorConnection({ instance, secretPayload = {}, vaultEntries = [] }, fetchImpl = fetch) {
  const sensitive = { ...secretPayload };
  const preparedInstance = {
    ...instance,
    captureMethod: inferConnectorCaptureMethod(instance.connectorId, {
      secretPayload: sensitive,
      existingMethod: instance.captureMethod
    })
  };
  const isNew = !preparedInstance.id;
  try {
    let saved = isNew ? await saveConnectorInstance(preparedInstance, 0, fetchImpl) : { ...preparedInstance };
    let credentialEntryId = saved.credentialEntryId || "";
    if (Object.keys(sensitive).length) {
      const existingCredential = vaultEntries.find(entry => entry.id === credentialEntryId);
      const credential = existingCredential
        ? await replaceCredential(existingCredential.id, { expectedVersion: existingCredential.version, secretPayload: sensitive }, fetchImpl)
        : await createCredential({
          scopeType: "connector",
          scopeId: saved.id,
          category: saved.connectorId,
          name: `${saved.name}凭证`,
          schemaVersion: 1,
          secretPayload: sensitive
        }, fetchImpl);
      credentialEntryId = credential.id;
    }
    if (!isNew || credentialEntryId !== saved.credentialEntryId) {
      saved = await saveConnectorInstance(
        { ...saved, ...preparedInstance, id: saved.id, credentialEntryId },
        saved.version || preparedInstance.version || 0,
        fetchImpl
      );
    }
    return saved;
  } finally {
    for (const key of Object.keys(sensitive)) delete sensitive[key];
  }
}

export async function persistInternalVaultConnection({ item, secretPayload = {}, vaultEntries = [] }, fetchImpl = fetch) {
  const sensitive = { ...secretPayload };
  const isNew = !item?.id;
  try {
    let saved = isNew ? await saveInternalVaultItem(item, 0, fetchImpl) : { ...item };
    let credentialEntryId = saved.credentialEntryId || "";
    if (Object.keys(sensitive).length) {
      const existingCredential = vaultEntries.find(entry => entry.id === credentialEntryId);
      const credential = existingCredential
        ? await replaceCredential(existingCredential.id, { expectedVersion: existingCredential.version, secretPayload: sensitive }, fetchImpl)
        : await createCredential({
          scopeType: "internal",
          scopeId: saved.id,
          category: saved.itemType,
          name: `${saved.name}凭证`,
          schemaVersion: 1,
          secretPayload: sensitive
        }, fetchImpl);
      credentialEntryId = credential.id;
    }
    if (!isNew || credentialEntryId !== saved.credentialEntryId) {
      saved = await saveInternalVaultItem({ ...saved, ...item, id: saved.id, credentialEntryId }, saved.version || item.version || 0, fetchImpl);
    }
    return saved;
  } finally {
    for (const key of Object.keys(sensitive)) delete sensitive[key];
  }
}

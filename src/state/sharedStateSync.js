function syncError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function createSharedStateSyncSession() {
  let baselineUpdatedAt = "";

  return {
    canSave() {
      return Boolean(baselineUpdatedAt);
    },

    acceptRemote(payload) {
      if (!payload?.synced || !payload.state || !payload.updatedAt) {
        baselineUpdatedAt = "";
        throw syncError("线上共享数据尚未初始化，已阻止默认数据自动写入。", "SHARED_STATE_NOT_INITIALIZED");
      }
      baselineUpdatedAt = String(payload.updatedAt);
      return payload.state;
    },

    buildWrite(state) {
      if (!baselineUpdatedAt) {
        throw syncError("缺少线上数据基线，已暂停共享数据保存。", "SHARED_STATE_BASE_REQUIRED");
      }
      return { state, baseUpdatedAt: baselineUpdatedAt };
    },

    acceptSaved(payload) {
      if (!payload?.synced || !payload.updatedAt) {
        throw syncError("共享数据保存响应缺少新版本。", "SHARED_STATE_SAVE_INVALID");
      }
      baselineUpdatedAt = String(payload.updatedAt);
      return baselineUpdatedAt;
    }
  };
}

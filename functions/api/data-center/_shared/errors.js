const TRANSIENT_STORAGE_ERROR = /network connection lost|failed to parse body as json|internal error|failed to fetch|fetch failed/i;

export function normalizeDataCenterStorageError(error, fallbackMessage) {
  const rawMessage = String(error?.message || "");
  if (TRANSIENT_STORAGE_ERROR.test(rawMessage)) {
    return {
      message: "线上数据库连接暂时中断，请稍后重试。",
      status: 503,
      code: "DATA_STORAGE_TEMPORARILY_UNAVAILABLE",
      retryable: true
    };
  }
  return {
    message: fallbackMessage,
    status: Number(error?.status || 500),
    code: String(error?.code || "INTERNAL_UNEXPECTED"),
    retryable: Boolean(error?.retryable ?? true)
  };
}

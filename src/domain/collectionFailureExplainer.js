// 采集失败在页面上曾直接印机器码，例如「DOUYIN_DATE_RANGE_NOT_APPLIED · 阶段 exporting」。
// 那行其实已经说清了卡点，只是用的是机器语言。此处统一翻译成「出了什么事、卡在哪、怎么办」。
export const COLLECTION_FAILURE_KIND = Object.freeze({
  pageInteraction: "page_interaction",
  schemaChanged: "schema_changed",
  needsHuman: "needs_human",
  extension: "extension",
  ingest: "ingest",
  lifecycle: "lifecycle",
  unknown: "unknown"
});

const STAGE_TEXT = Object.freeze({
  queued: "等待领取",
  claimed: "领取任务",
  opening: "打开页面",
  collecting: "读取页面",
  exporting: "生成并导出报表",
  downloading: "下载报表",
  validating: "校验文件",
  ingesting: "入库"
});

// retryable 表示「原样重试有机会成功」。页面结构变化重试必然再失败，
// 给按钮等于让人白点；需要人工的先由人处理，之后才谈重试。
const CATALOG = Object.freeze({
  DOUYIN_DATE_RANGE_NOT_APPLIED: {
    kind: COLLECTION_FAILURE_KIND.pageInteraction,
    summary: "抖店页面的日期范围没有生效，导出的不是目标业务日的数据。",
    action: "多为页面响应慢或改版所致，重试一次通常可恢复；连续多次失败请反馈。",
    retryable: true
  },
  DOUYIN_DATE_CONTROL_MISSING: {
    kind: COLLECTION_FAILURE_KIND.pageInteraction,
    summary: "在抖店页面上找不到日期选择控件。",
    action: "确认公司 Chrome 已打开对应店铺后重试；若持续找不到，多半是页面改版，需要更新采集适配。",
    retryable: true
  },
  KUAIMAI_TIME_RANGE_NOT_APPLIED: {
    kind: COLLECTION_FAILURE_KIND.pageInteraction,
    summary: "快麦页面的时间范围没有生效，导出的不是目标业务日的数据。",
    action: "多为页面响应慢所致，重试一次通常可恢复。",
    retryable: true
  },
  KUAIMAI_SALES_EXPORT_CONFIRM_MISSING: {
    kind: COLLECTION_FAILURE_KIND.pageInteraction,
    summary: "快麦的导出确认步骤没有出现，报表没有生成。",
    action: "重试一次；若仍不出现，请在公司 Mac 上手动导出并放入待导入文件夹。",
    retryable: true
  },
  DOUYIN_OFFICIAL_REPORT_BUTTON_MISSING: {
    kind: COLLECTION_FAILURE_KIND.pageInteraction,
    summary: "抖店页面上的官方报表入口不可用。",
    action: "请确认该账号有报表权限；权限正常仍不可用则为页面改版。",
    retryable: true
  },
  DOUYIN_PAGE_SCHEMA_CHANGED: {
    kind: COLLECTION_FAILURE_KIND.schemaChanged,
    summary: "抖店页面结构已变化，采集程序无法识别。",
    action: "重试无效，需要更新采集适配。请反馈该页面变化；如需补数请先导入官方报表。",
    retryable: false
  },
  DOUYIN_REPORT_SCHEMA_CHANGED: {
    kind: COLLECTION_FAILURE_KIND.schemaChanged,
    summary: "抖店报表的字段已变化，采集程序无法识别。",
    action: "重试无效，需要更新采集适配。请反馈字段变化。",
    retryable: false
  },
  KUAIMAI_ORDER_PAGE_SCHEMA_CHANGED: {
    kind: COLLECTION_FAILURE_KIND.schemaChanged,
    summary: "快麦订单页面结构已变化，采集程序无法识别。",
    action: "重试无效，需要更新采集适配。请反馈该页面变化；如需补数请先导入官方报表。",
    retryable: false
  },
  KUAIMAI_EXPORT_REQUIRED_COLUMNS_MISSING: {
    kind: COLLECTION_FAILURE_KIND.schemaChanged,
    summary: "快麦导出的文件缺少必需列，无法形成销售事实。",
    action: "重试无效。请在快麦导出设置中确认所需列，或反馈以更新采集适配。",
    retryable: false
  },
  KUAIMAI_SALES_CALCULATE_TIMEOUT: {
    kind: COLLECTION_FAILURE_KIND.pageInteraction,
    summary: "销售报表一直没算完，本次没有导出，避免落下半天的数据。",
    action: "多为当天数据量大或快麦繁忙，稍后重试即可；连续多次超时请反馈。",
    retryable: true
  },
  KUAIMAI_API_TIME_TYPE_INVALID: {
    kind: COLLECTION_FAILURE_KIND.schemaChanged,
    summary: "快麦取数口径不是订单创建时间，本次没有发起请求。",
    action: "重试无效。接口对无效口径会静默回落到付款时间，两者相差约 6%，需要更新采集适配。",
    retryable: false
  },
  KUAIMAI_API_BUSINESS_DATE_INVALID: {
    kind: COLLECTION_FAILURE_KIND.schemaChanged,
    summary: "业务日格式不合法，本次没有发起请求。",
    action: "重试无效，需要更新采集适配。",
    retryable: false
  },
  KUAIMAI_API_MALFORMED: {
    kind: COLLECTION_FAILURE_KIND.schemaChanged,
    summary: "快麦接口返回的结构不符合预期，无法确认取到了哪些订单。",
    action: "重试无效，多为接口调整所致，需要更新采集适配。",
    retryable: false
  },
  KUAIMAI_API_REQUEST_FAILED: {
    kind: COLLECTION_FAILURE_KIND.pageInteraction,
    summary: "快麦接口拒绝了这次查询。",
    action: "多为临时故障，重试一次通常可恢复；连续多次失败请反馈。",
    retryable: true
  },
  KUAIMAI_API_TOTAL_MISMATCH: {
    kind: COLLECTION_FAILURE_KIND.pageInteraction,
    summary: "实际拉取的订单数与快麦报告的总数不一致，本次未入库任何数据。",
    action: "为避免只补上一半的数据，本次整批作废，重试即可重新完整拉取。",
    retryable: true
  },
  KUAIMAI_LOGIN_REQUIRED: {
    kind: COLLECTION_FAILURE_KIND.needsHuman,
    summary: "快麦登录状态已失效。",
    action: "请在公司 Mac 的 Chrome 中打开快麦完成登录，然后重新触发。",
    retryable: false
  },
  KUAIMAI_HUMAN_VERIFICATION_REQUIRED: {
    kind: COLLECTION_FAILURE_KIND.needsHuman,
    summary: "快麦页面正在等待人工验证。",
    action: "请在公司 Mac 上完成验证码、滑块或设备确认，然后重新触发。",
    retryable: false
  },
  DOUYIN_LOGIN_REQUIRED: {
    kind: COLLECTION_FAILURE_KIND.needsHuman,
    summary: "抖店登录状态已失效。",
    action: "请在公司 Mac 的同一 Chrome Profile 登录抖店，然后重新触发。",
    retryable: false
  },
  DOUYIN_HUMAN_VERIFICATION_REQUIRED: {
    kind: COLLECTION_FAILURE_KIND.needsHuman,
    summary: "抖店页面正在等待人工验证。",
    action: "请在公司 Mac 上完成验证码、扫码、滑块或设备验证，然后重新触发。",
    retryable: false
  },
  EXTENSION_DOWNLOAD_TIMEOUT: {
    kind: COLLECTION_FAILURE_KIND.extension,
    summary: "报表下载超时，文件没有落到公司 Mac。",
    action: "稍后重试；若反复超时，请检查公司 Mac 的网络与磁盘空间。",
    retryable: true
  },
  EXTENSION_CONTENT_SCRIPT_UNAVAILABLE: {
    kind: COLLECTION_FAILURE_KIND.extension,
    summary: "Chrome 扩展没能在目标页面上运行。",
    action: "请确认公司 Mac 的 Chrome 已打开且扩展已启用，重新加载扩展后重试。",
    retryable: true
  },
  EXTENSION_ACTION_NOT_REGISTERED: {
    kind: COLLECTION_FAILURE_KIND.extension,
    summary: "Chrome 扩展不认识该采集动作，多为扩展版本过旧。",
    action: "请在公司 Mac 上更新数据采集扩展后重试。",
    retryable: false
  },
  EXTENSION_SITE_ACCESS_DENIED: {
    kind: COLLECTION_FAILURE_KIND.extension,
    summary: "Chrome 扩展没有该站点的访问权限。",
    action: "请在 Chrome 中为公司数据采集器开启该网站访问权限，重新加载扩展后重试。",
    retryable: false
  },
  ERP_COLLECTION_ARCHIVE_PROCESSING_TIMEOUT: {
    kind: COLLECTION_FAILURE_KIND.ingest,
    summary: "文件已采集并归档到公司 Mac，但入库处理超时，未形成销售事实。",
    action: "文件已在本机，请重新入库；不需要重新采集。",
    retryable: true
  },
  ERP_COLLECTION_UPLOAD_FAILED: {
    kind: COLLECTION_FAILURE_KIND.ingest,
    summary: "文件已归档到公司 Mac，但上传入库失败。",
    action: "确认公司 Mac 网络正常后重新入库；不需要重新采集。",
    retryable: true
  },
  ERP_COLLECTION_INTERNAL_ERROR: {
    kind: COLLECTION_FAILURE_KIND.ingest,
    summary: "入库过程中发生内部错误，未形成新的业务事实。",
    action: "上一批可信数据保持不变。请重新入库；若持续失败请反馈。",
    retryable: true
  },
  WEB_COLLECTION_STAGE_EXPIRED: {
    kind: COLLECTION_FAILURE_KIND.lifecycle,
    summary: "上一轮采集卡在中途，超过租约后已自动终止。",
    action: "确认公司 Mac 已登录对应平台后重新触发。",
    retryable: true
  },
  WEB_COLLECTION_QUEUE_ABANDONED: {
    kind: COLLECTION_FAILURE_KIND.lifecycle,
    summary: "任务排队超过 24 小时仍无采集器领取，已自动标记失败。",
    action: "请先确认公司 Mac 采集器在线，然后重新触发。",
    retryable: true
  }
});

export function productionErrorCodes() {
  return Object.keys(CATALOG);
}

export function explainCollectionFailure(errorCode, { stage = "" } = {}) {
  const code = String(errorCode || "").trim();
  if (!code) return null;
  const stageLabel = STAGE_TEXT[String(stage || "")] || "";
  const known = CATALOG[code];
  if (!known) {
    // 不假装认识：保留原码供排查，但仍给出统一结构，允许试一次。
    return {
      code,
      kind: COLLECTION_FAILURE_KIND.unknown,
      summary: `采集失败，该错误码尚未收录：${code}。`,
      stuckAt: stageLabel ? `卡在「${stageLabel}」` : "",
      action: "可以先重试一次；若重复出现请把该错误码反馈给开发。",
      retryable: true,
      needsHuman: false
    };
  }
  return {
    code,
    kind: known.kind,
    summary: known.summary,
    stuckAt: stageLabel ? `卡在「${stageLabel}」` : "",
    action: known.action,
    retryable: known.retryable,
    needsHuman: known.kind === COLLECTION_FAILURE_KIND.needsHuman
  };
}

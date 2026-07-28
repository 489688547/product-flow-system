import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, MonitorCheck, RefreshCw } from "lucide-react";
import { useDataCenter } from "../../state/DataCenterProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { loadErpArchives } from "../../state/erpCollectionApi.js";
import {
  loadWebCollectionStatus,
  triggerKuaimaiSalesCollection,
  triggerWebCollection
} from "../../state/webCollectionApi.js";
import {
  buildCollectionProgress,
  buildSyncConclusion,
  buildSyncCoverage
} from "../../domain/dataSyncCoverage.js";
import { DOUYIN_COLLECTION_RESOURCES } from "../../domain/dataCenterConnectors.js";
import { defaultDataCenterRange } from "../../domain/dataCenter.js";
import { buildDataSyncRunRows } from "../../domain/dataSyncRunRows.js";
import { TablePagination } from "../../ui/TablePagination.jsx";
import { SyncConclusionBar } from "./SyncConclusionBar.jsx";
import { SyncCoveragePanel } from "./SyncCoveragePanel.jsx";
import { DataConnectionsWorkspace } from "./connections/DataConnectionsWorkspace.jsx";

// 覆盖窗口独立于总览日期范围：联动会让半年区间拉出上千行。
const COVERAGE_WINDOW_DAYS = 14;
const RUN_PAGE_SIZE = 20;

const STATUS_LABELS = { healthy: "正常", success: "成功", queued: "等待 Chrome 领取", claimed: "已被 Chrome 领取", opening: "正在打开页面", exporting: "正在生成报表", downloading: "正在下载报表", validating: "正在校验", ingesting: "正在入库", pending_validation: "待验证", waiting_verification: "等待人工验证", waiting_human: "等待人工处理", collecting: "页面读数中", running: "同步中", stale: "已过期", login_required: "需要登录", schema_changed: "页面结构变化", failed: "失败", manual_required: "需要人工处理", unavailable: "尚未完成真实采集", superseded: "已被新批次取代", disabled: "未启用" };

function statusLabel(status) {
  return STATUS_LABELS[status] || status || "未启用";
}

function chromeStatusLabel(status) {
  return {
    extension_online: "扩展已连接",
    extension_offline: "扩展未连接",
    extension_expected: "扩展状态未确认",
    dedicated_browser_online: "专用 Chrome 已连接",
    dedicated_browser_offline: "专用 Chrome 未连接",
    ready: "扩展已连接"
  }[status] || "状态未知";
}

export function DataSourcesWorkspace({ canEdit, canManage, canManagePlatform, initialCategory }) {
  return <DataConnectionsWorkspace canEdit={canEdit} canManage={canManage} canManagePlatform={canManagePlatform} initialCategory={initialCategory} />;
}

const EMPTY_WEB_COLLECTION_STATUS = Object.freeze({ runners: [], stores: [], jobs: [], runs: [], cursors: [], notifications: [] });

export function SyncRunsWorkspace({ quality, dailyFacts = [], focusTarget = "", canTrigger = false }) {
  const { state, refresh } = useDataCenter();
  const coverageRef = useRef(null);
  const [archives, setArchives] = useState([]);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [archiveError, setArchiveError] = useState("");
  const [webCollection, setWebCollection] = useState(EMPTY_WEB_COLLECTION_STATUS);
  const [webCollectionLoading, setWebCollectionLoading] = useState(true);
  const [webCollectionError, setWebCollectionError] = useState("");
  const [includeHealthy, setIncludeHealthy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState("");
  const [resultError, setResultError] = useState("");
  const [runPage, setRunPage] = useState(1);
  const refreshWebCollection = useCallback(async () => {
    setWebCollectionLoading(true);
    try {
      setWebCollection(await loadWebCollectionStatus());
      setWebCollectionError("");
    } catch (error) {
      setWebCollectionError(error.message || "Chrome 采集状态读取失败。");
    } finally {
      setWebCollectionLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    setArchiveLoading(true);
    loadErpArchives().then(payload => {
      if (!active) return;
      setArchives(Array.isArray(payload.archives) ? payload.archives : []);
      setArchiveError("");
    }).catch(error => active && setArchiveError(error.message || "本机归档状态读取失败。"))
      .finally(() => active && setArchiveLoading(false));
    return () => { active = false; };
  }, []);
  useEffect(() => {
    refreshWebCollection();
  }, [refreshWebCollection]);
  const coverageRange = useMemo(() => {
    const to = defaultDataCenterRange().to;
    const from = new Date(Date.parse(`${to}T00:00:00.000Z`) - (COVERAGE_WINDOW_DAYS - 1) * 86400000)
      .toISOString().slice(0, 10);
    return { from, to };
  }, []);
  const coverage = useMemo(() => buildSyncCoverage({
    jobs: webCollection.jobs,
    stores: webCollection.stores,
    dailyFacts,
    range: coverageRange,
    includeHealthy
  }), [coverageRange, dailyFacts, includeHealthy, webCollection.jobs, webCollection.stores]);
  const progress = useMemo(() => buildCollectionProgress({
    jobs: webCollection.jobs,
    runners: webCollection.runners
  }), [webCollection.jobs, webCollection.runners]);
  const conclusion = useMemo(() => buildSyncConclusion(coverage, progress, {
    windowDays: COVERAGE_WINDOW_DAYS,
    latestDate: quality.latestDataDate
  }), [coverage, progress, quality.latestDataDate]);
  const syncRunRows = useMemo(() => buildDataSyncRunRows({
    legacyRuns: state.syncRuns,
    jobs: webCollection.jobs,
    runs: webCollection.runs
  }), [state.syncRuns, webCollection.jobs, webCollection.runs]);
  const pagedRunRows = useMemo(
    () => syncRunRows.slice((runPage - 1) * RUN_PAGE_SIZE, runPage * RUN_PAGE_SIZE),
    [runPage, syncRunRows]
  );
  useEffect(() => {
    if (focusTarget !== "kuaimai-sales" || !coverage.length) return;
    const frame = requestAnimationFrame(() => {
      coverageRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [coverage.length, focusTarget]);
  const refreshStatus = async () => {
    await Promise.allSettled([refresh(), refreshWebCollection()]);
  };
  // 逐目标串行提交；中途失败必须报告已成功的部分，不能让用户以为整批都失败。
  const submitBackfill = async rows => {
    if (!canTrigger || submitting) return;
    setSubmitting(true);
    setResultMessage("");
    setResultError("");
    let queued = 0;
    const failures = [];
    for (const row of rows) {
      try {
        if (row.caliber === "unified") {
          await triggerKuaimaiSalesCollection({ date: row.businessDate, resourceType: "order_items", force: true });
          queued += 1;
        } else {
          for (const store of webCollection.stores.filter(item => item.providerId === "douyin-ecommerce")) {
            for (const resource of DOUYIN_COLLECTION_RESOURCES) {
              await triggerWebCollection({
                providerId: "douyin-ecommerce",
                storeId: store.storeId,
                resourceType: resource.type,
                businessDate: row.businessDate,
                force: true
              });
              queued += 1;
            }
          }
        }
      } catch (error) {
        failures.push(`${row.businessDate} ${row.caliberLabel}：${error.message || "触发失败"}`);
      }
    }
    if (queued) setResultMessage(`已排入 ${queued} 个采集任务。`);
    if (failures.length) setResultError(`${failures.length} 个目标未能排队 — ${failures.join("；")}`);
    await refreshWebCollection();
    setSubmitting(false);
  };
  return <div className="data-workspace data-sync-workspace">
    <SyncConclusionBar
      conclusion={conclusion}
      progress={progress}
      loading={webCollectionLoading}
      error={webCollectionError}
      onRecheck={refreshStatus}
      rechecking={webCollectionLoading}
    />
    <div ref={coverageRef}>
      <SyncCoveragePanel
        coverage={coverage}
        runners={webCollection.runners}
        stores={webCollection.stores}
        jobs={webCollection.jobs}
        windowDays={COVERAGE_WINDOW_DAYS}
        canTrigger={canTrigger}
        loading={webCollectionLoading}
        error={webCollectionError}
        includeHealthy={includeHealthy}
        onToggleHealthy={() => setIncludeHealthy(current => !current)}
        onSubmit={submitBackfill}
        onRecheck={refreshStatus}
        submitting={submitting}
        resultMessage={resultMessage}
        resultError={resultError}
      />
    </div>
    <section className="section-panel"><div className="section-head"><div><h2>执行记录</h2><p>每一次跑了什么、结果如何。</p></div></div><DataTable minWidth={760} columns={[
      { key: "time", header: "执行时间", render: row => row.completedAt || row.startedAt || "—" },
      { key: "source", header: "数据源", render: row => row.sourceName || row.sourceId || "未知来源" },
      { key: "range", header: "数据范围", render: row => [row.from, row.to].filter(Boolean).join(" 至 ") || "—" },
      { key: "rows", header: "行数", className: "num", render: row => row.rowCount === null || row.rowCount === undefined ? "—" : row.rowCount },
      { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "success" ? "success" : row.status === "running" ? "warning" : "danger"}`}>{statusLabel(row.status)}</span> },
      { key: "message", header: "结果", render: row => row.message || "—" }
    ]} rows={pagedRunRows} empty={<div className="empty-state compact-empty">还没有数据中心同步记录。</div>} />
    <TablePagination total={syncRunRows.length} page={runPage} pageSize={RUN_PAGE_SIZE} onPageChange={setRunPage} /></section>
    <section className="section-panel"><div className="section-head"><div><h2>本机原始归档</h2><p>公司 Mac 上有哪些原始文件。</p></div><span className={`status-badge ${archiveError ? "danger" : archives.length ? "success" : "neutral"}`}>{archiveLoading ? "读取中" : archiveError ? "读取失败" : archives.length ? `${archives.length} 个归档文件` : "等待导出"}</span></div>
      <DataTable minWidth={720} columns={[
        { key: "file", header: "文件", render: row => row.fileName || "—" },
        { key: "resource", header: "资源", render: row => row.resourceType || "—" },
        { key: "size", header: "大小", className: "num", render: row => row.sizeBytes ? `${Math.round(row.sizeBytes / 1024)} KB` : "—" },
        { key: "status", header: "状态", render: row => <span className={`status-badge ${row.status === "processed" ? "success" : "neutral"}`}>{statusLabel(row.status)}</span> }
      ]} rows={archives} empty={<div className="empty-state compact-empty">{archiveError || "公司 Mac 上还没有原始归档文件。"}</div>} />
    </section>
  </div>;
}

export function DataCenterSettingsWorkspace({ canEdit }) {
  const { state, dispatch } = useDataCenter();
  const [draft, setDraft] = useState(state.settings);
  useEffect(() => setDraft(state.settings), [state.settings]);
  const changed = useMemo(() => JSON.stringify(draft) !== JSON.stringify(state.settings), [draft, state.settings]);
  return <section className="data-settings-workspace"><div className="data-settings-toolbar"><div><h2>采集与保留策略</h2><p>统一使用上海时区；正常报表只统计截止昨天的数据。</p></div>{canEdit ? <Button variant="primary" disabled={!changed} onClick={() => dispatch({ type: "settings", settings: draft })}>保存设置</Button> : <span className="status-badge neutral">只读</span>}</div><fieldset disabled={!canEdit}><label>业务时区<input value={draft.timezone || "Asia/Shanghai"} readOnly /></label><label>每日完成截止时间<input type="time" value={draft.cutoff || "07:30"} onChange={event => setDraft(current => ({ ...current, cutoff: event.target.value }))} /></label><label>原始数据保留天数<input type="number" min="30" max="1095" value={draft.rawRetentionDays || 365} onChange={event => setDraft(current => ({ ...current, rawRetentionDays: Number(event.target.value) }))} /></label><label>超过多少小时标记过期<input type="number" min="1" max="168" value={draft.staleAfterHours || 32} onChange={event => setDraft(current => ({ ...current, staleAfterHours: Number(event.target.value) }))} /></label></fieldset><p className="data-security-note">敏感信息加密保存；验证码不会被保存；查看与采集取用全程留痕。需要重新登录时由授权人员在指定公司电脑完成。</p></section>;
}

import { CloudDownload, PlugZap, RefreshCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { saveSalesData } from "../../state/salesStore.js";
import { Button } from "../../ui/Button.jsx";

function shanghaiDateString(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date);
}

function listDates(from, to) {
  const dates = [];
  let cursor = from;
  while (cursor <= to && dates.length < 62) {
    dates.push(cursor);
    const next = new Date(`${cursor}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return dates;
}

function mergeDailyRows(target, incoming) {
  const byKey = new Map(target.map(row => [`${row.code}|${row.date}|${row.platform}`, { ...row }]));
  incoming.forEach(row => {
    const key = `${row.code}|${row.date}|${row.platform}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...row });
      return;
    }
    ["qty", "sales", "netSales", "grossProfit", "refund", "cost", "preShipRefund", "postShipRefund"].forEach(field => {
      existing[field] = Math.round(((existing[field] || 0) + (row[field] || 0)) * 100) / 100;
    });
  });
  return [...byKey.values()];
}

export function KuaimaiSyncSettings({ canEdit = false, currentUser }) {
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [range, setRange] = useState({ from: shanghaiDateString(-1), to: shanghaiDateString(-1) });

  useEffect(() => {
    fetch("/api/kuaimai/status")
      .then(response => response.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false, configured: false, message: "本地服务不可用或未配置快麦API。" }));
  }, []);

  async function handleRefreshSession() {
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/kuaimai/refresh", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (payload.refreshed) setNotice("会话已刷新，有效期延长30天。");
      else if (payload.rateLimited) setNotice("平台限制每小时刷新一次，最近已刷新过，无需重复操作。");
      else setError(payload.message || "刷新会话失败。");
    } catch {
      setError("刷新会话失败：本地服务不可用。");
    }
  }

  async function handleSync() {
    if (syncing) return;
    setError("");
    setNotice("");
    setSyncing(true);
    const dates = listDates(range.from, range.to);
    let totalRows = 0;
    try {
      // 同步前顺手续期会话（限流错误忽略）
      fetch("/api/kuaimai/refresh", { method: "POST" }).catch(() => {});
      for (let index = 0; index < dates.length; index += 1) {
        const date = dates[index];
        setProgress(`正在同步 ${date}（${index + 1}/${dates.length}）…`);
        let rows = [];
        let titles = {};
        let pageNo = 1;
        for (let guard = 0; guard < 40; guard += 1) {
          const response = await fetch(`/api/kuaimai/pull?date=${date}&pageNo=${pageNo}`);
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || payload.synced === false) throw new Error(payload.message || `${date} 拉取失败。`);
          rows = mergeDailyRows(rows, payload.rows || []);
          titles = { ...titles, ...(payload.titles || {}) };
          if (!payload.nextPage) break;
          pageNo = payload.nextPage;
          setProgress(`正在同步 ${date}（${index + 1}/${dates.length}，第 ${pageNo} 页）…`);
        }
        if (rows.length) {
          await saveSalesData({
            rows,
            titles,
            months: [...new Set(rows.map(row => row.date.slice(0, 7)))],
            source: `快麦API ${date}`,
            importedBy: currentUser?.name || "",
            replaceScope: "dates"
          });
          totalRows += rows.length;
        }
      }
      setNotice(`同步完成：${dates[0]} ~ ${dates[dates.length - 1]}，写入 ${totalRows} 行聚合数据。注意：API同步的退款金额为0（接口不含退款明细），月底用Excel重导覆盖校准。`);
    } catch (event) {
      setError(event.message || "同步失败。");
    } finally {
      setSyncing(false);
      setProgress("");
    }
  }

  const statusText = !status ? "正在检查连接…"
    : status.connected ? `已连接（网关时间 ${status.serverTime || "未知"}）`
    : status.configured === false ? "未配置" : `连接失败：${status.message || "未知错误"}`;
  const syncDisabledReason = syncing ? "销售数据正在同步" : !status?.connected ? "请先完成快麦接口连接" : !range.from || !range.to ? "请选择完整的同步日期范围" : "";

  return (
    <section className="section-panel settings-kuaimai">
      <div className="section-head settings-template-head">
        <div>
          <h2>快麦ERP接口同步</h2>
          <p>直接从快麦开放平台按天拉取订单，聚合成单品销售数据（69码×日×平台）。适合日常增量；月底仍建议用Excel整月重导校准退款。</p>
          <p className={`kuaimai-status ${status?.connected ? "ok" : "bad"}`}><PlugZap size={14} aria-hidden="true" />{statusText}</p>
        </div>
        {canEdit ? (
          <div className="settings-save-actions">
            <Button onClick={handleRefreshSession}><RefreshCcw size={16} />刷新会话</Button>
          </div>
        ) : null}
      </div>
      {canEdit ? (
        <div className="kuaimai-sync-controls">
          <label>从<input type="date" value={range.from} max={shanghaiDateString(0)} onChange={event => setRange(current => ({ ...current, from: event.target.value }))} /></label>
          <label>到<input type="date" value={range.to} max={shanghaiDateString(0)} onChange={event => setRange(current => ({ ...current, to: event.target.value }))} /></label>
          <Button variant="primary" disabled={Boolean(syncDisabledReason)} disabledReason={syncDisabledReason} onClick={handleSync}>
            <CloudDownload size={16} />{syncing ? "同步中…" : "开始同步"}
          </Button>
        </div>
      ) : null}
      {progress ? <p className="sales-import-message" role="status">{progress}</p> : null}
      {notice ? <p className="sales-import-message success" role="status">{notice}</p> : null}
      {error ? <p className="sales-import-message error" role="alert">{error}</p> : null}
    </section>
  );
}

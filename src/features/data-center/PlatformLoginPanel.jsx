import React from "react";
import { Button } from "../../ui/Button.jsx";
import { LOGIN_STATE_LABELS, buildPlatformLoginStates } from "../../domain/platformLoginState.js";

// 登录失效是采集失败最常见的原因，但它原先只体现为某几条任务的错误码，
// 要人自己在一堆失败里认出「这是登录掉了」。这里把它汇总到平台一级，
// 并把「去登录」和「登完重采」放在同一行——参照快麦「智库-授权情况」的组织方式。

const STATE_BADGE = { login_required: "warning", signed_in: "success", unknown: "neutral" };

function 判据时间(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

export function PlatformLoginPanel({ jobs = [], onRecollect, recollecting = "", canTrigger = true }) {
  const states = buildPlatformLoginStates(jobs);
  if (!states.length) return null;

  return <section className="data-settings-workspace platform-login-panel">
    <div className="data-settings-toolbar">
      <div>
        <h2>平台登录</h2>
        {/* 说清这是什么时候的状态。判据来自采集记录，而采集是定时的——登录可能刚掉、
            也可能刚恢复，记录都还没跟上。不写清楚，会让人在「显示已登录」时反复排查别的原因。 */}
        <p>状态取自各平台最近一次有结论的采集，不是此刻的实时探测。要确认当前是否还登录着，点「重新采集」跑一次。</p>
      </div>
    </div>
    <table className="data-table">
      <thead><tr><th>平台</th><th>登录状态</th><th>判据</th><th>操作</th></tr></thead>
      <tbody>
        {states.map(item => <tr key={item.providerId}>
          <td>{item.name}</td>
          <td><span className={`status-badge ${STATE_BADGE[item.state] || "neutral"}`}>{LOGIN_STATE_LABELS[item.state]}</span></td>
          <td>
            <div>{item.reason}</div>
            {item.since ? <div className="data-note">{判据时间(item.since)}</div> : null}
          </td>
          <td className="platform-login-actions">
            {/* 快麦跑在当前浏览器的扩展里，链接正好落在对的地方。
                抖音跑在独立的专用浏览器里，网页链接打不开它，因此不给链接——
                给了只会把人带到一个采集器根本用不上的登录态。 */}
            {item.openIn === "current_browser"
              ? <a className="button" href={item.loginUrl} target="_blank" rel="noreferrer">打开登录页</a>
              : null}
            <Button
              type="button"
              disabled={!canTrigger || Boolean(recollecting)}
              onClick={() => onRecollect?.(item.providerId)}
            >
              {recollecting === item.providerId ? "正在排队…" : "重新采集"}
            </Button>
            <div className="data-note">{item.hint}</div>
          </td>
        </tr>)}
      </tbody>
    </table>
  </section>;
}

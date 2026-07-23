import { CheckCircle2, Database, MonitorCog } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDataEnvironment } from "../../state/DataEnvironmentProvider.jsx";
import { Button } from "../../ui/Button.jsx";

const ENVIRONMENTS = [
  {
    id: "production",
    label: "正式数据库",
    description: "日常真实业务数据；保存、同步和外部平台动作按正式规则执行。"
  },
  {
    id: "display",
    label: "展示数据库",
    description: "独立的展示业务数据；对外写动作将在系统内模拟，不会发到真实平台。"
  }
];

function displayStatusText(display) {
  if (display.status === "ready") return "可使用";
  if (display.status === "refreshing") return "正在更新";
  if (display.status === "failed") return "更新失败";
  if (!display.enabled) return "尚未启用";
  return "尚未准备完成";
}

function formattedTime(value) {
  if (!value) return "尚无成功更新时间";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "尚无成功更新时间"
    : `最近更新 ${date.toLocaleString("zh-CN", { hour12: false })}`;
}

export function DataEnvironmentSettings() {
  const {
    current,
    display,
    permissions,
    switching,
    error,
    lastSwitchAt,
    switchEnvironment
  } = useDataEnvironment();
  const [selected, setSelected] = useState(current.id);
  const [notice, setNotice] = useState("");
  const [localError, setLocalError] = useState("");
  const titleRef = useRef(null);

  useEffect(() => setSelected(current.id), [current.id]);
  useEffect(() => {
    if (!lastSwitchAt) return;
    setNotice(`已切换到${current.id === "display" ? "展示数据库" : "正式数据库"}。`);
    requestAnimationFrame(() => titleRef.current?.focus());
  }, [current.id, lastSwitchAt]);
  if (!permissions.canManage) return null;

  const displaySelectable = display.enabled && display.status === "ready";
  const selectedUnavailable = selected === "display" && !displaySelectable;
  const unchanged = selected === current.id;

  async function confirmSwitch() {
    if (unchanged || selectedUnavailable || switching) return;
    setNotice("");
    setLocalError("");
    try {
      await switchEnvironment(selected);
    } catch (switchError) {
      setLocalError(switchError?.message || "数据环境切换失败，请重试。");
    }
  }

  return (
    <section className="section-panel data-environment-settings" aria-labelledby="data-environment-title">
      <div className="section-head settings-template-head">
        <div>
          <h2 id="data-environment-title" ref={titleRef} tabIndex="-1">数据环境</h2>
          <p>只有当前账号的当前浏览器会切换，其他账号和浏览器不会跟着变化。</p>
        </div>
        <span className="data-environment-current"><Database size={16} aria-hidden="true" />当前：<strong>{current.id === "display" ? "展示数据库" : "正式数据库"}</strong></span>
      </div>

      <fieldset className="data-environment-options" disabled={switching}>
        <legend className="sr-only">选择数据环境</legend>
        {ENVIRONMENTS.map(option => {
          const unavailable = option.id === "display" && !displaySelectable;
          return (
            <label className={`data-environment-option${selected === option.id ? " selected" : ""}${unavailable ? " unavailable" : ""}`} key={option.id}>
              <input
                type="radio"
                name="data-environment"
                value={option.id}
                checked={selected === option.id}
                disabled={unavailable}
                onChange={() => {
                  setSelected(option.id);
                  setNotice("");
                  setLocalError("");
                }}
              />
              <span className="data-environment-option-icon" aria-hidden="true">
                {selected === option.id ? <CheckCircle2 size={19} /> : <MonitorCog size={19} />}
              </span>
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
                {option.id === "display" ? <em>{displayStatusText(display)} · {formattedTime(display.sourceUpdatedAt || display.lastUpdatedAt)}</em> : null}
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="data-environment-actions">
        <span className="data-environment-help">
          {selectedUnavailable ? "展示数据库尚未就绪，正式数据库不受影响。" : "切换后页面会重新读取所选数据库，未完成的旧请求会自动停止。"}
        </span>
        <Button
          variant="primary"
          disabled={unchanged || selectedUnavailable || switching}
          disabledReason={unchanged ? "当前已经使用这个数据库" : selectedUnavailable ? "展示数据库尚未准备完成" : ""}
          onClick={confirmSwitch}
        >
          {switching ? "正在切换…" : "确认切换"}
        </Button>
      </div>
      <div className="data-environment-feedback" aria-live="polite">
        {notice ? <p className="sales-import-message success">{notice}</p> : null}
        {localError || error ? <p className="sales-import-message error" role="alert">{localError || error}</p> : null}
      </div>
    </section>
  );
}

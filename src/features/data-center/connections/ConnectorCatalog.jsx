import { Plus, Settings2 } from "lucide-react";
import { CONNECTOR_STATUS_PRIORITY, DATA_CONNECTOR_DEFINITIONS } from "../../../domain/dataCenterConnectors.js";
import douyinLogo from "../../../assets/connectors/douyin.svg";
import oceanengineLogo from "../../../assets/connectors/oceanengine.svg";
import kuaishouLogo from "../../../assets/connectors/kuaishou.svg";
import taobaoLogo from "../../../assets/connectors/taobao.svg";
import pinduoduoLogo from "../../../assets/connectors/pinduoduo.svg";
import xiaohongshuLogo from "../../../assets/connectors/xiaohongshu.svg";
import jdLogo from "../../../assets/connectors/jd.svg";
import kuaimaiLogo from "../../../assets/connectors/kuaimai.svg";

const LOGOS = {
  douyin: douyinLogo,
  oceanengine: oceanengineLogo,
  kuaishou: kuaishouLogo,
  taobao: taobaoLogo,
  pinduoduo: pinduoduoLogo,
  xiaohongshu: xiaohongshuLogo,
  jd: jdLogo,
  kuaimai: kuaimaiLogo
};

const METHOD_LABELS = { api: "API", browser: "网页", export: "文件导出" };
const STATUS_LABELS = {
  waiting_verification: "等待人工验证",
  schema_changed: "页面结构变化",
  failed: "同步失败",
  login_required: "需要重新登录",
  stale: "数据已过期",
  running: "正在同步",
  pending_validation: "等待首次验证",
  healthy: "已接通",
  unconfigured: "尚未添加连接",
  disabled: "已停用"
};

function summaryStatus(instances) {
  if (!instances.length) return "unconfigured";
  return CONNECTOR_STATUS_PRIORITY.find(status => instances.some(item => item.status === status)) || "pending_validation";
}

export function ConnectorCatalog({ definitions = DATA_CONNECTOR_DEFINITIONS, instances = [], canEdit = false, onAdd, onManage }) {
  return (
    <div className="data-access-grid connector-catalog-grid">
      {definitions.map(definition => {
        const configured = instances.filter(item => item.connectorId === definition.id);
        const status = summaryStatus(configured);
        return (
          <article className={`connector-card status-${status}`} key={definition.id}>
            <div className="connector-card-head">
              <img src={LOGOS[definition.logo]} alt="" aria-hidden="true" />
              <div><strong>{definition.name}</strong><span>{definition.description}</span></div>
              <em>{STATUS_LABELS[status]}</em>
            </div>
            <div className="connector-methods" aria-label={`${definition.name}支持的接入方式`}>
              {definition.methods.map(method => <span key={method}>{METHOD_LABELS[method]}</span>)}
            </div>
            {configured.length ? (
              <ul className="connector-instance-list">
                {configured.slice(0, 3).map(instance => (
                  <li key={instance.id}>
                    <span><b>{instance.name}</b><small>{STATUS_LABELS[instance.status] || instance.status}</small></span>
                    <button type="button" onClick={() => onManage(definition, instance)} aria-label={`管理${instance.name}`}><Settings2 size={14} />管理连接</button>
                  </li>
                ))}
              </ul>
            ) : <p>配置保存后先进入待验证，不会直接标记为已接通。</p>}
            <button className="connector-add-action" type="button" disabled={!canEdit} onClick={() => onAdd(definition)}>
              <Plus size={15} />添加连接
            </button>
          </article>
        );
      })}
    </div>
  );
}

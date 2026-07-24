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

const METHOD_LABELS = { api: "API", browser: "网页", export: "文件导入" };
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
  disabled: "已停用",
  unavailable: "尚未接入"
};

function summaryStatus(instances) {
  if (!instances.length) return "unconfigured";
  return CONNECTOR_STATUS_PRIORITY.find(status => instances.some(item => item.status === status)) || "pending_validation";
}

export function ConnectorCatalog({
  definitions = DATA_CONNECTOR_DEFINITIONS,
  instances = [],
  canEdit = false,
  onAdd,
  onManage,
  waitingForSamples = () => false,
  pendingMessage = "",
  pendingActionLabel = "等待文件样例",
  providerReadiness = {}
}) {
  return (
    <div className="data-access-grid connector-catalog-grid">
      {definitions.map(definition => {
        const samplePending = waitingForSamples(definition.id);
        const readiness = providerReadiness[definition.id];
        const fixedUnavailable = readiness?.status === "unavailable";
        const configured = samplePending || definition.id === "douyin-ecommerce"
          ? []
          : instances.filter(item => item.connectorId === definition.id);
        const status = samplePending
          ? "sample_pending"
          : readiness?.status || summaryStatus(configured);
        return (
          <article className={`connector-card status-${status}`} key={definition.id}>
            <div className="connector-card-head">
              <img src={LOGOS[definition.logo]} alt="" aria-hidden="true" />
              <div><strong>{definition.name}</strong><span>{definition.description}</span></div>
              <em>{samplePending ? "等待文件样例" : STATUS_LABELS[status]}</em>
            </div>
            <div className="connector-methods" aria-label={`${definition.name}支持的接入方式`}>
              {definition.methods.map(method => <span key={method}>{definition.id === "douyin-ecommerce" && method === "browser" ? "Chrome 官方报表采集" : METHOD_LABELS[method]}</span>)}
            </div>
            {definition.collectionResources?.length ? <div className="connector-methods" aria-label="抖店采集资源">
              {definition.collectionResources.map(resource => {
                const resourceState = readiness?.resources?.find(item => item.type === resource.type);
                return <span key={resource.type}>{resource.label}{resourceState?.status === "success" ? " · 已完成" : ""}</span>;
              })}
            </div> : null}
            {definition.id === "douyin-ecommerce" && readiness?.stores?.length ? (
              <ul className="connector-instance-list" aria-label="已识别抖店店铺">
                {readiness.stores.slice(0, 3).map(store => (
                  <li key={store.storeId}>
                    <span><b>{store.storeName}</b><small>店铺 ID {store.storeId}</small></span>
                    <em>{store.status === "connected" ? "已识别" : "已停用"}</em>
                  </li>
                ))}
              </ul>
            ) : null}
            {configured.length ? (
              <ul className="connector-instance-list">
                {configured.slice(0, 3).map(instance => (
                  <li key={instance.id}>
                    <span><b>{instance.name}</b><small>{STATUS_LABELS[instance.status] || instance.status}</small></span>
                    <button
                      type="button"
                      aria-label={`管理${instance.name}`}
                      disabled={!canEdit}
                      title={!canEdit ? "当前账号没有数据接入编辑权限" : undefined}
                      onClick={() => onManage(definition, instance)}
                    ><Settings2 size={14} />管理连接</button>
                  </li>
                ))}
              </ul>
            ) : <p>{samplePending
              ? pendingMessage
              : fixedUnavailable
                ? "尚未接入；不会把广告消耗、ROI 或素材数据返回为 0。"
                : readiness?.error
                  ? readiness.error
                  : definition.id === "douyin-ecommerce"
                    ? "只有四类资源完成真实批次后才显示已接通；登录或验证失败会进入数据同步记录。"
                    : "配置保存后先进入待验证，不会直接标记为已接通。"}</p>}
            {definition.id === "douyin-ecommerce" ? <a
              className="connector-add-action"
              href="https://fxg.jinritemai.com/"
              target="_blank"
              rel="noreferrer"
            ><Plus size={15} />打开抖店处理</a> : <button
              className="connector-add-action"
              type="button"
              disabled={samplePending || fixedUnavailable || !canEdit}
              title={samplePending ? pendingMessage : fixedUnavailable ? "尚未接入" : (!canEdit ? "当前账号没有数据接入编辑权限" : undefined)}
              onClick={() => onAdd(definition)}
            >
              <Plus size={15} />{samplePending ? pendingActionLabel : fixedUnavailable ? "尚未接入" : "添加连接"}
            </button>}
          </article>
        );
      })}
    </div>
  );
}

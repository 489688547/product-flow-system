import { Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import kuaimaiLogo from "../../../assets/connectors/kuaimai.svg";
import { summarizeErpAccessHealth } from "../../../domain/dataAccessCatalog.js";
import { DATA_CONNECTOR_DEFINITIONS } from "../../../domain/dataCenterConnectors.js";
import { Button } from "../../../ui/Button.jsx";
import { PlatformConnectionsWorkspace } from "../PlatformConnectionsWorkspace.jsx";
import { DataAccessCard } from "./DataAccessCard.jsx";

const KUAIMAI_CONNECTOR = DATA_CONNECTOR_DEFINITIONS.find(item => item.id === "kuaimai-erp");

const SYNC_STATUS_LABELS = {
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

export function ErpAccessWorkspace({
  connectorInstances = [],
  platformController,
  canEdit = false,
  canManagePlatform = false,
  onAdd,
  onManage,
  onDetailChange
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const instances = connectorInstances.filter(item => item.connectorId === "kuaimai-erp");
  const [status, statusTone] = summarizeErpAccessHealth({
    connection: null,
    instances,
    loading: platformController.loading,
    error: platformController.error
  });

  const setDetail = open => {
    setDetailOpen(open);
    onDetailChange?.(open);
  };

  if (!detailOpen) {
    return (
      <div className="data-access-grid">
        <DataAccessCard
          mark={<img src={kuaimaiLogo} alt="" aria-hidden="true" />}
          markClassName="kuaimai"
          title="快麦 ERP"
          description="订单、商品、库存与销售数据"
          status={status}
          statusTone={statusTone}
          meta={[`${instances.length} 个同步连接`, "Chrome 插件 / 官方文件", "API 未打通"]}
          onOpen={() => setDetail(true)}
          actionLabel="管理"
        >
          <p>当前通过公司 Mac 的 Chrome 插件和快麦官方文件采集；开放平台 API 暂不使用。</p>
        </DataAccessCard>
      </div>
    );
  }

  return (
    <div className="data-access-detail">
      <PlatformConnectionsWorkspace
        canManage={canManagePlatform}
        platformIds={["kuaimai"]}
        initialPlatformId="kuaimai"
        embedded
        controller={platformController}
        onBack={() => setDetail(false)}
      />
      <section className="data-access-sync-section">
        <header>
          <div><h3>数据同步</h3><p>分别管理订单、商品、库存和销售同步。</p></div>
          <Button variant="primary" disabled={!canEdit} disabledReason="当前账号没有数据接入编辑权限" onClick={() => onAdd(KUAIMAI_CONNECTOR)}><Plus size={15} aria-hidden="true" />添加同步</Button>
        </header>
        {instances.length ? (
          <div className="data-access-instance-list">
            {instances.map(instance => (
              <button type="button" key={instance.id} disabled={!canEdit} title={!canEdit ? "当前账号没有数据接入编辑权限" : undefined} onClick={() => onManage(KUAIMAI_CONNECTOR, instance)}>
                <span><strong>{instance.name}</strong><small>{SYNC_STATUS_LABELS[instance.status] || instance.status || "等待首次验证"}</small></span>
                <span><Settings2 size={14} aria-hidden="true" />管理同步</span>
              </button>
            ))}
          </div>
        ) : <div className="empty-state compact-empty">还没有快麦同步连接。请先启动公司 Mac 的 Chrome 插件，或使用快麦官方文件导入。</div>}
      </section>
    </div>
  );
}

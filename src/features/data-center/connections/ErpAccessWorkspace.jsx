import { Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import kuaimaiLogo from "../../../assets/connectors/kuaimai.svg";
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

function platformStatus(controller, connection) {
  if (controller.loading && !controller.connections.length) return ["正在读取", "neutral"];
  if (controller.error && !connection) return ["状态暂不可用", "danger"];
  if (connection?.status === "connected") return ["已接通", "success"];
  if (["needs_attention", "incomplete"].includes(connection?.status)) return ["需处理", "danger"];
  if (connection?.status === "configured") return ["已配置", "warning"];
  return ["尚未连接", "neutral"];
}

export function ErpAccessWorkspace({
  connectorInstances = [],
  platformController,
  canEdit = false,
  canManagePlatform = false,
  onAdd,
  onManage
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const instances = connectorInstances.filter(item => item.connectorId === "kuaimai-erp");
  const connection = platformController.connections.find(item => item.platformId === "kuaimai");
  const [status, statusTone] = platformStatus(platformController, connection);

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
          meta={[`${instances.length} 个同步连接`, connection?.verifiedAt ? "平台连接已验证" : "平台连接待验证"]}
          onOpen={() => setDetailOpen(true)}
          actionLabel="管理"
        >
          <p>统一维护公司 API 连接和业务数据同步，不再分散到两个入口。</p>
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
        onBack={() => setDetailOpen(false)}
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
        ) : <div className="empty-state compact-empty">还没有快麦同步连接。完成平台连接后，可按数据范围添加同步。</div>}
      </section>
    </div>
  );
}

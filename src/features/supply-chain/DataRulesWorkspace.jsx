import { useState } from "react";
import { Button } from "../../ui/Button.jsx";
import { Modal } from "../../ui/Modal.jsx";

const STATUS_LABELS = Object.freeze({
  trusted: "可信",
  partial: "部分覆盖",
  stale: "数据过期",
  unavailable: "不可用"
});

const RULES = Object.freeze([
  { name: "销售需求归属", value: "订单创建时间 · Asia/Shanghai · 默认排除其它", version: "company-sales-v1" },
  { name: "盘点差异", value: "理论与实盘差异 5% 内可接受，超阈值需讨论", version: "stocktake-v1" },
  { name: "BOM 损耗", value: "组成 SKU 成本 × 用量后默认上浮 10%；缺成本不计算", version: "bom-cost-v1" },
  { name: "清仓阈值", value: "可售天数 > 45 天，结合过季、过节与日动销 < 20", version: "clearance-v1" },
  { name: "采购建议", value: "覆盖最长周期并结合同比、活动、MOQ 与产能", version: "procurement-v1" }
]);

export function DataRulesWorkspace({ sources = [], workflowAvailable = false, workflow, children }) {
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({ name: "清仓阈值", value: "", effectiveFrom: "" });
  const workflowRules = workflow?.workflows?.["business-rules"]?.items || [];
  async function saveRule() {
    if (!ruleForm.name.trim() || !ruleForm.value.trim()) return;
    try {
      await workflow.create({
        resource: "business-rules",
        id: `business-rule:${Date.now()}`,
        fields: {
          name: ruleForm.name.trim(),
          value: ruleForm.value.trim(),
          effectiveFrom: ruleForm.effectiveFrom || new Date().toISOString().slice(0, 10)
        }
      });
      setRuleOpen(false);
      setRuleForm({ name: "清仓阈值", value: "", effectiveFrom: "" });
    } catch {
      // The page-level workflow notice presents the safe error and request ID.
    }
  }

  async function publishRule(entity) {
    try {
      await workflow.act({
        resource: "business-rules",
        id: entity.id,
        action: "publish",
        expectedVersion: entity.version,
        reason: "业务规则复核通过"
      });
    } catch {
      // The page-level workflow notice presents the safe error and request ID.
    }
  }

  const effectiveRules = [
    ...RULES,
    ...workflowRules.map(entity => ({
      name: entity.fields?.name || entity.id,
      value: entity.fields?.value || "规则值待补",
      version: `v${entity.version}`,
      entity
    }))
  ];
  return (
    <div className="supply-work-grid supply-data-rules">
      <section className="section-panel">
        <div className="section-head"><div><h2>数据覆盖</h2><p>商品主数据、ERP 库存、销售需求、采购与付款、质量与售后分别显示来源和可信状态。</p></div></div>
        <div className="supply-source-grid">
          {sources.map(source => {
            const status = ["trusted", "partial", "stale", "unavailable"].includes(source.status) ? source.status : "partial";
            return <article key={source.name}>
              <div><strong>{source.name}</strong><span className={`status-badge ${status === "trusted" ? "success" : status === "unavailable" ? "danger" : "warning"}`}>{STATUS_LABELS[status]}</span></div>
              <p>{source.description}</p>
              <b>{source.countLabel}</b>
              <small>{source.updatedAt ? `最近可信：${source.updatedAt}` : "最近可信时间待补"}</small>
            </article>;
          })}
          <article>
            <div><strong>工作流命令</strong><span className={`status-badge ${workflowAvailable ? "success" : "neutral"}`}>{workflowAvailable ? "已接通" : "计划中"}</span></div>
            <p>责任规则、采购计划、供应商评价、质量标准与运费核对</p>
            <b>{workflowAvailable ? "版本化写入已开放" : "工作流服务暂不可用"}</b>
            <small>{workflowAvailable ? "所有写入带权限、幂等、版本与审计" : "服务恢复前保留只读数据，不伪造操作结果"}</small>
          </article>
        </div>
      </section>
      <section className="section-panel">
        <div className="section-head"><div><h2>规则目录</h2><p>规则值、版本与数据口径集中可见；版本化编辑由共享工作流服务提供。</p></div><Button variant="primary" disabled={!workflow?.resourceAvailable?.("business-rules")} disabledReason="业务规则服务暂不可用" onClick={() => setRuleOpen(true)}>新增规则版本</Button></div>
        <div className="supply-rule-list">
          {effectiveRules.map((rule, index) => <article key={`${rule.name}:${rule.version}:${index}`}><div><strong>{rule.name}</strong><small>{rule.version}</small></div><p>{rule.value}</p>{rule.entity?.status === "draft" ? <Button className="compact" disabled={Boolean(workflow?.busy)} onClick={() => publishRule(rule.entity)}>发布本版</Button> : rule.entity ? <span className="status-badge success">{rule.entity.status === "published" ? "已发布" : rule.entity.status}</span> : null}</article>)}
        </div>
      </section>
      {children}
      <Modal
        open={ruleOpen}
        title="新增业务规则版本"
        onClose={() => setRuleOpen(false)}
        footer={<><Button onClick={() => setRuleOpen(false)}>取消</Button><Button variant="primary" disabled={!ruleForm.name.trim() || !ruleForm.value.trim() || Boolean(workflow?.busy)} onClick={saveRule}>{workflow?.busy ? "保存中…" : "保存草稿"}</Button></>}
      >
        <div className="form-grid supply-form-grid">
          <label>规则名称<select value={ruleForm.name} onChange={event => setRuleForm(current => ({ ...current, name: event.target.value }))}>{RULES.map(rule => <option key={rule.name}>{rule.name}</option>)}</select></label>
          <label>生效日期<input type="date" value={ruleForm.effectiveFrom} onChange={event => setRuleForm(current => ({ ...current, effectiveFrom: event.target.value }))} /></label>
          <label className="full">规则值与说明<textarea rows="5" value={ruleForm.value} onChange={event => setRuleForm(current => ({ ...current, value: event.target.value }))} placeholder="记录阈值、适用范围和例外条件" /></label>
        </div>
      </Modal>
    </div>
  );
}

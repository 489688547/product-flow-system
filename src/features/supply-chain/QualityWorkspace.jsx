import { useMemo, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import { parseQualityImportRows } from "../../domain/supplyChain.js";
import { streamSpreadsheetRows } from "../../domain/xlsxLite.js";
import { useSupplyChain } from "../../state/SupplyChainProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { TablePagination } from "../../ui/TablePagination.jsx";
import { collaborationDraftFromSupplyIssue } from "../../domain/collaborationAdapters.js";
import { AppCollaborationButton } from "../collaboration/AppCollaborationButton.jsx";

const QUALITY_TABS = [
  ["standards", "质量标准"],
  ["inspections", "质检执行"],
  ["incidents", "问题闭环"]
];
const INCIDENT_STAGES = ["发现", "定性", "处理", "整改", "验证", "关闭"];
const INCIDENT_ACTIONS = Object.freeze({
  discovered: ["classify", "完成定性"],
  classified: ["handle", "记录处理"],
  handled: ["remediate", "记录整改"],
  remediated: ["verify", "完成验证"],
  verified: ["close", "关闭问题"]
});
const PAGE_SIZE = 30;

async function rowsFromSpreadsheet(file) {
  let headers = null;
  const rows = [];
  await streamSpreadsheetRows(file, row => {
    if (!headers) { headers = row.map(value => String(value || "").trim()); return; }
    if (row.some(value => String(value ?? "").trim())) rows.push(Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
  });
  return rows;
}

export function QualityWorkspace({
  products,
  canEdit,
  issues = [],
  aftersales = [],
  issueQuality = {},
  aftersalesQuality = {},
  workflow
}) {
  const { state, dispatch } = useSupplyChain();
  const [activeTab, setActiveTab] = useState("standards");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [closingIssue, setClosingIssue] = useState(null);
  const [closeResult, setCloseResult] = useState("");
  const [closeError, setCloseError] = useState("");
  const [createDialog, setCreateDialog] = useState("");
  const [createForm, setCreateForm] = useState({ productId: "", title: "", checklist: "", plannedAt: "" });
  const standardAvailable = workflow?.resourceAvailable?.("quality-standards") === true;
  const inspectionAvailable = workflow?.resourceAvailable?.("inspection-plans") === true;
  const incidentAvailable = workflow?.resourceAvailable?.("quality-incidents") === true;
  const workflowStandards = workflow?.workflows?.["quality-standards"]?.items || [];
  const workflowInspections = workflow?.workflows?.["inspection-plans"]?.items || [];
  const workflowIncidents = workflow?.workflows?.["quality-incidents"]?.items || [];
  const issuesUnavailable = issueQuality?.status === "unavailable";
  const aftersalesUnavailable = aftersalesQuality?.status === "unavailable";
  const sourceIssues = issues.length ? issues : state.qualityIssues;
  const productMap = useMemo(() => new Map(products.map(item => [item.id, item])), [products]);
  const supplierMap = useMemo(() => new Map(state.suppliers.map(item => [item.id, item])), [state.suppliers]);
  const standardRows = useMemo(() => products.map(product => {
    const entity = workflowStandards.find(item => String(item.fields?.productId || "") === String(product.id));
    return {
    id: product.id,
    name: product.name || product.productName || "未命名产品",
    category: product.category || "未分类",
    standard: entity?.fields?.knowledgeBase || product.qualityStandard || product.qualityStandardFile || null,
    checklist: entity?.fields?.checklistItems || product.qualityChecklist || [],
    version: entity?.version || product.qualityStandardVersion || null
  };
  }), [products, workflowStandards]);
  const inspectionRows = useMemo(() => [
    ...workflowInspections.map(entity => ({
      ...entity.fields,
      id: entity.id,
      workflowVersion: entity.version,
      inspectionType: entity.fields?.inspectionType || "后续抽检",
      inspectionStatus: entity.status === "completed" ? "passed" : "uninspected"
    })),
    ...sourceIssues
    .filter(issue => issue.inspectionDate || /抽检|质检|验收/.test(String(issue.sourceType || "")))
    .map(issue => ({
      ...issue,
      inspectionType: issue.inspectionType || (issue.firstBatch ? "首批检查" : "后续抽检"),
      inspectionStatus: issue.inspectionStatus || (issue.status === "closed" ? "passed" : issue.disposition ? "failed" : "uninspected")
    }))
  ], [sourceIssues, workflowInspections]);
  const incidentRows = useMemo(() => {
    const rows = new Map(sourceIssues.map(issue => [String(issue.id), { ...issue, workflowEntity: null }]));
    workflowIncidents.forEach(entity => {
      const sourceId = String(entity.fields?.sourceIncidentId || entity.id);
      const source = rows.get(sourceId) || {};
      rows.set(sourceId, {
        ...source,
        ...entity.fields,
        id: sourceId,
        status: entity.status,
        workflowEntity: entity
      });
    });
    return [...rows.values()];
  }, [sourceIssues, workflowIncidents]);
  async function handleFile(file) {
    if (!file) return;
    setParsing(true); setError(""); setPending(null);
    try {
      const parsed = parseQualityImportRows(await rowsFromSpreadsheet(file), { products, suppliers: state.suppliers });
      setPending({ ...parsed, fileName: file.name });
    } catch (event) { setError(event.message || "差评文件解析失败。"); }
    finally { setParsing(false); }
  }
  function confirmImport() {
    if (!pending?.validRows.length) return;
    const batchId = `quality-batch-${Date.now()}`;
    dispatch({ type: "batch", actions: [
      { type: "upsert", collection: "qualityImportBatches", record: { id: batchId, fileName: pending.fileName, rows: pending.validRows.length, errorRows: pending.errors.length, importedAt: new Date().toISOString() } },
      ...pending.validRows.map(issue => ({ type: "upsert", collection: "qualityIssues", record: { ...issue, id: `${batchId}-${issue.sourceRow}`, batchId, importedAt: new Date().toISOString() } }))
    ] });
    setPending(null);
  }
  function openCloseDialog(issue) {
    setClosingIssue(issue);
    setCloseResult(issue.publicRelationsResult || "");
    setCloseError("");
  }
  function cancelCloseDialog() {
    setClosingIssue(null);
    setCloseError("");
  }
  async function confirmCloseIssue() {
    if (!closingIssue) return;
    const publicRelationsResult = closeResult.trim();
    if (!publicRelationsResult) {
      setCloseError("请记录公关处理结果和整改结论。");
      return;
    }
    if (!incidentAvailable) return;
    try {
      let entity = closingIssue.workflowEntity;
      if (!entity) {
        const created = await workflow.create({
          resource: "quality-incidents",
          id: `quality-incident:${closingIssue.id}`,
          fields: {
            sourceIncidentId: closingIssue.id,
            productId: closingIssue.productId || null,
            skuCode: closingIssue.skuCode || null,
            content: closingIssue.content || "质量问题",
            evidence: publicRelationsResult
          }
        });
        entity = created.entity;
      } else {
        const next = INCIDENT_ACTIONS[entity.status];
        if (!next) return;
        await workflow.act({
          resource: "quality-incidents",
          id: entity.id,
          action: next[0],
          expectedVersion: entity.version,
          reason: publicRelationsResult,
          fields: { result: publicRelationsResult }
        });
      }
      cancelCloseDialog();
    } catch {
      // The page-level workflow notice presents the safe error and request ID.
    }
  }

  async function createQualityRecord() {
    if (!createForm.productId || !createForm.title.trim()) return;
    try {
      if (createDialog === "standard") {
        await workflow.create({
          resource: "quality-standards",
          id: `quality-standard:${createForm.productId}:${Date.now()}`,
          fields: {
            productId: createForm.productId,
            title: createForm.title.trim(),
            knowledgeBase: createForm.title.trim(),
            checklistItems: createForm.checklist.split("\n").map(value => value.trim()).filter(Boolean),
            effectiveFrom: new Date().toISOString().slice(0, 10)
          }
        });
      } else {
        await workflow.create({
          resource: "inspection-plans",
          id: `inspection-plan:${createForm.productId}:${Date.now()}`,
          fields: {
            productId: createForm.productId,
            title: createForm.title.trim(),
            inspectionType: "后续抽检",
            plannedAt: createForm.plannedAt || null
          }
        });
      }
      setCreateDialog("");
      setCreateForm({ productId: "", title: "", checklist: "", plannedAt: "" });
    } catch {
      // The page-level workflow notice presents the safe error and request ID.
    }
  }
  const columns = [
    { key: "product", header: "产品 / 批次", render: row => <span><strong>{productMap.get(row.productId)?.name || row.skuCode}</strong><small className="table-secondary">{row.batchNo || "批次待补充"}</small></span> },
    { key: "source", header: "来源", render: row => <span><strong>{row.sourceType || row.platform || "文件导入"}</strong><small className="table-secondary">{[row.platform, row.shopName].filter(Boolean).join(" · ") || "—"}</small></span> },
    { key: "supplier", header: "供应商 / 仓库", render: row => <span><strong>{supplierMap.get(row.supplierId)?.name || row.supplierName || "供应商待补充"}</strong><small className="table-secondary">{row.warehouse || "仓库待补充"}</small></span> },
    { key: "content", header: "差评与质量问题", render: row => <p>{row.content}</p> },
    { key: "category", header: "问题分类", render: row => row.category || "待判定" },
    { key: "action", header: "处置与整改", render: row => <span><strong>{row.disposition || "处置待补充"}</strong><small className="table-secondary">{row.correctiveAction || row.publicRelationsResult || "整改待补充"}</small></span> },
    { key: "verification", header: "验证 / 公关", render: row => <span><strong>{row.verificationResult || "待验证"}</strong><small className="table-secondary">{row.publicRelationsStatus || (row.status === "closed" ? "公关已处理" : "公关待处理")}</small></span> },
    { key: "status", header: "闭环状态", render: row => <span><span className={`status-badge ${row.status === "closed" ? "success" : "warning"}`}>{row.status === "closed" ? "已关闭" : "待处理"}</span><small className="table-secondary">{INCIDENT_STAGES.join(" → ")}</small></span> },
    { key: "actions", header: "操作", render: row => <TableActions>{canEdit && row.status !== "closed" ? <Button className="compact" disabled={!incidentAvailable || Boolean(workflow?.busy)} disabledReason="质量问题工作流暂不可用" onClick={() => openCloseDialog(row)}><CheckCircle2 size={15} />{row.workflowEntity ? INCIDENT_ACTIONS[row.workflowEntity.status]?.[1] || "查看闭环" : "纳入闭环"}</Button> : null}<AppCollaborationButton draft={collaborationDraftFromSupplyIssue(row, { productName: productMap.get(row.productId)?.name })} /></TableActions> }
  ];
  const standardColumns = [
    { key: "product", header: "产品", render: row => <span><strong>{row.name}</strong><small className="table-secondary">{row.category}</small></span> },
    { key: "knowledge", header: "知识库版", render: row => row.standard ? <span className="status-badge success">已绑定</span> : <span className="status-badge warning">标准缺失</span> },
    { key: "checklist", header: "质检清单版", render: row => row.checklist.length ? `${row.checklist.length} 项` : "待提炼检查项" },
    { key: "version", header: "版本", render: row => row.version ? `v${row.version}` : "待发布" },
    { key: "feedback", header: "市场反馈", render: () => <span><strong>待数据中心补齐</strong><small className="table-secondary">客服与全平台评价未形成共享事实</small></span> }
  ];
  const inspectionColumns = [
    { key: "product", header: "产品 / 批次", render: row => <span><strong>{productMap.get(row.productId)?.name || row.skuCode || "待关联产品"}</strong><small className="table-secondary">{row.batchNo || "批次待补"}</small></span> },
    { key: "type", header: "质检类型", render: row => row.inspectionType },
    { key: "line", header: "质检线", render: row => row.inspectionLine || (row.productionType === "self" ? "自产质检" : "外购质检") },
    { key: "date", header: "计划 / 执行时间", render: row => row.inspectionDate || "待安排" },
    { key: "owner", header: "质检员", render: row => row.inspectorName || "待指派" },
    { key: "status", header: "结果", render: row => {
      const labels = { passed: "已检合格", failed: "已检不合格", uninspected: "应检未检" };
      const tones = { passed: "success", failed: "danger", uninspected: "warning" };
      return <span className={`status-badge ${tones[row.inspectionStatus]}`}>{labels[row.inspectionStatus]}</span>;
    } }
  ];
  const rowsForActiveTab = activeTab === "standards" ? standardRows : activeTab === "inspections" ? inspectionRows : incidentRows;
  const visibleRows = rowsForActiveTab.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  function selectTab(key) {
    setActiveTab(key);
    setPage(1);
  }
  return (
    <div className="supply-work-grid">
      <div className="supply-workspace-tabs" role="tablist" aria-label="质量闭环工作区">
        {QUALITY_TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={activeTab === key} className={activeTab === key ? "is-active" : ""} onClick={() => selectTab(key)}>{label}</button>)}
      </div>
      {activeTab === "standards" ? <section className="section-panel">
        <div className="section-head">
          <div><h2>质量标准</h2><p>每个产品同时维护供开发参考的知识库版与供质检执行的精简清单版，版本保持一致。</p></div>
          <Button variant="primary" disabled={!standardAvailable} disabledReason="质量标准服务暂不可用" onClick={() => setCreateDialog("standard")}>新增质量标准</Button>
        </div>
        <DataTable minWidth={920} columns={standardColumns} rows={visibleRows} empty={<div className="empty-state compact-empty">还没有可绑定质量标准的产品。</div>} />
      </section> : null}
      {activeTab === "inspections" ? <section className="section-panel">
        <div className="section-head">
          <div><h2>质检执行</h2><p>首批检查与后续抽检沿用同一版本清单；外购和自产分线，明确“应检未检、已检合格、已检不合格”。</p></div>
          <Button variant="primary" disabled={!inspectionAvailable} disabledReason="质检计划服务暂不可用" onClick={() => setCreateDialog("inspection")}>创建抽检计划</Button>
        </div>
        <div className="supply-coverage-notice is-partial" role="status"><span><strong>先抽检后入库为默认规则</strong><small>先入库后抽检必须记录例外依据；没有质检记录时不伪造“已检”。</small></span></div>
        <DataTable minWidth={880} columns={inspectionColumns} rows={visibleRows} empty={<div className="empty-state compact-empty">尚无可验证的首批检查或后续抽检记录。</div>} />
      </section> : null}
      {activeTab === "incidents" ? <><section className="section-panel">
        <div className="section-head">
          <div>
            <h2>质量数据导入</h2>
            <p>兼容差评、到货抽检、月度抽检和仓库验收表，统一进入批次质量闭环。</p>
          </div>
          {canEdit ? (
            <label className={`upload-field ${parsing ? "is-busy" : ""}`}>
              <Upload size={16} />
              {parsing ? "正在解析…" : "导入质量 XLSX / CSV"}
              <input type="file" accept=".xlsx,.csv" disabled={parsing} onChange={event => { handleFile(event.target.files?.[0]); event.target.value = ""; }} />
            </label>
          ) : null}
        </div>
        {error ? <p className="supply-message error" role="alert">{error}</p> : null}
        {pending ? (
          <div className="supply-import-preview">
            <FileSpreadsheet size={20} />
            <div>
              <strong>{pending.fileName}</strong>
              <span>有效 {pending.validRows.length} 行 · 错误 {pending.errors.length} 行</span>
              {pending.errors.slice(0, 3).map(item => <small key={`${item.rowNumber}-${item.field}`}>第 {item.rowNumber} 行：{item.message}</small>)}
            </div>
            <div className="supply-import-actions">
              <Button onClick={() => setPending(null)}>取消</Button>
              <Button variant="primary" disabled={!pending.validRows.length} onClick={confirmImport}>确认导入</Button>
            </div>
          </div>
        ) : null}
      </section>
      <section className="section-panel">
        <div className="section-head">
          <div>
            <h2>质量问题闭环</h2>
            <p>按产品、批次、供应商和仓库追踪处置、整改、验证与公关结果；{aftersalesUnavailable ? "共享售后来源暂不可用。" : `当前共享售后 ${aftersales.length} 条。`}</p>
          </div>
        </div>
        {issuesUnavailable || aftersalesUnavailable ? (
          <div className="supply-coverage-notice is-partial" role="status">
            <span>
              <strong>质量与售后来源暂不可用</strong>
              <small>当前不能把空结果解释为零问题；工作流标准仍可维护，来源恢复后会自动补充事实。</small>
            </span>
          </div>
        ) : null}
        <DataTable minWidth={1280} columns={columns} rows={visibleRows} empty={<div className="empty-state compact-empty">{issuesUnavailable ? "质量问题来源暂不可用，暂无可信问题明细。" : "还没有导入质量问题。"}</div>} />
      </section></> : null}
      {rowsForActiveTab.length > PAGE_SIZE ? <TablePagination total={rowsForActiveTab.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}
      <Modal
        open={Boolean(closingIssue)}
        title={closingIssue?.workflowEntity ? INCIDENT_ACTIONS[closingIssue.workflowEntity.status]?.[1] || "质量问题闭环" : "纳入质量问题闭环"}
        onClose={cancelCloseDialog}
        footer={<>
          <Button onClick={cancelCloseDialog}>取消</Button>
          <Button variant="primary" disabled={!closeResult.trim() || Boolean(workflow?.busy)} disabledReason="请记录本步骤的依据和结论" onClick={confirmCloseIssue}>{workflow?.busy ? "保存中…" : "确认本步骤"}</Button>
        </>}
      >
        <label className="full-field">本步骤依据与结论（必填）<textarea rows="4" value={closeResult} onChange={event => setCloseResult(event.target.value)} placeholder="记录定性、处理、整改、验证或关闭依据。" /></label>
        {closeError ? <p className="form-error" role="alert">{closeError}</p> : null}
      </Modal>
      <Modal
        open={Boolean(createDialog)}
        title={createDialog === "standard" ? "新增质量标准" : "创建抽检计划"}
        onClose={() => setCreateDialog("")}
        footer={<><Button onClick={() => setCreateDialog("")}>取消</Button><Button variant="primary" disabled={!createForm.productId || !createForm.title.trim() || Boolean(workflow?.busy)} onClick={createQualityRecord}>{workflow?.busy ? "保存中…" : "保存"}</Button></>}
      >
        <div className="form-grid supply-form-grid">
          <label className="full">产品<select value={createForm.productId} onChange={event => setCreateForm(current => ({ ...current, productId: event.target.value }))}><option value="">请选择产品</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
          <label className="full">{createDialog === "standard" ? "标准名称" : "计划名称"}<input value={createForm.title} onChange={event => setCreateForm(current => ({ ...current, title: event.target.value }))} /></label>
          {createDialog === "standard" ? <label className="full">质检清单（每行一项）<textarea rows="6" value={createForm.checklist} onChange={event => setCreateForm(current => ({ ...current, checklist: event.target.value }))} /></label> : <label className="full">计划日期<input type="date" value={createForm.plannedAt} onChange={event => setCreateForm(current => ({ ...current, plannedAt: event.target.value }))} /></label>}
        </div>
      </Modal>
    </div>
  );
}

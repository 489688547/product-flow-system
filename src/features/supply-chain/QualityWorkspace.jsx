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

export function QualityWorkspace({ products, canEdit, workflowAvailable = false }) {
  const { state, dispatch } = useSupplyChain();
  const [activeTab, setActiveTab] = useState("standards");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const [closingIssue, setClosingIssue] = useState(null);
  const [closeResult, setCloseResult] = useState("");
  const [closeError, setCloseError] = useState("");
  const productMap = useMemo(() => new Map(products.map(item => [item.id, item])), [products]);
  const supplierMap = useMemo(() => new Map(state.suppliers.map(item => [item.id, item])), [state.suppliers]);
  const standardRows = useMemo(() => products.map(product => ({
    id: product.id,
    name: product.name || product.productName || "未命名产品",
    category: product.category || "未分类",
    standard: product.qualityStandard || product.qualityStandardFile || null,
    checklist: product.qualityChecklist || [],
    version: product.qualityStandardVersion || null
  })), [products]);
  const inspectionRows = useMemo(() => state.qualityIssues
    .filter(issue => issue.inspectionDate || /抽检|质检|验收/.test(String(issue.sourceType || "")))
    .map(issue => ({
      ...issue,
      inspectionType: issue.inspectionType || (issue.firstBatch ? "首批检查" : "后续抽检"),
      inspectionStatus: issue.inspectionStatus || (issue.status === "closed" ? "passed" : issue.disposition ? "failed" : "uninspected")
    })), [state.qualityIssues]);
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
  function confirmCloseIssue() {
    if (!closingIssue) return;
    const publicRelationsResult = closeResult.trim();
    if (!publicRelationsResult) {
      setCloseError("请记录公关处理结果和整改结论。");
      return;
    }
    dispatch({ type: "upsert", collection: "qualityIssues", record: { ...closingIssue, status: "closed", publicRelationsStatus: "已处理", publicRelationsResult, verificationResult: closingIssue.verificationResult || "关闭时已确认", closedAt: new Date().toISOString() } });
    cancelCloseDialog();
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
    { key: "actions", header: "操作", render: row => <TableActions>{canEdit && row.status !== "closed" ? <Button className="compact" disabled={!workflowAvailable} disabledReason="DEV-000006 交付前不允许跳过定性、整改和验证直接关闭" onClick={() => openCloseDialog(row)}><CheckCircle2 size={15} />关闭问题</Button> : null}<AppCollaborationButton draft={collaborationDraftFromSupplyIssue(row, { productName: productMap.get(row.productId)?.name })} /></TableActions> }
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
  const rowsForActiveTab = activeTab === "standards" ? standardRows : activeTab === "inspections" ? inspectionRows : state.qualityIssues;
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
          <Button variant="primary" disabled={!workflowAvailable} disabledReason="DEV-000006 交付后可新增和发布版本化标准">新增质量标准</Button>
        </div>
        <DataTable minWidth={920} columns={standardColumns} rows={visibleRows} empty={<div className="empty-state compact-empty">还没有可绑定质量标准的产品。</div>} />
      </section> : null}
      {activeTab === "inspections" ? <section className="section-panel">
        <div className="section-head">
          <div><h2>质检执行</h2><p>首批检查与后续抽检沿用同一版本清单；外购和自产分线，明确“应检未检、已检合格、已检不合格”。</p></div>
          <Button variant="primary" disabled={!workflowAvailable} disabledReason="DEV-000006 交付后可创建质检计划">创建抽检计划</Button>
        </div>
        <div className="supply-coverage-notice is-partial" role="status"><span><strong>先抽检后入库为默认规则</strong><small>先入库后抽检必须记录例外依据；计划与记录 API 未接通前不伪造“已检”。</small></span></div>
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
            <p>按产品、批次、供应商和仓库追踪处置、整改、验证与公关结果。</p>
          </div>
        </div>
        <DataTable minWidth={1280} columns={columns} rows={visibleRows} empty={<div className="empty-state compact-empty">还没有导入质量问题。</div>} />
      </section></> : null}
      {rowsForActiveTab.length > PAGE_SIZE ? <TablePagination total={rowsForActiveTab.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} /> : null}
      <Modal
        open={Boolean(closingIssue)}
        title="关闭质量问题"
        onClose={cancelCloseDialog}
        footer={<>
          <Button onClick={cancelCloseDialog}>取消</Button>
          <Button variant="primary" disabled={!closeResult.trim()} disabledReason="请记录公关处理结果和整改结论" onClick={confirmCloseIssue}>确认关闭</Button>
        </>}
      >
        <label className="full-field">公关处理结果与整改结论（必填）<textarea rows="4" value={closeResult} onChange={event => setCloseResult(event.target.value)} placeholder="记录公关处理结果、整改结论和验证情况。" /></label>
        {closeError ? <p className="form-error" role="alert">{closeError}</p> : null}
      </Modal>
    </div>
  );
}

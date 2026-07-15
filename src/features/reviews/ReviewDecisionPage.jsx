import { CheckCircle2, Clock3, FilePenLine } from "lucide-react";
import { useMemo, useState } from "react";
import { reviewRowsForProduct, stripHtml } from "../../domain/productFlow.js";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button } from "../../ui/Button.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { ProductPicker } from "../../ui/ProductPicker.jsx";
import { RichTextEditor } from "../../ui/RichTextEditor.jsx";

function reviewStatus(product, review) {
  if (review.stage > product.stage) return "未到阶段";
  return stripHtml(review.minutes) ? "已通过" : "待补纪要";
}

export function ReviewDecisionPage() {
  const { state, setCurrentProduct, updateReviewMinutes } = useProductFlow();
  const [selectedProductId, setSelectedProductId] = useState(state.currentId || state.products[0]?.id);
  const selectedProduct = state.products.find(product => product.id === selectedProductId) || state.products[0];
  const [editing, setEditing] = useState(null);
  const [minutes, setMinutes] = useState("");
  const rows = useMemo(() => reviewRowsForProduct(state, selectedProduct), [state, selectedProduct]);

  const columns = [
    { key: "title", header: "会议", render: review => <strong>{review.title}</strong> },
    { key: "stage", header: "阶段", render: review => `第 ${review.stage + 1} 阶段` },
    { key: "file", header: "纪要 / 决策文件", render: review => stripHtml(review.minutes) || "暂无纪要" },
    { key: "owner", header: "负责人", render: review => review.owner },
    { key: "status", header: "会议状态", render: review => {
      const status = reviewStatus(selectedProduct, review);
      return <span className={`badge ${status === "已通过" ? "success" : status === "未到阶段" ? "" : "warning"}`}>{status === "已通过" ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}{status}</span>;
    } },
    { key: "actions", header: "操作", render: review => (
      <TableActions>
        <Button
          data-testid="review-minutes"
          disabled={review.stage > selectedProduct.stage}
          title={review.stage > selectedProduct.stage ? "尚未到该阶段，暂不能补充纪要" : undefined}
          onClick={() => { setEditing(review); setMinutes(review.minutes || ""); }}
        >
          <FilePenLine size={16} />{stripHtml(review.minutes) ? "编辑纪要" : "补纪要"}
        </Button>
      </TableActions>
    ) }
  ];

  return (
    <section className="page">
      <PageHeader title="评审决策" description="会议任务完成且纪要内容非空，才算评审通过。" identity={<ProductPicker products={state.products} value={selectedProduct?.id} onChange={productId => { setSelectedProductId(productId); setCurrentProduct(productId); }} />} />
      <DataTable minWidth={760} columns={columns} rows={rows} empty={<div className="empty-state">暂无评审会议</div>} />
      <Modal
        open={Boolean(editing)}
        title="编辑会议纪要"
        onClose={() => setEditing(null)}
        footer={<><Button onClick={() => setEditing(null)}>取消</Button><Button variant="primary" onClick={() => { updateReviewMinutes(editing.id, minutes); setEditing(null); }}>保存纪要</Button></>}
      >
        <label className="full-field">会议纪要<RichTextEditor value={minutes} onChange={setMinutes} placeholder="记录会议结论、争议点、行动项和负责人…" /></label>
      </Modal>
    </section>
  );
}

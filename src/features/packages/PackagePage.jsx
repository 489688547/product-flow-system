import { Download, ExternalLink, File, FileImage, FileText, FileWarning, Link2, Pencil, Trash2, UploadCloud, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { canDownloadDeliverable, deliverableExtension, deliverableKind, isBrokenDeliverable } from "../../domain/deliverables.js";
import { stripHtml } from "../../domain/productFlow.js";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button, IconAction } from "../../ui/Button.jsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.jsx";
import { DeliverablePreviewModal } from "../../ui/DeliverablePreviewModal.jsx";
import { Modal } from "../../ui/Modal.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { ProductPicker } from "../../ui/ProductPicker.jsx";
import { RichTextEditor } from "../../ui/RichTextEditor.jsx";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`${file.name} 读取失败`));
    reader.readAsDataURL(file);
  });
}

function FileThumbnail({ file }) {
  const kind = deliverableKind(file);
  const broken = isBrokenDeliverable(file);
  if (broken) return <div className="file-type-preview broken"><FileWarning size={32} /><span>文件损坏</span></div>;
  if (kind === "image") return <img src={file.url} alt="" width="240" height="180" loading="lazy" />;
  if (kind === "video") return <div className="file-type-preview"><Video size={32} /><span>{deliverableExtension(file)}</span></div>;
  if (kind === "richtext") return <div className="rich-file-preview"><FileText size={28} /><p>{stripHtml(file.content).slice(0, 80) || "富文本文档"}</p></div>;
  if (kind === "link") return <div className="file-type-preview"><Link2 size={32} /><span>钉钉文档</span></div>;
  if (kind === "pdf") return <div className="file-type-preview"><FileText size={32} /><span>PDF</span></div>;
  return <div className="file-type-preview"><File size={32} /><span>{deliverableExtension(file)}</span></div>;
}

function DeliverableEditModal({ file, onClose, onSave }) {
  const [form, setForm] = useState(file || {});
  useEffect(() => setForm(file || {}), [file]);
  const kind = deliverableKind(file);
  return (
    <Modal
      open={Boolean(file)}
      title="编辑文件"
      onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={!String(form.name || "").trim()} disabledReason="请填写文件名称" onClick={() => onSave(form)}>保存</Button></>}
    >
      <div className="deliverable-form">
        <label>文件名称<input value={form.name || ""} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
        {kind === "link" ? <label>钉钉文档链接<input value={form.url || ""} onChange={event => setForm(current => ({ ...current, url: event.target.value }))} /></label> : null}
        {kind === "richtext" ? <label>文档内容<RichTextEditor value={form.content || ""} onChange={content => setForm(current => ({ ...current, content }))} /></label> : null}
      </div>
    </Modal>
  );
}

export function PackageFileManager({ product }) {
  const { state, addDeliverable, updateDeliverable, deleteDeliverable } = useProductFlow();
  const [error, setError] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [editingFile, setEditingFile] = useState(null);
  const [fileToDelete, setFileToDelete] = useState(null);
  const inputRef = useRef(null);
  const files = (state.deliverables || []).filter(file => file.productId === product?.id);

  async function addFiles(fileList) {
    setError("");
    try {
      for (const file of Array.from(fileList || [])) {
        if (!file.size) throw new Error(`${file.name} 是空文件，已拒绝导入。`);
        const url = await readFileAsDataUrl(file);
        addDeliverable({ productId: product.id, name: file.name, type: file.type || "file", url });
      }
    } catch (eventError) {
      setError(eventError.message || "文件导入失败。");
    }
  }

  const confirmDeleteFile = file => {
    setFileToDelete(file);
  };

  return (
    <>
      <button
        data-testid="package-dropzone"
        className="dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={event => event.preventDefault()}
        onDrop={event => { event.preventDefault(); addFiles(event.dataTransfer.files); }}
      >
        <UploadCloud size={24} />
        <strong>拖入文件到资料包</strong>
        <span>支持图片、PPT、PDF、Word、视频等文件；导入失败会立即提示。</span>
      </button>
      <input ref={inputRef} className="hidden" type="file" multiple onChange={event => { addFiles(event.target.files); event.target.value = ""; }} />
      {error ? <p className="form-error">{error}</p> : null}
      <div className="file-grid">
        {files.map(file => {
          const broken = isBrokenDeliverable(file);
          const canDownload = canDownloadDeliverable(file);
          return (
            <article className={`file-card${broken ? " broken" : ""}`} key={file.id}>
              <button type="button" className="file-card-main" aria-label={`打开 ${file.name}`} onClick={() => setPreviewFile(file)}>
                <div className="file-preview"><FileThumbnail file={file} /></div>
                <strong title={file.name}>{file.name}</strong>
              </button>
              <IconAction label="删除" className="file-card-delete danger" onClick={event => { event.stopPropagation(); confirmDeleteFile(file); }}><Trash2 size={15} /></IconAction>
              <div className="file-card-overlay" aria-label="文件操作">
                <IconAction label="编辑" onClick={() => setEditingFile(file)}><Pencil size={17} /></IconAction>
                {broken ? <IconAction label="下载" disabled disabledReason="文件为空或损坏，不能下载"><Download size={17} /></IconAction> : canDownload ? <a className="icon-action" href={file.url} download={file.name} aria-label="下载" title="下载"><Download size={17} /></a> : <a className="icon-action" href={file.url} target="_blank" rel="noreferrer" aria-label="新窗口打开" title="新窗口打开"><ExternalLink size={17} /></a>}
              </div>
            </article>
          );
        })}
      </div>
      {!files.length ? <div className="empty-state empty-panel"><FileImage size={24} aria-hidden="true" /><strong>这个产品还没有文件</strong><span>拖入文件后会显示在这里。</span></div> : null}
      <DeliverablePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      <DeliverableEditModal file={editingFile} onClose={() => setEditingFile(null)} onSave={patch => { updateDeliverable(editingFile.id, { name: patch.name.trim(), url: patch.url, content: patch.content }); setEditingFile(null); }} />
      <ConfirmDialog
        open={Boolean(fileToDelete)}
        title="删除文件"
        message={fileToDelete ? `确定删除“${fileToDelete.name}”？` : ""}
        description="删除后不可恢复。"
        onClose={() => setFileToDelete(null)}
        onConfirm={() => {
          deleteDeliverable(fileToDelete.id);
          setFileToDelete(null);
        }}
      />
    </>
  );
}

export function PackagePage() {
  const { state, currentUser, setCurrentProduct } = useProductFlow();
  const [selectedProductId, setSelectedProductId] = useState(state.currentId || state.products[0]?.id);
  const selectedProduct = state.products.find(product => product.id === selectedProductId) || state.products[0];

  return (
    <section className="page">
      <PageHeader title="资料包" description="管理当前产品自然产生的文档、图片、视频和会议纪要。" identity={<ProductPicker products={state.products} value={selectedProduct?.id} currentUser={currentUser} onChange={productId => { setSelectedProductId(productId); setCurrentProduct(productId); }} />} />
      <PackageFileManager product={selectedProduct} />
    </section>
  );
}

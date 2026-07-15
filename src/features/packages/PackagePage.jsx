import { File, FileImage, FileText, FolderOpen, Link2, Trash2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { stripHtml } from "../../domain/productFlow.js";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button, IconAction } from "../../ui/Button.jsx";
import { DeliverablePreviewModal } from "../../ui/DeliverablePreviewModal.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { ProductPicker } from "../../ui/ProductPicker.jsx";

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`${file.name} 读取失败`));
    reader.readAsDataURL(file);
  });
}

function fileIcon(file) {
  if (file.type === "dingtalk-doc") return <Link2 size={28} />;
  if (file.type === "richtext") return <FileText size={28} />;
  return (file.type || "").startsWith("image") ? <FileImage size={28} /> : <File size={28} />;
}

export function PackageFileManager({ product }) {
  const { state, addDeliverable, deleteDeliverable } = useProductFlow();
  const [error, setError] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
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
    if (window.confirm("确认删除这个文件？删除后不可恢复。")) deleteDeliverable(file.id);
  };
  const openFile = file => {
    if (file.type === "richtext") {
      setPreviewFile(file);
      return;
    }
    if (file.url) window.open(file.url, "_blank", "noopener,noreferrer");
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
        <span>支持图片、PPT、PDF、Word、视频等文件；有问题会直接报错。</span>
      </button>
      <input ref={inputRef} className="hidden" type="file" multiple onChange={event => addFiles(event.target.files)} />
      {error ? <p className="form-error">{error}</p> : null}
      <div className="file-grid">
        {files.map(file => (
          <article className="file-card" key={file.id}>
            <div className="file-preview">
              {file.type?.startsWith("image") ? <img src={file.url} alt={file.name} width="240" height="180" loading="lazy" /> : file.type === "richtext" ? <div className="rich-file-preview">{fileIcon(file)}<p>{stripHtml(file.content).slice(0, 80) || "富文本文档"}</p></div> : fileIcon(file)}
            </div>
            <strong>{file.name}</strong>
            <span>{file.created || "今天"}</span>
            <div className="card-actions">
              <Button onClick={() => openFile(file)}><FolderOpen size={16} />打开</Button>
              <IconAction label="删除" className="danger" onClick={() => confirmDeleteFile(file)}><Trash2 size={16} /></IconAction>
            </div>
          </article>
        ))}
      </div>
      {!files.length ? <div className="empty-state empty-panel"><FolderOpen size={24} aria-hidden="true" /><strong>这个产品还没有文件</strong><span>拖入文件后会显示在这里。</span></div> : null}
      <DeliverablePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </>
  );
}

export function PackagePage() {
  const { state, setCurrentProduct } = useProductFlow();
  const [selectedProductId, setSelectedProductId] = useState(state.currentId || state.products[0]?.id);
  const selectedProduct = state.products.find(product => product.id === selectedProductId) || state.products[0];

  return (
    <section className="page">
      <PageHeader
        title="资料包"
        description="管理当前产品自然产生的文档、图片、视频和会议纪要。"
        identity={<ProductPicker products={state.products} value={selectedProduct?.id} onChange={productId => { setSelectedProductId(productId); setCurrentProduct(productId); }} />}
      />
      <PackageFileManager product={selectedProduct} />
    </section>
  );
}

import { PackageFileManager } from "../packages/PackagePage.jsx";
import { Modal } from "../../ui/Modal.jsx";

export function ProductPackageModal({ open, product, onClose }) {
  if (!product) return null;
  return (
    <Modal open={open} title={`${product.name} · 资料包`} onClose={onClose} size="large">
      <PackageFileManager product={product} />
    </Modal>
  );
}

import { Modal } from "../../ui/Modal.jsx";
import { Button } from "../../ui/Button.jsx";

export function SupplyChainRecordModal({ title = "来源记录", record, onClose }) {
  return <Modal title={title} open={Boolean(record)} onClose={onClose} footer={<Button onClick={onClose}>关闭</Button>}><pre className="supply-record-json">{record ? JSON.stringify(record, null, 2) : ""}</pre></Modal>;
}

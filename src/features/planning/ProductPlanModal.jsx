import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "../../ui/Modal.jsx";
import { Button } from "../../ui/Button.jsx";
import { DatePickerField } from "../../ui/DatePickerField.jsx";
import { validateProductPlan } from "../../domain/productPlanning.js";

const EMPTY = { developmentStart: "", launchDate: "" };

export function ProductPlanModal({ open, demand, plan, initialDates, canEdit, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, ...(plan || {}), ...(initialDates || {}) });
    setError("");
  }, [initialDates, open, plan]);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const save = () => {
    const validation = validateProductPlan(form);
    if (!validation.valid) return setError(validation.reason);
    onSave(form);
  };
  const remove = () => {
    if (!plan || !window.confirm("确认删除这条产品规划？删除后不可恢复。")) return;
    onDelete(plan.id);
  };
  return (
    <Modal
      open={open}
      title={plan ? "编辑产品规划" : "安排产品规划"}
      onClose={onClose}
      footer={<>
        {plan ? <Button className="quiet-danger" disabled={!canEdit} disabledReason="你没有编辑产品规划的权限" onClick={remove}><Trash2 size={15} aria-hidden="true" />删除</Button> : null}
        <span className="modal-footer-spacer" />
        <Button onClick={onClose}>取消</Button>
        <Button variant="primary" disabled={!canEdit} disabledReason="只有产品部和总经办可以编辑产品规划" onClick={save}>保存</Button>
      </>}
    >
      <div className="planning-modal-product">
        <img src={demand?.image || plan?.demandSnapshot?.image || ""} alt="" width="48" height="48" />
        <div><strong>{demand?.name || plan?.demandSnapshot?.name || "未命名产品"}</strong><p>设置从开发开始到预计上线的完整周期，可跨月安排。</p></div>
      </div>
      <div className="planning-date-grid">
        <fieldset>
          <legend>开发至上线</legend>
          <label>开发开始<DatePickerField value={form.developmentStart} onChange={developmentStart => set({ developmentStart })} disabled={!canEdit} /></label>
          <label>预计上线<DatePickerField value={form.launchDate} onChange={launchDate => set({ launchDate })} disabled={!canEdit} /></label>
        </fieldset>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </Modal>
  );
}

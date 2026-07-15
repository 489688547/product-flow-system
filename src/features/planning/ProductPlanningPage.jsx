import { CalendarRange, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { canEditProductPlanning } from "../../domain/permissions.js";
import { generateProductCover, visibleDemandPool } from "../../domain/productFlow.js";
import { Button } from "../../ui/Button.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { DemandModal } from "../demands/DemandModal.jsx";
import { PlanningDemandTray } from "./PlanningDemandTray.jsx";
import { AnnualPlanningTimeline } from "./AnnualPlanningTimeline.jsx";
import { ProductPlanModal } from "./ProductPlanModal.jsx";

function monthDefaults(year, monthIndex) {
  const month = String(monthIndex + 1).padStart(2, "0");
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const middle = Math.min(15, lastDay);
  return {
    developmentStart: `${year}-${month}-01`,
    developmentEnd: `${year}-${month}-${String(middle).padStart(2, "0")}`,
    launchStart: `${year}-${month}-${String(Math.min(middle + 1, lastDay)).padStart(2, "0")}`,
    launchEnd: `${year}-${month}-${String(lastDay).padStart(2, "0")}`
  };
}

export function ProductPlanningPage() {
  const { state, currentUser, orgCache, addDemand, addProductPlan, updateProductPlan, deleteProductPlan } = useProductFlow();
  const [year, setYear] = useState(new Date().getFullYear());
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [planModal, setPlanModal] = useState(null);
  const canEdit = canEditProductPlanning(currentUser);
  const demands = useMemo(() => visibleDemandPool(state.demands), [state.demands]);

  const openNewPlan = (demand, monthIndex = new Date().getMonth()) => {
    if (!canEdit) return;
    setPlanModal({ demand, plan: null, initialDates: monthDefaults(year, monthIndex) });
  };
  const openDroppedDemand = (demandId, monthIndex) => {
    const demand = demands.find(item => item.id === demandId);
    if (demand) openNewPlan(demand, monthIndex);
  };
  const openExistingPlan = plan => {
    const demand = demands.find(item => item.id === plan.demandId) || null;
    setPlanModal({ demand, plan, initialDates: null });
  };
  const savePlan = form => {
    if (planModal.plan) updateProductPlan(planModal.plan.id, form);
    else addProductPlan({ ...form, demandId: planModal.demand.id, demandSnapshot: { name: planModal.demand.name, image: planModal.demand.image || generateProductCover(planModal.demand.name) } });
    setPlanModal(null);
  };
  const saveDemand = form => {
    addDemand({ ...form, image: form.image || generateProductCover(form.name), status: "待讨论" });
    setDemandModalOpen(false);
  };

  return (
    <section className="page planning-page">
      <PageHeader title="产品规划" description="把需求池产品拆进年度节奏，统一查看预计开发和上线窗口。">
        <div className="planning-year-picker" aria-label="规划年份">
          <button type="button" onClick={() => setYear(value => value - 1)} aria-label="上一年"><ChevronLeft size={16} /></button>
          <strong><CalendarRange size={16} aria-hidden="true" />{year} 年</strong>
          <button type="button" onClick={() => setYear(value => value + 1)} aria-label="下一年"><ChevronRight size={16} /></button>
        </div>
        <Button variant="primary" disabled={!canEdit} disabledReason="只有产品部和总经办可以添加需求机会" onClick={() => setDemandModalOpen(true)}><Plus size={16} aria-hidden="true" />添加需求机会</Button>
      </PageHeader>
      <PlanningDemandTray demands={demands} canEdit={canEdit} onArrange={openNewPlan} />
      <AnnualPlanningTimeline year={year} plans={state.productPlans || []} demands={demands} canEdit={canEdit} onDropDemand={openDroppedDemand} onEditPlan={openExistingPlan} />
      <DemandModal open={demandModalOpen} currentUser={currentUser} orgCache={orgCache} onClose={() => setDemandModalOpen(false)} onSave={saveDemand} />
      <ProductPlanModal
        open={Boolean(planModal)}
        demand={planModal?.demand}
        plan={planModal?.plan}
        initialDates={planModal?.initialDates}
        canEdit={canEdit}
        onClose={() => setPlanModal(null)}
        onSave={savePlan}
        onDelete={id => { deleteProductPlan(id); setPlanModal(null); }}
      />
    </section>
  );
}

import { CalendarRange, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { canEditProductPlanning } from "../../domain/permissions.js";
import { buildPlanningCandidates } from "../../domain/productPlanning.js";
import { normalizeExpectedLaunchMonth } from "../../domain/expectedLaunch.js";
import { generateProductCover } from "../../domain/productFlow.js";
import { Button } from "../../ui/Button.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { DemandModal } from "../demands/DemandModal.jsx";
import { PlanningDemandTray } from "./PlanningDemandTray.jsx";
import { AnnualPlanningTimeline } from "./AnnualPlanningTimeline.jsx";
import { ProductPlanModal } from "./ProductPlanModal.jsx";

function monthDefaults(year, monthIndex) {
  const month = String(monthIndex + 1).padStart(2, "0");
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return {
    developmentStart: `${year}-${month}-01`,
    launchDate: `${year}-${month}-${String(lastDay).padStart(2, "0")}`
  };
}

function enrichPlanningDemand(demand, products) {
  const product = products.find(item => item.id === demand.productId);
  const levelConfirmed = Boolean(product?.levelConfirmed);
  return {
    ...demand,
    planningLevel: levelConfirmed ? product.level : "未定级",
    planningLevelConfirmed: levelConfirmed,
    planningLevelIsReference: false,
    expectedLaunchMonth: normalizeExpectedLaunchMonth(product?.expectedLaunchMonth || demand.expectedLaunchMonth)
  };
}

export function ProductPlanningPage() {
  const { state, currentUser, orgCache, addDemand, addProductPlan, updateProductPlan, deleteProductPlan } = useProductFlow();
  const [year, setYear] = useState(new Date().getFullYear());
  const [demandModalOpen, setDemandModalOpen] = useState(false);
  const [planModal, setPlanModal] = useState(null);
  const canEdit = canEditProductPlanning(currentUser);
  const allDemands = useMemo(
    () => (state.demands || []).map(demand => enrichPlanningDemand(demand, state.products || [])),
    [state.demands, state.products]
  );
  const candidates = useMemo(
    () => buildPlanningCandidates(state.demands || [], state.products || []),
    [state.demands, state.products]
  );
  const planningRecords = useMemo(() => {
    const records = new Map(allDemands.map(demand => [demand.id, demand]));
    candidates.forEach(candidate => records.set(candidate.id, candidate));
    return [...records.values()];
  }, [allDemands, candidates]);

  const openNewPlan = (demand, monthIndex = new Date().getMonth(), replaceDates = false) => {
    if (!canEdit) return;
    const existingPlan = (state.productPlans || []).find(plan => (
      plan.demandId === demand.id || (demand.productId && plan.demandSnapshot?.productId === demand.productId)
    )) || null;
    setPlanModal({
      demand,
      plan: existingPlan,
      initialDates: !existingPlan || replaceDates ? monthDefaults(year, monthIndex) : null
    });
  };
  const openDroppedDemand = (demandId, monthIndex) => {
    const demand = candidates.find(item => item.id === demandId);
    if (demand) openNewPlan(demand, monthIndex, true);
  };
  const openExistingPlan = plan => {
    const demand = planningRecords.find(item => item.id === plan.demandId || (plan.demandSnapshot?.productId && item.productId === plan.demandSnapshot.productId)) || null;
    setPlanModal({ demand, plan, initialDates: null });
  };
  const savePlan = form => {
    const demandSnapshot = {
      name: planModal.demand?.name || planModal.plan?.demandSnapshot?.name,
      image: planModal.demand?.image || planModal.plan?.demandSnapshot?.image || generateProductCover(planModal.demand?.name),
      level: planModal.demand?.planningLevelConfirmed ? planModal.demand.planningLevel : (planModal.plan?.demandSnapshot?.levelConfirmed ? planModal.plan.demandSnapshot.level : ""),
      levelConfirmed: Boolean(planModal.demand?.planningLevelConfirmed ?? planModal.plan?.demandSnapshot?.levelConfirmed),
      levelIsReference: false,
      expectedLaunchMonth: normalizeExpectedLaunchMonth(planModal.demand?.expectedLaunchMonth || planModal.plan?.demandSnapshot?.expectedLaunchMonth),
      productId: planModal.demand?.productId || planModal.plan?.demandSnapshot?.productId
    };
    if (planModal.plan) updateProductPlan(planModal.plan.id, { ...form, demandSnapshot });
    else addProductPlan({ ...form, demandId: planModal.demand.id, demandSnapshot });
    setPlanModal(null);
  };
  const saveDemand = form => {
    addDemand({ ...form, image: form.image || generateProductCover(form.name), status: "待讨论" });
    setDemandModalOpen(false);
  };

  return (
    <section className="page planning-page">
      <PageHeader title="产品规划" description="把待规划产品拆进年度节奏，统一查看预计开发和上线窗口。">
        <div className="planning-year-picker" aria-label="规划年份">
          <button type="button" onClick={() => setYear(value => value - 1)} aria-label="上一年"><ChevronLeft size={16} /></button>
          <strong><CalendarRange size={16} aria-hidden="true" />{year} 年</strong>
          <button type="button" onClick={() => setYear(value => value + 1)} aria-label="下一年"><ChevronRight size={16} /></button>
        </div>
        <Button variant="primary" disabled={!canEdit} disabledReason="只有产品部和总经办可以添加需求机会" onClick={() => setDemandModalOpen(true)}><Plus size={16} aria-hidden="true" />添加需求机会</Button>
      </PageHeader>
      <PlanningDemandTray demands={candidates} canEdit={canEdit} onArrange={openNewPlan} />
      <AnnualPlanningTimeline year={year} plans={state.productPlans || []} demands={planningRecords} canEdit={canEdit} onDropDemand={openDroppedDemand} onEditPlan={openExistingPlan} />
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

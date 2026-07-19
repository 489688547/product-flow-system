const COMMITMENT_TRANSITIONS = {
  draft: { submit: "office_review", cancel: "cancelled" },
  returned: { submit: "office_review", cancel: "cancelled" },
  office_review: { office_approve: "executive_review", return: "returned", cancel: "cancelled" },
  executive_review: { executive_confirm: "active", return: "returned", cancel: "cancelled" },
  active: { mark_at_risk: "at_risk", mark_off_track: "off_track", complete: "completed", cancel: "cancelled" },
  at_risk: { resume: "active", mark_off_track: "off_track", complete: "completed", cancel: "cancelled" },
  off_track: { resume: "active", mark_at_risk: "at_risk", complete: "completed", cancel: "cancelled" },
  completed: {},
  cancelled: {}
};

const REPORT_TRANSITIONS = {
  draft: { submit: "submitted" },
  returned: { submit: "submitted" },
  submitted: { approve: "approved", return: "returned" },
  approved: { freeze: "frozen", return: "returned" },
  frozen: {}
};

function timestamp(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function cleanMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function strategyAttainment(state, strategyId) {
  const results = (state?.requiredResults || []).filter(item => item.strategyId === strategyId && !item.archived);
  const completed = results.filter(item => item.status === "verified").length;
  return {
    attained: results.length >= 2 && results.length <= 6 && completed === results.length,
    completed,
    total: results.length,
    results
  };
}

export function commitmentProgress(state, commitmentId) {
  const milestones = (state?.commitmentMilestones || []).filter(item => item.commitmentId === commitmentId && !item.archived);
  const completed = milestones.filter(item => item.status === "completed").length;
  const total = milestones.length;
  return {
    completed,
    total,
    percent: total ? Math.round((completed / total) * 100) : 0,
    label: total ? `${completed}/${total}` : "未设置里程碑",
    milestones
  };
}

export function transitionDepartmentCommitment(commitment, action = {}) {
  const current = commitment?.status || "draft";
  const nextStatus = COMMITMENT_TRANSITIONS[current]?.[action.type];
  if (!nextStatus) throw new Error(`当前状态“${current}”不能执行该操作。`);
  if (action.type === "return" && !String(action.reason || "").trim()) throw new Error("退回时必须填写原因。");
  return {
    ...commitment,
    status: nextStatus,
    statusReason: String(action.reason || "").trim(),
    statusActor: action.actor || "",
    statusChangedAt: timestamp(action.timestamp),
    updatedAt: timestamp(action.timestamp)
  };
}

export function incentiveBudgetCheck(state, project = {}) {
  const department = String(project.department || "");
  const year = Number(project.year || new Date().getFullYear());
  const budget = (state?.departmentRewardBudgets || []).find(item => item.department === department && Number(item.year) === year);
  const committed = (state?.incentiveProjects || [])
    .filter(item => item.id !== project.id && item.department === department && Number(item.year || year) === year && !["cancelled"].includes(item.status))
    .reduce((sum, item) => sum + cleanMoney(item.rewardCap), 0);
  const requested = cleanMoney(project.rewardCap);
  const remaining = Math.max(0, cleanMoney(budget?.amount) - committed);
  const crossDepartment = (project.partnerDepartments || []).some(item => item && item !== department);
  return {
    budget: cleanMoney(budget?.amount),
    committed,
    requested,
    remaining,
    crossDepartment,
    requiresApproval: crossDepartment || requested > remaining
  };
}

export function settleIncentiveProject(project, award = {}) {
  const amount = Number(award.amount);
  const reason = String(award.reason || "").trim();
  if (!reason) throw new Error("请填写奖金决定理由。");
  if (!Number.isFinite(amount) || amount < 0 || amount > cleanMoney(project?.rewardCap)) {
    throw new Error("最终奖金不能超过项目奖金上限。");
  }
  return {
    ...project,
    status: "closed",
    finalReward: amount,
    rewardReason: reason,
    rewardDecidedBy: award.decidedBy || "",
    rewardDecidedAt: timestamp(award.decidedAt),
    payoutStatus: amount > 0 ? "pending" : "not_applicable",
    updatedAt: timestamp(award.decidedAt)
  };
}

export function transitionMonthlyReport(report, action = {}) {
  const current = report?.status || "draft";
  if (current === "frozen") {
    if (action.type !== "append_correction") throw new Error("月报已冻结，不能修改原文。");
    const text = String(action.text || "").trim();
    if (!text) throw new Error("请填写更正说明。");
    const correctedAt = timestamp(action.timestamp);
    return {
      ...report,
      corrections: [...(report.corrections || []), { id: `correction-${correctedAt}-${(report.corrections || []).length + 1}`, text, actor: action.actor || "", createdAt: correctedAt }],
      updatedAt: correctedAt
    };
  }
  if (action.type === "edit") return { ...report, ...(action.patch || {}), updatedAt: timestamp(action.timestamp) };
  const nextStatus = REPORT_TRANSITIONS[current]?.[action.type];
  if (!nextStatus) throw new Error(`当前状态“${current}”不能执行该操作。`);
  if (action.type === "return" && !String(action.reason || "").trim()) throw new Error("退回月报时必须填写原因。");
  if (action.type === "freeze" && !String(action.meetingConclusion || "").trim()) throw new Error("冻结月报前请填写会议结论。");
  const changedAt = timestamp(action.timestamp);
  return {
    ...report,
    status: nextStatus,
    returnReason: action.type === "return" ? String(action.reason).trim() : "",
    meetingConclusion: action.type === "freeze" ? String(action.meetingConclusion).trim() : report.meetingConclusion,
    frozenAt: action.type === "freeze" ? changedAt : report.frozenAt,
    statusActor: action.actor || "",
    statusChangedAt: changedAt,
    updatedAt: changedAt
  };
}

export function ensureMonthlyReports(state, month, departments = []) {
  const existing = (state?.monthlyReports || []).map(item => ({ ...item }));
  const uniqueDepartments = [...new Set(departments.map(item => String(item || "").trim()).filter(Boolean))];
  uniqueDepartments.forEach(department => {
    if (existing.some(item => item.month === month && item.department === department)) return;
    existing.push({
      id: `report-${month}-${department}`,
      month,
      department,
      owner: "",
      ownerUnionId: "",
      status: "draft",
      keyResults: "",
      incompleteItems: "",
      nextMonthPriorities: "",
      risks: "",
      coordinationNeeds: "",
      decisionNeeds: "",
      linkedStrategyIds: [],
      linkedCommitmentIds: [],
      linkedIncentiveProjectIds: [],
      corrections: [],
      createdAt: timestamp(),
      updatedAt: timestamp()
    });
  });
  return existing;
}

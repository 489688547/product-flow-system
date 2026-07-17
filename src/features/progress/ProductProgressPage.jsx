import { CalendarCheck2, CalendarPlus, Flag, GripVertical, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  deliverablesForTask,
  hasFormalProductGrading,
  productStagePolicy,
  orgUsers,
  STAGES,
  taskCategoryActions,
  tasksForProductStage
} from "../../domain/productFlow.js";
import { useProductFlow } from "../../state/ProductFlowProvider.jsx";
import { Button, IconAction } from "../../ui/Button.jsx";
import { ConfirmDialog } from "../../ui/ConfirmDialog.jsx";
import { DataTable, TableActions } from "../../ui/DataTable.jsx";
import { DatePickerField } from "../../ui/DatePickerField.jsx";
import { DeliverablePreviewModal } from "../../ui/DeliverablePreviewModal.jsx";
import { OrgSelect } from "../../ui/OrgSelect.jsx";
import { PageHeader } from "../../ui/PageHeader.jsx";
import { ProductPicker } from "../../ui/ProductPicker.jsx";
import { buildTaskMeetingPayload, buildTaskTodoPayload } from "../../domain/dingTalk.js";
import { buildProductScheduleSummary } from "../../domain/dashboardSummary.js";
import { formatExpectedLaunchMonth } from "../../domain/expectedLaunch.js";
import { buildProductGmvProgress, normalizeMonthlyGmvTarget } from "../../domain/productGmv.js";
import { preferredProgressProductId, productManagerAssignment } from "../../domain/productOwnership.js";
import { buildTaskTodoSnapshot, normalizeTaskDueDate, todoSyncStatus } from "../../domain/taskTodo.js";
import { MeetingScheduleModal } from "./MeetingScheduleModal.jsx";
import { ProductGradingModal } from "./ProductGradingModal.jsx";
import { ProductScheduleSummary } from "./ProductScheduleSummary.jsx";
import { ProductGmvSummary } from "../sales/ProductGmvSummary.jsx";
import { useProductSalesRows } from "../sales/useProductSalesRows.js";
import { TaskCategorySelect } from "./TaskCategorySelect.jsx";
import { TaskDeliverableModal } from "./TaskDeliverableModal.jsx";
import { TaskDeliverables } from "./TaskDeliverables.jsx";
import { TaskTemplateModal } from "./TaskTemplateModal.jsx";
import { TodoSyncModal } from "./TodoSyncModal.jsx";

function stagePolicyTone(mode) {
  if (mode === "不涉及" || mode === "跳过") return "skipped";
  if (mode === "必走" || mode === "核心测试" || mode === "关键节点") return "required";
  if (mode.includes("复盘") || mode.includes("月") || mode.includes("天")) return "review";
  return "suggested";
}

function stagePolicyLabel(mode) {
  return mode === "必走" ? "必需" : mode;
}

function productLevelTone(level) {
  const prefix = String(level || "").trim().slice(0, 2).toLowerCase();
  return ["p0", "p1", "p2", "p3"].includes(prefix) ? prefix : "pending";
}

const progressStages = STAGES.filter(stage => stage.index > 0);

function validProgressStage(stage) {
  return Math.min(STAGES.length - 1, Math.max(1, Number(stage) || 1));
}

export function ProductProgressPage({ focusStage, onNavigate }) {
  const { state, loading, currentUser, orgCache, setCurrentProduct, setProductStage, updateProduct, gradeProduct, addTask, reorderTasks, updateTask, deleteTask, addDeliverable, updateDeliverable, deleteDeliverable, syncTaskTodo, scheduleTaskMeeting, returnProductToDemand } = useProductFlow();
  const selectionInitialized = useRef(false);
  const lastFocusTick = useRef(0);
  const [selectedProductId, setSelectedProductId] = useState("");
  const selectedProduct = state.products.find(item => item.id === selectedProductId) || state.products[0];
  const [selectedStage, setSelectedStage] = useState(validProgressStage(selectedProduct?.stage));
  const [meetingTask, setMeetingTask] = useState(null);
  const [todoTask, setTodoTask] = useState(null);
  const [deliverableTask, setDeliverableTask] = useState(null);
  const [templateTask, setTemplateTask] = useState(null);
  const [previewDeliverable, setPreviewDeliverable] = useState(null);
  const [editingDeliverable, setEditingDeliverable] = useState(null);
  const [deliverableToDelete, setDeliverableToDelete] = useState(null);
  const [gradingOpen, setGradingOpen] = useState(false);
  const [monthlyGmvDraft, setMonthlyGmvDraft] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState("");
  const [taskToDelete, setTaskToDelete] = useState(null);

  useEffect(() => {
    if (loading) return;
    const hasExplicitFocus = Boolean(focusStage?.productId && lastFocusTick.current !== focusStage.tick);
    const selectionMissing = !state.products.some(product => product.id === selectedProductId);
    if (!selectionInitialized.current || hasExplicitFocus || selectionMissing) {
      const explicitProductId = hasExplicitFocus ? focusStage.productId : "";
      const preferredId = preferredProgressProductId(state.products, currentUser, explicitProductId);
      setSelectedProductId(preferredId);
      selectionInitialized.current = true;
      if (hasExplicitFocus) lastFocusTick.current = focusStage.tick;
    }
  }, [currentUser, focusStage?.productId, focusStage?.tick, loading, selectedProductId, state.products]);

  useEffect(() => {
    if (!selectedProduct) return;
    if (focusStage?.productId === selectedProduct.id && Number.isInteger(focusStage.stage)) {
      setSelectedStage(validProgressStage(focusStage.stage));
      return;
    }
    setSelectedStage(validProgressStage(selectedProduct.stage));
  }, [focusStage, selectedProduct?.id, selectedProduct?.stage]);

  useEffect(() => {
    setMonthlyGmvDraft(selectedProduct?.monthlyGmvTarget ? String(selectedProduct.monthlyGmvTarget) : "");
  }, [selectedProduct?.id, selectedProduct?.monthlyGmvTarget]);

  const tasks = useMemo(() => tasksForProductStage(state, selectedProduct, selectedStage), [state, selectedProduct, selectedStage]);
  const productSchedule = selectedProduct
    ? buildProductScheduleSummary(selectedProduct, state.productPlans, state.demands, new Date(), state.tasks).schedule
    : { state: "unplanned", percent: null, launchDate: "" };
  const productSales = useProductSalesRows([selectedProduct]);
  const productGmvSummary = useMemo(() => buildProductGmvProgress({
    product: selectedProduct,
    dailyRows: productSales.rows,
    launchDate: productSchedule.launchDate
  }), [selectedProduct, productSales.rows, productSchedule.launchDate]);
  if (!selectedProduct) return <section className="page"><div className="empty-state">暂无产品</div></section>;
  const selectedPolicy = productStagePolicy(state, selectedProduct, selectedStage);
  const hasFormalGrading = hasFormalProductGrading(selectedProduct);
  const monthlyGmvTarget = normalizeMonthlyGmvTarget(selectedProduct.monthlyGmvTarget);
  const saveMonthlyGmvTarget = () => {
    const nextTarget = normalizeMonthlyGmvTarget(monthlyGmvDraft);
    setMonthlyGmvDraft(nextTarget ? String(nextTarget) : "");
    if (nextTarget !== monthlyGmvTarget) updateProduct(selectedProduct.id, { monthlyGmvTarget: nextTarget });
  };
  const handleAddTask = () => {
    addTask({
      productId: selectedProduct.id,
      stage: selectedStage,
      category: "会前准备",
      title: "新任务",
      ownerDept: "产品部",
      deliverable: "待补充"
    });
  };
  const handleReturnProduct = () => {
    const message = "退回需求池会清空这个产品的进度、任务、资料包和评审记录，确认继续？";
    if (window.confirm(message)) returnProductToDemand(selectedProduct.id);
  };
  const handleSetCurrentStage = () => {
    if (selectedStage === selectedProduct.stage) return;
    const movingBackward = selectedStage < Number(selectedProduct.stage || 1);
    const message = movingBackward
      ? `确认回退到第 ${selectedStage} 阶段？后续阶段的任务完成状态和会议纪要会被清除。`
      : `确认将第 ${selectedStage} 阶段设为当前阶段？`;
    if (window.confirm(message)) setProductStage(selectedProduct.id, selectedStage);
  };
  const openDeliverable = file => setPreviewDeliverable(file);
  const handleTaskDrop = (event, targetTaskId) => {
    event.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetTaskId) {
      setDraggedTaskId("");
      return;
    }
    const orderedIds = tasks.map(task => task.id).filter(id => id !== draggedTaskId);
    let targetIndex = orderedIds.indexOf(targetTaskId);
    if (targetIndex < 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.clientY > bounds.top + bounds.height / 2) targetIndex += 1;
    orderedIds.splice(targetIndex, 0, draggedTaskId);
    reorderTasks(selectedProduct.id, selectedStage, orderedIds);
    setDraggedTaskId("");
  };
  const getTaskRowProps = task => ({
    className: draggedTaskId === task.id ? "task-row-dragging" : "",
    onDragOver: event => {
      if (!draggedTaskId || draggedTaskId === task.id) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    },
    onDrop: event => handleTaskDrop(event, task.id)
  });
  const columns = [
    { key: "order", header: "", label: "排序", render: task => (
      <button
        type="button"
        className="task-drag-handle"
        draggable
        aria-label={`拖动调整任务顺序：${task.title}`}
        title="拖动调整任务顺序"
        onDragStart={event => {
          setDraggedTaskId(task.id);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", task.id);
        }}
        onDragEnd={() => setDraggedTaskId("")}
      ><GripVertical size={17} /></button>
    ) },
    { key: "category", header: "类别", render: task => <TaskCategorySelect value={task.category} onChange={category => updateTask(task.id, { category })} label={`${task.title}任务类别`} /> },
    { key: "title", header: "任务内容", render: task => <input name={`task-title-${task.id}`} autoComplete="off" aria-label={`${task.title}任务内容`} value={task.title} onChange={event => updateTask(task.id, { title: event.target.value })} /> },
    { key: "ownerDept", header: "责任部门", render: task => <OrgSelect type="department" value={task.ownerDept} onChange={ownerDept => updateTask(task.id, { ownerDept })} orgCache={state.orgCache} placeholder="选择责任部门" searchInMenu multiple /> },
    { key: "deliverable", header: "交付物", render: task => <TaskDeliverables files={deliverablesForTask(state, task.id)} deliverableTemplates={task.deliverableTemplates || []} onAdd={() => setDeliverableTask(task)} onOpen={openDeliverable} onOpenTemplates={() => setTemplateTask(task)} /> },
    { key: "due", header: "截止", render: task => <DatePickerField ariaLabel={`${task.title}截止日期`} value={task.due || ""} onChange={due => updateTask(task.id, { due })} /> },
    { key: "actions", header: "操作", render: task => {
      const categoryActions = taskCategoryActions(task.category);
      const completionBlocked = Boolean(task.required && !deliverablesForTask(state, task.id).length && !task.done);
      const hasMeeting = Boolean(task.dingMeeting?.eventId);
      const syncStatus = todoSyncStatus(task);
      const hasValidDue = Boolean(normalizeTaskDueDate(task.due));
      return <TableActions>
        <label className={`task-check ${task.done ? "checked" : ""} ${completionBlocked ? "blocked" : ""}`} title={completionBlocked ? "请先添加交付物，再完成必需任务" : undefined}>
          <input aria-label={`${task.title}完成状态`} type="checkbox" disabled={completionBlocked} checked={Boolean(task.done)} onChange={event => updateTask(task.id, { done: event.target.checked })} />
          <span>{task.done ? "已完成" : "未完成"}</span>
        </label>
        {categoryActions.todo ? (
          <Button
            className="compact todo-sync-action"
            data-status={syncStatus}
            data-testid="sync-task-todo"
            disabled={!hasValidDue}
            title={!hasValidDue ? "请先设置有效的截止日期，再同步到钉钉" : `${syncStatus}，点击${task.dingTodo?.id ? "更新" : "发送"}钉钉待办`}
            onClick={() => setTodoTask(task)}
          ><Send size={16} />{syncStatus}</Button>
        ) : null}
        {categoryActions.meeting ? (
          <Button
            className="compact"
            data-testid="schedule-task-meeting"
            disabled={hasMeeting}
            title={hasMeeting ? "会议已同步到钉钉日程" : undefined}
            onClick={() => setMeetingTask(task)}
          >
            {hasMeeting ? <CalendarCheck2 size={16} /> : <CalendarPlus size={16} />}{hasMeeting ? "已预约" : "预约会议"}
          </Button>
        ) : null}
        <IconAction label="删除" className="danger" onClick={() => setTaskToDelete(task)}><Trash2 size={16} /></IconAction>
      </TableActions>;
    }}
  ];

  return (
    <section className="page">
      <PageHeader
        title="产品进度"
        description="按产品定级查看适用阶段和任务。"
        identity={(
          <div className="progress-overview-toolbar">
            <ProductPicker
              products={state.products}
              value={selectedProduct.id}
              currentUser={currentUser}
              onChange={productId => {
                setSelectedProductId(productId);
                setCurrentProduct(productId);
              }}
            />
            <ProductScheduleSummary schedule={productSchedule} onOpenPlanning={() => onNavigate?.("planning")} />
            <ProductGmvSummary summary={productGmvSummary} loading={productSales.loading} error={productSales.error} />
            <Button className="compact quiet-danger" data-testid="return-product-demand" onClick={handleReturnProduct}><RotateCcw size={16} />退回需求池</Button>
          </div>
        )}
      />
      <div className="stage-grid">
        {progressStages.map(stage => {
          const policy = productStagePolicy(state, selectedProduct, stage.index);
          const stageTasks = tasksForProductStage(state, selectedProduct, stage.index);
          const done = stageTasks.filter(task => task.done).length;
          return (
            <button key={stage.index} className={`stage-card ${stage.index === selectedStage ? "active" : ""} ${policy.applies ? "" : "muted"}`} onClick={() => setSelectedStage(stage.index)}>
              <span className="stage-num">{stage.index}</span>
              <strong>{stage.short}</strong>
              <em className={`policy-${stagePolicyTone(policy.mode)}`}>{stagePolicyLabel(policy.mode)}</em>
              <p>{policy.applies ? stage.goal : policy.reason === "no-default-tasks" ? "未配置默认任务" : "该等级不涉及"}</p>
              <small>{policy.applies ? `${done}/${stageTasks.length} 任务完成` : policy.reason === "no-default-tasks" ? "可直接跳过" : "该等级不涉及"}</small>
            </button>
          );
        })}
      </div>
      <div className="section-panel">
        <div className="section-head">
          <div><h2>{selectedStage}. {STAGES[selectedStage].title}</h2><p>{selectedPolicy.usage}</p></div>
          <div className="toolbar-actions">
            <Button data-testid="add-stage-task" onClick={handleAddTask}><Plus size={16} />加任务</Button>
            <Button
              data-testid="set-current-stage"
              disabled={selectedStage === selectedProduct.stage || !selectedPolicy.applies || (selectedStage > 1 && (!selectedProduct.productManager || !monthlyGmvTarget || !hasFormalGrading))}
              disabledReason={!selectedPolicy.applies ? selectedPolicy.reason === "no-default-tasks" ? "该阶段没有默认任务，可直接选择后续阶段" : "该产品等级不涉及这个阶段" : selectedStage > 1 && (!selectedProduct.productManager || !monthlyGmvTarget || !hasFormalGrading) ? "请先确认产品负责人、平均月 GMV 和产品定级" : selectedStage === selectedProduct.stage ? "这已经是当前阶段" : ""}
              onClick={handleSetCurrentStage}
            ><Flag size={16} />{selectedStage === selectedProduct.stage ? "当前阶段" : "设为当前阶段"}</Button>
          </div>
        </div>
        {selectedStage === 1 ? (
          <div className="project-assignment">
            <div className="project-assignment-item">
              <span className="project-assignment-label">产品负责人</span>
              <OrgSelect
                type="user"
                value={selectedProduct.productManager || ""}
                onChange={productManager => updateProduct(selectedProduct.id, productManagerAssignment(productManager, orgCache))}
                orgCache={orgCache}
                departmentFilter="产品"
                placeholder="选择产品负责人"
                label="产品负责人"
                searchInMenu
              />
            </div>
            <div className="project-assignment-item project-gmv-target">
              <span className="project-assignment-label">平均月 GMV</span>
              <div className="project-gmv-control">
                <div className="project-gmv-input">
                  <span>¥</span>
                  <input
                    aria-label="平均月 GMV"
                    inputMode="decimal"
                    value={monthlyGmvDraft}
                    placeholder="填写月度目标"
                    onChange={event => setMonthlyGmvDraft(event.target.value.replace(/[^\d.]/g, ""))}
                    onBlur={saveMonthlyGmvTarget}
                    onKeyDown={event => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="project-assignment-item project-grade-action">
              <div className="project-grade-value">
                <span className="project-assignment-label">产品定级</span>
                    <strong className={`level-badge level-${productLevelTone(hasFormalGrading ? selectedProduct.level : "")}`}>
                      {hasFormalGrading ? selectedProduct.level : "待定级"}
                    </strong>
                    <small>期望上线：{formatExpectedLaunchMonth(selectedProduct.expectedLaunchMonth)}</small>
                  </div>
                  <Button className="compact" disabled={!selectedProduct.productManager || (!monthlyGmvTarget && !hasFormalGrading)} disabledReason={!selectedProduct.productManager ? "请先选择产品负责人" : !monthlyGmvTarget && !hasFormalGrading ? "请先填写平均月 GMV" : ""} onClick={() => setGradingOpen(true)}>{hasFormalGrading ? "查看定级打分" : "定级"}</Button>
            </div>
          </div>
        ) : null}
        {selectedPolicy.applies ? <DataTable className="task-table" minWidth={880} columns={columns} rows={tasks} getRowProps={getTaskRowProps} empty={<div className="empty-state">暂无任务</div>} /> : <div className="empty-state">{selectedPolicy.reason === "no-default-tasks" ? "设置中未配置该阶段的默认任务，流程可直接跳过；需要临时执行时可添加任务。" : "该等级不涉及这个阶段，不需要维护任务。"}</div>}
      </div>
      <MeetingScheduleModal
        open={Boolean(meetingTask)}
        task={meetingTask}
        product={selectedProduct}
        currentUser={currentUser}
        orgCache={orgCache}
        onClose={() => setMeetingTask(null)}
        onSchedule={async ({ startTime, endTime, attendees }) => {
          const payload = buildTaskMeetingPayload({ product: selectedProduct, task: meetingTask, organizer: currentUser, attendees, startTime, endTime });
          return scheduleTaskMeeting({ taskId: meetingTask.id, payload, attendees });
        }}
      />
      <TaskDeliverableModal
        open={Boolean(deliverableTask)}
        task={deliverableTask}
        product={selectedProduct}
        onClose={() => setDeliverableTask(null)}
        onSave={file => {
          addDeliverable(file);
          setDeliverableTask(null);
        }}
      />
      <TaskDeliverableModal
        open={Boolean(editingDeliverable)}
        task={state.tasks.find(item => item.id === editingDeliverable?.taskId)}
        product={selectedProduct}
        file={editingDeliverable}
        onClose={() => setEditingDeliverable(null)}
        onSave={patch => {
          updateDeliverable(editingDeliverable.id, patch);
          setEditingDeliverable(null);
        }}
      />
      <TaskTemplateModal open={Boolean(templateTask)} task={templateTask} onClose={() => setTemplateTask(null)} />
      <ProductGradingModal
        open={gradingOpen}
        product={selectedProduct}
        canEdit={currentUser?.name === selectedProduct.productManager}
        onClose={() => setGradingOpen(false)}
        onSave={answers => {
          const result = gradeProduct(selectedProduct.id, answers, { gradedBy: selectedProduct.productManager || currentUser?.name || "" });
          setGradingOpen(false);
          if (result.level === "O级储备") onNavigate?.("demands");
        }}
      />
      <DeliverablePreviewModal
        file={previewDeliverable}
        onClose={() => setPreviewDeliverable(null)}
        onEdit={() => {
          setEditingDeliverable(previewDeliverable);
          setPreviewDeliverable(null);
        }}
        onDelete={() => setDeliverableToDelete(previewDeliverable)}
      />
      <ConfirmDialog
        open={Boolean(deliverableToDelete)}
        title="删除交付物"
        message={deliverableToDelete ? `确定删除“${deliverableToDelete.name}”？` : ""}
        description="该交付物会同时从产品进度和资料包移除，删除后无法恢复。"
        onClose={() => setDeliverableToDelete(null)}
        onConfirm={() => {
          deleteDeliverable(deliverableToDelete.id);
          setDeliverableToDelete(null);
          setPreviewDeliverable(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(taskToDelete)}
        title="删除任务"
        message={taskToDelete ? `确定删除“${taskToDelete.title}”？` : ""}
        description="相关交付物会从任务解绑，删除后无法恢复。"
        onClose={() => setTaskToDelete(null)}
        onConfirm={() => {
          deleteTask(taskToDelete.id);
          setTaskToDelete(null);
        }}
      />
      <TodoSyncModal
        open={Boolean(todoTask)}
        task={todoTask}
        product={selectedProduct}
        orgCache={orgCache}
        onClose={() => setTodoTask(null)}
        onSync={async ({ executors }) => {
          const detailUrl = new URL(window.location.href);
          detailUrl.searchParams.set("productId", selectedProduct.id);
          detailUrl.searchParams.set("taskId", todoTask.id);
          detailUrl.hash = "progress";
          const recoveryUsers = orgUsers(orgCache).filter(user => user.name === selectedProduct.productManager);
          const payload = buildTaskTodoPayload({ product: selectedProduct, task: todoTask, creator: currentUser, executors, recoveryUsers, detailUrl: detailUrl.toString() });
          const snapshot = buildTaskTodoSnapshot(todoTask, payload.executorUnionIds);
          return syncTaskTodo({ taskId: todoTask.id, payload, executors, snapshot });
        }}
      />
    </section>
  );
}

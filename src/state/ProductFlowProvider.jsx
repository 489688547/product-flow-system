import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  applyProductGrading,
  advanceProductToNextStage,
  calculateProductGrade,
  createDefaultState,
  convertDemandToProject,
  moveProductToStage,
  nextTaskSortOrder,
  reorderProductStageTasks,
  syncDefaultTasksForProduct,
  updateDemandRecord,
  updateProductRecord,
  updateWorkflowTaskTemplates
} from "../domain/productFlow.js";
import { normalizeClientState } from "./stateModel.js";
import { ensureCurrentUserInOrgCache, resolveCurrentUser } from "../domain/sessionUser.js";
import { createTaskMeetingRecord, reconcileTaskTodosFromDingTalk } from "../domain/dingTalk.js";
import { applyTaskTodoSyncFailure, applyTaskTodoSyncSuccess } from "../domain/taskTodo.js";
import { sharedStateApiUrl } from "./stateApi.js";
import { createDemandRecord } from "../domain/demandDate.js";
import { useAuth } from "./AuthProvider.jsx";
import { normalizeProductPlans, validateProductPlan } from "../domain/productPlanning.js";
import { createDingTalkTodoRefreshController } from "./dingTalkTodoRefresh.js";
import { createSharedStateSyncSession } from "./sharedStateSync.js";
import { productFlowStateFingerprint } from "./productFlowStateFingerprint.js";
import { persistLocalState, tryRemoveStorageItem, trySetStorageItem } from "./resilientLocalStorage.js";

const ProductFlowContext = createContext(null);
const STORAGE_KEY = "productFlowState";
const DIRTY_STORAGE_KEY = "productFlowStateDirty";
const RECOVERY_STORAGE_KEY = "productFlowStateRecoveryBackup";

function isLocalPreview() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function sharedErrorMessage(error, fallback) {
  const message = String(error?.message || "").trim();
  return /load failed|failed to fetch/i.test(message) ? fallback : message || fallback;
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeClientState(JSON.parse(raw)) : createDefaultState();
  } catch {
    return createDefaultState();
  }
}

function preserveLocalRecoveryCopy() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    localStorage.setItem(RECOVERY_STORAGE_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      state: JSON.parse(raw)
    }));
    return true;
  } catch {
    return false;
  }
}

export function ProductFlowProvider({ children }) {
  const { user: authUser } = useAuth();
  const [state, setState] = useState(loadLocalState);
  const [sharedError, setSharedError] = useState("");
  const [loading, setLoading] = useState(true);
  const latestState = useRef(state);
  latestState.current = state;
  const stateApiUrl = sharedStateApiUrl(window.location.hostname);
  const sharedSyncSession = useRef(createSharedStateSyncSession({ fingerprint: productFlowStateFingerprint }));
  const orgSyncAttempted = useRef(false);
  const sessionAccount = useMemo(() => authUser ? ({
    role: authUser.role,
    source: authUser.loginMode || "session",
    dingUser: {
      userid: authUser.userId,
      unionid: authUser.unionId,
      name: authUser.name,
      title: authUser.title,
      departmentNames: [authUser.department].filter(Boolean)
    }
  }) : null, [authUser]);
  const currentUser = useMemo(() => resolveCurrentUser(sessionAccount, state.orgCache), [sessionAccount, state.orgCache]);
  const orgCache = useMemo(() => ensureCurrentUserInOrgCache(state.orgCache, currentUser), [state.orgCache, currentUser]);
  const commitState = useCallback(updater => {
    setState(current => {
      const nextState = typeof updater === "function" ? updater(current) : updater;
      if (nextState === current) return current;
      persistLocalState(localStorage, STORAGE_KEY, nextState);
      trySetStorageItem(localStorage, DIRTY_STORAGE_KEY, "1");
      return nextState;
    });
  }, []);
  const todoRefreshController = useMemo(() => createDingTalkTodoRefreshController({
    fetchImpl: (...args) => fetch(...args),
    onTodos: todos => commitState(current => {
      const tasks = reconcileTaskTodosFromDingTalk(current.tasks || [], todos);
      return tasks === current.tasks ? current : { ...current, tasks };
    })
  }), [commitState]);

  useEffect(() => {
    let alive = true;
    async function loadSharedState() {
      try {
        const response = await fetch(stateApiUrl);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || "共享数据加载失败。");
        const normalized = normalizeClientState(payload.state);
        const remoteState = sharedSyncSession.current.acceptRemote({ ...payload, state: normalized });
        if (alive) {
          const hadLocalChanges = localStorage.getItem(DIRTY_STORAGE_KEY) === "1";
          const preserved = hadLocalChanges && preserveLocalRecoveryCopy();
          setState(remoteState);
          persistLocalState(localStorage, STORAGE_KEY, remoteState);
          tryRemoveStorageItem(localStorage, DIRTY_STORAGE_KEY);
          setSharedError(preserved ? "发现本机未同步修改，已保留恢复副本并加载线上最新数据。" : "");
        }
      } catch (error) {
        if (alive) setSharedError(sharedErrorMessage(error, "共享数据加载失败，已暂停自动保存，请刷新重试。"));
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadSharedState();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (loading || orgSyncAttempted.current) return undefined;
    orgSyncAttempted.current = true;
    let alive = true;
    async function refreshOrganization() {
      try {
        const response = await fetch("/api/dingtalk/org/sync", { method: "POST" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.synced || !payload.org || !alive) return;
        setState(current => ({ ...current, orgCache: payload.org }));
      } catch {
        // Local preview and temporary DingTalk failures keep the last shared cache.
      }
    }
    refreshOrganization();
    return () => { alive = false; };
  }, [loading]);

  const refreshTaskTodoStatuses = useCallback(
    () => todoRefreshController.refresh(),
    [todoRefreshController]
  );

  useEffect(() => {
    if (loading || !authUser?.unionId) return undefined;
    let active = true;
    const refresh = () => {
      if (!active) return;
      refreshTaskTodoStatuses().catch(() => {
        // A temporary read failure must not overwrite the last successful local snapshot.
      });
    };
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      todoRefreshController.invalidate();
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [authUser?.unionId, loading, refreshTaskTodoStatuses, todoRefreshController]);

  useEffect(() => {
    persistLocalState(localStorage, STORAGE_KEY, state);
    if (loading || !sharedSyncSession.current.canSave()) return undefined;
    const writeRequest = sharedSyncSession.current.buildWrite(state);
    if (!writeRequest) {
      tryRemoveStorageItem(localStorage, DIRTY_STORAGE_KEY);
      return undefined;
    }
    trySetStorageItem(localStorage, DIRTY_STORAGE_KEY, "1");
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(stateApiUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(writeRequest)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.synced === false) throw new Error(payload.message || "共享数据保存失败。");
        sharedSyncSession.current.acceptSaved(payload, state);
        if (latestState.current === state) {
          tryRemoveStorageItem(localStorage, DIRTY_STORAGE_KEY);
        }
        setSharedError("");
      } catch (error) {
        setSharedError(isLocalPreview() ? "" : sharedErrorMessage(error, "共享数据同步失败，修改已保存在本机。"));
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [loading, state, stateApiUrl]);

  const updateDemand = useCallback((id, patch) => {
    commitState(current => updateDemandRecord(current, id, patch));
  }, []);

  const addDemand = useCallback(demand => {
    commitState(current => ({
      ...current,
      demands: [createDemandRecord(demand), ...current.demands]
    }));
  }, []);

  const deleteDemand = useCallback(id => {
    commitState(current => ({ ...current, demands: current.demands.filter(item => item.id !== id) }));
  }, []);

  const convertDemand = useCallback(id => {
    const productId = `p-${Date.now()}`;
    commitState(current => convertDemandToProject(current, id, { productId }));
    return productId;
  }, []);

  const returnProductToDemand = useCallback(productId => {
    commitState(current => {
      const product = current.products.find(item => item.id === productId);
      if (!product) return current;
      const matchedDemand = current.demands.find(item => item.productId === productId);
      const returnedDemand = {
        id: matchedDemand?.id || `d-return-${Date.now()}`,
        name: product.name,
        expectedLaunchMonth: matchedDemand?.expectedLaunchMonth || product.expectedLaunchMonth || "",
        requester: matchedDemand?.requester || product.requester || "",
        owner: matchedDemand?.requester || product.requester || "",
        source: product.source,
        status: "已讨论",
        productId: "",
        image: product.image || "",
        createdAt: matchedDemand?.createdAt || new Date().toISOString(),
        desc: product.desc || matchedDemand?.desc || "",
        discussion: matchedDemand?.discussion || "从产品进度退回需求池，需要重新评估是否继续立项。"
      };
      const demands = matchedDemand
        ? current.demands.map(item => item.id === matchedDemand.id ? returnedDemand : item)
        : [returnedDemand, ...current.demands];
      const products = current.products.filter(item => item.id !== productId);
      return {
        ...current,
        currentId: products[0]?.id || "",
        products,
        demands,
        tasks: (current.tasks || []).filter(task => task.productId !== productId),
        deliverables: (current.deliverables || []).filter(file => file.productId !== productId),
        reviews: (current.reviews || []).filter(review => review.productId !== productId),
        decisions: (current.decisions || []).filter(decision => decision.productId !== productId),
        dingMeetings: (current.dingMeetings || []).filter(meeting => meeting.productId !== productId)
      };
    });
  }, []);

  const setCurrentProduct = useCallback(id => {
    commitState(current => ({ ...current, currentId: id }));
  }, []);

  const addTask = useCallback(task => {
    commitState(current => {
      const taskWithOrder = {
        id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        category: "会前准备",
        title: "新任务",
        ownerDept: "产品部",
        deliverable: "待补充",
        required: false,
        due: "",
        done: false,
        systemDefault: false,
        ...task,
        sortOrder: nextTaskSortOrder(current, task.productId, task.stage)
      };
      return {
        ...current,
        tasks: [...(current.tasks || []), taskWithOrder]
      };
    });
  }, []);

  const reorderTasks = useCallback((productId, stage, orderedTaskIds) => {
    commitState(current => reorderProductStageTasks(current, productId, stage, orderedTaskIds));
  }, []);

  const updateTask = useCallback((id, patch) => {
    commitState(current => ({
      ...current,
      tasks: current.tasks.map(item => item.id === id ? { ...item, ...patch } : item)
    }));
  }, []);

  const deleteTask = useCallback(id => {
    commitState(current => ({
      ...current,
      tasks: (current.tasks || []).filter(item => item.id !== id),
      deliverables: (current.deliverables || []).map(file => file.taskId === id ? { ...file, taskId: "" } : file)
    }));
  }, []);

  const syncTaskTodo = useCallback(async ({ taskId, payload, executors, snapshot }) => {
    try {
      const response = await fetch("/api/dingtalk/todo/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.synced) {
        const detail = result.detail?.message || result.detail?.errmsg || result.detail?.errorMessage || "";
        throw new Error([result.message || "钉钉待办同步失败。", detail].filter(Boolean).join(" "));
      }
      const syncedAt = new Date().toISOString();
      todoRefreshController.invalidate();
      commitState(current => ({
        ...current,
        tasks: (current.tasks || []).map(item => item.id === taskId
          ? applyTaskTodoSyncSuccess(item, { payload, executors, snapshot, todo: result.todo, syncedAt })
          : item)
      }));
      return result.todo;
    } catch (error) {
      commitState(current => ({
        ...current,
        tasks: (current.tasks || []).map(item => item.id === taskId
          ? applyTaskTodoSyncFailure(item, error)
          : item)
      }));
      throw error;
    }
  }, []);

  const scheduleTaskMeeting = useCallback(async ({ taskId, payload, attendees }) => {
    const response = await fetch("/api/dingtalk/calendar/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.synced) {
      const detail = result.detail?.message || result.detail?.errmsg || result.detail?.errorMessage || "";
      throw new Error([result.message || "钉钉日程创建失败。", detail].filter(Boolean).join(" "));
    }
    const syncedAt = new Date().toISOString();
    const dingMeeting = createTaskMeetingRecord({ event: result.event, payload, attendees, syncedAt });
    commitState(current => {
      const task = current.tasks.find(item => item.id === taskId);
      const meetingRecord = {
        id: `task:${taskId}`,
        taskId,
        productId: task?.productId || "",
        title: task?.title || payload.summary,
        ...dingMeeting,
        status: "已同步"
      };
      return {
        ...current,
        tasks: current.tasks.map(item => item.id === taskId ? { ...item, dingMeeting } : item),
        dingMeetings: [meetingRecord, ...(current.dingMeetings || []).filter(item => item.id !== meetingRecord.id)]
      };
    });
    return dingMeeting;
  }, []);

  const advanceProductStage = useCallback(productId => {
    commitState(current => advanceProductToNextStage(current, productId));
  }, []);

  const setProductStage = useCallback((productId, stage) => {
    commitState(current => moveProductToStage(current, productId, stage));
  }, []);

  const syncProductDefaults = useCallback(productId => {
    commitState(current => {
      const product = current.products.find(item => item.id === productId);
      return product ? syncDefaultTasksForProduct(current, product) : current;
    });
  }, []);

  const updateProduct = useCallback((id, patch) => {
    commitState(current => updateProductRecord(current, id, patch));
  }, []);

  const gradeProduct = useCallback((productId, answers, options = {}) => {
    const grading = calculateProductGrade(answers);
    if (!grading.complete) return grading;
    commitState(current => applyProductGrading(current, productId, grading, options));
    return grading;
  }, []);

  const addDeliverable = useCallback(file => {
    commitState(current => ({
      ...current,
      deliverables: [{ ...file, id: `file-${Date.now()}-${Math.random().toString(16).slice(2)}`, created: "今天" }, ...(current.deliverables || [])]
    }));
  }, []);

  const updateDeliverable = useCallback((id, patch) => {
    commitState(current => ({
      ...current,
      deliverables: (current.deliverables || []).map(file => file.id === id ? { ...file, ...patch, id } : file)
    }));
  }, []);

  const deleteDeliverable = useCallback(id => {
    commitState(current => ({ ...current, deliverables: (current.deliverables || []).filter(file => file.id !== id) }));
  }, []);

  const addProductPlan = useCallback(input => {
    const validation = validateProductPlan(input);
    if (!validation.valid) throw new Error(validation.reason);
    const now = new Date().toISOString();
    const [plan] = normalizeProductPlans([{
      ...input,
      id: `plan-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdBy: currentUser?.name || "",
      createdAt: now,
      updatedAt: now
    }]);
    commitState(current => ({
      ...current,
      productPlans: [plan, ...(current.productPlans || []).filter(item => item.demandId !== plan.demandId)]
    }));
    return plan.id;
  }, [currentUser?.name]);

  const updateProductPlan = useCallback((id, patch) => {
    commitState(current => {
      const existing = (current.productPlans || []).find(plan => plan.id === id);
      if (!existing) return current;
      const merged = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
      const validation = validateProductPlan(merged);
      if (!validation.valid) throw new Error(validation.reason);
      const [normalized] = normalizeProductPlans([merged]);
      return { ...current, productPlans: current.productPlans.map(plan => plan.id === id ? normalized : plan) };
    });
  }, []);

  const deleteProductPlan = useCallback(id => {
    commitState(current => ({ ...current, productPlans: (current.productPlans || []).filter(plan => plan.id !== id) }));
  }, []);

  const updateReviewMinutes = useCallback((id, minutes) => {
    commitState(current => ({
      ...current,
      reviews: (current.reviews || []).map(review => review.id === id ? { ...review, minutes } : review)
    }));
  }, []);

  const addFeedbackIssue = useCallback(issue => {
    commitState(current => ({
      ...current,
      feedbackIssues: [{ ...issue, id: `issue-${Date.now()}`, created: "今天", status: "待处理" }, ...(current.feedbackIssues || [])]
    }));
  }, []);

  const updateSettings = useCallback(patch => {
    commitState(current => ({ ...current, settings: { ...(current.settings || {}), ...patch } }));
  }, []);

  const updateTaskTemplates = useCallback(taskTemplates => {
    commitState(current => updateWorkflowTaskTemplates(current, taskTemplates));
  }, []);

  const value = useMemo(() => ({
    state,
    currentUser,
    orgCache,
    loading,
    sharedError,
    updateDemand,
    addDemand,
    deleteDemand,
    convertDemand,
    returnProductToDemand,
    setCurrentProduct,
    updateProduct,
    gradeProduct,
    addTask,
    reorderTasks,
    updateTask,
    deleteTask,
    syncTaskTodo,
    scheduleTaskMeeting,
    advanceProductStage,
    setProductStage,
    syncProductDefaults,
    addDeliverable,
    updateDeliverable,
    deleteDeliverable,
    addProductPlan,
    updateProductPlan,
    deleteProductPlan,
    updateReviewMinutes,
    addFeedbackIssue,
    updateSettings,
    updateTaskTemplates
  }), [state, currentUser, orgCache, loading, sharedError, updateDemand, addDemand, deleteDemand, convertDemand, returnProductToDemand, setCurrentProduct, updateProduct, gradeProduct, addTask, reorderTasks, updateTask, deleteTask, syncTaskTodo, scheduleTaskMeeting, advanceProductStage, setProductStage, syncProductDefaults, addDeliverable, updateDeliverable, deleteDeliverable, addProductPlan, updateProductPlan, deleteProductPlan, updateReviewMinutes, addFeedbackIssue, updateSettings, updateTaskTemplates]);

  return <ProductFlowContext.Provider value={value}>{children}</ProductFlowContext.Provider>;
}

export function useProductFlow() {
  const context = useContext(ProductFlowContext);
  if (!context) throw new Error("useProductFlow must be used inside ProductFlowProvider");
  return context;
}

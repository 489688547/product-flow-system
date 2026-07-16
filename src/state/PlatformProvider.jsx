import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createDefaultPlatformState, normalizePlatformState, reducePlatformState } from "../domain/strategyExecution.js";
import { applyRemoteTodoSnapshots, reconcilePersonalTodos } from "../domain/personalTodos.js";
import { useAuth } from "./AuthProvider.jsx";
import { useProductFlow } from "./ProductFlowProvider.jsx";
import { platformApiUrl } from "./platformApi.js";
import { buildDecisionTodoPayload, buildPersonalTodoPayload } from "../domain/platformNotifications.js";

const PlatformContext = createContext(null);
const STORAGE_KEY = "platformExecutionState";
const GOVERNED_DEMO_COLLECTIONS = ["departmentCommitments", "commitmentMilestones", "incentiveProjects", "departmentRewardBudgets", "monthlyReports"];

function isLocalHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function normalizeWithLocalDemo(input) {
  const normalized = normalizePlatformState(input);
  if (!isLocalHost() || normalized.version === "strategy-platform-v2") return normalized;
  const demo = createDefaultPlatformState();
  return {
    ...normalized,
    version: "strategy-platform-v2",
    ...Object.fromEntries(GOVERNED_DEMO_COLLECTIONS.map(key => [key, normalized[key]?.length ? normalized[key] : demo[key]]))
  };
}

function loadLocalState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeWithLocalDemo(JSON.parse(raw)) : createDefaultPlatformState();
  } catch {
    return createDefaultPlatformState();
  }
}

function errorMessage(error, fallback) {
  const message = String(error?.message || "").trim();
  return /load failed|failed to fetch/i.test(message) ? fallback : message || fallback;
}

export function PlatformProvider({ children, enabled = true }) {
  const { user } = useAuth();
  const { state: productState, currentUser, orgCache, updateTask } = useProductFlow();
  const [state, setState] = useState(loadLocalState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const apiUrl = platformApiUrl(window.location.hostname);
  const firstSave = useRef(true);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError("");
      return undefined;
    }
    let alive = true;
    async function loadSharedPlatform() {
      try {
        const response = await fetch(apiUrl);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.synced === false || !payload.state) return;
        if (alive) {
          const normalized = normalizeWithLocalDemo(payload.state);
          setState(normalized);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
          setError("");
        }
      } catch (loadError) {
        if (alive && !isLocalHost()) {
          setError(errorMessage(loadError, "战略执行数据加载失败，当前显示本地缓存。"));
        }
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadSharedPlatform();
    return () => { alive = false; };
  }, [apiUrl, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (firstSave.current) {
      firstSave.current = false;
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.synced === false) throw new Error(payload.message || "战略执行数据保存失败。");
        setError("");
      } catch (saveError) {
        if (!isLocalHost()) {
          setError(errorMessage(saveError, "战略执行数据同步失败，修改已保存在本机。"));
        }
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [apiUrl, enabled, state]);

  const dispatch = useCallback(action => {
    setState(current => reducePlatformState(current, {
      ...action,
      actor: action.actor || user?.name || "系统"
    }));
  }, [user?.name]);

  useEffect(() => {
    if (!enabled) return;
    setState(current => {
      const personalTodos = reconcilePersonalTodos({
        platformState: current,
        productState,
        orgCache,
        existingTodos: current.personalTodos,
        now: new Date()
      });
      return reducePlatformState(current, { type: "replace_personal_todos", todos: personalTodos });
    });
  }, [
    enabled,
    orgCache,
    productState.products,
    productState.tasks,
    state.commitmentMilestones,
    state.decisionRequests,
    state.departmentCommitments,
    state.incentiveProjects,
    state.milestones,
    state.monthlyReports,
    state.risks,
    state.statusUpdates
  ]);

  const saveRequiredResult = useCallback((record, reason = "维护战略达成标准") => {
    dispatch({ type: "upsert_required_result", record, reason });
  }, [dispatch]);

  const saveDepartmentCommitment = useCallback((record, reason = "维护部门承诺") => {
    dispatch({ type: "upsert_department_commitment", record, reason });
  }, [dispatch]);

  const transitionCommitment = useCallback((id, transition, reason = "") => {
    dispatch({ type: "transition_department_commitment", id, transition, reason });
  }, [dispatch]);

  const saveCommitmentMilestone = useCallback((record, reason = "维护月度里程碑") => {
    dispatch({ type: "upsert_commitment_milestone", record, reason });
  }, [dispatch]);

  const saveIncentiveProject = useCallback((record, reason = "维护激励项目") => {
    dispatch({ type: "upsert_incentive_project", record, reason });
  }, [dispatch]);

  const settleIncentive = useCallback((id, award) => {
    dispatch({ type: "settle_incentive_project", id, award });
  }, [dispatch]);

  const saveMonthlyReport = useCallback((record, reason = "填写月度汇报") => {
    dispatch({ type: "upsert_monthly_report", record, reason });
  }, [dispatch]);

  const transitionReport = useCallback((id, transition, options = {}) => {
    dispatch({ type: "transition_monthly_report", id, transition, ...options });
  }, [dispatch]);

  const appendReportCorrection = useCallback((id, text) => {
    dispatch({ type: "transition_monthly_report", id, transition: "append_correction", text });
  }, [dispatch]);

  const ensureReports = useCallback((month, departments) => {
    dispatch({ type: "ensure_monthly_reports", month, departments });
  }, [dispatch]);

  const syncDecisionTodo = useCallback(async (decisionId, { creator, executor, detailUrl }) => {
    const decision = state.decisionRequests.find(item => item.id === decisionId);
    const project = state.projects.find(item => item.id === decision?.projectId);
    if (!decision) throw new Error("待决策事项不存在或已被归档。");
    try {
      const payload = buildDecisionTodoPayload(decision, project, creator, executor, detailUrl);
      const response = await fetch("/api/dingtalk/todo/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.synced) throw new Error(result.message || "钉钉待办同步失败。");
      dispatch({
        type: "update_decision_notification",
        id: decisionId,
        dingTodo: {
          id: result.todo?.id || result.todo?.taskId || payload.todoId,
          executorUnionIds: payload.executorUnionIds,
          syncedAt: new Date().toISOString(),
          lastError: ""
        }
      });
      return result.todo;
    } catch (syncError) {
      dispatch({
        type: "update_decision_notification",
        id: decisionId,
        dingTodo: { lastError: syncError.message || "钉钉待办同步失败。", failedAt: new Date().toISOString() }
      });
      throw syncError;
    }
  }, [dispatch, state.decisionRequests, state.projects]);

  const syncPersonalTodoRecord = useCallback(async todo => {
    const payload = buildPersonalTodoPayload(todo, currentUser, `${window.location.origin}${window.location.pathname}#home`);
    try {
      const response = await fetch("/api/dingtalk/todo/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.synced) throw new Error(result.message || "钉钉待办同步失败。");
      dispatch({
        type: "update_personal_todo_notification",
        id: todo.id,
        dingTodo: {
          id: result.todo?.id || result.todo?.taskId || payload.todoId,
          creatorUnionId: payload.creatorUnionId,
          syncedAt: new Date().toISOString(),
          syncedVersion: Number(todo.dingTodo?.syncedVersion || 0) + 1,
          lastError: ""
        }
      });
      return result.todo;
    } catch (syncError) {
      dispatch({
        type: "update_personal_todo_notification",
        id: todo.id,
        dingTodo: { lastError: syncError.message || "钉钉待办同步失败。", failedAt: new Date().toISOString() }
      });
      throw syncError;
    }
  }, [currentUser, dispatch]);

  const syncPersonalTodo = useCallback(async id => {
    const todo = state.personalTodos.find(item => item.id === id);
    if (!todo) throw new Error("个人待办不存在或已被取消。");
    return syncPersonalTodoRecord(todo);
  }, [state.personalTodos, syncPersonalTodoRecord]);

  const applySourceStatus = useCallback((todo, done, source = "platform") => {
    if (todo.sourceType === "milestone") {
      const milestone = state.milestones.find(item => item.id === todo.sourceId);
      if (milestone) dispatch({
        type: "upsert_milestone",
        record: { ...milestone, status: done ? "completed" : "pending" },
        reason: source === "dingtalk" ? "钉钉待办状态回流" : "个人待办状态更新"
      });
    }
    if (todo.sourceType === "product_task") updateTask(todo.sourceId, { done });
  }, [dispatch, state.milestones, updateTask]);

  const setPersonalTodoDone = useCallback(async (id, done) => {
    const todo = state.personalTodos.find(item => item.id === id);
    if (!todo) throw new Error("个人待办不存在或已被取消。");
    const nextTodo = {
      ...todo,
      status: done ? "done" : "pending",
      completedAt: done ? new Date().toISOString() : "",
      completedFrom: done ? "platform" : ""
    };
    dispatch({
      type: "apply_personal_todo_status",
      id,
      status: nextTodo.status,
      completedAt: nextTodo.completedAt,
      completedFrom: nextTodo.completedFrom,
      reason: done ? "在平台标记完成" : "在平台重新打开"
    });
    applySourceStatus(todo, done, "platform");
    try {
      await syncPersonalTodoRecord(nextTodo);
    } catch {
      // Local completion remains valid; the saved sync error enables a manual retry.
    }
  }, [applySourceStatus, dispatch, state.personalTodos, syncPersonalTodoRecord]);

  const refreshPersonalTodoStatuses = useCallback(async () => {
    const response = await fetch("/api/dingtalk/todo/list");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.synced) throw new Error(payload.message || "钉钉待办状态查询失败。");
    const result = applyRemoteTodoSnapshots(state.personalTodos, payload.todos || [], currentUser, new Date());
    result.todos.forEach(nextTodo => {
      const previous = state.personalTodos.find(item => item.id === nextTodo.id);
      if (!previous || previous === nextTodo) return;
      if (previous.status !== nextTodo.status) {
        const audit = result.audits.find(item => item.todoId === nextTodo.id);
        dispatch({
          type: "apply_personal_todo_status",
          id: nextTodo.id,
          status: nextTodo.status,
          completedAt: nextTodo.completedAt,
          completedFrom: nextTodo.completedFrom || "dingtalk",
          remoteSnapshotKey: nextTodo.dingTodo?.remoteSnapshotKey,
          dingTodo: nextTodo.dingTodo,
          auditAction: audit?.action,
          reason: "钉钉待办状态回流"
        });
      } else if (JSON.stringify(previous.dingTodo || {}) !== JSON.stringify(nextTodo.dingTodo || {})) {
        dispatch({ type: "update_personal_todo_notification", id: nextTodo.id, dingTodo: nextTodo.dingTodo });
      }
    });
    result.effects.forEach(effect => {
      const isMilestone = ["complete_milestone", "reopen_milestone"].includes(effect.type);
      const isProductTask = ["complete_product_task", "reopen_product_task"].includes(effect.type);
      const todo = state.personalTodos.find(item => item.sourceId === effect.sourceId && (
        (isMilestone && item.sourceType === "milestone")
        || (isProductTask && item.sourceType === "product_task")
      ));
      if (todo) applySourceStatus(todo, ["complete_milestone", "complete_product_task"].includes(effect.type), "dingtalk");
    });
    return result;
  }, [applySourceStatus, currentUser, dispatch, state.personalTodos]);

  const value = useMemo(() => ({
    state,
    loading,
    error,
    dispatch,
    syncDecisionTodo,
    syncPersonalTodo,
    refreshPersonalTodoStatuses,
    setPersonalTodoDone,
    saveRequiredResult,
    saveDepartmentCommitment,
    transitionCommitment,
    saveCommitmentMilestone,
    saveIncentiveProject,
    settleIncentive,
    saveMonthlyReport,
    transitionReport,
    appendReportCorrection,
    ensureReports
  }), [
    appendReportCorrection,
    dispatch,
    ensureReports,
    error,
    loading,
    refreshPersonalTodoStatuses,
    saveCommitmentMilestone,
    saveDepartmentCommitment,
    saveIncentiveProject,
    saveMonthlyReport,
    saveRequiredResult,
    setPersonalTodoDone,
    settleIncentive,
    state,
    syncDecisionTodo,
    syncPersonalTodo,
    transitionCommitment,
    transitionReport
  ]);
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export function usePlatform() {
  const context = useContext(PlatformContext);
  if (!context) throw new Error("usePlatform must be used inside PlatformProvider");
  return context;
}

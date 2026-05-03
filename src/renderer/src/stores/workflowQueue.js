import { defineStore } from "pinia";
import { ref } from "vue";
import {
  workflowQueueClearPending,
  workflowQueueGet,
  workflowQueueRunFront,
} from "../api/workflowApi";

const normalizeQueue = (payload = {}) => {
  const queue = payload && typeof payload === "object" ? payload : {};
  return {
    pending: Array.isArray(queue.pending) ? queue.pending : [],
    running: Array.isArray(queue.running) ? queue.running : [],
    history: Array.isArray(queue.history) ? queue.history : [],
    updatedAt:
      typeof queue.updatedAt === "string" && queue.updatedAt.trim()
        ? queue.updatedAt
        : "",
  };
};

export const useWorkflowQueueStore = defineStore("workflowQueue", () => {
  const pending = ref([]);
  const running = ref([]);
  const history = ref([]);
  const loading = ref(false);
  const error = ref("");
  const lastUpdatedAt = ref("");

  const setQueueData = (payload = {}) => {
    const normalized = normalizeQueue(payload);
    pending.value = normalized.pending;
    running.value = normalized.running;
    history.value = normalized.history;
    lastUpdatedAt.value = normalized.updatedAt || new Date().toISOString();
  };

  const ingestRunEvent = (eventPayload = {}) => {
    if (!eventPayload || typeof eventPayload !== "object") {
      return false;
    }

    if (String(eventPayload.type || "") !== "queue.updated") {
      return false;
    }

    const queuePayload = eventPayload?.payload?.queue;
    if (!queuePayload || typeof queuePayload !== "object") {
      return false;
    }

    setQueueData(queuePayload);
    return true;
  };

  const refreshQueue = async () => {
    loading.value = true;
    error.value = "";

    try {
      const result = await workflowQueueGet();
      if (!result?.success) {
        error.value = result?.error || "队列读取失败";
        return result;
      }

      setQueueData(result.data || {});
      return result;
    } catch (err) {
      error.value = err?.message || "队列读取失败";
      return {
        success: false,
        error: error.value,
      };
    } finally {
      loading.value = false;
    }
  };

  const runFront = async (payload = {}) => {
    const result = await workflowQueueRunFront(payload);
    if (result?.success) {
      await refreshQueue();
    }
    return result;
  };

  const clearPending = async () => {
    const result = await workflowQueueClearPending();
    if (result?.success) {
      await refreshQueue();
    }
    return result;
  };

  return {
    pending,
    running,
    history,
    loading,
    error,
    lastUpdatedAt,
    setQueueData,
    ingestRunEvent,
    refreshQueue,
    runFront,
    clearPending,
  };
});

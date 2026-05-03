const MAX_HISTORY = 180;

const pendingRuns = [];
const runningRuns = new Map();
const historyRuns = [];

let processScheduled = false;
let processHandler = null;
let lastUpdatedAt = "";

const touchQueue = () => {
  lastUpdatedAt = new Date().toISOString();
};

const cloneValue = (value, fallbackValue) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallbackValue;
  }
};

const toSummary = (entry = {}) => ({
  runId: entry.runId,
  workflowId: entry.workflowId || "",
  workflowName: entry.workflowName || "",
  status: entry.status || "pending",
  requestedAt: entry.requestedAt || "",
  startedAt: entry.startedAt || null,
  endedAt: entry.endedAt || null,
  mode: entry.mode || "enqueue",
  error: entry.error || null,
});

const scheduleProcess = () => {
  if (processScheduled || typeof processHandler !== "function") {
    return;
  }

  processScheduled = true;
  Promise.resolve()
    .then(() => processHandler())
    .catch(() => {
      // 队列处理异常由上层日志记录，这里仅避免未处理拒绝阻断调度循环
    })
    .finally(() => {
      processScheduled = false;
      if (pendingRuns.length > 0 && runningRuns.size === 0) {
        scheduleProcess();
      }
    });
};

const pushHistory = (entry = {}) => {
  historyRuns.unshift(toSummary(entry));
  if (historyRuns.length > MAX_HISTORY) {
    historyRuns.splice(MAX_HISTORY);
  }
};

export const registerRunQueueProcessor = (handler) => {
  processHandler = typeof handler === "function" ? handler : null;
  scheduleProcess();
};

export const enqueueRun = (entry = {}, { front = false } = {}) => {
  const normalized = {
    ...entry,
    status: "pending",
    requestedAt: entry.requestedAt || new Date().toISOString(),
  };

  if (front) {
    pendingRuns.unshift(normalized);
  } else {
    pendingRuns.push(normalized);
  }

  touchQueue();
  scheduleProcess();
  return toSummary(normalized);
};

export const shiftPendingRun = () => {
  const next = pendingRuns.shift() || null;
  if (next) {
    touchQueue();
  }
  return next;
};

export const markRunRunning = (entry = {}) => {
  if (!entry?.runId) {
    return;
  }

  const summary = {
    ...entry,
    status: "running",
    startedAt: entry.startedAt || new Date().toISOString(),
  };
  runningRuns.set(entry.runId, summary);
  touchQueue();
};

export const markRunSettled = (runId, patch = {}) => {
  const current = runningRuns.get(runId);
  if (!current) {
    return;
  }

  const settled = {
    ...current,
    ...patch,
    status: patch.status || current.status || "success",
    endedAt: patch.endedAt || new Date().toISOString(),
  };

  runningRuns.delete(runId);
  pushHistory(settled);
  touchQueue();
  scheduleProcess();
};

export const markPendingRejected = (entry = {}, patch = {}) => {
  const rejected = {
    ...entry,
    ...patch,
    status: patch.status || "rejected",
    endedAt: patch.endedAt || new Date().toISOString(),
  };
  pushHistory(rejected);
  touchQueue();
};

export const cancelPendingRun = (runId) => {
  const targetId = typeof runId === "string" ? runId.trim() : "";
  if (!targetId) {
    return false;
  }

  const index = pendingRuns.findIndex((item) => item?.runId === targetId);
  if (index < 0) {
    return false;
  }

  const [removed] = pendingRuns.splice(index, 1);
  pushHistory({
    ...removed,
    status: "cancelled",
    endedAt: new Date().toISOString(),
  });
  touchQueue();
  scheduleProcess();
  return true;
};

export const clearPendingRuns = () => {
  const clearedCount = pendingRuns.length;
  if (clearedCount === 0) {
    return 0;
  }

  const now = new Date().toISOString();
  pendingRuns.splice(0).forEach((entry) => {
    pushHistory({
      ...entry,
      status: "cancelled",
      endedAt: now,
    });
  });
  touchQueue();
  return clearedCount;
};

export const getPendingRunSnapshot = (runId) => {
  const targetId = typeof runId === "string" ? runId.trim() : "";
  if (!targetId) {
    return null;
  }
  const pending = pendingRuns.find((item) => item?.runId === targetId);
  if (!pending) {
    return null;
  }
  return {
    runId: pending.runId,
    workflowId: pending.workflowId || "",
    workflowName: pending.workflowName || "",
    status: "pending",
    startedAt: pending.requestedAt || null,
    endedAt: null,
    summary: null,
    nodeStates: {},
    runtime: pending.runtime || {},
    error: null,
    validation: pending.validation || null,
    eventCount: 0,
    workflowLogs: [],
    pipelineLogs: [],
    nodeLogs: {},
    queue: {
      mode: pending.mode || "enqueue",
      pending: true,
    },
  };
};

export const getRunQueueState = () => ({
  pending: pendingRuns.map((item) => cloneValue(toSummary(item), {})),
  running: [...runningRuns.values()].map((item) => cloneValue(toSummary(item), {})),
  history: historyRuns.map((item) => cloneValue(item, {})),
  updatedAt: lastUpdatedAt || new Date().toISOString(),
});

export const hasRunningQueueItem = () => runningRuns.size > 0;

export const listPendingRuns = () => pendingRuns.map((item) => cloneValue(toSummary(item), {}));

export const listRunningRuns = () =>
  [...runningRuns.values()].map((item) => cloneValue(toSummary(item), {}));

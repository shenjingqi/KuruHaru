const MAX_MEMORY_RUNS = 120;
const MAX_WORKFLOW_LOGS = 1600;
const MAX_PIPELINE_LOGS = 1200;
const MAX_NODE_LOGS_PER_NODE = 900;
const MAX_NODE_LOG_BUCKETS = 500;

const runStateMap = new Map();

const cloneJsonValue = (value, fallbackValue) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallbackValue;
  }
};

const pickRunSnapshot = (entry, { includeLogs = true } = {}) => {
  if (!entry) {
    return null;
  }

  const snapshot = {
    runId: entry.runId,
    workflowId: entry.workflowId,
    workflowName: entry.workflowName,
    status: entry.status,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt || null,
    summary: entry.summary || null,
    nodeStates: entry.nodeStates || {},
    runtime: entry.runtime || {},
    error: entry.error || null,
    validation: entry.validation || null,
    eventCount: Number.parseInt(entry.eventCount, 10) || 0,
    logStats: {
      workflow: Array.isArray(entry.workflowLogs)
        ? entry.workflowLogs.length
        : 0,
      pipeline: Array.isArray(entry.pipelineLogs)
        ? entry.pipelineLogs.length
        : 0,
      node: Object.values(entry.nodeLogs || {}).reduce(
        (acc, list) => acc + (Array.isArray(list) ? list.length : 0),
        0,
      ),
      nodeBuckets: Object.keys(entry.nodeLogs || {}).length,
    },
  };

  if (includeLogs) {
    snapshot.workflowLogs = Array.isArray(entry.workflowLogs)
      ? entry.workflowLogs
      : [];
    snapshot.pipelineLogs = Array.isArray(entry.pipelineLogs)
      ? entry.pipelineLogs
      : [];
    snapshot.nodeLogs =
      entry.nodeLogs && typeof entry.nodeLogs === "object"
        ? entry.nodeLogs
        : {};
  }

  return cloneJsonValue(snapshot, null);
};

const appendCapped = (targetList, item, maxCount) => {
  if (!Array.isArray(targetList)) {
    return;
  }

  targetList.push(item);
  if (targetList.length <= maxCount) {
    return;
  }

  targetList.splice(0, targetList.length - maxCount);
};

const resolveEventScope = (rawEvent = {}) => {
  const preferred =
    typeof rawEvent.scope === "string" ? rawEvent.scope.trim() : "";
  if (
    preferred === "pipeline" ||
    preferred === "workflow" ||
    preferred === "node"
  ) {
    return preferred;
  }

  const eventType =
    typeof rawEvent.type === "string" ? rawEvent.type.trim() : "";
  if (eventType.startsWith("pipeline.")) {
    return "pipeline";
  }
  if (eventType.startsWith("node.")) {
    return "node";
  }
  return "workflow";
};

const pruneNodeLogBuckets = (runState) => {
  const nodeLogs = runState?.nodeLogs;
  if (!nodeLogs || typeof nodeLogs !== "object") {
    return;
  }

  const nodeIds = Object.keys(nodeLogs);
  if (nodeIds.length <= MAX_NODE_LOG_BUCKETS) {
    return;
  }

  nodeIds
    .map((nodeId) => {
      const logs = Array.isArray(nodeLogs[nodeId]) ? nodeLogs[nodeId] : [];
      const lastTs = String(logs[logs.length - 1]?.ts || "");
      return { nodeId, lastTs };
    })
    .sort((left, right) => left.lastTs.localeCompare(right.lastTs))
    .slice(0, nodeIds.length - MAX_NODE_LOG_BUCKETS)
    .forEach((item) => {
      delete nodeLogs[item.nodeId];
    });
};

const pruneRunStates = () => {
  const entries = [...runStateMap.values()];
  if (entries.length <= MAX_MEMORY_RUNS) {
    return;
  }

  const removable = entries
    .filter(
      (entry) => entry.status !== "running" && entry.status !== "cancelling",
    )
    .sort((left, right) =>
      String(left.endedAt || left.startedAt).localeCompare(
        String(right.endedAt || right.startedAt),
      ),
    );

  while (runStateMap.size > MAX_MEMORY_RUNS && removable.length > 0) {
    const candidate = removable.shift();
    if (candidate?.runId) {
      runStateMap.delete(candidate.runId);
    }
  }
};

export const hasRunningRun = () => {
  for (const entry of runStateMap.values()) {
    if (entry.status === "running" || entry.status === "cancelling") {
      return true;
    }
  }
  return false;
};

export const createRunningRunState = (payload) => {
  const next = {
    runId: payload.runId,
    workflowId: payload.workflowId,
    workflowName: payload.workflowName || "",
    status: "running",
    startedAt: payload.startedAt,
    endedAt: null,
    summary: null,
    nodeStates: {},
    runtime: payload.runtime || {},
    error: null,
    validation: payload.validation || null,
    eventCount: 0,
    pipelineLogs: [],
    workflowLogs: [],
    nodeLogs: {},
    abortController: null,
    promise: null,
  };

  runStateMap.set(next.runId, next);
  return pickRunSnapshot(next);
};

export const setRunAbortController = (runId, abortController) => {
  const runState = runStateMap.get(runId);
  if (!runState) {
    return false;
  }
  runState.abortController = abortController;
  return true;
};

export const setRunPromise = (runId, promise) => {
  const runState = runStateMap.get(runId);
  if (!runState) {
    return false;
  }
  runState.promise = promise;
  return true;
};

export const updateRunNodeState = (runId, nodeId, patch) => {
  const runState = runStateMap.get(runId);
  if (!runState) {
    return false;
  }

  const prevNodeState = runState.nodeStates[nodeId] || {};
  runState.nodeStates[nodeId] = {
    ...prevNodeState,
    ...patch,
  };

  return true;
};

export const appendRunEvent = (runId, rawEvent = {}) => {
  const runState = runStateMap.get(runId);
  if (!runState) {
    return false;
  }

  const event = {
    ...rawEvent,
    runId,
    ts:
      typeof rawEvent.ts === "string" && rawEvent.ts.trim()
        ? rawEvent.ts
        : new Date().toISOString(),
    scope: resolveEventScope(rawEvent),
    nodeId:
      typeof rawEvent.nodeId === "string" && rawEvent.nodeId.trim()
        ? rawEvent.nodeId.trim()
        : null,
  };

  runState.eventCount = (Number.parseInt(runState.eventCount, 10) || 0) + 1;

  if (event.scope === "pipeline") {
    appendCapped(runState.pipelineLogs, event, MAX_PIPELINE_LOGS);
    return true;
  }

  if (event.scope === "node" && event.nodeId) {
    if (!Array.isArray(runState.nodeLogs[event.nodeId])) {
      runState.nodeLogs[event.nodeId] = [];
    }
    appendCapped(
      runState.nodeLogs[event.nodeId],
      event,
      MAX_NODE_LOGS_PER_NODE,
    );
    pruneNodeLogBuckets(runState);
    return true;
  }

  appendCapped(runState.workflowLogs, event, MAX_WORKFLOW_LOGS);
  return true;
};

export const markRunCancelling = (runId) => {
  const runState = runStateMap.get(runId);
  if (!runState) {
    return false;
  }

  if (runState.status === "running") {
    runState.status = "cancelling";
  }
  return true;
};

export const markRunFinished = (runId, patch) => {
  const runState = runStateMap.get(runId);
  if (!runState) {
    return null;
  }

  Object.assign(runState, {
    ...patch,
    endedAt: patch?.endedAt || new Date().toISOString(),
  });
  runState.abortController = null;
  runState.promise = null;

  pruneRunStates();
  return pickRunSnapshot(runState, { includeLogs: true });
};

export const cancelRunningRun = (runId) => {
  const runState = runStateMap.get(runId);
  if (!runState) {
    return false;
  }

  if (runState.status !== "running" && runState.status !== "cancelling") {
    return false;
  }

  markRunCancelling(runId);

  if (
    runState.abortController &&
    typeof runState.abortController.abort === "function"
  ) {
    runState.abortController.abort();
  }

  return true;
};

export const getRunSnapshot = (runId) => {
  return pickRunSnapshot(runStateMap.get(runId), { includeLogs: true });
};

export const listRunSnapshots = (limit = 50) => {
  const list = [...runStateMap.values()]
    .map((entry) => pickRunSnapshot(entry, { includeLogs: false }))
    .filter(Boolean)
    .sort((left, right) =>
      String(right.startedAt).localeCompare(String(left.startedAt)),
    );

  return list.slice(0, Math.max(1, limit));
};

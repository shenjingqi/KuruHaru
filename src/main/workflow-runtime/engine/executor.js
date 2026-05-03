import { createLogSender } from "../../utils/logger";
import { normalizeWorkflowRuntimeConfig } from "../contracts/workflow-schema";
import { validateWorkflowGraph } from "./graph-validator";
import {
  appendRunEvent,
  createRunningRunState,
  hasRunningRun,
  markRunFinished,
  setRunAbortController,
  setRunPromise,
  updateRunNodeState,
} from "./run-store";

const logger = createLogSender("workflow-runtime");

const RUN_EVENT_TYPE = {
  RUN_STARTED: "run.started",
  RUN_SUCCESS: "run.success",
  RUN_FAILED: "run.failed",
  RUN_CANCELLED: "run.cancelled",
  NODE_STARTED: "node.started",
  NODE_SUCCESS: "node.success",
  NODE_FAILED: "node.failed",
  NODE_LOG: "node.log",
};

const CANCELLED_ERROR_CODE = "WORKFLOW_CANCELLED";

const cloneJsonValue = (value, fallbackValue = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallbackValue;
  }
};

const makeNodeRunId = (runId, nodeId, attempt = 1) => {
  const safeAttempt = Number.parseInt(attempt, 10) || 1;
  return `${runId}:${nodeId}:attempt-${safeAttempt}`;
};

const makeErrorPayload = (error) => ({
  code:
    typeof error?.code === "string" && error.code.trim()
      ? error.code
      : "WORKFLOW_EXECUTION_ERROR",
  message: error?.message || String(error || "Unknown error"),
});

const toDurationMs = (startedAt, endedAt = new Date().toISOString()) => {
  const startTs = Date.parse(startedAt || "");
  const endTs = Date.parse(endedAt || "");
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
    return null;
  }
  return Math.max(0, endTs - startTs);
};

const makeOutputPreview = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (value.length <= 200) {
      return value;
    }
    return `${value.slice(0, 200)}...`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return {
      type: "array",
      length: value.length,
      sample: value.slice(0, 3),
    };
  }

  if (typeof value === "object") {
    const keys = Object.keys(value);
    const preview = {};
    keys.slice(0, 6).forEach((key) => {
      preview[key] = value[key];
    });

    return {
      type: "object",
      keys,
      preview,
    };
  }

  return String(value);
};

const createInputBundle = (nodeId, incomingEdgeMap, outputMap) => {
  const incomingEdges = incomingEdgeMap.get(nodeId) || [];
  const inputValues = incomingEdges.map((edge) => outputMap.get(edge.source));
  const inputMap = {};

  incomingEdges.forEach((edge, index) => {
    const outputValue = outputMap.get(edge.source);
    inputMap[edge.source] = outputValue;
    inputMap[edge.sourcePort || `source_${index}`] = outputValue;
  });

  return { incomingEdges, inputValues, inputMap };
};

const makeInputPreview = ({ inputValues, inputMap }) => {
  const values = Array.isArray(inputValues) ? inputValues : [];
  const map = inputMap && typeof inputMap === "object" ? inputMap : {};
  const fromNodes = Object.keys(map).filter((key) => key.startsWith("node-"));

  return {
    inputCount: values.length,
    fromNodes,
    sample: makeOutputPreview(values.length <= 1 ? values[0] : values),
  };
};

const resolveRunEventScope = ({ scope, type, nodeId }) => {
  if (scope === "pipeline" || scope === "workflow" || scope === "node") {
    return scope;
  }

  const eventType = typeof type === "string" ? type : "";
  if (eventType.startsWith("pipeline.")) {
    return "pipeline";
  }
  if (eventType.startsWith("node.")) {
    return "node";
  }
  if (nodeId) {
    return "node";
  }
  return "workflow";
};

const emitWorkflowEvent = ({
  runId,
  workflowId,
  nodeId,
  type,
  scope,
  payload,
  emit,
}) => {
  const nodeRunId =
    payload?.nodeRunId ||
    (nodeId ? makeNodeRunId(runId, nodeId, payload?.attempt || 1) : null);

  const event = {
    traceId: runId,
    workflowRunId: runId,
    nodeRunId,
    runId,
    workflowId,
    nodeId: nodeId || null,
    type,
    scope: resolveRunEventScope({ scope, type, nodeId }),
    ts: new Date().toISOString(),
    payload: payload || {},
  };

  appendRunEvent(runId, event);
  emit(event);
};

const ensureRunNotCancelled = (signal) => {
  if (signal?.aborted) {
    const error = new Error("工作流已取消");
    error.code = CANCELLED_ERROR_CODE;
    throw error;
  }
};

const makeSummary = (nodeStates) => {
  const states = Object.values(nodeStates || {});
  return {
    totalNodes: states.length,
    successNodes: states.filter((state) => state.status === "success").length,
    failedNodes: states.filter((state) => state.status === "failed").length,
    skippedNodes: states.filter((state) => state.status === "skipped").length,
  };
};

const buildOutgoingEdgeMap = (edges = [], nodeMap = new Map()) => {
  const outgoingEdgeMap = new Map();

  edges.forEach((edge) => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      return;
    }
    if (!outgoingEdgeMap.has(edge.source)) {
      outgoingEdgeMap.set(edge.source, []);
    }
    outgoingEdgeMap.get(edge.source).push(edge);
  });

  return outgoingEdgeMap;
};

const buildInputMapFromEdge = (edge, payload) => {
  if (!edge || !edge.source) {
    return {};
  }

  const inputMap = {
    [edge.source]: payload,
  };
  if (edge.sourcePort) {
    inputMap[edge.sourcePort] = payload;
  }
  if (edge.targetPort) {
    inputMap[edge.targetPort] = payload;
  }
  return inputMap;
};

const ensureSingleDispatchSupported = (runtime, validation) => {
  if (runtime.dispatchMode !== "single") {
    return;
  }

  const blockedNodeIds = validation.order.filter((nodeId) => {
    const incomingEdges = validation.incomingEdgeMap.get(nodeId) || [];
    return incomingEdges.length > 1;
  });

  if (!blockedNodeIds.length) {
    return;
  }

  throw new Error(`???????????????: ${blockedNodeIds.join(", ")}`);
};

const executeNodeInvocation = async ({
  runId,
  workflow,
  node,
  nodeRegistry,
  abortController,
  emit,
  syncNodeState,
  inputValues = [],
  inputMap = {},
  attemptMap,
  onItem = null,
}) => {
  ensureRunNotCancelled(abortController.signal);

  const nodeAttempt = (attemptMap.get(node.id) || 0) + 1;
  attemptMap.set(node.id, nodeAttempt);

  const nodeStartAt = new Date().toISOString();
  const nodeRunId = makeNodeRunId(runId, node.id, nodeAttempt);
  const inputPreview = makeInputPreview({ inputValues, inputMap });
  const configSnapshot = cloneJsonValue(node.config || {}, {});

  syncNodeState(node.id, {
    nodeId: node.id,
    nodeRunId,
    attempt: nodeAttempt,
    type: node.type,
    label: node.label,
    status: "running",
    startedAt: nodeStartAt,
    configSnapshot,
    inputPreview,
  });

  emitWorkflowEvent({
    runId,
    workflowId: workflow.id,
    nodeId: node.id,
    type: RUN_EVENT_TYPE.NODE_STARTED,
    scope: "node",
    payload: {
      message: `?????? ${node.label || node.id}`,
      nodeType: node.type,
      nodeLabel: node.label,
      nodeRunId,
      attempt: nodeAttempt,
      inputPreview,
      configSnapshot,
    },
    emit,
  });

  let emittedItemCount = 0;
  const emitItem =
    typeof onItem === "function"
      ? async (itemOutput) => {
          emittedItemCount += 1;
          await onItem(itemOutput);
        }
      : undefined;

  try {
    const nodeDefinition = nodeRegistry.get(node.type);
    if (!nodeDefinition || typeof nodeDefinition.execute !== "function") {
      throw new Error(`???????: ${node.type}`);
    }

    emitWorkflowEvent({
      runId,
      workflowId: workflow.id,
      nodeId: node.id,
      type: RUN_EVENT_TYPE.NODE_LOG,
      scope: "node",
      payload: {
        nodeRunId,
        attempt: nodeAttempt,
        message: `???? ${node.label || node.id} (${node.type})`,
      },
      emit,
    });

    const output = await nodeDefinition.execute({
      node,
      config: node.config || {},
      inputValues,
      inputMap,
      signal: abortController.signal,
      context: {
        traceId: runId,
        runId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: node.label,
        nodeRunId,
        attempt: nodeAttempt,
      },
      emit: (payload) =>
        emitWorkflowEvent({
          runId,
          workflowId: workflow.id,
          nodeId: node.id,
          type: RUN_EVENT_TYPE.NODE_LOG,
          scope: "node",
          payload:
            payload && typeof payload === "object"
              ? {
                  nodeRunId,
                  attempt: nodeAttempt,
                  ...payload,
                }
              : {
                  nodeRunId,
                  attempt: nodeAttempt,
                  message: String(payload || ""),
                },
          emit,
        }),
      emitItem,
    });

    ensureRunNotCancelled(abortController.signal);

    const outputPreview = makeOutputPreview(output);
    const endedAt = new Date().toISOString();

    syncNodeState(node.id, {
      status: "success",
      endedAt,
      durationMs: toDurationMs(nodeStartAt, endedAt),
      outputPreview,
    });

    emitWorkflowEvent({
      runId,
      workflowId: workflow.id,
      nodeId: node.id,
      type: RUN_EVENT_TYPE.NODE_SUCCESS,
      scope: "node",
      payload: {
        message: `?? ${node.label || node.id} ????`,
        nodeRunId,
        attempt: nodeAttempt,
        outputPreview,
      },
      emit,
    });

    return { output, emittedItemCount };
  } catch (error) {
    const normalizedError = makeErrorPayload(error);
    const endedAt = new Date().toISOString();
    syncNodeState(node.id, {
      status: "failed",
      endedAt,
      durationMs: toDurationMs(nodeStartAt, endedAt),
      error: normalizedError,
    });

    emitWorkflowEvent({
      runId,
      workflowId: workflow.id,
      nodeId: node.id,
      type: RUN_EVENT_TYPE.NODE_FAILED,
      scope: "node",
      payload: {
        ...normalizedError,
        message: normalizedError.message,
        nodeRunId,
        attempt: nodeAttempt,
      },
      emit,
    });

    throw error;
  }
};

const executeRun = async ({
  runId,
  workflow,
  validation,
  nodeRegistry,
  emit,
}) => {
  const runtime = normalizeWorkflowRuntimeConfig(workflow.runtime);
  ensureSingleDispatchSupported(runtime, validation);
  const abortController = new AbortController();
  setRunAbortController(runId, abortController);

  const outputMap = new Map();
  const nodeStates = {};
  const attemptMap = new Map();
  const startedAt = new Date().toISOString();
  const validEdges = (workflow.graph.edges || []).filter(
    (edge) =>
      validation.nodeMap.has(edge.source) &&
      validation.nodeMap.has(edge.target),
  );
  const outgoingEdgeMap = buildOutgoingEdgeMap(validEdges, validation.nodeMap);
  const syncNodeState = (nodeId, patch) => {
    nodeStates[nodeId] = {
      ...(nodeStates[nodeId] || {}),
      ...patch,
    };
    updateRunNodeState(runId, nodeId, nodeStates[nodeId]);
  };

  emitWorkflowEvent({
    runId,
    workflowId: workflow.id,
    type: RUN_EVENT_TYPE.RUN_STARTED,
    scope: "workflow",
    payload: {
      message: `??? ${workflow.name || workflow.id} ???`,
      workflowName: workflow.name,
      runtime,
      nodeCount: workflow.graph.nodes.length,
      edgeCount: workflow.graph.edges.length,
    },
    emit,
  });

  const runSingleDispatchNode = async (
    nodeId,
    payload = undefined,
    edge = null,
  ) => {
    ensureRunNotCancelled(abortController.signal);

    const node = validation.nodeMap.get(nodeId);
    if (!node) {
      return;
    }

    const propagateOutput = async (nodeOutput) => {
      outputMap.set(node.id, nodeOutput);
      const outgoingEdges = outgoingEdgeMap.get(node.id) || [];
      for (const outgoingEdge of outgoingEdges) {
        await runSingleDispatchNode(
          outgoingEdge.target,
          nodeOutput,
          outgoingEdge,
        );
      }
    };

    const inputValues = payload === undefined ? [] : [payload];
    const inputMap =
      payload === undefined ? {} : buildInputMapFromEdge(edge, payload);

    try {
      const { output, emittedItemCount } = await executeNodeInvocation({
        runId,
        workflow,
        node,
        nodeRegistry,
        abortController,
        emit,
        syncNodeState,
        inputValues,
        inputMap,
        attemptMap,
        onItem:
          runtime.dispatchMode === "single"
            ? async (itemOutput) => {
                await propagateOutput(itemOutput);
              }
            : null,
      });

      if (emittedItemCount === 0) {
        await propagateOutput(output);
      }
    } catch (error) {
      const normalizedError = makeErrorPayload(error);
      if (
        normalizedError.code === CANCELLED_ERROR_CODE ||
        runtime.failFast !== false
      ) {
        throw error;
      }
    }
  };

  try {
    if (runtime.dispatchMode === "single") {
      const sourceNodeIds = validation.order.filter((nodeId) => {
        const incomingEdges = validation.incomingEdgeMap.get(nodeId) || [];
        return incomingEdges.length === 0;
      });

      for (const nodeId of sourceNodeIds) {
        await runSingleDispatchNode(nodeId);
      }
    } else {
      for (const nodeId of validation.order) {
        ensureRunNotCancelled(abortController.signal);

        const node = validation.nodeMap.get(nodeId);
        if (!node) {
          continue;
        }

        const { inputValues, inputMap } = createInputBundle(
          node.id,
          validation.incomingEdgeMap,
          outputMap,
        );

        try {
          const { output } = await executeNodeInvocation({
            runId,
            workflow,
            node,
            nodeRegistry,
            abortController,
            emit,
            syncNodeState,
            inputValues,
            inputMap,
            attemptMap,
          });

          outputMap.set(node.id, output);
        } catch (error) {
          const normalizedError = makeErrorPayload(error);
          if (
            normalizedError.code === CANCELLED_ERROR_CODE ||
            runtime.failFast !== false
          ) {
            throw error;
          }
        }
      }
    }

    const finishedAt = new Date().toISOString();
    const summary = makeSummary(nodeStates);
    const finalRecord = markRunFinished(runId, {
      status: "success",
      startedAt,
      endedAt: finishedAt,
      nodeStates,
      summary,
      runtime,
      workflowSnapshot: cloneJsonValue(workflow, {}),
    });

    emitWorkflowEvent({
      runId,
      workflowId: workflow.id,
      type: RUN_EVENT_TYPE.RUN_SUCCESS,
      scope: "workflow",
      payload: {
        message: "???????",
        summary,
      },
      emit,
    });

    return finalRecord;
  } catch (error) {
    const normalizedError = makeErrorPayload(error);
    const isCancelled = normalizedError.code === CANCELLED_ERROR_CODE;
    const finalStatus = isCancelled ? "cancelled" : "failed";
    const summary = makeSummary(nodeStates);
    const finalRecord = markRunFinished(runId, {
      status: finalStatus,
      startedAt,
      endedAt: new Date().toISOString(),
      nodeStates,
      summary,
      runtime,
      workflowSnapshot: cloneJsonValue(workflow, {}),
      error: normalizedError,
    });

    emitWorkflowEvent({
      runId,
      workflowId: workflow.id,
      type: isCancelled
        ? RUN_EVENT_TYPE.RUN_CANCELLED
        : RUN_EVENT_TYPE.RUN_FAILED,
      scope: "workflow",
      payload: {
        message: normalizedError.message,
        ...normalizedError,
        summary,
      },
      emit,
    });

    return finalRecord;
  }
};

export const startWorkflowExecution = ({
  runId,
  workflow,
  nodeRegistry,
  emit,
  onSettled,
}) => {
  const validation = validateWorkflowGraph({ workflow, nodeRegistry });
  if (!validation.ok) {
    return {
      accepted: false,
      code: "WORKFLOW_INVALID",
      message: "工作流校验失败",
      validation,
    };
  }

  if (hasRunningRun()) {
    return {
      accepted: false,
      code: "WORKFLOW_BUSY",
      message: "当前已有运行中的工作流，暂不支持并行执行",
      validation,
    };
  }

  const startedAt = new Date().toISOString();
  createRunningRunState({
    runId,
    workflowId: workflow.id,
    workflowName: workflow.name,
    startedAt,
    runtime: normalizeWorkflowRuntimeConfig(workflow.runtime),
    workflowSnapshot: cloneJsonValue(workflow, {}),
    validation: {
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
    },
  });

  const executionPromise = executeRun({
    runId,
    workflow,
    validation,
    nodeRegistry,
    emit,
  })
    .then(async (runRecord) => {
      if (typeof onSettled === "function") {
        await onSettled(runRecord);
      }
      return runRecord;
    })
    .catch((error) => {
      logger.error(`[workflow] run=${runId} 执行异常`, error?.message || error);
      throw error;
    });

  setRunPromise(runId, executionPromise);

  return {
    accepted: true,
    runId,
    validation: {
      ok: validation.ok,
      errors: validation.errors,
      warnings: validation.warnings,
    },
  };
};

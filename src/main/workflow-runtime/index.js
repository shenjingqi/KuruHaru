import { BrowserWindow, ipcMain } from "electron";
import { createLogSender } from "../utils/logger";
import { normalizeWorkflowDefinition } from "./contracts/workflow-schema";
import { validateWorkflowGraph } from "./engine/graph-validator";
import {
  cancelRunningRun,
  getRunSnapshot,
  hasRunningRun,
  listRunSnapshots,
} from "./engine/run-store";
import {
  cancelPendingRun,
  clearPendingRuns,
  enqueueRun,
  getPendingRunSnapshot,
  getRunQueueState,
  hasRunningQueueItem,
  listPendingRuns,
  listRunningRuns,
  markRunRunning,
  markRunSettled,
  registerRunQueueProcessor,
  shiftPendingRun,
} from "./engine/run-queue";
import { startWorkflowExecution } from "./engine/executor";
import { startPublishGuardianDaemon } from "./engine/publish-guardian";
import {
  buildPartialWorkflowDocument,
  buildRecoveryReport,
  getWorkflowNodeDocs,
  listWorkflowCatalogCategories,
  listWorkflowCatalogEntries,
  listWorkflowTemplates,
  loadWorkflowTemplateDocument,
  normalizeRunSession,
} from "./core/workflow-shell";
import {
  getWorkflowNodeRegistry,
  getWorkflowObjectInfo,
  listWorkflowNodeDefinitions,
} from "./registry/node-registry";
import {
  createRunId,
  deleteWorkflowDefinition,
  ensureWorkflowStorageDirs,
  listRunRecords,
  listWorkflowDefinitions,
  readRunRecordById,
  readWorkflowDefinitionById,
  saveRunRecord,
  saveWorkflowDefinition,
} from "./storage";

const logger = createLogSender("workflow-runtime");

const IPC_CHANNELS = {
  list: "workflow-list",
  get: "workflow-get",
  save: "workflow-save",
  remove: "workflow-delete",
  validate: "workflow-validate",
  run: "workflow-run",
  runFront: "workflow-queue-run-front",
  queueGet: "workflow-queue-get",
  queueClearPending: "workflow-queue-clear-pending",
  cancel: "workflow-cancel",
  getRun: "workflow-get-run",
  listRuns: "workflow-list-runs",
  getObjectInfo: "workflow-get-object-info",
  listNodeDefinitions: "workflow-list-node-definitions",
  bootstrap: "workflow-bootstrap",
  templateList: "workflow-template-list",
  templateLoad: "workflow-template-load",
  documentGet: "workflow-document-get",
  documentSave: "workflow-document-save",
  catalogGet: "workflow-catalog-get",
  nodeDocsGet: "workflow-node-docs-get",
  enqueue: "workflow-enqueue",
  partialEnqueue: "workflow-partial-enqueue",
  runGetV2: "workflow-run-get",
  runListV2: "workflow-run-list",
  recoveryReportGet: "workflow-recovery-report-get",
  runEvent: "workflow-run-event",
};

const removeHandlerSafely = (channel) => {
  try {
    ipcMain.removeHandler(channel);
  } catch {
    // handler 不存在时忽略
  }
};

const resolveRunSortTime = (run) =>
  String(run?.endedAt || run?.startedAt || run?.requestedAt || "");

const mergeRunLists = ({ memoryRuns, storedRuns, limit = 50 }) => {
  const mergedMap = new Map();
  [...memoryRuns, ...storedRuns].forEach((run) => {
    if (!run || typeof run !== "object" || !run.runId) {
      return;
    }
    if (!mergedMap.has(run.runId)) {
      mergedMap.set(run.runId, run);
      return;
    }

    const current = mergedMap.get(run.runId);
    const currentTime = resolveRunSortTime(current);
    const nextTime = resolveRunSortTime(run);
    if (nextTime > currentTime) {
      mergedMap.set(run.runId, run);
    }
  });

  return [...mergedMap.values()]
    .sort((left, right) =>
      resolveRunSortTime(right).localeCompare(resolveRunSortTime(left)),
    )
    .slice(0, Math.max(1, limit));
};

const resolveWorkflowFromPayload = (payload) => {
  const requestPayload =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};

  if (requestPayload.workflow && typeof requestPayload.workflow === "object") {
    return normalizeWorkflowDefinition(requestPayload.workflow);
  }

  const workflowId =
    typeof requestPayload.workflowId === "string"
      ? requestPayload.workflowId.trim()
      : "";
  if (!workflowId) {
    return null;
  }

  return readWorkflowDefinitionById(workflowId);
};

const toValidationPayload = (validation) =>
  validation && typeof validation === "object"
    ? {
        ok: validation.ok,
        errors: validation.errors || [],
        warnings: validation.warnings || [],
      }
    : undefined;

const buildQueueHistory = ({ queueSnapshot, mergedRuns, limit = 80 }) => {
  const pendingIds = new Set(
    (queueSnapshot.pending || []).map((item) => item.runId),
  );
  const runningIds = new Set(
    (queueSnapshot.running || []).map((item) => item.runId),
  );

  const map = new Map();
  [...(queueSnapshot.history || []), ...mergedRuns]
    .filter((item) => item?.runId)
    .forEach((item) => {
      if (pendingIds.has(item.runId) || runningIds.has(item.runId)) {
        return;
      }
      if (!map.has(item.runId)) {
        map.set(item.runId, item);
      }
    });

  return [...map.values()]
    .sort((left, right) => {
      const leftTime = String(
        left.endedAt || left.startedAt || left.requestedAt || "",
      );
      const rightTime = String(
        right.endedAt || right.startedAt || right.requestedAt || "",
      );
      return rightTime.localeCompare(leftTime);
    })
    .slice(0, Math.max(1, limit));
};

const buildNormalizedQueuePayload = async ({ limit = 100 } = {}) => {
  const queueSnapshot = getRunQueueState();
  const memoryRuns = listRunSnapshots(limit);
  const storedRuns = await listRunRecords(limit);
  const mergedRuns = mergeRunLists({
    memoryRuns,
    storedRuns,
    limit,
  });

  return {
    pending: (queueSnapshot.pending || []).map((item) => normalizeRunSession(item)),
    running: (queueSnapshot.running || []).map((item) => normalizeRunSession(item)),
    history: buildQueueHistory({ queueSnapshot, mergedRuns, limit }).map((item) =>
      normalizeRunSession(item),
    ),
    updatedAt: queueSnapshot.updatedAt || null,
  };
};

const readAnyRunRecordById = async (runId) => {
  const pendingRun = getPendingRunSnapshot(runId);
  if (pendingRun) {
    return pendingRun;
  }

  const memoryRun = getRunSnapshot(runId);
  if (memoryRun) {
    return memoryRun;
  }

  return readRunRecordById(runId);
};

const buildWorkflowBootstrapPayload = async () => {
  const templates = listWorkflowTemplates();
  const catalogEntries = listWorkflowCatalogEntries();
  const queue = await buildNormalizedQueuePayload();
  const recentDocuments = await listWorkflowDefinitions();

  return {
    templates,
    recentDocuments,
    runtimeSummary: {
      queue,
      pendingCount: queue.pending.length,
      runningCount: queue.running.length,
      historyCount: queue.history.length,
    },
    catalogSummary: {
      total: catalogEntries.length,
      categories: listWorkflowCatalogCategories(catalogEntries),
    },
    featureFlags: {
      partialExecution: true,
      subgraph: false,
      singleLayerOnly: true,
      runtimeDockEmbedded: true,
    },
  };
};

const broadcastWorkflowRunEvent = (eventPayload) => {
  if (!eventPayload || typeof eventPayload !== "object") {
    return;
  }

  BrowserWindow.getAllWindows().forEach((windowRef) => {
    if (!windowRef || windowRef.isDestroyed()) {
      return;
    }

    const webContents = windowRef.webContents;
    if (!webContents || webContents.isDestroyed()) {
      return;
    }

    webContents.send(IPC_CHANNELS.runEvent, eventPayload);
  });
};

export const setupWorkflowRuntimeIPC = async () => {
  await ensureWorkflowStorageDirs();
  const nodeRegistry = getWorkflowNodeRegistry();
  startPublishGuardianDaemon();

  const emitQueueSnapshot = () => {
    broadcastWorkflowRunEvent({
      runId: null,
      ts: new Date().toISOString(),
      type: "queue.updated",
      scope: "workflow",
      payload: {
        queue: getRunQueueState(),
      },
    });
  };

  const processPendingQueue = () => {
    if (hasRunningQueueItem() || hasRunningRun()) {
      return;
    }

    const next = shiftPendingRun();
    if (!next) {
      return;
    }

    const emit = (runEvent) => {
      broadcastWorkflowRunEvent(runEvent);
    };

    markRunRunning({
      ...next,
      status: "running",
      startedAt: new Date().toISOString(),
    });
    emitQueueSnapshot();

    let startResult;
    try {
      startResult = startWorkflowExecution({
        runId: next.runId,
        workflow: next.workflow,
        nodeRegistry,
        emit,
        onSettled: async (runRecord) => {
          const fallbackEndedAt = new Date().toISOString();
          const settledPatch = runRecord
            ? {
                workflowId: runRecord.workflowId,
                workflowName: runRecord.workflowName,
                status: runRecord.status,
                startedAt: runRecord.startedAt,
                endedAt: runRecord.endedAt,
              }
            : {
                status: "failed",
                endedAt: fallbackEndedAt,
              };

          if (runRecord) {
            try {
              await saveRunRecord(runRecord);
            } catch (error) {
              logger.error(
                `[workflow] 保存运行记录失败 runId=${next.runId}`,
                error?.message || error,
              );
            }
          }

          markRunSettled(next.runId, settledPatch);
          emitQueueSnapshot();
        },
      });
    } catch (error) {
      const errorPayload = {
        code: "WORKFLOW_RUN_REJECTED",
        message: error?.message || "工作流启动失败",
      };
      markRunSettled(next.runId, {
        status: "failed",
        endedAt: new Date().toISOString(),
        error: errorPayload,
      });
      emitQueueSnapshot();
      emit({
        runId: next.runId,
        ts: new Date().toISOString(),
        type: "run.failed",
        scope: "workflow",
        payload: errorPayload,
      });
      return;
    }

    if (!startResult.accepted) {
      const errorPayload = {
        code: startResult.code || "WORKFLOW_RUN_REJECTED",
        message: startResult.message || "工作流启动失败",
      };

      markRunSettled(next.runId, {
        status:
          startResult.code === "WORKFLOW_CANCELLED" ? "cancelled" : "failed",
        endedAt: new Date().toISOString(),
        error: errorPayload,
      });

      emitQueueSnapshot();
      emit({
        runId: next.runId,
        ts: new Date().toISOString(),
        type: "run.failed",
        scope: "workflow",
        payload: errorPayload,
      });
    }
  };

  registerRunQueueProcessor(processPendingQueue);

  Object.values(IPC_CHANNELS)
    .filter((channel) => channel !== IPC_CHANNELS.runEvent)
    .forEach(removeHandlerSafely);

  ipcMain.handle(IPC_CHANNELS.bootstrap, async () => {
    try {
      return {
        success: true,
        data: await buildWorkflowBootstrapPayload(),
      };
    } catch (error) {
      return {
        success: false,
        error: error?.message || '工作流子系统启动失败',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.templateList, () => ({
    success: true,
    data: listWorkflowTemplates(),
  }));

  ipcMain.handle(IPC_CHANNELS.templateLoad, async (_event, templateId) => {
    try {
      const document = loadWorkflowTemplateDocument(templateId);
      if (!document) {
        return {
          success: false,
          error: '工作流模板不存在',
        };
      }
      return { success: true, data: document };
    } catch (error) {
      return {
        success: false,
        error: error?.message || '载入工作流模板失败',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.documentGet, async (_event, documentId) => {
    try {
      const document = await readWorkflowDefinitionById(documentId);
      if (!document) {
        return {
          success: false,
          error: '工作流文档不存在',
        };
      }
      return { success: true, data: document };
    } catch (error) {
      return {
        success: false,
        error: error?.message || '读取工作流文档失败',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.documentSave, async (_event, payload = {}) => {
    try {
      const workflow =
        payload && typeof payload === 'object' && payload.document
          ? payload.document
          : payload && typeof payload === 'object' && payload.workflow
            ? payload.workflow
            : payload;
      const normalizedWorkflow = normalizeWorkflowDefinition(workflow);
      const validation = validateWorkflowGraph({
        workflow: normalizedWorkflow,
        nodeRegistry,
      });
      if (!validation.ok && payload?.allowInvalid !== true) {
        return {
          success: false,
          code: 'WORKFLOW_INVALID',
          error: '工作流校验失败',
          validation: toValidationPayload(validation),
        };
      }
      const savedRecord = await saveWorkflowDefinition(normalizedWorkflow);
      return {
        success: true,
        data: savedRecord,
        validation: toValidationPayload(validation),
      };
    } catch (error) {
      return {
        success: false,
        error: error?.message || '保存工作流文档失败',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.catalogGet, () => {
    const entries = listWorkflowCatalogEntries();
    return {
      success: true,
      data: {
        entries,
        categories: listWorkflowCatalogCategories(entries),
      },
    };
  });

  ipcMain.handle(IPC_CHANNELS.nodeDocsGet, (_event, nodeType) => {
    const entry = getWorkflowNodeDocs(nodeType);
    if (!entry) {
      return {
        success: false,
        error: '节点文档不存在',
      };
    }
    return { success: true, data: entry };
  });

  ipcMain.handle(IPC_CHANNELS.listNodeDefinitions, () => {
    return {
      success: true,
      data: listWorkflowNodeDefinitions(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.getObjectInfo, () => {
    return {
      success: true,
      data: getWorkflowObjectInfo(),
    };
  });

  ipcMain.handle(IPC_CHANNELS.list, async () => {
    try {
      const definitions = await listWorkflowDefinitions();
      return { success: true, data: definitions };
    } catch (error) {
      return {
        success: false,
        error: error?.message || "读取工作流列表失败",
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.get, async (_event, workflowId) => {
    try {
      const record = await readWorkflowDefinitionById(workflowId);
      if (!record) {
        return { success: false, error: "工作流不存在" };
      }
      return { success: true, data: record };
    } catch (error) {
      return { success: false, error: error?.message || "读取工作流失败" };
    }
  });

  ipcMain.handle(IPC_CHANNELS.save, async (_event, payload = {}) => {
    try {
      const workflow =
        payload && typeof payload === "object" && payload.workflow
          ? payload.workflow
          : payload;
      const normalizedWorkflow = normalizeWorkflowDefinition(workflow);
      const validation = validateWorkflowGraph({
        workflow: normalizedWorkflow,
        nodeRegistry,
      });
      const allowInvalid = payload?.allowInvalid === true;

      if (!validation.ok && !allowInvalid) {
        return {
          success: false,
          code: "WORKFLOW_INVALID",
          error: "工作流校验失败",
          validation: {
            ok: validation.ok,
            errors: validation.errors,
            warnings: validation.warnings,
          },
        };
      }

      const savedRecord = await saveWorkflowDefinition(normalizedWorkflow);
      return {
        success: true,
        data: savedRecord,
        validation: {
          ok: validation.ok,
          errors: validation.errors,
          warnings: validation.warnings,
        },
      };
    } catch (error) {
      return { success: false, error: error?.message || "保存工作流失败" };
    }
  });

  ipcMain.handle(IPC_CHANNELS.remove, async (_event, workflowId) => {
    try {
      const deleted = await deleteWorkflowDefinition(workflowId);
      return { success: true, data: { deleted } };
    } catch (error) {
      return { success: false, error: error?.message || "删除工作流失败" };
    }
  });

  ipcMain.handle(IPC_CHANNELS.validate, (_event, payload = {}) => {
    try {
      const workflow =
        payload && typeof payload === "object" && payload.workflow
          ? payload.workflow
          : payload;
      const normalizedWorkflow = normalizeWorkflowDefinition(workflow);
      const validation = validateWorkflowGraph({
        workflow: normalizedWorkflow,
        nodeRegistry,
      });

      return {
        success: true,
        data: {
          ok: validation.ok,
          errors: validation.errors,
          warnings: validation.warnings,
          nodeCount: normalizedWorkflow.graph.nodes.length,
          edgeCount: normalizedWorkflow.graph.edges.length,
        },
      };
    } catch (error) {
      return { success: false, error: error?.message || "校验工作流失败" };
    }
  });

  const enqueueWorkflowRun = async (
    event,
    payload = {},
    { front = false } = {},
  ) => {
    const workflow = await resolveWorkflowFromPayload(payload);
    if (!workflow) {
      return {
        success: false,
        code: "WORKFLOW_NOT_FOUND",
        error: "未找到可执行的工作流定义",
      };
    }

    const validation = validateWorkflowGraph({ workflow, nodeRegistry });
    if (!validation.ok) {
      return {
        success: false,
        code: "WORKFLOW_INVALID",
        error: "工作流校验失败",
        validation: toValidationPayload(validation),
      };
    }

    const runId = createRunId();
    const queued = enqueueRun(
      {
        runId,
        workflow,
        workflowId: workflow.id,
        workflowName: workflow.name,
        runtime: workflow.runtime,
        requestedAt: new Date().toISOString(),
        mode: front ? "front" : "enqueue",
        sender: event?.sender || null,
        validation: toValidationPayload(validation),
      },
      { front },
    );

    const pendingList = listPendingRuns();
    const queueIndex = pendingList.findIndex((item) => item.runId === runId);
    const queuePosition = queueIndex >= 0 ? queueIndex + 1 : 0;

    emitQueueSnapshot();

    return {
      success: true,
      data: {
        runId,
        workflowId: workflow.id,
        status: queuePosition > 0 ? "pending" : "running",
        queuePosition,
        validation: toValidationPayload(validation),
        queue: getRunQueueState(),
        requestedAt: queued.requestedAt,
      },
    };
  };

  ipcMain.handle(IPC_CHANNELS.run, async (event, payload = {}) => {
    try {
      return await enqueueWorkflowRun(event, payload, { front: false });
    } catch (error) {
      return { success: false, error: error?.message || "工作流运行失败" };
    }
  });

  ipcMain.handle(IPC_CHANNELS.runFront, async (event, payload = {}) => {
    try {
      return await enqueueWorkflowRun(event, payload, { front: true });
    } catch (error) {
      return {
        success: false,
        error: error?.message || '前插运行失败',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.enqueue, async (event, payload = {}) => {
    try {
      return await enqueueWorkflowRun(event, payload, { front: false });
    } catch (error) {
      return {
        success: false,
        error: error?.message || '工作流入队失败',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.partialEnqueue, async (event, payload = {}) => {
    try {
      const workflow = await resolveWorkflowFromPayload(payload);
      if (!workflow) {
        return {
          success: false,
          code: 'WORKFLOW_NOT_FOUND',
          error: '未找到可执行的工作流定义',
        };
      }

      const targetNodeId =
        typeof payload?.nodeId === 'string'
          ? payload.nodeId.trim()
          : typeof payload?.targetNodeId === 'string'
            ? payload.targetNodeId.trim()
            : '';
      if (!targetNodeId) {
        return {
          success: false,
          error: '缺少局部执行目标节点',
        };
      }

      const partialWorkflow = buildPartialWorkflowDocument({
        workflow,
        nodeId: targetNodeId,
      });
      const result = await enqueueWorkflowRun(
        event,
        { workflow: partialWorkflow },
        { front: false },
      );
      if (result?.success && result.data) {
        result.data.partialExecution = {
          enabled: true,
          targetNodeId,
        };
      }
      return result;
    } catch (error) {
      return {
        success: false,
        error: error?.message || '局部执行入队失败',
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.queueGet, async () => {
    const queueSnapshot = getRunQueueState();
    const memoryRuns = listRunSnapshots(100);
    const storedRuns = await listRunRecords(100);
    const mergedRuns = mergeRunLists({
      memoryRuns,
      storedRuns,
      limit: 100,
    });

    return {
      success: true,
      data: {
        pending: queueSnapshot.pending,
        running: queueSnapshot.running,
        history: buildQueueHistory({ queueSnapshot, mergedRuns }),
        updatedAt: queueSnapshot.updatedAt,
      },
    };
  });

  ipcMain.handle(IPC_CHANNELS.queueClearPending, () => {
    const cleared = clearPendingRuns();
    emitQueueSnapshot();
    return {
      success: true,
      data: {
        cleared,
        queue: getRunQueueState(),
      },
    };
  });

  ipcMain.handle(IPC_CHANNELS.cancel, (_event, payload = {}) => {
    const runId =
      typeof payload === "string"
        ? payload
        : typeof payload?.runId === "string"
          ? payload.runId
          : "";

    if (!runId) {
      return { success: false, error: "缺少 runId" };
    }

    const cancelledPending = cancelPendingRun(runId);
    const cancelledRunning = cancelledPending ? false : cancelRunningRun(runId);
    const cancelled = cancelledPending || cancelledRunning;
    if (cancelled) {
      emitQueueSnapshot();
    }

    return {
      success: true,
      data: {
        runId,
        cancelled,
        scope: cancelledPending
          ? "pending"
          : cancelledRunning
            ? "running"
            : "none",
      },
    };
  });

  ipcMain.handle(IPC_CHANNELS.getRun, async (_event, runId) => {
    if (!runId || typeof runId !== 'string') {
      return { success: false, error: '缺少 runId' };
    }

    const pendingRun = getPendingRunSnapshot(runId);
    if (pendingRun) {
      return { success: true, data: pendingRun };
    }

    const memoryRun = getRunSnapshot(runId);
    if (memoryRun) {
      return { success: true, data: memoryRun };
    }

    const storedRun = await readRunRecordById(runId);
    if (!storedRun) {
      return { success: false, error: '运行记录不存在' };
    }

    return { success: true, data: storedRun };
  });

  ipcMain.handle(IPC_CHANNELS.runGetV2, async (_event, runId) => {
    if (!runId || typeof runId !== 'string') {
      return { success: false, error: '缺少 runSessionId' };
    }

    const runRecord = await readAnyRunRecordById(runId);
    if (!runRecord) {
      return { success: false, error: '运行记录不存在' };
    }

    return { success: true, data: normalizeRunSession(runRecord) };
  });

  ipcMain.handle(IPC_CHANNELS.listRuns, async (_event, payload = {}) => {
    const limit =
      payload && typeof payload === "object"
        ? Number.parseInt(payload.limit, 10) || 50
        : 50;

    const pending = listPendingRuns();
    const running = listRunningRuns();
    const memoryRuns = listRunSnapshots(limit);
    const storedRuns = await listRunRecords(limit);
    const merged = mergeRunLists({
      memoryRuns: [...pending, ...running, ...memoryRuns],
      storedRuns,
      limit,
    });

    return { success: true, data: merged };
  });

  ipcMain.handle(IPC_CHANNELS.runListV2, async (_event, payload = {}) => {
    const limit =
      payload && typeof payload === "object"
        ? Number.parseInt(payload.limit, 10) || 50
        : 50;

    const pending = listPendingRuns();
    const running = listRunningRuns();
    const memoryRuns = listRunSnapshots(limit);
    const storedRuns = await listRunRecords(limit);
    const merged = mergeRunLists({
      memoryRuns: [...pending, ...running, ...memoryRuns],
      storedRuns,
      limit,
    });

    return {
      success: true,
      data: merged.map((item) => normalizeRunSession(item)),
    };
  });

  ipcMain.handle(IPC_CHANNELS.recoveryReportGet, async (_event, runSessionId) => {
    if (!runSessionId || typeof runSessionId !== "string") {
      return { success: false, error: '\u7f3a\u5c11 runSessionId' };
    }

    const runRecord = await readAnyRunRecordById(runSessionId);
    if (!runRecord) {
      return { success: false, error: '\u6062\u590d\u62a5\u544a\u76ee\u6807\u4e0d\u5b58\u5728' };
    }

    return {
      success: true,
      data: buildRecoveryReport(runRecord),
    };
  });

  logger.debug("workflow-runtime IPC 已注册");
};

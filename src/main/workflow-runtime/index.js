import { ipcMain } from "electron";
import { createLogSender } from "../utils/logger";
import { normalizeWorkflowDefinition } from "./contracts/workflow-schema";
import { validateWorkflowGraph } from "./engine/graph-validator";
import {
  cancelRunningRun,
  getRunSnapshot,
  listRunSnapshots,
} from "./engine/run-store";
import { startWorkflowExecution } from "./engine/executor";
import { startPublishGuardianDaemon } from "./engine/publish-guardian";
import {
  getWorkflowNodeRegistry,
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
  cancel: "workflow-cancel",
  getRun: "workflow-get-run",
  listRuns: "workflow-list-runs",
  listNodeDefinitions: "workflow-list-node-definitions",
  runEvent: "workflow-run-event",
};

const removeHandlerSafely = (channel) => {
  try {
    ipcMain.removeHandler(channel);
  } catch {
    // handler 不存在时忽略
  }
};

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
    const currentTime = String(current?.startedAt || "");
    const nextTime = String(run?.startedAt || "");
    if (nextTime > currentTime) {
      mergedMap.set(run.runId, run);
    }
  });

  return [...mergedMap.values()]
    .sort((left, right) =>
      String(right.startedAt || "").localeCompare(String(left.startedAt || "")),
    )
    .slice(0, Math.max(1, limit));
};

const resolveWorkflowFromPayload = async (payload) => {
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

export const setupWorkflowRuntimeIPC = async () => {
  await ensureWorkflowStorageDirs();
  const nodeRegistry = getWorkflowNodeRegistry();
  startPublishGuardianDaemon();

  Object.values(IPC_CHANNELS)
    .filter((channel) => channel !== IPC_CHANNELS.runEvent)
    .forEach(removeHandlerSafely);

  ipcMain.handle(IPC_CHANNELS.listNodeDefinitions, async () => {
    return {
      success: true,
      data: listWorkflowNodeDefinitions(),
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

  ipcMain.handle(IPC_CHANNELS.validate, async (_event, payload = {}) => {
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

  ipcMain.handle(IPC_CHANNELS.run, async (event, payload = {}) => {
    try {
      const workflow = await resolveWorkflowFromPayload(payload);
      if (!workflow) {
        return {
          success: false,
          code: "WORKFLOW_NOT_FOUND",
          error: "未找到可执行的工作流定义",
        };
      }

      const runId = createRunId();
      const startResult = startWorkflowExecution({
        runId,
        workflow,
        nodeRegistry,
        emit: (runEvent) => {
          if (event?.sender && !event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.runEvent, runEvent);
          }
        },
        onSettled: async (runRecord) => {
          if (runRecord) {
            await saveRunRecord(runRecord);
          }
        },
      });

      if (!startResult.accepted) {
        return {
          success: false,
          code: startResult.code || "WORKFLOW_RUN_REJECTED",
          error: startResult.message || "工作流启动失败",
          validation:
            startResult.validation && typeof startResult.validation === "object"
              ? {
                  ok: startResult.validation.ok,
                  errors: startResult.validation.errors || [],
                  warnings: startResult.validation.warnings || [],
                }
              : undefined,
        };
      }

      return {
        success: true,
        data: {
          runId,
          workflowId: workflow.id,
          status: "running",
          validation: startResult.validation,
        },
      };
    } catch (error) {
      return { success: false, error: error?.message || "工作流运行失败" };
    }
  });

  ipcMain.handle(IPC_CHANNELS.cancel, async (_event, payload = {}) => {
    const runId =
      typeof payload === "string"
        ? payload
        : typeof payload?.runId === "string"
          ? payload.runId
          : "";

    if (!runId) {
      return { success: false, error: "缺少 runId" };
    }

    const cancelled = cancelRunningRun(runId);
    return {
      success: true,
      data: {
        runId,
        cancelled,
      },
    };
  });

  ipcMain.handle(IPC_CHANNELS.getRun, async (_event, runId) => {
    if (!runId || typeof runId !== "string") {
      return { success: false, error: "缺少 runId" };
    }

    const memoryRun = getRunSnapshot(runId);
    if (memoryRun) {
      return { success: true, data: memoryRun };
    }

    const storedRun = await readRunRecordById(runId);
    if (!storedRun) {
      return { success: false, error: "运行记录不存在" };
    }

    return { success: true, data: storedRun };
  });

  ipcMain.handle(IPC_CHANNELS.listRuns, async (_event, payload = {}) => {
    const limit =
      payload && typeof payload === "object"
        ? Number.parseInt(payload.limit, 10) || 50
        : 50;

    const memoryRuns = listRunSnapshots(limit);
    const storedRuns = await listRunRecords(limit);
    const merged = mergeRunLists({ memoryRuns, storedRuns, limit });

    return { success: true, data: merged };
  });

  logger.debug("workflow-runtime IPC 已注册");
};

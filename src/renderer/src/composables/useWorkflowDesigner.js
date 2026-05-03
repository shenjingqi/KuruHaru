import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import * as workflowApi from "../api/workflowApi";

const resolveWorkflowMethod = (namespacedMethod, flatMethod) => {
  if (typeof workflowApi?.[flatMethod] === "function") {
    return workflowApi[flatMethod];
  }
  if (typeof window.api?.workflow?.[namespacedMethod] === "function") {
    return window.api.workflow[namespacedMethod];
  }
  if (typeof window.api?.[flatMethod] === "function") {
    return window.api[flatMethod];
  }
  return null;
};

const createWorkflowCaller = (namespacedMethod, flatMethod) => {
  return async (...args) => {
    const method = resolveWorkflowMethod(namespacedMethod, flatMethod);
    if (!method) {
      return {
        success: false,
        error: `${flatMethod} API unavailable`,
      };
    }

    try {
      return await method(...args);
    } catch (error) {
      return {
        success: false,
        error: error?.message || `${flatMethod} call failed`,
      };
    }
  };
};

const workflowCancel = createWorkflowCaller("cancel", "workflowCancel");
const workflowDelete = createWorkflowCaller("delete", "workflowDelete");
const workflowGet = createWorkflowCaller("get", "workflowGet");
const workflowGetObjectInfo = createWorkflowCaller(
  "getObjectInfo",
  "workflowGetObjectInfo",
);
const workflowGetRun = createWorkflowCaller("getRun", "workflowGetRun");
const workflowList = createWorkflowCaller("list", "workflowList");
const workflowListNodeDefinitions = createWorkflowCaller(
  "listNodeDefinitions",
  "workflowListNodeDefinitions",
);
const workflowListRuns = createWorkflowCaller("listRuns", "workflowListRuns");
const workflowRun = createWorkflowCaller("run", "workflowRun");
const workflowTemplateLoad = createWorkflowCaller(
  "templateLoad",
  "workflowTemplateLoad",
);
const workflowSave = createWorkflowCaller("save", "workflowSave");
const workflowValidate = createWorkflowCaller("validate", "workflowValidate");

const normalizeObjectInfoIoGroup = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const key = String(item.key || "").trim();
      const label = String(item.label || key || "").trim();
      if (!key && !label) {
        return null;
      }

      return {
        ...item,
        key: key || label,
        label: label || key,
        datatype: String(
          item.datatype || item.dataType || item.valueType || "ANY",
        )
          .trim()
          .toUpperCase(),
      };
    })
    .filter(Boolean);
};

const objectInfoRecordToNodeDefinition = (rawRecord = {}, typeHint = "") => {
  if (!rawRecord || typeof rawRecord !== "object") {
    return null;
  }

  const type = String(rawRecord.type || typeHint || "").trim();
  if (!type) {
    return null;
  }

  const requiredInputs = normalizeObjectInfoIoGroup(rawRecord.inputs?.required);
  const optionalInputs = normalizeObjectInfoIoGroup(
    rawRecord.inputs?.optional,
  ).map((entry) => ({
    ...entry,
    required: false,
  }));
  const outputs = normalizeObjectInfoIoGroup(rawRecord.outputs);

  return {
    type,
    label:
      String(rawRecord.displayName || rawRecord.label || type).trim() || type,
    displayName:
      String(rawRecord.displayName || rawRecord.label || type).trim() || type,
    category: String(rawRecord.category || "other").trim() || "other",
    description: String(rawRecord.description || "").trim(),
    defaultConfig: cloneJsonValue(rawRecord.defaultConfig || {}, {}),
    widgets: cloneJsonValue(rawRecord.widgets || [], []),
    runtimeFlags: cloneJsonValue(rawRecord.runtimeFlags || {}, {}),
    uiHints: cloneJsonValue(rawRecord.uiHints || {}, {}),
    io: {
      input: [...requiredInputs, ...optionalInputs],
      output: outputs,
    },
  };
};

const objectInfoMapToNodeDefinitions = (objectInfoMap = {}) =>
  Object.entries(objectInfoMap)
    .map(([type, record]) => objectInfoRecordToNodeDefinition(record, type))
    .filter(Boolean);

const definitionsToObjectInfoMap = (definitions = []) => {
  const entries = Array.isArray(definitions) ? definitions : [];
  return Object.fromEntries(
    entries
      .map((definition) => {
        if (!definition || typeof definition !== "object") {
          return null;
        }

        const type = String(definition.type || "").trim();
        if (!type) {
          return null;
        }

        const inputs = Array.isArray(definition?.io?.input)
          ? definition.io.input
          : [];

        return [
          type,
          {
            type,
            displayName:
              String(
                definition.displayName || definition.label || type,
              ).trim() || type,
            label:
              String(
                definition.displayName || definition.label || type,
              ).trim() || type,
            category: String(definition.category || "other").trim() || "other",
            description: String(definition.description || "").trim(),
            defaultConfig: cloneJsonValue(definition.defaultConfig || {}, {}),
            inputs: {
              required: inputs.filter((entry) => entry?.required !== false),
              optional: inputs.filter((entry) => entry?.required === false),
            },
            outputs: Array.isArray(definition?.io?.output)
              ? cloneJsonValue(definition.io.output, [])
              : [],
            widgets: cloneJsonValue(definition.widgets || [], []),
            runtimeFlags: cloneJsonValue(definition.runtimeFlags || {}, {}),
            uiHints: cloneJsonValue(definition.uiHints || {}, {}),
          },
        ];
      })
      .filter(Boolean),
  );
};

const onWorkflowRunEvent =
  typeof workflowApi.onWorkflowRunEvent === "function"
    ? workflowApi.onWorkflowRunEvent
    : typeof workflowApi.onRunEvent === "function"
      ? workflowApi.onRunEvent
      : (callback) => {
          if (typeof window.api?.onWorkflowRunEvent === "function") {
            return window.api.onWorkflowRunEvent(callback);
          }

          if (typeof window.api?.workflow?.onRunEvent === "function") {
            return window.api.workflow.onRunEvent(callback);
          }

          if (typeof window.api?.on === "function") {
            window.api.on("workflow-run-event", callback);
            return () => {
              if (typeof window.api?.removeAllListeners === "function") {
                window.api.removeAllListeners("workflow-run-event");
              }
            };
          }

          return () => {};
        };

const createInitialTranslateNode = () => ({
  id: `node-${Date.now().toString(36)}-start`,
  type: "whisper.translateSubtitles",
  label: "翻译字幕",
  position: {
    x: 72,
    y: 72,
  },
  size: {
    width: DEFAULT_NODE_WIDTH,
    height: DEFAULT_NODE_HEIGHT,
  },
  appearance: {
    fontSize: DEFAULT_NODE_FONT_SIZE,
  },
  config: {
    exePath: "",
    targetPath: "",
    subFormats: ["lrc", "srt", "vtt"],
  },
});

const createEmptyWorkflow = () => ({
  id: "",
  name: "未命名工作流",
  version: "1.0.0",
  description: "",
  tags: [],
  graph: {
    nodes: [createInitialTranslateNode()],
    edges: [],
    links: [],
    groups: [],
    reroutes: [],
    floatingLinks: [],
    state: {},
    extra: {},
    definitions: {},
  },
  runtime: {
    maxParallel: 1,
    failFast: true,
    timeoutMs: 0,
    dispatchMode: "single",
    batchSize: 50,
    emitPerItem: false,
  },
});

const ensureGraphCompat = (workflowRecord) => {
  if (!workflowRecord || typeof workflowRecord !== "object") {
    return workflowRecord;
  }

  if (!workflowRecord.graph || typeof workflowRecord.graph !== "object") {
    workflowRecord.graph = {};
  }

  const graph = workflowRecord.graph;
  graph.nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  graph.edges = Array.isArray(graph.edges) ? graph.edges : [];
  graph.links = Array.isArray(graph.links)
    ? graph.links
    : graph.edges.map((edge) => ({ ...edge }));
  graph.groups = Array.isArray(graph.groups) ? graph.groups : [];
  graph.reroutes = Array.isArray(graph.reroutes) ? graph.reroutes : [];
  graph.floatingLinks = Array.isArray(graph.floatingLinks)
    ? graph.floatingLinks
    : [];
  graph.state =
    graph.state && typeof graph.state === "object" ? graph.state : {};
  graph.extra =
    graph.extra && typeof graph.extra === "object" ? graph.extra : {};
  graph.definitions =
    graph.definitions && typeof graph.definitions === "object"
      ? graph.definitions
      : {};

  return workflowRecord;
};

const syncGraphLinks = (workflowRecord) => {
  if (!workflowRecord?.graph) {
    return;
  }
  workflowRecord.graph.links = Array.isArray(workflowRecord.graph.edges)
    ? workflowRecord.graph.edges.map((edge) => ({ ...edge }))
    : [];
};

const parseJsonSafely = (rawText, fallbackValue = {}) => {
  try {
    const parsed = JSON.parse(rawText);
    return parsed && typeof parsed === "object" ? parsed : fallbackValue;
  } catch {
    return fallbackValue;
  }
};

const cloneJsonValue = (value, fallbackValue = {}) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallbackValue;
  }
};

const createNodeId = () =>
  `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const createEdgeId = () =>
  `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const createDefaultRunProgress = () => ({
  currentRj: "",
  totalWorks: 0,
  completedWorks: 0,
  remainingWorks: 0,
  processedFiles: 0,
  totalFiles: 0,
});

const clampProgressPercent = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
};

const resolveProgressPercent = (progress = {}) => {
  const totalWorks = Math.max(0, Number(progress?.totalWorks || 0));
  const completedWorks = Math.max(0, Number(progress?.completedWorks || 0));
  if (totalWorks > 0) {
    return clampProgressPercent((completedWorks / totalWorks) * 100);
  }

  const totalFiles = Math.max(0, Number(progress?.totalFiles || 0));
  const processedFiles = Math.max(0, Number(progress?.processedFiles || 0));
  if (totalFiles > 0) {
    return clampProgressPercent((processedFiles / totalFiles) * 100);
  }

  return 0;
};

const DEFAULT_NODE_WIDTH = 238;
const DEFAULT_NODE_HEIGHT = 128;
const DEFAULT_NODE_FONT_SIZE = 16;
const MIN_NODE_WIDTH = 160;
const MAX_NODE_WIDTH = 760;
const MIN_NODE_HEIGHT = 96;
const MAX_NODE_HEIGHT = 520;

const clampNodeWidth = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_NODE_WIDTH;
  }
  return Math.min(MAX_NODE_WIDTH, Math.max(MIN_NODE_WIDTH, Math.round(parsed)));
};

const clampNodeHeight = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_NODE_HEIGHT;
  }
  return Math.min(
    MAX_NODE_HEIGHT,
    Math.max(MIN_NODE_HEIGHT, Math.round(parsed)),
  );
};

const resolveNodeSize = (node) => ({
  width: clampNodeWidth(node?.size?.width),
  height: clampNodeHeight(node?.size?.height),
});

const TRANSLATE_SUBTITLE_NODE_TYPE = "whisper.translateSubtitles";

const sanitizePath = (value) => (typeof value === "string" ? value.trim() : "");

const normalizeWorkflowPayload = (workflowValue) => {
  const payload = cloneJsonValue(workflowValue, null);
  if (!payload || typeof payload !== "object") {
    const error = new Error("工作流数据序列化失败，请重试");
    error.code = "WORKFLOW_PAYLOAD_SERIALIZE_FAILED";
    throw error;
  }
  return payload;
};

const findRunBlockerMessage = (workflowPayload) => {
  const nodes = Array.isArray(workflowPayload?.graph?.nodes)
    ? workflowPayload.graph.nodes
    : [];
  const translateNode = nodes.find(
    (node) => node?.type === TRANSLATE_SUBTITLE_NODE_TYPE,
  );
  if (!translateNode) {
    return "";
  }

  const exePath = sanitizePath(translateNode?.config?.exePath);
  const targetPath = sanitizePath(translateNode?.config?.targetPath);
  if (exePath && targetPath) {
    return "";
  }

  const nodeName =
    translateNode?.label || translateNode?.id || "whisper.translateSubtitles";
  return `${nodeName} 缺少必要配置：请先设置引擎路径和媒体目录`;
};

export const useWorkflowDesigner = ({ message } = {}) => {
  const workflow = ref(ensureGraphCompat(createEmptyWorkflow()));
  const workflowSummaries = ref([]);
  const runHistory = ref([]);
  const nodeDefinitions = ref([]);
  const nodeObjectInfoMap = ref({});
  const selectedNodeId = ref(workflow.value.graph.nodes[0]?.id || "");
  const selectedEdgeId = ref("");
  const sourceNodeId = ref("");
  const targetNodeId = ref("");
  const selectedNodeConfigDraft = ref("{}");
  const selectedNodeConfigError = ref("");
  const validationState = ref({
    ok: true,
    errors: [],
    warnings: [],
  });
  const isSaving = ref(false);
  const isValidating = ref(false);
  const isLoadingWorkflow = ref(false);
  const activeRunId = ref("");
  const activeRunStatus = ref("idle");
  const runProgress = ref(createDefaultRunProgress());
  const workflowLogs = ref([]);
  const pipelineLogs = ref([]);
  const nodeLogsByNodeId = ref({});
  const runNodeStates = ref({});
  const lastRunEvent = ref(null);
  const dragState = reactive({
    nodeId: "",
    offsetX: 0,
    offsetY: 0,
  });

  const canvasRef = ref(null);
  let disposeRunEvent = null;
  let runStatusPollTimer = null;

  const currentNodeOptions = computed(() =>
    workflow.value.graph.nodes.map((node) => ({
      label: `${node.label || node.type} (${node.id})`,
      value: node.id,
    })),
  );

  const selectedNode = computed(() =>
    workflow.value.graph.nodes.find((node) => node.id === selectedNodeId.value),
  );

  const selectedNodeObjectInfo = computed(() => {
    const nodeType = String(selectedNode.value?.type || "").trim();
    if (!nodeType) {
      return null;
    }
    return nodeObjectInfoMap.value[nodeType] || null;
  });

  const selectedNodeRunState = computed(() => {
    const nodeId = selectedNodeId.value;
    if (!nodeId) {
      return null;
    }

    return runNodeStates.value[nodeId] || null;
  });

  const selectedNodeLogs = computed(() => {
    const nodeId = selectedNodeId.value;
    if (!nodeId) {
      return [];
    }

    const logs = nodeLogsByNodeId.value[nodeId];
    return Array.isArray(logs) ? logs : [];
  });

  const selectedEdge = computed(() =>
    workflow.value.graph.edges.find((edge) => edge.id === selectedEdgeId.value),
  );

  const isRunInProgress = computed(
    () =>
      activeRunStatus.value === "pending" ||
      activeRunStatus.value === "running" ||
      activeRunStatus.value === "cancelling",
  );

  const activeWorkInProgress = computed(
    () =>
      Boolean(runProgress.value.currentRj) &&
      activeRunStatus.value === "running",
  );

  const totalWorksDisplay = computed(() => {
    const totalWorks = Math.max(
      0,
      Number.parseInt(runProgress.value.totalWorks, 10) || 0,
    );
    const remainingWorks = Math.max(
      0,
      Number.parseInt(runProgress.value.remainingWorks, 10) || 0,
    );
    const inProgressWorks = activeWorkInProgress.value ? 1 : 0;
    const completedWorks = Math.max(
      0,
      Number.parseInt(runProgress.value.completedWorks, 10) || 0,
    );
    return Math.max(
      totalWorks,
      completedWorks + remainingWorks,
      completedWorks + remainingWorks + inProgressWorks,
    );
  });

  const completedWorksDisplay = computed(() => {
    const completedWorks = Math.max(
      0,
      Number.parseInt(runProgress.value.completedWorks, 10) || 0,
    );
    const derivedCompleted = Math.max(
      totalWorksDisplay.value -
        (Number.parseInt(runProgress.value.remainingWorks, 10) || 0),
      0,
    );
    return Math.max(
      completedWorks,
      derivedCompleted - (activeWorkInProgress.value ? 1 : 0),
    );
  });

  const inProgressWorksDisplay = computed(() =>
    activeWorkInProgress.value ? 1 : 0,
  );

  const remainingWorksDisplay = computed(() =>
    Math.max(
      totalWorksDisplay.value -
        completedWorksDisplay.value -
        inProgressWorksDisplay.value,
      0,
    ),
  );

  const nodePaletteGroups = computed(() => {
    const grouped = {};
    nodeDefinitions.value.forEach((item) => {
      const nodeType = String(item?.type || "").trim();
      if (!nodeType) {
        return;
      }

      const objectInfo = nodeObjectInfoMap.value?.[nodeType] || {};
      const normalizedItem = objectInfoRecordToNodeDefinition(
        objectInfo,
        nodeType,
      );
      const category =
        String(objectInfo.category || item.category || "other").trim() ||
        "other";
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push({
        ...(normalizedItem || item),
        ...item,
        type: nodeType,
        label:
          String(
            objectInfo.displayName ||
              item.displayName ||
              item.label ||
              normalizedItem?.label ||
              nodeType,
          ).trim() || nodeType,
        displayName:
          String(
            objectInfo.displayName ||
              item.displayName ||
              item.label ||
              normalizedItem?.displayName ||
              nodeType,
          ).trim() || nodeType,
        category,
        description: String(
          objectInfo.description ||
            item.description ||
            normalizedItem?.description ||
            "",
        ).trim(),
        widgets: cloneJsonValue(
          Array.isArray(objectInfo.widgets) && objectInfo.widgets.length
            ? objectInfo.widgets
            : item.widgets || normalizedItem?.widgets || [],
          [],
        ),
        io: cloneJsonValue(
          item.io || normalizedItem?.io || { input: [], output: [] },
          { input: [], output: [] },
        ),
      });
    });

    return Object.entries(grouped)
      .sort(([left], [right]) => left.localeCompare(right, "zh-Hans-CN"))
      .map(([category, items]) => ({
        category,
        items: items.sort((left, right) =>
          String(left.label || left.type).localeCompare(
            String(right.label || right.type),
            "zh-Hans-CN",
          ),
        ),
      }));
  });

  const edgeVisualList = computed(() => {
    return workflow.value.graph.edges
      .map((edge) => {
        const sourceNode = workflow.value.graph.nodes.find(
          (node) => node.id === edge.source,
        );
        const targetNode = workflow.value.graph.nodes.find(
          (node) => node.id === edge.target,
        );
        if (!sourceNode || !targetNode) {
          return null;
        }

        const sourceSize = resolveNodeSize(sourceNode);
        const targetSize = resolveNodeSize(targetNode);

        return {
          ...edge,
          x1: sourceNode.position.x + sourceSize.width,
          y1: sourceNode.position.y + sourceSize.height / 2,
          x2: targetNode.position.x,
          y2: targetNode.position.y + targetSize.height / 2,
        };
      })
      .filter(Boolean);
  });

  const notify = (level, text) => {
    if (!message || typeof message[level] !== "function") {
      return;
    }
    message[level](text);
  };

  const stopRunStatusPolling = () => {
    if (runStatusPollTimer) {
      clearInterval(runStatusPollTimer);
      runStatusPollTimer = null;
    }
  };

  const resetRunProgress = () => {
    runProgress.value = createDefaultRunProgress();
  };

  const applyRunProgressPatch = (patch = {}) => {
    const next = {
      ...runProgress.value,
      ...patch,
    };

    const numericKeys = [
      "totalWorks",
      "completedWorks",
      "remainingWorks",
      "processedFiles",
      "totalFiles",
    ];
    numericKeys.forEach((key) => {
      const parsed = Number.parseInt(next[key], 10);
      next[key] = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    });

    if (
      typeof next.currentRj !== "string" &&
      typeof next.currentRj !== "number"
    ) {
      next.currentRj = "";
    }

    runProgress.value = next;
  };

  const resolveWorkflowApiMethod = (
    importedMethod,
    namespacedMethod,
    flatMethod,
  ) => {
    if (typeof importedMethod === "function") {
      return importedMethod;
    }
    if (typeof workflowApi?.[flatMethod] === "function") {
      return workflowApi[flatMethod];
    }
    if (typeof window.api?.workflow?.[namespacedMethod] === "function") {
      return window.api.workflow[namespacedMethod];
    }
    if (typeof window.api?.[flatMethod] === "function") {
      return window.api[flatMethod];
    }
    return null;
  };

  const refreshWorkflowList = async () => {
    const request = resolveWorkflowApiMethod(
      workflowList,
      "list",
      "workflowList",
    );
    if (!request) {
      workflowSummaries.value = [];
      notify(
        "error",
        "Failed to load workflow list: workflowList API unavailable",
      );
      return;
    }

    let result;
    try {
      result = await request();
    } catch (error) {
      notify("error", error?.message || "Failed to load workflow list");
      return;
    }

    if (result?.success) {
      workflowSummaries.value = Array.isArray(result.data) ? result.data : [];
      return;
    }

    notify("error", result?.error || "Failed to load workflow list");
  };

  const refreshNodeDefinitions = async () => {
    let objectInfoResult;
    try {
      objectInfoResult = await workflowGetObjectInfo();
    } catch (error) {
      objectInfoResult = {
        success: false,
        error: error?.message || "Failed to load node object info",
      };
    }

    if (objectInfoResult?.success && objectInfoResult.data) {
      nodeObjectInfoMap.value = cloneJsonValue(objectInfoResult.data, {});
      nodeDefinitions.value = objectInfoMapToNodeDefinitions(
        nodeObjectInfoMap.value,
      );
      return;
    }

    const request = resolveWorkflowApiMethod(
      workflowListNodeDefinitions,
      "listNodeDefinitions",
      "workflowListNodeDefinitions",
    );
    if (!request) {
      nodeObjectInfoMap.value = {};
      nodeDefinitions.value = [];
      notify(
        "error",
        objectInfoResult?.error ||
          "Failed to load node definitions: workflow APIs unavailable",
      );
      return;
    }

    let result;
    try {
      result = await request();
    } catch (error) {
      notify("error", error?.message || "Failed to load node definitions");
      return;
    }

    if (result?.success) {
      nodeDefinitions.value = Array.isArray(result.data) ? result.data : [];
      nodeObjectInfoMap.value = definitionsToObjectInfoMap(
        nodeDefinitions.value,
      );
      return;
    }

    notify(
      "error",
      objectInfoResult?.error ||
        result?.error ||
        "Failed to load node definitions",
    );
  };

  const inspectRunRecord = (record = {}) => {
    if (!record || typeof record !== "object") {
      return;
    }

    if (record.runId) {
      activeRunId.value = String(record.runId);
    }
    activeRunStatus.value = String(
      record.status || activeRunStatus.value || "idle",
    );
    syncRunRecordSnapshot(record);
  };

  const runWorkflowPayload = async (
    workflowPayload,
    { mode = "append" } = {},
  ) => {
    if (isRunInProgress.value) {
      notify("warning", "A workflow run is already in progress");
      return {
        success: false,
        error: "A workflow run is already in progress",
      };
    }

    stopRunStatusPolling();
    resetRunProgress();
    resetRunArtifacts();

    try {
      const normalizedPayload = normalizeWorkflowPayload(workflowPayload);
      const runBlocker = findRunBlockerMessage(normalizedPayload);
      if (runBlocker) {
        appendSystemLog(`Pre-run check failed ${runBlocker}`);
        notify("warning", runBlocker);
        return {
          success: false,
          error: runBlocker,
        };
      }

      const result =
        mode === "front"
          ? await workflowApi.workflowQueueRunFront({
              workflow: normalizedPayload,
            })
          : await workflowRun({ workflow: normalizedPayload });
      if (!result?.success || !result.data?.runId) {
        activeRunId.value = "";
        activeRunStatus.value = "idle";
        appendSystemLog(
          `Failed to start ${result?.code ? `[${result.code}]` : ""} ${result?.error || ""}`.trim(),
        );
        notify("error", result?.error || "Failed to start workflow run");
        if (result?.validation) {
          validationState.value = {
            ok: result.validation.ok === true,
            errors: result.validation.errors || [],
            warnings: result.validation.warnings || [],
          };
        }
        return result;
      }

      activeRunId.value = result.data.runId;
      const initialStatus = String(result?.data?.status || "pending");
      activeRunStatus.value = initialStatus;
      appendSystemLog(`runId=${activeRunId.value} accepted (${initialStatus})`);
      startRunStatusPolling(activeRunId.value);
      return result;
    } catch (error) {
      activeRunId.value = "";
      activeRunStatus.value = "idle";
      appendSystemLog(`Start exception ${error?.message || error}`);
      notify("error", error?.message || "Failed to start workflow run");
      return {
        success: false,
        error: error?.message || "Failed to start workflow run",
      };
    }
  };

  const rerunHistoryRun = (record = {}, options = {}) => {
    const workflowSnapshot =
      record?.workflowSnapshot && typeof record.workflowSnapshot === "object"
        ? record.workflowSnapshot
        : workflow.value;
    return runWorkflowPayload(workflowSnapshot, options);
  };

  const refreshRunHistory = async () => {
    const request = resolveWorkflowApiMethod(
      workflowListRuns,
      "listRuns",
      "workflowListRuns",
    );
    if (!request) {
      runHistory.value = [];
      notify(
        "error",
        "Failed to load run history: workflowListRuns API unavailable",
      );
      return;
    }

    let result;
    try {
      result = await request({ limit: 30 });
    } catch (error) {
      notify("error", error?.message || "Failed to load run history");
      return;
    }

    if (result?.success) {
      runHistory.value = Array.isArray(result.data) ? result.data : [];
      return;
    }

    notify("error", result?.error || "Failed to load run history");
  };

  const startRunStatusPolling = (runId) => {
    stopRunStatusPolling();
    if (!runId) {
      return;
    }

    runStatusPollTimer = setInterval(async () => {
      const result = await workflowGetRun(runId);
      if (!result?.success || !result.data) {
        return;
      }

      syncRunRecordSnapshot(result.data);

      const status = String(result.data.status || "");
      if (status) {
        activeRunStatus.value = status;
      }

      if (["success", "failed", "cancelled"].includes(status)) {
        stopRunStatusPolling();
        await refreshRunHistory();
      }
    }, 1800);
  };

  const createNewWorkflow = () => {
    stopRunStatusPolling();
    workflow.value = ensureGraphCompat(createEmptyWorkflow());
    selectedNodeId.value = workflow.value.graph.nodes[0]?.id || "";
    selectedEdgeId.value = "";
    sourceNodeId.value = "";
    targetNodeId.value = "";
    selectedNodeConfigDraft.value = "{}";
    selectedNodeConfigError.value = "";
    validationState.value = { ok: true, errors: [], warnings: [] };
    activeRunId.value = "";
    activeRunStatus.value = "idle";
    resetRunArtifacts();
    resetRunProgress();
  };

  const applyWorkflowRecord = (record, successMessage = "") => {
    workflow.value = cloneJsonValue(record, createEmptyWorkflow());
    ensureGraphCompat(workflow.value);
    syncGraphLinks(workflow.value);
    selectedNodeId.value = workflow.value.graph.nodes[0]?.id || "";
    selectedEdgeId.value = "";
    sourceNodeId.value = "";
    targetNodeId.value = "";
    selectedNodeConfigDraft.value = "{}";
    selectedNodeConfigError.value = "";
    validationState.value = { ok: true, errors: [], warnings: [] };
    activeRunId.value = "";
    activeRunStatus.value = "idle";
    resetRunArtifacts();
    stopRunStatusPolling();
    resetRunProgress();
    if (successMessage) {
      notify("success", successMessage);
    }
  };

  const consumePendingTemplateId = () => {
    if (typeof sessionStorage === "undefined") {
      return "";
    }
    const value = String(
      sessionStorage.getItem("workflow.pendingTemplateId") || "",
    ).trim();
    sessionStorage.removeItem("workflow.pendingTemplateId");
    return value;
  };

  const loadTemplateById = async (templateId, options = {}) => {
    const normalizedTemplateId = String(templateId || "").trim();
    if (!normalizedTemplateId) {
      return false;
    }

    const result = await workflowTemplateLoad(normalizedTemplateId);
    if (!result?.success || !result.data) {
      notify("error", result?.error || "模板加载失败");
      return false;
    }

    const successMessage =
      typeof options.successMessage === "string" &&
      options.successMessage.trim()
        ? options.successMessage.trim()
        : `已载入模板：${result.data.name || normalizedTemplateId}`;
    applyWorkflowRecord(result.data, successMessage);
    return true;
  };

  const hydratePendingTemplateDocument = () => {
    const templateId = consumePendingTemplateId();
    if (!templateId) {
      return false;
    }

    return loadTemplateById(templateId);
  };

  const loadWorkflowById = async (workflowId) => {
    if (!workflowId) {
      return;
    }

    isLoadingWorkflow.value = true;
    try {
      const result = await workflowGet(workflowId);
      if (!result?.success || !result.data) {
        notify("error", result?.error || "读取工作流失败");
        return;
      }

      workflow.value = cloneJsonValue(result.data, createEmptyWorkflow());
      ensureGraphCompat(workflow.value);
      syncGraphLinks(workflow.value);
      selectedNodeId.value = workflow.value.graph.nodes[0]?.id || "";
      selectedEdgeId.value = "";
      sourceNodeId.value = "";
      targetNodeId.value = "";
      selectedNodeConfigDraft.value = "{}";
      selectedNodeConfigError.value = "";
      validationState.value = { ok: true, errors: [], warnings: [] };
      activeRunId.value = "";
      activeRunStatus.value = "idle";
      resetRunArtifacts();
      stopRunStatusPolling();
      resetRunProgress();
      notify("success", `已加载工作流：${workflow.value.name}`);
    } finally {
      isLoadingWorkflow.value = false;
    }
  };

  const saveCurrentWorkflow = async () => {
    isSaving.value = true;
    try {
      const workflowPayload = normalizeWorkflowPayload(workflow.value);
      const result = await workflowSave({ workflow: workflowPayload });
      if (!result?.success || !result.data) {
        notify("error", result?.error || "保存工作流失败");
        if (result?.validation) {
          validationState.value = {
            ok: result.validation.ok === true,
            errors: result.validation.errors || [],
            warnings: result.validation.warnings || [],
          };
        }
        return;
      }

      workflow.value = cloneJsonValue(result.data, createEmptyWorkflow());
      ensureGraphCompat(workflow.value);
      syncGraphLinks(workflow.value);
      validationState.value = {
        ok: result?.validation?.ok !== false,
        errors: result?.validation?.errors || [],
        warnings: result?.validation?.warnings || [],
      };
      await refreshWorkflowList();
      notify("success", "工作流已保存");
    } catch (error) {
      notify("error", error?.message || "保存工作流失败");
    } finally {
      isSaving.value = false;
    }
  };

  const validateCurrentWorkflow = async () => {
    isValidating.value = true;
    try {
      const workflowPayload = normalizeWorkflowPayload(workflow.value);
      const result = await workflowValidate({ workflow: workflowPayload });
      if (!result?.success || !result.data) {
        notify("error", result?.error || "校验失败");
        return;
      }

      validationState.value = {
        ok: result.data.ok === true,
        errors: result.data.errors || [],
        warnings: result.data.warnings || [],
      };
      notify(
        validationState.value.ok ? "success" : "warning",
        validationState.value.ok ? "工作流校验通过" : "工作流校验未通过",
      );
    } catch (error) {
      notify("error", error?.message || "校验失败");
    } finally {
      isValidating.value = false;
    }
  };

  const removeWorkflowById = async (workflowId) => {
    if (!workflowId) {
      return;
    }
    const result = await workflowDelete(workflowId);
    if (!result?.success) {
      notify("error", result?.error || "删除失败");
      return;
    }

    if (workflow.value.id === workflowId) {
      createNewWorkflow();
    }
    await refreshWorkflowList();
    notify("success", "工作流已删除");
  };

  const resolveNodeDefinition = (nodeType) =>
    nodeDefinitions.value.find((item) => item.type === nodeType) ||
    objectInfoRecordToNodeDefinition(
      nodeObjectInfoMap.value?.[nodeType],
      nodeType,
    );

  const resolveNodeDefaultConfig = (nodeType) => {
    const objectInfo = nodeObjectInfoMap.value?.[nodeType];
    if (objectInfo && typeof objectInfo === "object") {
      return cloneJsonValue(objectInfo.defaultConfig || {}, {});
    }
    const nodeDef = resolveNodeDefinition(nodeType);
    return cloneJsonValue(nodeDef?.defaultConfig || {}, {});
  };

  const resolveNodeDefaultLabel = (nodeType) => {
    const objectInfo = nodeObjectInfoMap.value?.[nodeType];
    const objectInfoLabel = String(
      objectInfo?.displayName || objectInfo?.label || "",
    ).trim();
    if (objectInfoLabel) {
      return objectInfoLabel;
    }
    const nodeDef = resolveNodeDefinition(nodeType);
    if (typeof nodeDef?.label === "string" && nodeDef.label.trim()) {
      return nodeDef.label.trim();
    }
    return nodeType;
  };

  const addNodeByType = (nodeType, options = {}) => {
    ensureGraphCompat(workflow.value);
    const index = workflow.value.graph.nodes.length;
    const fallbackPosition = {
      x: 52 + (index % 3) * 196,
      y: 56 + Math.floor(index / 3) * 118,
    };
    const nextPosition = {
      x:
        typeof options?.position?.x === "number"
          ? Math.max(8, Math.round(options.position.x))
          : fallbackPosition.x,
      y:
        typeof options?.position?.y === "number"
          ? Math.max(8, Math.round(options.position.y))
          : fallbackPosition.y,
    };

    const newNode = {
      id: createNodeId(),
      type: nodeType,
      label: resolveNodeDefaultLabel(nodeType),
      position: nextPosition,
      size: {
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
      },
      appearance: {
        fontSize: DEFAULT_NODE_FONT_SIZE,
      },
      config: resolveNodeDefaultConfig(nodeType),
    };
    workflow.value.graph.nodes.push(newNode);
    selectedNodeId.value = newNode.id;
    return newNode;
  };

  const selectNode = (nodeId) => {
    selectedNodeId.value = nodeId;
    selectedEdgeId.value = "";
  };

  const removeNode = (nodeId) => {
    ensureGraphCompat(workflow.value);
    workflow.value.graph.nodes = workflow.value.graph.nodes.filter(
      (node) => node.id !== nodeId,
    );
    workflow.value.graph.edges = workflow.value.graph.edges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId,
    );
    workflow.value.graph.reroutes = workflow.value.graph.reroutes.filter(
      (reroute) =>
        typeof reroute?.linkId !== "string" ||
        workflow.value.graph.edges.some((edge) => edge.id === reroute.linkId),
    );
    syncGraphLinks(workflow.value);
    if (selectedNodeId.value === nodeId) {
      selectedNodeId.value = "";
    }
    if (sourceNodeId.value === nodeId) {
      sourceNodeId.value = "";
    }
    if (targetNodeId.value === nodeId) {
      targetNodeId.value = "";
    }
  };

  const addEdge = (payload = {}) => {
    ensureGraphCompat(workflow.value);
    const nextSourceNodeId =
      typeof payload.source === "string" && payload.source.trim()
        ? payload.source.trim()
        : sourceNodeId.value;
    const nextTargetNodeId =
      typeof payload.target === "string" && payload.target.trim()
        ? payload.target.trim()
        : targetNodeId.value;
    const nextSourcePort =
      typeof payload.sourcePort === "string" && payload.sourcePort.trim()
        ? payload.sourcePort.trim()
        : "output";
    const nextTargetPort =
      typeof payload.targetPort === "string" && payload.targetPort.trim()
        ? payload.targetPort.trim()
        : "input";
    const replaceTargetPort = payload.replaceTargetPort === true;

    if (!nextSourceNodeId || !nextTargetNodeId) {
      notify("warning", "请选择 source 和 target 节点");
      return "";
    }

    if (nextSourceNodeId === nextTargetNodeId) {
      notify("warning", "source 和 target 不能相同");
      return "";
    }

    const existingTargetEdgeIds = workflow.value.graph.edges
      .filter(
        (edge) =>
          edge.target === nextTargetNodeId &&
          String(edge.targetPort || "input") === nextTargetPort,
      )
      .map((edge) => edge.id);

    if (replaceTargetPort) {
      workflow.value.graph.edges = workflow.value.graph.edges.filter(
        (edge) =>
          !(
            edge.target === nextTargetNodeId &&
            String(edge.targetPort || "input") === nextTargetPort
          ),
      );
      workflow.value.graph.reroutes = workflow.value.graph.reroutes.filter(
        (reroute) =>
          typeof reroute?.linkId !== "string" ||
          workflow.value.graph.edges.some((edge) => edge.id === reroute.linkId),
      );
    }

    const duplicated = workflow.value.graph.edges.some(
      (edge) =>
        edge.source === nextSourceNodeId &&
        edge.target === nextTargetNodeId &&
        String(edge.sourcePort || "output") === nextSourcePort &&
        String(edge.targetPort || "input") === nextTargetPort,
    );
    if (duplicated) {
      notify("warning", "连线已存在");
      return "";
    }

    if (existingTargetEdgeIds.length) {
      workflow.value.graph.edges = workflow.value.graph.edges.filter(
        (edge) => !existingTargetEdgeIds.includes(edge.id),
      );
      workflow.value.graph.reroutes = workflow.value.graph.reroutes.filter(
        (reroute) => !existingTargetEdgeIds.includes(reroute?.linkId),
      );
    }

    const edge = {
      id: createEdgeId(),
      source: nextSourceNodeId,
      target: nextTargetNodeId,
      sourcePort: nextSourcePort,
      targetPort: nextTargetPort,
    };
    workflow.value.graph.edges.push(edge);
    syncGraphLinks(workflow.value);
    selectedEdgeId.value = edge.id;
    return edge.id;
  };

  const removeSelectedEdge = () => {
    if (!selectedEdgeId.value) {
      return;
    }
    ensureGraphCompat(workflow.value);
    workflow.value.graph.edges = workflow.value.graph.edges.filter(
      (edge) => edge.id !== selectedEdgeId.value,
    );
    workflow.value.graph.reroutes = workflow.value.graph.reroutes.filter(
      (reroute) => reroute?.linkId !== selectedEdgeId.value,
    );
    syncGraphLinks(workflow.value);
    selectedEdgeId.value = "";
  };

  const applyNodeConfigDraft = () => {
    if (!selectedNode.value) {
      return;
    }

    const parsed = parseJsonSafely(selectedNodeConfigDraft.value, null);
    if (!parsed) {
      selectedNodeConfigError.value = "配置 JSON 解析失败，请检查格式";
      return;
    }

    selectedNode.value.config = parsed;
    selectedNodeConfigError.value = "";
    notify("success", "节点配置已更新");
  };

  watch(
    () => selectedNode.value,
    (node) => {
      if (!node) {
        selectedNodeConfigDraft.value = "{}";
        selectedNodeConfigError.value = "";
        return;
      }
      selectedNodeConfigDraft.value = JSON.stringify(
        node.config || {},
        null,
        2,
      );
      selectedNodeConfigError.value = "";
    },
    { immediate: true },
  );

  const MAX_WORKFLOW_LOG_LINES = 900;
  const MAX_PIPELINE_LOG_LINES = 900;
  const MAX_NODE_LOG_LINES = 700;

  const trimLogLines = (logs, maxSize) => {
    if (!Array.isArray(logs)) {
      return [];
    }
    if (logs.length <= maxSize) {
      return logs;
    }
    return logs.slice(logs.length - maxSize);
  };

  const resetRunArtifacts = () => {
    workflowLogs.value = [];
    pipelineLogs.value = [];
    nodeLogsByNodeId.value = {};
    runNodeStates.value = {};
  };

  const normalizeEventScope = (evt) => {
    const rawScope = typeof evt?.scope === "string" ? evt.scope.trim() : "";
    if (
      rawScope === "workflow" ||
      rawScope === "pipeline" ||
      rawScope === "node"
    ) {
      return rawScope;
    }

    const eventType = String(evt?.type || "");
    if (eventType.startsWith("pipeline.")) {
      return "pipeline";
    }
    if (eventType.startsWith("node.")) {
      return "node";
    }
    return "workflow";
  };

  const formatEventLogLine = (evt) => {
    if (typeof evt === "string") {
      return evt;
    }

    if (!evt || typeof evt !== "object") {
      return String(evt || "");
    }

    const timestamp = String(evt.ts || "").slice(11, 19) || "--:--:--";
    const eventType = String(evt.type || "event");
    const messageText =
      typeof evt?.payload?.message === "string"
        ? evt.payload.message.trim()
        : typeof evt?.message === "string"
          ? evt.message.trim()
          : "";

    return `[${timestamp}] ${eventType}${messageText ? ` ${messageText}` : ""}`;
  };

  const appendWorkflowLog = (line) => {
    workflowLogs.value = trimLogLines(
      [...workflowLogs.value, line],
      MAX_WORKFLOW_LOG_LINES,
    );
  };

  const appendPipelineLog = (line) => {
    pipelineLogs.value = trimLogLines(
      [...pipelineLogs.value, line],
      MAX_PIPELINE_LOG_LINES,
    );
  };

  const appendNodeLog = (nodeId, line) => {
    if (!nodeId) {
      appendWorkflowLog(line);
      return;
    }

    const previous = nodeLogsByNodeId.value;
    const nodeLogs = Array.isArray(previous[nodeId]) ? previous[nodeId] : [];
    nodeLogsByNodeId.value = {
      ...previous,
      [nodeId]: trimLogLines([...nodeLogs, line], MAX_NODE_LOG_LINES),
    };
  };

  const patchRunNodeState = (nodeId, patch = {}) => {
    if (!nodeId) {
      return;
    }

    runNodeStates.value = {
      ...runNodeStates.value,
      [nodeId]: {
        ...(runNodeStates.value[nodeId] || {}),
        ...patch,
      },
    };
  };

  const syncRunRecordSnapshot = (record = {}) => {
    if (record?.nodeStates && typeof record.nodeStates === "object") {
      runNodeStates.value = cloneJsonValue(record.nodeStates, {});
    }

    if (Array.isArray(record.workflowLogs)) {
      workflowLogs.value = trimLogLines(
        record.workflowLogs
          .map((item) => formatEventLogLine(item))
          .filter(Boolean),
        MAX_WORKFLOW_LOG_LINES,
      );
    }

    if (Array.isArray(record.pipelineLogs)) {
      pipelineLogs.value = trimLogLines(
        record.pipelineLogs
          .map((item) => formatEventLogLine(item))
          .filter(Boolean),
        MAX_PIPELINE_LOG_LINES,
      );
    }

    if (record?.nodeLogs && typeof record.nodeLogs === "object") {
      const nextNodeLogs = {};
      Object.entries(record.nodeLogs).forEach(([nodeId, items]) => {
        if (!Array.isArray(items) || !nodeId) {
          return;
        }
        nextNodeLogs[nodeId] = trimLogLines(
          items.map((item) => formatEventLogLine(item)).filter(Boolean),
          MAX_NODE_LOG_LINES,
        );
      });
      nodeLogsByNodeId.value = nextNodeLogs;
    }
  };

  const appendSystemLog = (text, scope = "workflow") => {
    const line = `[SYS] ${String(text || "").trim()}`.trim();
    if (!line) {
      return;
    }

    if (scope === "pipeline") {
      appendPipelineLog(line);
      return;
    }
    appendWorkflowLog(line);
  };

  const handleRunEvent = async (evt) => {
    if (!evt || typeof evt !== "object" || !evt.runId) {
      if (evt && typeof evt === "object") {
        lastRunEvent.value = cloneJsonValue(evt, null);
      }
      return;
    }

    lastRunEvent.value = cloneJsonValue(evt, null);

    if (!activeRunId.value) {
      activeRunId.value = evt.runId;
    }

    if (evt.runId !== activeRunId.value) {
      return;
    }

    const eventType = String(evt.type || "");
    const eventScope = normalizeEventScope(evt);
    const progressPatch =
      evt?.payload?.progress && typeof evt.payload.progress === "object"
        ? evt.payload.progress
        : null;

    if (progressPatch) {
      applyRunProgressPatch(progressPatch);
      if (evt.nodeId) {
        patchRunNodeState(evt.nodeId, {
          progress: {
            ...(runNodeStates.value[evt.nodeId]?.progress || {}),
            ...progressPatch,
          },
          progressPercent: resolveProgressPercent(progressPatch),
        });
      }
    }

    if (eventType === "node.started" && evt.nodeId) {
      patchRunNodeState(evt.nodeId, {
        nodeId: evt.nodeId,
        nodeRunId: evt?.payload?.nodeRunId || "",
        attempt: evt?.payload?.attempt || 1,
        status: "running",
        startedAt: evt.ts,
        type:
          evt?.payload?.nodeType || runNodeStates.value[evt.nodeId]?.type || "",
        label:
          evt?.payload?.nodeLabel ||
          runNodeStates.value[evt.nodeId]?.label ||
          "",
        configSnapshot:
          evt?.payload?.configSnapshot ||
          runNodeStates.value[evt.nodeId]?.configSnapshot ||
          {},
        inputPreview:
          evt?.payload?.inputPreview ||
          runNodeStates.value[evt.nodeId]?.inputPreview ||
          null,
        progress: runNodeStates.value[evt.nodeId]?.progress || null,
        progressPercent: runNodeStates.value[evt.nodeId]?.progressPercent || 0,
      });
    } else if (eventType === "node.success" && evt.nodeId) {
      patchRunNodeState(evt.nodeId, {
        status: "success",
        endedAt: evt.ts,
        outputPreview:
          evt?.payload?.outputPreview ||
          runNodeStates.value[evt.nodeId]?.outputPreview ||
          null,
        progressPercent: 100,
      });
    } else if (eventType === "node.failed" && evt.nodeId) {
      patchRunNodeState(evt.nodeId, {
        status: "failed",
        endedAt: evt.ts,
        error: {
          code: evt?.payload?.code || "WORKFLOW_EXECUTION_ERROR",
          message: evt?.payload?.message || "Node execution failed",
        },
        progressPercent: runNodeStates.value[evt.nodeId]?.progressPercent || 0,
      });
    }

    const line = formatEventLogLine(evt);
    if (eventScope === "node") {
      appendNodeLog(evt.nodeId, line);
    } else if (eventScope === "pipeline") {
      appendPipelineLog(line);
    } else {
      appendWorkflowLog(line);
    }

    if (eventType === "run.started") {
      activeRunStatus.value = "running";
      startRunStatusPolling(activeRunId.value);
    } else if (eventType === "run.success") {
      activeRunStatus.value = "success";
      stopRunStatusPolling();
      await refreshRunHistory();
    } else if (eventType === "run.failed") {
      activeRunStatus.value = "failed";
      stopRunStatusPolling();
      await refreshRunHistory();
    } else if (eventType === "run.cancelled") {
      activeRunStatus.value = "cancelled";
      stopRunStatusPolling();
      await refreshRunHistory();
    }
  };

  const startRun = async () => {
    await runWorkflowPayload(workflow.value);
  };

  const cancelRun = async () => {
    if (!activeRunId.value) {
      return;
    }

    const result = await workflowCancel({ runId: activeRunId.value });
    if (!result?.success) {
      notify("error", result?.error || "取消运行失败");
      return;
    }

    if (result?.data?.cancelled) {
      activeRunStatus.value = "cancelling";
      appendSystemLog(`Cancel requested runId=${activeRunId.value}`);
    } else {
      notify("warning", "当前运行不可取消");
    }
  };

  const resolveCanvasPointer = (event, scale = 1) => {
    if (!canvasRef.value || !event) {
      return { x: 0, y: 0 };
    }

    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const rect = canvasRef.value.getBoundingClientRect();

    return {
      x: (event.clientX - rect.left + canvasRef.value.scrollLeft) / safeScale,
      y: (event.clientY - rect.top + canvasRef.value.scrollTop) / safeScale,
    };
  };

  const handleCanvasMouseMove = (event, scale = 1) => {
    if (!dragState.nodeId || !canvasRef.value) {
      return;
    }

    const node = workflow.value.graph.nodes.find(
      (item) => item.id === dragState.nodeId,
    );
    if (!node) {
      return;
    }

    const pointer = resolveCanvasPointer(event, scale);
    node.position.x = Math.max(8, Math.round(pointer.x - dragState.offsetX));
    node.position.y = Math.max(8, Math.round(pointer.y - dragState.offsetY));
  };

  const stopNodeDrag = () => {
    dragState.nodeId = "";
  };

  const startNodeDrag = (node, event, scale = 1) => {
    if (!canvasRef.value || !node) {
      return;
    }

    const pointer = resolveCanvasPointer(event, scale);
    dragState.nodeId = node.id;
    dragState.offsetX = pointer.x - node.position.x;
    dragState.offsetY = pointer.y - node.position.y;
    selectedNodeId.value = node.id;
  };

  onMounted(async () => {
    if (typeof window !== "undefined") {
      window.__workflowDesigner = {
        loadTemplateById,
      };
    }

    await Promise.allSettled([
      refreshWorkflowList(),
      refreshNodeDefinitions(),
      refreshRunHistory(),
    ]);
    await hydratePendingTemplateDocument();
    disposeRunEvent = onWorkflowRunEvent((evt) => {
      handleRunEvent(evt);
    });
  });

  onUnmounted(() => {
    if (
      typeof window !== "undefined" &&
      window.__workflowDesigner?.loadTemplateById === loadTemplateById
    ) {
      delete window.__workflowDesigner;
    }
    if (typeof disposeRunEvent === "function") {
      disposeRunEvent();
    }
    stopRunStatusPolling();
  });

  return {
    workflow,
    workflowSummaries,
    nodeDefinitions,
    nodeObjectInfoMap,
    nodePaletteGroups,
    runHistory,
    activeRunId,
    activeRunStatus,
    runProgress,
    workflowLogs,
    pipelineLogs,
    selectedNodeLogs,
    runNodeStates,
    lastRunEvent,
    selectedNodeRunState,
    totalWorksDisplay,
    completedWorksDisplay,
    inProgressWorksDisplay,
    remainingWorksDisplay,
    isRunInProgress,
    isSaving,
    isValidating,
    isLoadingWorkflow,
    selectedNodeId,
    selectedEdgeId,
    selectedNode,
    selectedNodeObjectInfo,
    selectedEdge,
    selectedNodeConfigDraft,
    selectedNodeConfigError,
    sourceNodeId,
    targetNodeId,
    currentNodeOptions,
    validationState,
    edgeVisualList,
    canvasRef,
    createNewWorkflow,
    loadTemplateById,
    loadWorkflowById,
    saveCurrentWorkflow,
    validateCurrentWorkflow,
    removeWorkflowById,
    addNodeByType,
    selectNode,
    removeNode,
    addEdge,
    removeSelectedEdge,
    applyNodeConfigDraft,
    startRun,
    runWorkflowPayload,
    inspectRunRecord,
    rerunHistoryRun,
    cancelRun,
    startNodeDrag,
    handleCanvasMouseMove,
    stopNodeDrag,
  };
};

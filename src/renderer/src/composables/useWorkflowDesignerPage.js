import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  ref,
  watch,
} from "vue";
import { useMessage } from "naive-ui";
import { selectFile } from "../api/dialogApi";
import { workflowPartialEnqueue } from "../api/workflowApi";
import { workflowDesignerContextKey } from "../components/workflow/designer/workflowDesignerContext";
import { useWorkflowDesigner } from "./useWorkflowDesigner";
import { useWorkflowCanvasStore } from "../stores/workflowCanvas";
import { useWorkflowSelectionStore } from "../stores/workflowSelection";
import { useWorkflowCommandStore } from "../stores/workflowCommand";
import { useWorkflowKeybindingStore } from "../stores/workflowKeybinding";
import { useWorkflowQueueStore } from "../stores/workflowQueue";
import { useWorkflowHubStore } from "../stores/workflowHub";

export const useWorkflowDesignerPage = () => {
  const isPlainRecord = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);

  const cloneJsonValue = (value, fallbackValue = null) => {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallbackValue;
    }
  };

  const TRANSLATE_SUBTITLE_NODE_TYPE = "whisper.translateSubtitles";
  const PACK_SUBTITLE_NODE_TYPE = "whisper.packSubtitles";
  const UPLOAD_SUBTITLE_NODE_TYPE = "tg.uploadSubtitles";
  const CLOUD_DELETE_RECENT_NODE_TYPE = "asmr.cloudDeleteRecentUploads";
  const LOCAL_DELETE_SCANNED_NODE_TYPE = "files.localDeleteScanned";
  const subtitleFormatOptions = ["lrc", "srt", "vtt"];
  const resolveSearchParam = (key) => {
    if (typeof window === "undefined") {
      return "";
    }

    try {
      return String(
        new URLSearchParams(window.location.search).get(key) || "",
      ).trim();
    } catch {
      return "";
    }
  };

  const workflowParityScene = resolveSearchParam("workflowParityScene");
  const workflowParityCapturePath = resolveSearchParam(
    "workflowParityCapturePath",
  );
  const workflowParityCaptureDelay = Number.parseInt(
    resolveSearchParam("workflowParityCaptureDelay") || "360",
    10,
  );
  const workflowParityAutoExit = /^(1|true|yes)$/i.test(
    resolveSearchParam("workflowParityAutoExit"),
  );
  const LOCAL_NODE_DEFINITION_FALLBACK = [
    {
      type: TRANSLATE_SUBTITLE_NODE_TYPE,
      io: {
        input: [
          {
            key: "targetPath/path",
            label: "媒体目录（可来自上游）",
            datatype: "PATH",
          },
        ],
        output: [
          {
            key: "items[]",
            label: "已翻译作品列表",
            datatype: "LIST",
          },
          {
            key: "totalWorks",
            label: "作品总数",
            datatype: "NUMBER",
          },
        ],
      },
    },
    {
      type: PACK_SUBTITLE_NODE_TYPE,
      io: {
        input: [
          {
            key: "targetPath/path",
            label: "字幕目录（可来自上游）",
            datatype: "PATH",
          },
          {
            key: "code",
            label: "RJ/VJ/BJ 过滤提示（可选）",
            datatype: "STRING",
          },
        ],
        output: [
          {
            key: "outputPaths[]",
            label: "打包后压缩包路径",
            datatype: "LIST",
          },
          {
            key: "results[]",
            label: "逐目录打包结果",
            datatype: "LIST",
          },
        ],
      },
    },
    {
      type: UPLOAD_SUBTITLE_NODE_TYPE,
      io: {
        input: [
          {
            key: "archives/files",
            label: "待上传压缩包列表（可选）",
            datatype: "FILES",
          },
          {
            key: "scanPath/path",
            label: "扫描目录（无上游时使用）",
            datatype: "PATH",
          },
        ],
        output: [
          {
            key: "uploadedFiles[]",
            label: "上传成功列表",
            datatype: "LIST",
          },
          {
            key: "skippedFiles[]",
            label: "跳过列表",
            datatype: "LIST",
          },
          {
            key: "failedFiles[]",
            label: "失败列表",
            datatype: "LIST",
          },
        ],
      },
    },
    {
      type: CLOUD_DELETE_RECENT_NODE_TYPE,
      io: {
        input: [
          {
            key: "rjCodes",
            label: "待删除 RJ 编号（可选，来自上游）",
            datatype: "LIST",
          },
        ],
        output: [
          {
            key: "matchedWorkIds[]",
            label: "匹配到的云端作品ID",
            datatype: "LIST",
          },
          {
            key: "deletedCount",
            label: "删除成功数量",
            datatype: "NUMBER",
          },
          {
            key: "notFound[]",
            label: "未匹配编号",
            datatype: "LIST",
          },
        ],
      },
    },
    {
      type: LOCAL_DELETE_SCANNED_NODE_TYPE,
      io: {
        input: [
          {
            key: "scanPath/path",
            label: "扫描目录（可来自上游）",
            datatype: "PATH",
          },
        ],
        output: [
          {
            key: "files[]",
            label: "扫描到的文件",
            datatype: "LIST",
          },
          {
            key: "deletedFiles[]",
            label: "已删除文件",
            datatype: "LIST",
          },
          {
            key: "failedFiles[]",
            label: "删除失败文件",
            datatype: "LIST",
          },
        ],
      },
    },
    {
      type: "files.scanArchives",
      io: {
        input: [
          {
            key: "path",
            label: "扫描目录",
            datatype: "PATH",
          },
        ],
        output: [
          {
            key: "archives[]",
            label: "压缩包归档列表",
            datatype: "LIST",
          },
        ],
      },
    },
    {
      type: "tools.extractFileNames",
      io: {
        input: [
          {
            key: "sourceDir",
            label: "源目录",
            datatype: "PATH",
          },
        ],
        output: [
          {
            key: "outputPath",
            label: "结果文件路径",
            datatype: "PATH",
          },
          {
            key: "entries[]",
            label: "提取条目列表",
            datatype: "LIST",
          },
        ],
      },
    },
    {
      type: "tools.cleanData",
      io: {
        input: [
          {
            key: "mainFile",
            label: "主文件（保留集合）",
            datatype: "FILE",
          },
          {
            key: "compareDir",
            label: "待比对目录",
            datatype: "PATH",
          },
        ],
        output: [
          {
            key: "filesToDelete[]",
            label: "可删除文件列表",
            datatype: "LIST",
          },
          {
            key: "filesToKeep[]",
            label: "保留文件列表",
            datatype: "LIST",
          },
        ],
      },
    },
    {
      type: "input.manual",
      io: {
        input: [
          {
            key: "inputValues[0]",
            label: "上游首个输入（可选）",
            datatype: "ANY",
          },
        ],
        output: [
          {
            key: "value",
            label: "透传值/手动值",
            datatype: "ANY",
          },
        ],
      },
    },
    {
      type: "file.readText",
      io: {
        input: [
          {
            key: "path",
            label: "文件路径（path/上游）",
            datatype: "PATH",
          },
        ],
        output: [
          {
            key: "path",
            label: "实际读取路径",
            datatype: "PATH",
          },
          {
            key: "content",
            label: "文本内容",
            datatype: "STRING",
          },
        ],
      },
    },
    {
      type: "file.writeText",
      io: {
        input: [
          {
            key: "path",
            label: "写入路径（path/上游）",
            datatype: "PATH",
          },
          {
            key: "content",
            label: "文本内容（content/上游）",
            datatype: "STRING",
          },
        ],
        output: [
          {
            key: "path",
            label: "写入文件路径",
            datatype: "PATH",
          },
          {
            key: "bytes",
            label: "写入字节数",
            datatype: "NUMBER",
          },
        ],
      },
    },
    {
      type: "util.delay",
      io: {
        input: [
          {
            key: "ms",
            label: "延时毫秒（config.ms）",
            datatype: "NUMBER",
          },
        ],
        output: [
          {
            key: "delayedMs",
            label: "实际延时毫秒",
            datatype: "NUMBER",
          },
        ],
      },
    },
    {
      type: "output.inspect",
      io: {
        input: [
          {
            key: "inputValues/inputMap",
            label: "上游任意输出",
            datatype: "ANY",
          },
        ],
        output: [
          {
            key: "inspectPayload",
            label: "透传调试数据",
            datatype: "ANY",
          },
        ],
      },
    },
  ];

  const message = useMessage();

  const {
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
    selectedNodeRunState,
    runNodeStates,
    lastRunEvent,
    totalWorksDisplay,
    completedWorksDisplay,
    inProgressWorksDisplay,
    remainingWorksDisplay,
    isRunInProgress,
    isSaving,
    isValidating,
    selectedNodeId,
    selectedEdgeId,
    selectedNode,
    selectedNodeObjectInfo,
    selectedNodeConfigDraft,
    selectedNodeConfigError,
    sourceNodeId,
    targetNodeId,
    currentNodeOptions,
    validationState,
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
  } = useWorkflowDesigner({ message });
  const canvasStore = useWorkflowCanvasStore();
  const selectionStore = useWorkflowSelectionStore();
  const commandStore = useWorkflowCommandStore();
  const keybindingStore = useWorkflowKeybindingStore();
  const queueStore = useWorkflowQueueStore();
  const workflowHub = useWorkflowHubStore();
  const comfyParityMode = ref(true);

  const nodeSearchKeyword = ref("");
  const nodePickerKeyword = ref("");
  const nodePickerStatusFilter = ref("all");
  const inspectorTab = ref("config");
  const MIN_CANVAS_ZOOM = 0.45;
  const MAX_CANVAS_ZOOM = 2.2;
  const BASE_CANVAS_WIDTH = 3200;
  const BASE_CANVAS_HEIGHT = 2000;
  const DEFAULT_NODE_WIDTH = 248;
  const DEFAULT_NODE_HEIGHT = 112;
  const DEFAULT_NODE_FONT_SIZE = 14;
  const MIN_NODE_WIDTH = 220;
  const MAX_NODE_WIDTH = 760;
  const MIN_NODE_HEIGHT = 56;
  const MAX_NODE_HEIGHT = 520;
  const MIN_NODE_FONT_SIZE = 12;
  const MAX_NODE_FONT_SIZE = 28;
  const GRID_SNAP_SIZE = 8;
  const DEFAULT_GROUP_WIDTH = 360;
  const DEFAULT_GROUP_HEIGHT = 220;
  const MIN_GROUP_WIDTH = 220;
  const MIN_GROUP_HEIGHT = 140;
  const REROUTE_HANDLE_SIZE = 10;
  const NODE_PORT_STACK_TOP = 50;
  const NODE_PORT_ROW_STEP = 20;
  const COMFY_NODE_TITLE_HEIGHT = 28;
  const COMFY_NODE_SLOT_HEIGHT = 18;
  const COMFY_NODE_WIDGET_HEIGHT = 18;
  const COMFY_NODE_WIDGET_ROW_GAP = 3;
  const COMFY_NODE_WIDGET_STACK_OFFSET = 6;
  const COMFY_NODE_WIDGET_SECTION_PADDING = 10;
  const COMFY_NODE_BASE_WIDTH = 120;
  const COMFY_NODE_WIDGET_MARGIN = 15;
  const COMFY_NODE_WIDGET_ARROW_MARGIN = 6;
  const COMFY_NODE_WIDGET_ARROW_WIDTH = 10;
  const COMFY_NODE_WIDGET_MIN_VALUE_WIDTH = 42;
  const COMFY_NODE_MIN_WIDTH = 150;
  const COMFY_NODE_MAX_WIDTH = 380;
  const COMFY_DEFAULT_INPUT_SLOT_COLOR = "var(--color-datatype-ANY, #a7a7a7)";
  const COMFY_DEFAULT_OUTPUT_SLOT_COLOR = "var(--color-datatype-ANY, #a7a7a7)";
  const NODE_INLINE_PANEL_WIDTH = 308;
  const NODE_INLINE_PANEL_HEIGHT = 286;
  const NODE_INLINE_PANEL_RUNTIME_HEIGHT = 368;
  const canvasZoom = computed({
    get: () => canvasStore.zoom,
    set: (value) => canvasStore.setZoom(value),
  });
  const bridgeBarCollapsed = ref(false);
  const leftDockCollapsed = ref(false);
  const nodeInlineInspectorVisible = ref(false);
  const nodeInlineInspectorTab = ref("config");
  const nodeInlineInspectorPinned = ref(false);
  const WIDE_CANVAS_BREAKPOINT = 1280;
  const prefersInlineInspector = ref(false);
  const nodeInlineInspectorManualPosition = ref({
    left: null,
    top: null,
  });
  const nodeInlineInspectorDrag = ref({
    active: false,
    offsetX: 0,
    offsetY: 0,
  });
  const nodeCardElementMap = new Map();
  let nodeHeightSyncScheduled = false;
  let comfyNodeNormalizeScheduled = false;
  let nodeCardResizeObserver = null;

  const clampNodeWidth = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_NODE_WIDTH;
    }
    const minWidth = comfyParityMode.value
      ? COMFY_NODE_MIN_WIDTH
      : MIN_NODE_WIDTH;
    const maxWidth = comfyParityMode.value
      ? COMFY_NODE_MAX_WIDTH
      : MAX_NODE_WIDTH;
    return Math.min(maxWidth, Math.max(minWidth, Math.round(parsed)));
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

  const resolveNodeDimensions = (node) => ({
    width: clampNodeWidth(node?.size?.width),
    height: clampNodeHeight(node?.size?.height),
  });

  const clampNodeFontSize = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_NODE_FONT_SIZE;
    }
    return Math.min(
      MAX_NODE_FONT_SIZE,
      Math.max(MIN_NODE_FONT_SIZE, Math.round(parsed)),
    );
  };

  const resolveNodeFontSize = (node) =>
    clampNodeFontSize(node?.appearance?.fontSize);

  const ensureNodeCardResizeObserver = () => {
    if (comfyParityMode.value) {
      return;
    }
    if (nodeCardResizeObserver || typeof ResizeObserver === "undefined") {
      return;
    }

    nodeCardResizeObserver = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const nodeId = entry.target?.dataset?.nodeId || "";
        if (!nodeId) {
          return;
        }
        syncSingleNodeDimensions(nodeId, entry.contentRect?.height);
      });
    });
  };

  const setNodeCardRef = (nodeId, element) => {
    if (!nodeId) {
      return;
    }

    const previousElement = nodeCardElementMap.get(nodeId);
    if (comfyParityMode.value) {
      if (previousElement && previousElement !== element) {
        nodeCardResizeObserver?.unobserve(previousElement);
      }
      if (element) {
        nodeCardElementMap.set(nodeId, element);
      } else {
        nodeCardElementMap.delete(nodeId);
      }
      return;
    }

    ensureNodeCardResizeObserver();
    if (previousElement && previousElement !== element) {
      nodeCardResizeObserver?.unobserve(previousElement);
    }

    if (element) {
      nodeCardElementMap.set(nodeId, element);
      nodeCardResizeObserver?.observe(element);
      return;
    }

    if (previousElement) {
      nodeCardResizeObserver?.unobserve(previousElement);
    }
    nodeCardElementMap.delete(nodeId);
  };

  const MINIMAP_WIDTH = 220;
  const MINIMAP_HEIGHT = 132;
  const logDockExpanded = ref(false);
  const runtimeDockTab = ref("queue");
  const logDockScope = ref("workflow");
  const dockLogKeyword = ref("");
  const quickPaletteVisible = ref(false);
  const quickPaletteMode = ref("node");
  const quickPaletteKeyword = ref("");
  const quickPaletteSelectedIndex = ref(0);
  const quickPaletteCanvasPoint = ref({
    x: 0,
    y: 0,
  });
  const spacePanPressed = ref(false);
  const canvasPan = ref({
    active: false,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  });
  const connectDrag = ref({
    active: false,
    sourceNodeId: "",
    sourcePortKey: "output",
    x: 0,
    y: 0,
  });
  const libraryDragNodeType = ref("");
  const connectHoverNodeId = ref("");
  const connectHoverPortKey = ref("");
  const connectFeedback = ref({
    edgeId: "",
    sourceNodeId: "",
    targetNodeId: "",
  });
  let connectFeedbackTimer = null;
  const minimapRef = ref(null);
  const minimapMetrics = ref({
    width: MINIMAP_WIDTH,
    height: MINIMAP_HEIGHT,
  });
  const minimapDrag = ref({
    active: false,
    offsetX: 0,
    offsetY: 0,
    pointerId: null,
  });
  const canvasViewport = ref({
    x: 0,
    y: 0,
    width: BASE_CANVAS_WIDTH,
    height: BASE_CANVAS_HEIGHT,
  });
  const canvasZoomPercent = computed(() => canvasStore.zoomPercent);
  const selectedNodeIds = computed(() =>
    selectionStore.selectedItems
      .filter((item) => item.type === "node")
      .map((item) => item.id),
  );
  const selectedEdgeIds = computed(() =>
    selectionStore.selectedItems
      .filter((item) => item.type === "edge")
      .map((item) => item.id),
  );
  const selectedGroupIds = computed(() =>
    selectionStore.selectedItems
      .filter((item) => item.type === "group")
      .map((item) => item.id),
  );
  const selectedRerouteIds = computed(() =>
    selectionStore.selectedItems
      .filter((item) => item.type === "reroute")
      .map((item) => item.id),
  );
  const canCreateGroupFromSelection = computed(
    () => selectedNodeIds.value.length > 0,
  );
  const marqueeStyle = computed(() => ({
    left: `${selectionStore.marqueeRect.left}px`,
    top: `${selectionStore.marqueeRect.top}px`,
    width: `${selectionStore.marqueeRect.width}px`,
    height: `${selectionStore.marqueeRect.height}px`,
  }));
  const nodeResizeState = ref({
    active: false,
    nodeId: "",
    handle: "",
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    originX: 0,
    originY: 0,
    originWidth: DEFAULT_NODE_WIDTH,
    originHeight: DEFAULT_NODE_HEIGHT,
  });
  const nodeCopyClipboard = ref(null);
  const clipboardPasteSerial = ref(0);
  const nodeTitleEditState = ref({
    active: false,
    nodeId: "",
    draft: "",
  });
  const CONTEXT_MENU_MARGIN = 8;
  const DEFAULT_CONTEXT_MENU_METRICS = {
    width: 236,
    height: 268,
  };
  const createDefaultContextMenuState = () => ({
    visible: false,
    x: 0,
    y: 0,
    anchorX: 0,
    anchorY: 0,
    scope: "canvas",
    nodeId: "",
    edgeId: "",
    groupId: "",
    rerouteId: "",
  });
  const contextMenuState = ref(createDefaultContextMenuState());
  const contextMenuMetrics = ref({ ...DEFAULT_CONTEXT_MENU_METRICS });

  const nodeBatchDragState = ref({
    active: false,
    pointerId: null,
    anchorX: 0,
    anchorY: 0,
    nodes: [],
  });
  const groupDragState = ref({
    active: false,
    groupId: "",
    pointerId: null,
    offsetX: 0,
    offsetY: 0,
  });
  const groupResizeState = ref({
    active: false,
    groupId: "",
    pointerId: null,
    handle: "",
    startClientX: 0,
    startClientY: 0,
    originX: 0,
    originY: 0,
    originWidth: DEFAULT_GROUP_WIDTH,
    originHeight: DEFAULT_GROUP_HEIGHT,
  });
  const rerouteDragState = ref({
    active: false,
    rerouteId: "",
    pointerId: null,
  });
  const GRAPH_HISTORY_LIMIT = 120;
  const skipNextCanvasBackgroundClick = ref(false);
  const graphHistoryPast = ref([]);
  const graphHistoryFuture = ref([]);
  let graphHistoryCommitTimer = null;
  let graphHistoryApplying = false;
  let graphHistorySignature = "";
  const subgraphNavigationStack = ref([]);
  const activeSubgraphId = ref("");
  const normalizeSubgraphId = (value) => String(value || "").trim();
  const resolveRecordStringByKeys = (recordValue, keys = []) => {
    if (!isPlainRecord(recordValue) || !Array.isArray(keys)) {
      return "";
    }
    const matched = keys.find((key) => {
      const value = recordValue?.[key];
      return typeof value === "string" && value.trim();
    });
    if (!matched) {
      return "";
    }
    return String(recordValue?.[matched] || "").trim();
  };
  const resolveNodeContainerSubgraphId = (node) =>
    resolveRecordStringByKeys(node, [
      "graphId",
      "graph_id",
      "parentGraphId",
      "parent_graph_id",
      "ownerSubgraphId",
      "subgraphOwnerId",
      "containerSubgraphId",
      "container_subgraph_id",
    ]) ||
    resolveRecordStringByKeys(node?.meta, [
      "graphId",
      "graph_id",
      "parentGraphId",
      "parent_graph_id",
      "ownerSubgraphId",
      "subgraphOwnerId",
      "containerSubgraphId",
      "container_subgraph_id",
    ]);
  const resolveGroupContainerSubgraphId = (group) =>
    resolveRecordStringByKeys(group, [
      "subgraphId",
      "subgraph_id",
      "graphId",
      "graph_id",
      "parentGraphId",
      "parent_graph_id",
    ]) ||
    resolveRecordStringByKeys(group?.meta, [
      "subgraphId",
      "subgraph_id",
      "graphId",
      "graph_id",
      "parentGraphId",
      "parent_graph_id",
    ]);
  const subgraphDefinitionMap = computed(() => {
    const map = new Map();
    const appendDefinitions = (collection) => {
      if (!isPlainRecord(collection)) {
        return;
      }
      Object.entries(collection).forEach(([key, value]) => {
        const normalizedId = normalizeSubgraphId(key);
        if (!normalizedId || !isPlainRecord(value)) {
          return;
        }
        map.set(normalizedId, {
          ...value,
          id: normalizedId,
        });
      });
    };
    appendDefinitions(workflow.value?.extra?.subgraphs);
    appendDefinitions(workflow.value?.graph?.extra?.subgraphs);
    appendDefinitions(workflow.value?.extra?.subgraphDefinitions);
    appendDefinitions(workflow.value?.graph?.extra?.subgraphDefinitions);
    return map;
  });
  const resolveNodeSubgraphTargetId = (node) => {
    if (!node) {
      return "";
    }
    const rawCandidates = [
      node?.subgraphId,
      node?.subgraph_id,
      node?.subgraphRef,
      node?.subgraph_ref,
      node?.meta?.subgraphId,
      node?.meta?.subgraph_id,
      node?.meta?.subgraphRef,
      node?.meta?.subgraph_ref,
      node?.config?.subgraphId,
      node?.config?.subgraph_id,
      node?.config?.subgraphRef,
      node?.config?.subgraph_ref,
    ]
      .map((item) => normalizeSubgraphId(item))
      .filter(Boolean);
    if (!rawCandidates.length) {
      return "";
    }
    const matched = rawCandidates.find((id) =>
      subgraphDefinitionMap.value.has(id),
    );
    return matched || rawCandidates[0];
  };
  const hasSubgraphDefinition = (subgraphId) =>
    subgraphDefinitionMap.value.has(normalizeSubgraphId(subgraphId));
  const canExitActiveSubgraph = computed(
    () =>
      Boolean(activeSubgraphId.value) ||
      subgraphNavigationStack.value.length > 0,
  );
  const isNodeVisibleInActiveSubgraph = (node) => {
    const activeId = normalizeSubgraphId(activeSubgraphId.value);
    const nodeContainerId = normalizeSubgraphId(
      resolveNodeContainerSubgraphId(node),
    );
    if (!activeId) {
      return !nodeContainerId;
    }
    return nodeContainerId === activeId;
  };
  const enterSubgraph = (subgraphId) => {
    const nextId = normalizeSubgraphId(subgraphId);
    if (!nextId) {
      return;
    }
    if (activeSubgraphId.value === nextId) {
      return;
    }
    subgraphNavigationStack.value = [
      ...subgraphNavigationStack.value,
      activeSubgraphId.value,
    ];
    activeSubgraphId.value = nextId;
  };
  const exitSubgraph = () => {
    if (!subgraphNavigationStack.value.length) {
      activeSubgraphId.value = "";
      return;
    }
    const history = [...subgraphNavigationStack.value];
    const previousId = history.pop();
    subgraphNavigationStack.value = history;
    activeSubgraphId.value = normalizeSubgraphId(previousId);
  };

  const clampToGrid = (value, min = 8) =>
    Math.max(
      min,
      Math.round(Number(value || 0) / GRID_SNAP_SIZE) * GRID_SNAP_SIZE,
    );

  const ensureGraphCollections = () => {
    if (!workflow.value || typeof workflow.value !== "object") {
      return;
    }
    if (!workflow.value.graph || typeof workflow.value.graph !== "object") {
      workflow.value.graph = {};
    }
    const graph = workflow.value.graph;
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
  };

  const cloneJsonSafe = (value, fallback) => {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  };
  const captureGraphHistorySnapshot = () =>
    cloneJsonSafe(workflow.value?.graph || {}, {
      nodes: [],
      edges: [],
      links: [],
      groups: [],
      reroutes: [],
      floatingLinks: [],
      state: {},
      extra: {},
      definitions: {},
    });
  const normalizeSelectionAfterGraphRestore = () => {
    ensureGraphCollections();
    const nodeIdSet = new Set(
      (workflow.value?.graph?.nodes || []).map((node) =>
        String(node?.id || ""),
      ),
    );
    const edgeIdSet = new Set(
      (workflow.value?.graph?.edges || []).map((edge) =>
        String(edge?.id || ""),
      ),
    );
    const groupIdSet = new Set(
      (workflow.value?.graph?.groups || []).map((group) =>
        String(group?.id || ""),
      ),
    );
    const rerouteIdSet = new Set(
      (workflow.value?.graph?.reroutes || []).map((item) =>
        String(item?.id || ""),
      ),
    );
    const nextSelection = selectionStore.selectedItems.filter((item) => {
      if (item.type === "node") {
        return nodeIdSet.has(String(item.id || ""));
      }
      if (item.type === "edge") {
        return edgeIdSet.has(String(item.id || ""));
      }
      if (item.type === "group") {
        return groupIdSet.has(String(item.id || ""));
      }
      if (item.type === "reroute") {
        return rerouteIdSet.has(String(item.id || ""));
      }
      return false;
    });
    selectionStore.setSelection(nextSelection);
    if (!nodeIdSet.has(String(selectedNodeId.value || ""))) {
      selectedNodeId.value = "";
    }
    if (!edgeIdSet.has(String(selectedEdgeId.value || ""))) {
      selectedEdgeId.value = "";
    }
  };
  const applyGraphHistorySnapshot = (snapshot) => {
    if (!snapshot || typeof snapshot !== "object") {
      return false;
    }
    graphHistoryApplying = true;
    workflow.value.graph = cloneJsonSafe(
      snapshot,
      captureGraphHistorySnapshot(),
    );
    ensureGraphCollections();
    normalizeSelectionAfterGraphRestore();
    graphHistorySignature = JSON.stringify(captureGraphHistorySnapshot());
    queueMicrotask(() => {
      graphHistoryApplying = false;
    });
    return true;
  };
  const commitGraphHistorySnapshot = () => {
    if (graphHistoryApplying) {
      return;
    }
    ensureGraphCollections();
    const snapshot = captureGraphHistorySnapshot();
    const signature = JSON.stringify(snapshot);
    if (!signature || graphHistorySignature === signature) {
      return;
    }
    graphHistoryPast.value = [...graphHistoryPast.value, snapshot].slice(
      -GRAPH_HISTORY_LIMIT,
    );
    graphHistoryFuture.value = [];
    graphHistorySignature = signature;
  };
  const scheduleGraphHistorySnapshot = () => {
    if (graphHistoryApplying) {
      return;
    }
    if (graphHistoryCommitTimer) {
      clearTimeout(graphHistoryCommitTimer);
      graphHistoryCommitTimer = null;
    }
    graphHistoryCommitTimer = setTimeout(() => {
      graphHistoryCommitTimer = null;
      commitGraphHistorySnapshot();
    }, 120);
  };
  const undoGraphHistory = () => {
    if (graphHistoryPast.value.length <= 1) {
      return false;
    }
    const current = graphHistoryPast.value[graphHistoryPast.value.length - 1];
    const previous = graphHistoryPast.value[graphHistoryPast.value.length - 2];
    graphHistoryPast.value = graphHistoryPast.value.slice(0, -1);
    graphHistoryFuture.value = [current, ...graphHistoryFuture.value].slice(
      0,
      GRAPH_HISTORY_LIMIT,
    );
    return applyGraphHistorySnapshot(previous);
  };
  const redoGraphHistory = () => {
    if (!graphHistoryFuture.value.length) {
      return false;
    }
    const [nextSnapshot, ...rest] = graphHistoryFuture.value;
    graphHistoryFuture.value = rest;
    graphHistoryPast.value = [...graphHistoryPast.value, nextSnapshot].slice(
      -GRAPH_HISTORY_LIMIT,
    );
    return applyGraphHistorySnapshot(nextSnapshot);
  };
  const canUndoGraphHistory = computed(() => graphHistoryPast.value.length > 1);
  const canRedoGraphHistory = computed(
    () => graphHistoryFuture.value.length > 0,
  );
  const executeUndoGraphHistory = () => {
    const ok = undoGraphHistory();
    closeContextMenu();
    return ok;
  };
  const executeRedoGraphHistory = () => {
    const ok = redoGraphHistory();
    closeContextMenu();
    return ok;
  };

  const createGroupId = () =>
    `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const createRerouteId = () =>
    `reroute-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const clampGroupWidth = (value) =>
    Math.max(
      MIN_GROUP_WIDTH,
      Number.isFinite(Number(value))
        ? Math.round(Number(value))
        : DEFAULT_GROUP_WIDTH,
    );

  const clampGroupHeight = (value) =>
    Math.max(
      MIN_GROUP_HEIGHT,
      Number.isFinite(Number(value))
        ? Math.round(Number(value))
        : DEFAULT_GROUP_HEIGHT,
    );

  const resolveGroupBoundsFromNodes = (nodes = []) => {
    if (!Array.isArray(nodes) || !nodes.length) {
      return {
        x: 96,
        y: 96,
        width: DEFAULT_GROUP_WIDTH,
        height: DEFAULT_GROUP_HEIGHT,
      };
    }

    const left = Math.min(
      ...nodes.map((node) => Number(node?.position?.x || 0)),
    );
    const top = Math.min(
      ...nodes.map((node) => Number(node?.position?.y || 0)),
    );
    const right = Math.max(
      ...nodes.map(
        (node) =>
          Number(node?.position?.x || 0) + resolveNodeDimensions(node).width,
      ),
    );
    const bottom = Math.max(
      ...nodes.map(
        (node) =>
          Number(node?.position?.y || 0) + resolveNodeDimensions(node).height,
      ),
    );
    const padding = 28;
    return {
      x: clampToGrid(Math.max(0, left - padding), 0),
      y: clampToGrid(Math.max(0, top - padding), 0),
      width: clampGroupWidth(
        Math.max(DEFAULT_GROUP_WIDTH, right - left + padding * 2),
      ),
      height: clampGroupHeight(
        Math.max(DEFAULT_GROUP_HEIGHT, bottom - top + padding * 2),
      ),
    };
  };

  const getGroupCardStyle = (groupVisual) => ({
    left: `${Number(groupVisual?.position?.x || 0)}px`,
    top: `${Number(groupVisual?.position?.y || 0)}px`,
    width: `${clampGroupWidth(groupVisual?.size?.width)}px`,
    height: `${clampGroupHeight(groupVisual?.size?.height)}px`,
    "--group-accent": String(groupVisual?.color || "rgba(110, 170, 230, 0.24)"),
  });

  const getRerouteHandleStyle = (rerouteVisual) => ({
    left: `${Number(rerouteVisual?.x || 0) - REROUTE_HANDLE_SIZE / 2}px`,
    top: `${Number(rerouteVisual?.y || 0) - REROUTE_HANDLE_SIZE / 2}px`,
  });

  const isGroupSelected = (groupId) => selectedGroupIds.value.includes(groupId);
  const isRerouteSelected = (rerouteId) =>
    selectedRerouteIds.value.includes(rerouteId);
  const canvasSceneStyle = computed(() => ({
    width: `${Math.round(BASE_CANVAS_WIDTH * canvasZoom.value)}px`,
    height: `${Math.round(BASE_CANVAS_HEIGHT * canvasZoom.value)}px`,
  }));
  const canvasContentStyle = computed(() => ({
    width: `${BASE_CANVAS_WIDTH}px`,
    height: `${BASE_CANVAS_HEIGHT}px`,
    transform: `scale(${canvasZoom.value})`,
    transformOrigin: "top left",
  }));

  const updateResponsiveWorkflowChrome = () => {
    if (typeof window === "undefined") {
      return;
    }

    prefersInlineInspector.value = window.innerWidth >= WIDE_CANVAS_BREAKPOINT;
    if (prefersInlineInspector.value) {
      return;
    }

    nodeInlineInspectorVisible.value = false;
    nodeInlineInspectorPinned.value = false;
    nodeInlineInspectorManualPosition.value = {
      left: null,
      top: null,
    };
  };

  const clampCanvasZoom = (value) =>
    Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, value));

  const applyCanvasZoom = (nextZoom, event = null) => {
    const canvas = canvasRef.value;
    const safeNextZoom = clampCanvasZoom(nextZoom);
    if (!canvas || safeNextZoom === canvasZoom.value) {
      return;
    }

    if (!event) {
      canvasZoom.value = safeNextZoom;
      nextTick(() => {
        updateCanvasViewport();
      });
      return;
    }

    const currentZoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
    const rect = canvas.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const sceneX = (pointerX + canvas.scrollLeft) / currentZoom;
    const sceneY = (pointerY + canvas.scrollTop) / currentZoom;

    canvasZoom.value = safeNextZoom;

    nextTick(() => {
      const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
      canvas.scrollLeft = Math.max(0, sceneX * zoom - pointerX);
      canvas.scrollTop = Math.max(0, sceneY * zoom - pointerY);
      updateCanvasViewport();
    });
  };

  const zoomIn = () => {
    applyCanvasZoom(Math.round((canvasZoom.value + 0.1) * 100) / 100);
  };

  const zoomOut = () => {
    applyCanvasZoom(Math.round((canvasZoom.value - 0.1) * 100) / 100);
  };

  const handleCanvasWheel = (event) => {
    const zoomModifierPressed = Boolean(
      event?.ctrlKey || event?.altKey || event?.metaKey,
    );
    if (!zoomModifierPressed) {
      return;
    }

    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    const next =
      Math.round(clampCanvasZoom(canvasZoom.value * factor) * 100) / 100;
    applyCanvasZoom(next, event);
  };

  const removeRerouteById = (rerouteId) => {
    if (!rerouteId) {
      return;
    }
    ensureGraphCollections();
    const removed = workflow.value.graph.reroutes.find(
      (item) => item.id === rerouteId,
    );
    workflow.value.graph.reroutes = workflow.value.graph.reroutes.filter(
      (item) => item.id !== rerouteId,
    );
    selectionStore.removeFromSelection("reroute", rerouteId);
    if (!removed?.linkId) {
      return;
    }
    workflow.value.graph.reroutes
      .filter((item) => item.linkId === removed.linkId)
      .sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
      .forEach((item, index) => {
        item.order = index;
      });
  };

  const removeGroupById = (groupId) => {
    if (!groupId) {
      return;
    }
    ensureGraphCollections();
    workflow.value.graph.groups = workflow.value.graph.groups.filter(
      (item) => item.id !== groupId,
    );
    selectionStore.removeFromSelection("group", groupId);
  };

  const deleteCurrentSelection = () => {
    const rerouteIds = [...selectedRerouteIds.value];
    rerouteIds.forEach((rerouteId) => {
      removeRerouteById(rerouteId);
    });

    const edgeIds = [...selectedEdgeIds.value];
    edgeIds.forEach((edgeId) => {
      selectedEdgeId.value = edgeId;
      removeSelectedEdge();
    });

    const nodeIds = [...selectedNodeIds.value];
    nodeIds.forEach((nodeId) => {
      removeNode(nodeId);
    });

    const groupIds = [...selectedGroupIds.value];
    groupIds.forEach((groupId) => {
      removeGroupById(groupId);
    });

    selectionStore.clearSelection();
    selectedNodeId.value = "";
    selectedEdgeId.value = "";
  };

  const selectAllGraphItems = () => {
    ensureGraphCollections();
    const nodes = Array.isArray(workflow.value?.graph?.nodes)
      ? workflow.value.graph.nodes
      : [];
    const edges = Array.isArray(workflow.value?.graph?.edges)
      ? workflow.value.graph.edges
      : [];
    const groups = Array.isArray(workflow.value?.graph?.groups)
      ? workflow.value.graph.groups
      : [];
    const reroutes = Array.isArray(workflow.value?.graph?.reroutes)
      ? workflow.value.graph.reroutes
      : [];
    selectionStore.setSelection([
      ...groups.map((group) => ({ type: "group", id: group.id })),
      ...nodes.map((node) => ({ type: "node", id: node.id })),
      ...edges.map((edge) => ({ type: "edge", id: edge.id })),
      ...reroutes.map((reroute) => ({ type: "reroute", id: reroute.id })),
    ]);
    selectedNodeId.value = nodes[0]?.id || "";
    selectedEdgeId.value = selectedNodeId.value ? "" : edges[0]?.id || "";
  };

  const createGroupFromSelection = () => {
    if (canvasStore.locked) {
      closeContextMenu();
      return;
    }
    ensureGraphCollections();
    const selectedSet = new Set(selectedNodeIds.value);
    const candidateNodes = workflow.value.graph.nodes.filter((node) =>
      selectedSet.has(node.id),
    );
    if (!candidateNodes.length) {
      message.warning("请先选中至少一个节点再创建分组");
      closeContextMenu();
      return;
    }

    const bounds = resolveGroupBoundsFromNodes(candidateNodes);
    const groupId = createGroupId();
    const group = {
      id: groupId,
      label: `分组 ${workflow.value.graph.groups.length + 1}`,
      color: "rgba(110, 170, 230, 0.24)",
      position: {
        x: bounds.x,
        y: bounds.y,
      },
      size: {
        width: bounds.width,
        height: bounds.height,
      },
      nodes: candidateNodes.map((node) => node.id),
    };
    workflow.value.graph.groups.push(group);
    selectionStore.selectSingle("group", groupId);
    selectedNodeId.value = "";
    selectedEdgeId.value = "";
    closeContextMenu();
  };

  const fitGroupToContents = (groupId) => {
    if (!groupId) {
      return;
    }
    ensureGraphCollections();
    const group = workflow.value.graph.groups.find(
      (item) => item.id === groupId,
    );
    if (!group) {
      return;
    }

    const declaredNodeIds = Array.isArray(group.nodes) ? group.nodes : [];
    const nodesByDeclared = workflow.value.graph.nodes.filter((node) =>
      declaredNodeIds.includes(node.id),
    );
    const nodesInRect = workflow.value.graph.nodes.filter((node) => {
      const size = resolveNodeDimensions(node);
      return (
        node.position.x >= Number(group?.position?.x || 0) &&
        node.position.y >= Number(group?.position?.y || 0) &&
        node.position.x + size.width <=
          Number(group?.position?.x || 0) +
            clampGroupWidth(group?.size?.width) &&
        node.position.y + size.height <=
          Number(group?.position?.y || 0) +
            clampGroupHeight(group?.size?.height)
      );
    });

    const targetNodes = nodesByDeclared.length ? nodesByDeclared : nodesInRect;
    if (!targetNodes.length) {
      return;
    }

    const bounds = resolveGroupBoundsFromNodes(targetNodes);
    group.position = {
      x: bounds.x,
      y: bounds.y,
    };
    group.size = {
      width: bounds.width,
      height: bounds.height,
    };
    group.nodes = targetNodes.map((node) => node.id);
  };

  const resolveClipboardAnchorFromNodes = (nodes = []) => {
    if (!Array.isArray(nodes) || !nodes.length) {
      return { x: 0, y: 0 };
    }
    return {
      x: Math.min(...nodes.map((node) => Number(node?.position?.x || 0))),
      y: Math.min(...nodes.map((node) => Number(node?.position?.y || 0))),
    };
  };
  const resolveClipboardEntryNodeIds = (nodes = [], edges = []) => {
    const nodeIds = nodes
      .map((node) => String(node?.id || "").trim())
      .filter(Boolean);
    if (!nodeIds.length) {
      return [];
    }
    const nodeIdSet = new Set(nodeIds);
    const incomingTargetSet = new Set();
    edges.forEach((edge) => {
      const sourceId = String(edge?.source || "").trim();
      const targetId = String(edge?.target || "").trim();
      if (!nodeIdSet.has(sourceId) || !nodeIdSet.has(targetId)) {
        return;
      }
      incomingTargetSet.add(targetId);
    });
    const entryIds = nodeIds.filter((nodeId) => !incomingTargetSet.has(nodeId));
    return entryIds.length ? entryIds : [nodeIds[0]];
  };
  const buildNodeClipboardPayload = (targetNodeIds = []) => {
    ensureGraphCollections();
    const normalizedNodeIdSet = new Set(
      targetNodeIds.map((id) => String(id || "").trim()).filter(Boolean),
    );
    if (!normalizedNodeIdSet.size) {
      return null;
    }

    const copiedNodes = workflow.value.graph.nodes
      .filter((node) => normalizedNodeIdSet.has(String(node?.id || "")))
      .map((node) => cloneJsonSafe(node, null))
      .filter(Boolean);
    if (!copiedNodes.length) {
      return null;
    }

    const copiedNodeIdSet = new Set(
      copiedNodes.map((node) => String(node?.id || "").trim()).filter(Boolean),
    );
    const copiedEdges = workflow.value.graph.edges
      .filter((edge) => {
        const sourceId = String(edge?.source || "").trim();
        const targetId = String(edge?.target || "").trim();
        return copiedNodeIdSet.has(sourceId) && copiedNodeIdSet.has(targetId);
      })
      .map((edge) => cloneJsonSafe(edge, null))
      .filter(Boolean);
    const copiedEdgeIdSet = new Set(
      copiedEdges.map((edge) => String(edge?.id || "").trim()).filter(Boolean),
    );
    const copiedReroutes = workflow.value.graph.reroutes
      .filter((reroute) => copiedEdgeIdSet.has(String(reroute?.linkId || "")))
      .map((reroute) => cloneJsonSafe(reroute, null))
      .filter(Boolean);

    return {
      kind: "workflow-node-clipboard",
      version: 2,
      capturedAt: new Date().toISOString(),
      nodes: copiedNodes,
      edges: copiedEdges,
      reroutes: copiedReroutes,
      anchor: resolveClipboardAnchorFromNodes(copiedNodes),
      entryNodeIds: resolveClipboardEntryNodeIds(copiedNodes, copiedEdges),
    };
  };
  const normalizeNodeClipboardPayload = (rawClipboard) => {
    if (!rawClipboard || typeof rawClipboard !== "object") {
      return null;
    }

    if (
      rawClipboard.kind === "workflow-node-clipboard" &&
      Array.isArray(rawClipboard.nodes)
    ) {
      const nodes = rawClipboard.nodes
        .map((node) => cloneJsonSafe(node, null))
        .filter(Boolean);
      if (!nodes.length) {
        return null;
      }
      const edges = Array.isArray(rawClipboard.edges)
        ? rawClipboard.edges
            .map((edge) => cloneJsonSafe(edge, null))
            .filter(Boolean)
        : [];
      const reroutes = Array.isArray(rawClipboard.reroutes)
        ? rawClipboard.reroutes
            .map((reroute) => cloneJsonSafe(reroute, null))
            .filter(Boolean)
        : [];
      const anchor = isPlainRecord(rawClipboard.anchor)
        ? {
            x: Number(rawClipboard.anchor.x || 0),
            y: Number(rawClipboard.anchor.y || 0),
          }
        : resolveClipboardAnchorFromNodes(nodes);
      const entryNodeIds =
        Array.isArray(rawClipboard.entryNodeIds) &&
        rawClipboard.entryNodeIds.length
          ? rawClipboard.entryNodeIds
              .map((nodeId) => String(nodeId || "").trim())
              .filter(Boolean)
          : resolveClipboardEntryNodeIds(nodes, edges);
      return {
        kind: "workflow-node-clipboard",
        version: Number(rawClipboard.version || 2),
        capturedAt: rawClipboard.capturedAt || "",
        nodes,
        edges,
        reroutes,
        anchor,
        entryNodeIds,
      };
    }

    if (Array.isArray(rawClipboard.nodes)) {
      const nodes = rawClipboard.nodes
        .map((node) => cloneJsonSafe(node, null))
        .filter(Boolean);
      if (!nodes.length) {
        return null;
      }
      const edges = Array.isArray(rawClipboard.edges)
        ? rawClipboard.edges
            .map((edge) => cloneJsonSafe(edge, null))
            .filter(Boolean)
        : [];
      return {
        kind: "workflow-node-clipboard",
        version: 2,
        capturedAt: "",
        nodes,
        edges,
        reroutes: [],
        anchor: resolveClipboardAnchorFromNodes(nodes),
        entryNodeIds: resolveClipboardEntryNodeIds(nodes, edges),
      };
    }

    if (typeof rawClipboard.type === "string" && rawClipboard.type.trim()) {
      const node = cloneJsonSafe(rawClipboard, null);
      if (!node) {
        return null;
      }
      return {
        kind: "workflow-node-clipboard",
        version: 2,
        capturedAt: "",
        nodes: [node],
        edges: [],
        reroutes: [],
        anchor: resolveClipboardAnchorFromNodes([node]),
        entryNodeIds: [String(node?.id || "").trim()].filter(Boolean),
      };
    }

    return null;
  };
  const hasNodeClipboardPayload = computed(() =>
    Boolean(
      normalizeNodeClipboardPayload(nodeCopyClipboard.value)?.nodes?.length,
    ),
  );
  const resolveCopyNodeIds = (preferredNodeId = "") => {
    const normalizedPreferred = String(preferredNodeId || "").trim();
    const selectionNodeIds = selectedNodeIds.value
      .map((nodeId) => String(nodeId || "").trim())
      .filter(Boolean);
    const selectionNodeIdSet = new Set(selectionNodeIds);
    if (selectionNodeIds.length > 0) {
      if (normalizedPreferred && !selectionNodeIdSet.has(normalizedPreferred)) {
        return [normalizedPreferred];
      }
      return selectionNodeIds;
    }
    if (normalizedPreferred) {
      return [normalizedPreferred];
    }
    const fallbackNodeId = String(selectedNodeId.value || "").trim();
    if (!fallbackNodeId) {
      return [];
    }
    return [fallbackNodeId];
  };
  const copyNodesToClipboard = (preferredNodeId = "") => {
    const copyNodeIds = resolveCopyNodeIds(preferredNodeId);
    const clipboardPayload = buildNodeClipboardPayload(copyNodeIds);
    if (!clipboardPayload) {
      return false;
    }
    nodeCopyClipboard.value = clipboardPayload;
    clipboardPasteSerial.value = 0;
    return true;
  };
  const createClipboardNodeId = () =>
    `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const resolvePasteAnchorPoint = () => {
    if (contextMenuState.value.visible) {
      return {
        x: Number(contextMenuState.value.x || 0),
        y: Number(contextMenuState.value.y || 0),
      };
    }
    return {
      x: canvasViewport.value.x + canvasViewport.value.width / 2,
      y: canvasViewport.value.y + canvasViewport.value.height / 2,
    };
  };
  const resolveNodePrimaryPortKey = (nodeId, direction = "in") => {
    const targetNode = workflow.value.graph.nodes.find(
      (node) => node.id === nodeId,
    );
    if (!targetNode) {
      return direction === "out" ? "output" : "input";
    }
    const slots = getNodePortSlots(targetNode, direction);
    if (!slots.length) {
      return direction === "out" ? "output" : "input";
    }
    return String(slots[0]?.key || (direction === "out" ? "output" : "input"));
  };
  const pasteClipboardNodes = ({ connectWithSelection = false } = {}) => {
    const clipboardPayload = normalizeNodeClipboardPayload(
      nodeCopyClipboard.value,
    );
    if (!clipboardPayload?.nodes?.length) {
      return false;
    }

    ensureGraphCollections();
    const preSelectedNodeIds = selectedNodeIds.value
      .map((nodeId) => String(nodeId || "").trim())
      .filter(Boolean);
    const contextNodeId = String(
      contextMenuState.value.nodeId || selectedNodeId.value || "",
    ).trim();
    if (
      connectWithSelection &&
      contextNodeId &&
      !preSelectedNodeIds.includes(contextNodeId)
    ) {
      preSelectedNodeIds.unshift(contextNodeId);
    }

    const sourceAnchor = isPlainRecord(clipboardPayload.anchor)
      ? {
          x: Number(clipboardPayload.anchor.x || 0),
          y: Number(clipboardPayload.anchor.y || 0),
        }
      : resolveClipboardAnchorFromNodes(clipboardPayload.nodes);
    const pasteAnchor = resolvePasteAnchorPoint();
    const cascadeOffset = 26 * clipboardPasteSerial.value;
    const deltaX = clampToGrid(
      Number(pasteAnchor.x || 0) - Number(sourceAnchor.x || 0) + cascadeOffset,
      0,
    );
    const deltaY = clampToGrid(
      Number(pasteAnchor.y || 0) - Number(sourceAnchor.y || 0) + cascadeOffset,
      0,
    );

    const sourceToCreatedNodeIdMap = new Map();
    const createdNodeIds = [];
    clipboardPayload.nodes.forEach((rawNode) => {
      const sourceNode = cloneJsonSafe(rawNode, null);
      if (!sourceNode) {
        return;
      }

      const sourceNodeId = String(sourceNode.id || "").trim();
      const nextNodeId = createClipboardNodeId();
      sourceToCreatedNodeIdMap.set(sourceNodeId, nextNodeId);

      const sourceX = Number(sourceNode?.position?.x || 0);
      const sourceY = Number(sourceNode?.position?.y || 0);
      const nextNode = {
        ...sourceNode,
        id: nextNodeId,
        position: {
          x: clampToGrid(sourceX + deltaX, 0),
          y: clampToGrid(sourceY + deltaY, 0),
        },
        size: {
          width: clampNodeWidth(sourceNode?.size?.width),
          height: clampNodeHeight(sourceNode?.size?.height),
        },
        appearance: isPlainRecord(sourceNode?.appearance)
          ? cloneJsonSafe(sourceNode.appearance, {})
          : {},
        config: cloneJsonSafe(sourceNode?.config || {}, {}),
      };
      workflow.value.graph.nodes.push(nextNode);
      createdNodeIds.push(nextNodeId);
    });

    if (!createdNodeIds.length) {
      return false;
    }

    const sourceToCreatedEdgeIdMap = new Map();
    clipboardPayload.edges.forEach((rawEdge) => {
      const sourceEdge = cloneJsonSafe(rawEdge, null);
      if (!sourceEdge) {
        return;
      }
      const nextSourceId = sourceToCreatedNodeIdMap.get(
        String(sourceEdge?.source || "").trim(),
      );
      const nextTargetId = sourceToCreatedNodeIdMap.get(
        String(sourceEdge?.target || "").trim(),
      );
      if (!nextSourceId || !nextTargetId) {
        return;
      }
      const createdEdgeId = addEdge({
        source: nextSourceId,
        target: nextTargetId,
        sourcePort: String(sourceEdge?.sourcePort || "output"),
        targetPort: String(sourceEdge?.targetPort || "input"),
      });
      if (createdEdgeId) {
        sourceToCreatedEdgeIdMap.set(
          String(sourceEdge?.id || "").trim(),
          createdEdgeId,
        );
      }
    });

    const reroutesToAppend = [];
    clipboardPayload.reroutes.forEach((rawReroute, index) => {
      const sourceReroute = cloneJsonSafe(rawReroute, null);
      if (!sourceReroute) {
        return;
      }
      const sourceLinkId = String(sourceReroute?.linkId || "").trim();
      const nextLinkId = sourceToCreatedEdgeIdMap.get(sourceLinkId);
      if (!nextLinkId) {
        return;
      }
      reroutesToAppend.push({
        ...sourceReroute,
        id: createRerouteId(),
        linkId: nextLinkId,
        order: Number.isFinite(Number(sourceReroute?.order))
          ? Math.max(0, Math.round(Number(sourceReroute.order)))
          : index,
        x: clampToGrid(Number(sourceReroute?.x || 0) + deltaX, 0),
        y: clampToGrid(Number(sourceReroute?.y || 0) + deltaY, 0),
      });
    });
    if (reroutesToAppend.length) {
      workflow.value.graph.reroutes.push(...reroutesToAppend);
    }

    if (connectWithSelection) {
      const entryNodeSourceIds =
        Array.isArray(clipboardPayload.entryNodeIds) &&
        clipboardPayload.entryNodeIds.length
          ? clipboardPayload.entryNodeIds
          : resolveClipboardEntryNodeIds(
              clipboardPayload.nodes,
              clipboardPayload.edges,
            );
      const entryNodeTargetIds = [
        ...new Set(
          entryNodeSourceIds
            .map((sourceId) =>
              sourceToCreatedNodeIdMap.get(String(sourceId || "").trim()),
            )
            .filter(Boolean),
        ),
      ];
      const targetEntryIds = entryNodeTargetIds.length
        ? entryNodeTargetIds
        : [createdNodeIds[0]];
      const createdNodeIdSet = new Set(createdNodeIds);
      const sourceIds = [...new Set(preSelectedNodeIds)].filter(
        (nodeId) =>
          nodeId &&
          !createdNodeIdSet.has(nodeId) &&
          workflow.value.graph.nodes.some((node) => node.id === nodeId),
      );
      sourceIds.forEach((sourceId) => {
        const sourcePort = resolveNodePrimaryPortKey(sourceId, "out");
        targetEntryIds.forEach((targetId) => {
          if (!targetId || sourceId === targetId) {
            return;
          }
          const targetPort = resolveNodePrimaryPortKey(targetId, "in");
          addEdge({
            source: sourceId,
            target: targetId,
            sourcePort,
            targetPort,
          });
        });
      });
    }

    selectionStore.setSelection(
      createdNodeIds.map((nodeId) => ({
        type: "node",
        id: nodeId,
      })),
    );
    selectedNodeId.value = createdNodeIds[0] || "";
    selectedEdgeId.value = "";
    clipboardPasteSerial.value += 1;
    return true;
  };
  const copyPrimarySelectedNode = () => {
    copyNodesToClipboard();
  };

  const registerWorkflowCommands = () => {
    commandStore.registerCommands([
      {
        id: "Comfy.Node.OpenPicker",
        label: "搜索添加节点",
        category: "search",
        description: "从画布搜索节点并创建",
        active: () => canvasStore.locked !== true,
        handler: () => openNodeCreationPalette(),
      },
      {
        id: "Comfy.CommandPalette.Open",
        label: "命令面板",
        category: "search",
        description: "搜索工作流命令",
        handler: () => openCommandPalette(),
      },
      {
        id: "Comfy.File.New",
        label: "新建工作流",
        category: "file",
        handler: createNewWorkflow,
      },
      {
        id: "Comfy.File.Save",
        label: "保存工作流",
        category: "file",
        handler: saveCurrentWorkflow,
      },
      {
        id: "Comfy.File.Validate",
        label: "校验工作流",
        category: "file",
        handler: validateCurrentWorkflow,
      },
      {
        id: "Comfy.Edit.Undo",
        label: "撤销",
        category: "edit",
        active: () => graphHistoryPast.value.length > 1,
        handler: () => undoGraphHistory(),
      },
      {
        id: "Comfy.Edit.Redo",
        label: "重做",
        category: "edit",
        active: () => graphHistoryFuture.value.length > 0,
        handler: () => redoGraphHistory(),
      },
      {
        id: "Comfy.Edit.Delete",
        label: "删除",
        category: "edit",
        handler: deleteCurrentSelection,
      },
      {
        id: "Comfy.Edit.SelectAll",
        label: "全选",
        category: "edit",
        handler: selectAllGraphItems,
      },
      {
        id: "Comfy.Edit.Copy",
        label: "复制节点",
        category: "edit",
        active: () => Boolean(selectedNodeIds.value[0] || selectedNodeId.value),
        handler: copyPrimarySelectedNode,
      },
      {
        id: "Comfy.Edit.Paste",
        label: "粘贴节点",
        category: "edit",
        active: () => hasNodeClipboardPayload.value,
        handler: pasteCopiedNode,
      },
      {
        id: "Comfy.Edit.PasteWithConnect",
        label: "粘贴并连接",
        category: "edit",
        active: () =>
          hasNodeClipboardPayload.value && selectedNodeIds.value.length > 0,
        handler: pasteCopiedNodeWithConnect,
      },
      {
        id: "Comfy.View.ZoomIn",
        label: "放大",
        category: "view",
        handler: zoomIn,
      },
      {
        id: "Comfy.View.ZoomOut",
        label: "缩小",
        category: "view",
        handler: zoomOut,
      },
      {
        id: "Comfy.View.FitView",
        label: "适配视图",
        category: "view",
        handler: fitCanvasView,
      },
      {
        id: "Comfy.View.ResetView",
        label: "重置视图",
        category: "view",
        handler: resetCanvasView,
      },
      {
        id: "Comfy.View.ToggleLinks",
        label: "显示/隐藏连线",
        category: "view",
        handler: toggleCanvasLinks,
      },
      {
        id: "Comfy.View.ToggleLock",
        label: "锁定/解锁画布",
        category: "view",
        handler: toggleCanvasLock,
      },
      {
        id: "Comfy.View.ToggleMinimap",
        label: "显示/隐藏导航器",
        category: "view",
        handler: toggleCanvasMinimap,
      },
      {
        id: "Comfy.Graph.CreateGroup",
        label: "创建分组",
        category: "graph",
        active: () => canCreateGroupFromSelection.value,
        handler: createGroupFromSelection,
      },
      {
        id: "Comfy.Queue.Run",
        label: "执行流程",
        category: "queue",
        active: () => !isRunInProgress.value,
        handler: startRun,
      },
      {
        id: "Comfy.Queue.RunFront",
        label: "前插执行",
        category: "queue",
        handler: queueRunCurrentWorkflowFront,
      },
      {
        id: "Comfy.Queue.Cancel",
        label: "停止执行",
        category: "queue",
        active: () => isRunInProgress.value,
        handler: cancelRun,
      },
    ]);
  };

  const syncComfyParityModeFromConfig = () => {
    // 工作流设计页当前阶段强制使用 Comfy 对齐分支，避免配置回落到 legacy 壳层。
    comfyParityMode.value = true;
  };

  const registerWorkflowKeybindings = () => {
    keybindingStore.clearBindings();
    keybindingStore.registerBindings([
      { scope: "global", combo: "ctrl+s", commandId: "Comfy.File.Save" },
      { scope: "canvas", combo: "tab", commandId: "Comfy.Node.OpenPicker" },
      {
        scope: "global",
        combo: "ctrl+k",
        commandId: "Comfy.CommandPalette.Open",
      },
      { scope: "canvas", combo: "ctrl+z", commandId: "Comfy.Edit.Undo" },
      { scope: "canvas", combo: "ctrl+y", commandId: "Comfy.Edit.Redo" },
      { scope: "canvas", combo: "ctrl+shift+z", commandId: "Comfy.Edit.Redo" },
      { scope: "canvas", combo: "ctrl+a", commandId: "Comfy.Edit.SelectAll" },
      { scope: "canvas", combo: "delete", commandId: "Comfy.Edit.Delete" },
      { scope: "canvas", combo: "backspace", commandId: "Comfy.Edit.Delete" },
      { scope: "canvas", combo: "ctrl+c", commandId: "Comfy.Edit.Copy" },
      { scope: "canvas", combo: "ctrl+v", commandId: "Comfy.Edit.Paste" },
      {
        scope: "canvas",
        combo: "ctrl+shift+v",
        commandId: "Comfy.Edit.PasteWithConnect",
      },
      { scope: "canvas", combo: "ctrl+=", commandId: "Comfy.View.ZoomIn" },
      { scope: "canvas", combo: "ctrl+-", commandId: "Comfy.View.ZoomOut" },
      { scope: "canvas", combo: "ctrl+0", commandId: "Comfy.View.FitView" },
      {
        scope: "canvas",
        combo: "ctrl+g",
        commandId: "Comfy.Graph.CreateGroup",
      },
      { scope: "canvas", combo: "ctrl+enter", commandId: "Comfy.Queue.Run" },
    ]);
  };

  const isTextInputElement = (target) => {
    if (!(target instanceof Element)) {
      return false;
    }

    const tagName = target.tagName?.toLowerCase();
    return (
      tagName === "input" ||
      tagName === "textarea" ||
      tagName === "select" ||
      target.isContentEditable === true
    );
  };

  const resolveKeybindingScopeCandidates = (event) => {
    const scopeCandidates = [];
    const appendScope = (scope) => {
      const normalizedScope = String(scope || "")
        .trim()
        .toLowerCase();
      if (!normalizedScope || scopeCandidates.includes(normalizedScope)) {
        return;
      }
      scopeCandidates.push(normalizedScope);
    };

    if (contextMenuState.value.visible) {
      appendScope(contextMenuState.value.scope);
    }
    if (selectedNodeIds.value.length > 0 || selectedNodeId.value) {
      appendScope("node");
    }
    if (selectedEdgeIds.value.length > 0 || selectedEdgeId.value) {
      appendScope("edge");
    }
    if (selectedGroupIds.value.length > 0) {
      appendScope("group");
    }
    if (selectedRerouteIds.value.length > 0) {
      appendScope("reroute");
    }
    if (isTextInputElement(event?.target)) {
      appendScope("text");
    }
    appendScope("canvas");
    return scopeCandidates;
  };

  const resetCanvasPanState = () => {
    const canvas = canvasRef.value;
    if (
      canvas &&
      canvasPan.value.active &&
      Number.isFinite(canvasPan.value.pointerId)
    ) {
      try {
        canvas.releasePointerCapture(canvasPan.value.pointerId);
      } catch {
        // Ignore release errors when pointer capture was already cleared.
      }
    }

    canvasPan.value = {
      active: false,
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      startScrollLeft: 0,
      startScrollTop: 0,
    };
  };

  const handleGlobalKeyDown = async (event) => {
    const keyHandled = await keybindingStore.triggerFromKeyboardEvent({
      event,
      commandStore,
      scope: resolveKeybindingScopeCandidates(event),
      context: {
        isRunInProgress: isRunInProgress.value,
        hasSelection: selectionStore.selectedItems.length > 0,
        contextMenuScope: contextMenuState.value.scope,
      },
    });
    if (keyHandled) {
      closeContextMenu();
      return;
    }

    if (event?.code !== "Space" || isTextInputElement(event.target)) {
      return;
    }

    spacePanPressed.value = true;
    event.preventDefault();
  };

  const handleGlobalKeyUp = (event) => {
    if (event?.code !== "Space") {
      return;
    }

    spacePanPressed.value = false;
  };

  const handleWindowBlur = () => {
    spacePanPressed.value = false;
    resetCanvasPanState();
    stopNodeDrag();
    stopNodeBatchDrag();
    stopNodeResize();
    stopGroupDrag();
    stopGroupResize();
    stopRerouteDrag();
    selectionStore.endMarquee();
    stopNodeInlineInspectorDrag();
    stopMinimapDrag();
    cancelNodeTitleEdit();
    closeContextMenu();
    closeQuickPalette();
  };

  const isPanBlockedTarget = (target) => {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(
      target.closest(
        ".flow-node-card, .canvas-group-card, .edge-path, .edge-reroute-handle, .port, .canvas-navigator, .node-inline-panel, button, input, select, textarea",
      ),
    );
  };

  const handleCanvasPanStart = (event) => {
    const canvas = canvasRef.value;
    if (!canvas || !event || canvasPan.value.active) {
      return;
    }

    if (canvasStore.locked) {
      return;
    }

    const isMarqueeTrigger =
      event.button === 0 &&
      event.shiftKey &&
      !spacePanPressed.value &&
      !isPanBlockedTarget(event.target);
    if (isMarqueeTrigger) {
      const pointer = resolveCanvasPointerFromEvent(event);
      selectionStore.beginMarquee({
        x: pointer.x,
        y: pointer.y,
      });
      return;
    }

    const isMiddleButton = event.button === 1;
    const isSpaceDrag = event.button === 0 && spacePanPressed.value;
    const isBackgroundDrag =
      event.button === 0 &&
      canvasStore.navigationMode === "pan" &&
      !spacePanPressed.value &&
      !isPanBlockedTarget(event.target);
    if (!isMiddleButton && !isSpaceDrag && !isBackgroundDrag) {
      return;
    }

    canvasPan.value = {
      active: true,
      pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: canvas.scrollLeft,
      startScrollTop: canvas.scrollTop,
    };

    if (Number.isFinite(event.pointerId) && canvas.setPointerCapture) {
      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture errors on unsupported environments.
      }
    }

    stopNodeDrag();
    stopNodeBatchDrag();
    cancelEdgeConnect();
    event.preventDefault();
  };

  const handleCanvasPanMove = (event) => {
    if (!canvasPan.value.active || !canvasRef.value || !event) {
      return;
    }

    if (
      Number.isFinite(canvasPan.value.pointerId) &&
      Number.isFinite(event.pointerId) &&
      event.pointerId !== canvasPan.value.pointerId
    ) {
      return;
    }

    const canvas = canvasRef.value;
    const deltaX = event.clientX - canvasPan.value.startClientX;
    const deltaY = event.clientY - canvasPan.value.startClientY;

    canvas.scrollLeft = Math.max(0, canvasPan.value.startScrollLeft - deltaX);
    canvas.scrollTop = Math.max(0, canvasPan.value.startScrollTop - deltaY);
    updateCanvasViewport();
    event.preventDefault();
  };

  const handleCanvasPanEnd = (event = null) => {
    if (!canvasPan.value.active) {
      return;
    }

    if (
      event &&
      Number.isFinite(canvasPan.value.pointerId) &&
      Number.isFinite(event.pointerId) &&
      event.pointerId !== canvasPan.value.pointerId
    ) {
      return;
    }

    resetCanvasPanState();
  };

  const inspectorTabs = [
    { label: "配置", value: "config" },
    { label: "结构", value: "schema" },
    { label: "运行", value: "runtime" },
    { label: "输出", value: "output" },
    { label: "属性", value: "attrs" },
  ];

  const dispatchModeLabelMap = {
    single: "逐条推进",
    batch: "批次派发",
    fanout: "并行扩散",
  };

  const categoryLabelMap = {
    whisper: "翻译字幕",
    tg: "上传",
    clean: "清理",
    asmr: "云端",
    input: "输入",
    file: "文件",
    util: "处理",
    output: "输出",
    files: "资源",
    tools: "工具",
    other: "其他",
  };

  const nodeCategorySet = new Set([
    "whisper",
    "tg",
    "asmr",
    "files",
    "file",
    "tools",
    "input",
    "util",
    "output",
    "clean",
  ]);

  const nodeCategoryAccentMap = {
    whisper: "#5fc7d6",
    tg: "#8fd18f",
    asmr: "#e18473",
    files: "#d8a85b",
    file: "#d8a85b",
    tools: "#78d7cb",
    util: "#b69ccf",
    input: "#4ec9c3",
    output: "#e8ba6e",
    clean: "#da6f79",
    other: "#d9c3a2",
  };

  const nodeTypeAccentMap = {
    "whisper.translateSubtitles": "#58d2cf",
    "whisper.packSubtitles": "#e0a34c",
    "tg.uploadSubtitles": "#97d48c",
    "asmr.cloudDeleteRecentUploads": "#db6d77",
    "files.localDeleteScanned": "#c6a2df",
  };

  const resolveNodeCategoryKey = (nodeType) => {
    const [prefix = "other"] = String(nodeType || "")
      .toLowerCase()
      .split(".");
    return nodeCategorySet.has(prefix) ? prefix : "other";
  };

  const getNodeCategoryAccent = (nodeType) =>
    nodeTypeAccentMap[String(nodeType || "")] ||
    nodeCategoryAccentMap[resolveNodeCategoryKey(nodeType)] ||
    nodeCategoryAccentMap.other;

  const ensureNodeVisualState = (node) => {
    if (!node || typeof node !== "object") {
      return {
        muted: false,
        bypassed: false,
        pinned: false,
        collapsed: false,
        manualSize: false,
        comfyNormalized: false,
      };
    }
    if (!node.visual || typeof node.visual !== "object") {
      node.visual = {};
    }
    node.visual.muted = node.visual.muted === true;
    node.visual.bypassed = node.visual.bypassed === true;
    node.visual.pinned = node.visual.pinned === true;
    node.visual.collapsed = node.visual.collapsed === true;
    node.visual.manualSize = node.visual.manualSize === true;
    node.visual.comfyNormalized = node.visual.comfyNormalized === true;
    return node.visual;
  };

  const isNodeManuallySized = (node) => ensureNodeVisualState(node).manualSize;

  const setNodeManualSize = (node, value = true) => {
    ensureNodeVisualState(node).manualSize = value === true;
  };

  const isNodeMuted = (node) => ensureNodeVisualState(node).muted;
  const isNodeBypassed = (node) => ensureNodeVisualState(node).bypassed;
  const isNodePinned = (node) => ensureNodeVisualState(node).pinned;
  const isNodeCollapsed = (node) => ensureNodeVisualState(node).collapsed;

  const getNodeCardStateClass = (node) => ({
    "is-muted": isNodeMuted(node),
    "is-bypassed": isNodeBypassed(node),
    "is-pinned": isNodePinned(node),
    "is-collapsed": isNodeCollapsed(node),
  });

  const isNodeBatchDragging = (nodeId = "") =>
    nodeBatchDragState.value.active &&
    nodeBatchDragState.value.nodes.some((item) => item.id === nodeId);

  const getNodeCategoryClass = (nodeType) =>
    `cat-${resolveNodeCategoryKey(nodeType)}`;

  const getNodeCategoryLabel = (nodeType) =>
    getCategoryLabel(resolveNodeCategoryKey(nodeType));

  const shouldShowNodeType = (node) => {
    const typeLabel = getNodeTypeDisplay(node?.type || "");
    const nodeLabel = resolveNodeLabel(node);
    return Boolean(typeLabel) && typeLabel !== nodeLabel;
  };

  const shouldShowNodeFamily = (node) => {
    const familyLabel = getNodeCategoryLabel(node?.type || "");
    const typeLabel = getNodeTypeDisplay(node?.type || "");
    const nodeLabel = resolveNodeLabel(node);
    return (
      Boolean(familyLabel) &&
      familyLabel !== nodeLabel &&
      familyLabel !== typeLabel
    );
  };

  const formatNodeIdCompact = (nodeId) => {
    const value = String(nodeId || "");
    if (!value) {
      return "未分配 ID";
    }
    if (value.length <= 20) {
      return value;
    }
    return `${value.slice(0, 8)}...${value.slice(-8)}`;
  };

  const estimateNodeCardWidth = (node) => {
    const textUnitWidth = (value) =>
      Array.from(String(value || "")).reduce((total, char) => {
        if (/[\u4e00-\u9fff]/.test(char)) {
          return total + 1.65;
        }
        return total + 1;
      }, 0);
    const textPixelWidth = (value, fontSize = DEFAULT_NODE_FONT_SIZE) =>
      textUnitWidth(value) * fontSize * 0.6;

    if (comfyParityMode.value) {
      const inputWidth = getNodePortSlots(node, "in").reduce(
        (maxValue, slot) =>
          Math.max(maxValue, textPixelWidth(slot?.rawLabel || slot?.label)),
        0,
      );
      const outputWidth = getNodePortSlots(node, "out").reduce(
        (maxValue, slot) =>
          Math.max(maxValue, textPixelWidth(slot?.rawLabel || slot?.label)),
        0,
      );
      const summaryEntries = getNodeCardSummaryEntries(node);
      const widgetTextWidth = summaryEntries.reduce(
        (maxValue, entry) =>
          Math.max(
            maxValue,
            textPixelWidth(entry?.label) + textPixelWidth(entry?.value),
          ),
        0,
      );
      const widgetPadding =
        COMFY_NODE_WIDGET_MIN_VALUE_WIDTH +
        2 *
          (COMFY_NODE_WIDGET_MARGIN +
            COMFY_NODE_WIDGET_ARROW_MARGIN +
            COMFY_NODE_WIDGET_ARROW_WIDTH);
      const widgetDrivenWidth =
        widgetTextWidth > 0 ? widgetTextWidth + widgetPadding : 0;
      const titleDrivenWidth =
        COMFY_NODE_TITLE_HEIGHT +
        textPixelWidth(resolveNodeLabel(node)) +
        COMFY_NODE_TITLE_HEIGHT * 0.33;
      const slotDrivenWidth =
        inputWidth +
        outputWidth +
        COMFY_NODE_SLOT_HEIGHT * 2 +
        (inputWidth && outputWidth ? 5 : 0);
      const minWidth =
        COMFY_NODE_BASE_WIDTH * (summaryEntries.length ? 1.12 : 1);
      const preferredWidth = Math.max(
        minWidth,
        COMFY_NODE_MIN_WIDTH,
        slotDrivenWidth,
        widgetDrivenWidth,
        titleDrivenWidth,
      );

      return clampNodeWidth(Math.min(COMFY_NODE_MAX_WIDTH, preferredWidth));
    }

    const summaryEntries = getNodeCardSummaryEntries(node);
    const summaryWidthScore = summaryEntries.reduce((maxValue, entry) => {
      const entryScore = `${entry.label}${entry.value}`.length;
      return Math.max(maxValue, entryScore);
    }, 0);

    const textWidthScore = Math.max(
      resolveNodeLabel(node).length + getNodeCategoryLabel(node.type).length,
      getNodeTypeDisplay(node.type).length,
      formatNodeIdCompact(node.id).length,
      summaryWidthScore,
    );

    return clampNodeWidth(210 + Math.max(0, textWidthScore - 10) * 9);
  };

  const estimateAdaptiveNodeFontSize = (node) => {
    const baseFontSize = resolveNodeFontSize(node);
    if (comfyParityMode.value) {
      return clampNodeFontSize(baseFontSize);
    }
    const size = resolveNodeDimensions(node);
    const widthGrowth = Math.max(0, size.width - DEFAULT_NODE_WIDTH);
    const heightGrowth = Math.max(0, size.height - DEFAULT_NODE_HEIGHT);
    const widthBonus =
      widthGrowth > 0 ? Math.max(1, Math.round(widthGrowth / 72)) : 0;
    const heightBonus =
      heightGrowth > 0 ? Math.max(1, Math.round(heightGrowth / 110)) : 0;
    const adaptiveBonus = Math.min(6, widthBonus + heightBonus);

    return clampNodeFontSize(baseFontSize + adaptiveBonus);
  };

  const getNodeCardStyle = (node) => {
    const size = resolveNodeDimensions(node);
    const fontSize = estimateAdaptiveNodeFontSize(node);
    const portRowCount = Math.max(
      1,
      getNodePortSlots(node, "in").length,
      getNodePortSlots(node, "out").length,
    );
    const visual = ensureNodeVisualState(node);
    const selected = selectedNodeIds.value.includes(node.id);
    const zIndex = visual.pinned ? 12 : selected ? 9 : 4;
    return {
      width: `${size.width}px`,
      left: `${node.position.x}px`,
      top: `${node.position.y}px`,
      zIndex: String(zIndex),
      "--node-width": `${size.width}px`,
      "--node-height": `${size.height}px`,
      "--node-name-size": `${fontSize}px`,
      "--node-type-size": `${Math.max(11, Math.round(fontSize * 0.72))}px`,
      "--node-config-size": `${Math.max(11, Math.round(fontSize * 0.78))}px`,
      "--node-pill-size": `${Math.max(10, Math.round(fontSize * 0.66))}px`,
      "--node-badge-size": `${Math.max(10, Math.round(fontSize * 0.7))}px`,
      "--node-port-row-count": String(portRowCount),
      "--node-accent": getNodeCategoryAccent(node.type),
    };
  };

  const selectedNodeDimensions = computed(() =>
    resolveNodeDimensions(selectedNode.value),
  );
  const selectedNodeFontSize = computed(() =>
    resolveNodeFontSize(selectedNode.value),
  );
  const selectedNodeWidthDraft = ref("");
  const selectedNodeHeightDraft = ref("");
  const selectedNodeFontSizeDraft = ref("");

  const syncSelectedNodeEditorDrafts = () => {
    selectedNodeWidthDraft.value = String(selectedNodeDimensions.value.width);
    selectedNodeHeightDraft.value = String(selectedNodeDimensions.value.height);
    selectedNodeFontSizeDraft.value = String(selectedNodeFontSize.value);
  };

  watch(
    selectedNodeId,
    (nextNodeId) => {
      syncSelectedNodeEditorDrafts();
      if (
        nodeTitleEditState.value.active &&
        nodeTitleEditState.value.nodeId !== nextNodeId
      ) {
        cancelNodeTitleEdit();
      }
      if (!nodeInlineInspectorPinned.value) {
        nodeInlineInspectorManualPosition.value = {
          left: null,
          top: null,
        };
      }
    },
    { immediate: true },
  );

  const updateSelectedNodeSize = (axis, rawValue) => {
    if (!selectedNode.value) {
      return;
    }

    const currentSize = resolveNodeDimensions(selectedNode.value);
    selectedNode.value.size = {
      width: axis === "width" ? clampNodeWidth(rawValue) : currentSize.width,
      height:
        axis === "height" ? clampNodeHeight(rawValue) : currentSize.height,
    };
    setNodeManualSize(selectedNode.value, true);
  };

  const applyNodeSizePreset = (width, height) => {
    if (!selectedNode.value) {
      return;
    }

    selectedNode.value.size = {
      width: clampNodeWidth(width),
      height: clampNodeHeight(height),
    };
    setNodeManualSize(selectedNode.value, true);
    syncSelectedNodeEditorDrafts();
  };

  const commitSelectedNodeSize = (axis) => {
    if (axis === "width") {
      updateSelectedNodeSize("width", selectedNodeWidthDraft.value);
    } else {
      updateSelectedNodeSize("height", selectedNodeHeightDraft.value);
    }
    syncSelectedNodeEditorDrafts();
  };

  const updateSelectedNodeFontSize = (rawValue) => {
    if (!selectedNode.value) {
      return;
    }

    selectedNode.value.appearance = {
      ...selectedNode.value.appearance,
      fontSize: clampNodeFontSize(rawValue),
    };
  };

  const commitSelectedNodeFontSize = () => {
    updateSelectedNodeFontSize(selectedNodeFontSizeDraft.value);
    syncSelectedNodeEditorDrafts();
  };

  const applyNodeFontSizePreset = (fontSize) => {
    updateSelectedNodeFontSize(fontSize);
    syncSelectedNodeEditorDrafts();
  };

  const getNodeInlineInspectorHeight = () =>
    nodeInlineInspectorTab.value === "runtime"
      ? NODE_INLINE_PANEL_RUNTIME_HEIGHT
      : nodeInlineInspectorTab.value === "attrs"
        ? NODE_INLINE_PANEL_HEIGHT
        : NODE_INLINE_PANEL_HEIGHT - 32;

  const clampNodeInlineInspectorPosition = (left, top) => {
    const panelHeight = getNodeInlineInspectorHeight();
    return {
      left: Math.max(
        18,
        Math.min(
          BASE_CANVAS_WIDTH - NODE_INLINE_PANEL_WIDTH - 18,
          Math.round(left),
        ),
      ),
      top: Math.max(
        18,
        Math.min(BASE_CANVAS_HEIGHT - panelHeight - 18, Math.round(top)),
      ),
    };
  };

  const resolveNodeInlineInspectorAutoPosition = () => {
    if (!selectedNode.value) {
      return {
        left: 18,
        top: 18,
      };
    }

    const node = selectedNode.value;
    const size = resolveNodeDimensions(node);
    const panelHeight = getNodeInlineInspectorHeight();
    const canOpenRight =
      node.position.x + size.width + 18 + NODE_INLINE_PANEL_WIDTH <
      BASE_CANVAS_WIDTH - 24;
    const left = canOpenRight
      ? node.position.x + size.width + 18
      : node.position.x - NODE_INLINE_PANEL_WIDTH - 18;
    const top = Math.max(
      18,
      Math.min(BASE_CANVAS_HEIGHT - panelHeight - 18, node.position.y - 6),
    );

    return clampNodeInlineInspectorPosition(left, top);
  };

  const startNodeInlineInspectorDrag = (event) => {
    if (!selectedNode.value || event?.button !== 0) {
      return;
    }

    if (event.target instanceof Element && event.target.closest("button")) {
      return;
    }

    const pointer = resolveCanvasPointerFromEvent(event);
    const origin = nodeInlineInspectorPinned.value
      ? nodeInlineInspectorManualPosition.value.left !== null
        ? nodeInlineInspectorManualPosition.value
        : resolveNodeInlineInspectorAutoPosition()
      : resolveNodeInlineInspectorAutoPosition();

    nodeInlineInspectorPinned.value = true;
    nodeInlineInspectorManualPosition.value = {
      left: origin.left,
      top: origin.top,
    };
    nodeInlineInspectorDrag.value = {
      active: true,
      offsetX: pointer.x - origin.left,
      offsetY: pointer.y - origin.top,
    };
  };

  const moveNodeInlineInspectorDrag = (event) => {
    if (!nodeInlineInspectorDrag.value.active) {
      return;
    }

    const pointer = resolveCanvasPointerFromEvent(event);
    nodeInlineInspectorManualPosition.value = clampNodeInlineInspectorPosition(
      pointer.x - nodeInlineInspectorDrag.value.offsetX,
      pointer.y - nodeInlineInspectorDrag.value.offsetY,
    );
  };

  const stopNodeInlineInspectorDrag = () => {
    if (!nodeInlineInspectorDrag.value.active) {
      return;
    }

    nodeInlineInspectorDrag.value = {
      active: false,
      offsetX: 0,
      offsetY: 0,
    };
  };

  const toggleNodeInlineInspectorPin = () => {
    if (nodeInlineInspectorPinned.value) {
      nodeInlineInspectorPinned.value = false;
      nodeInlineInspectorManualPosition.value = {
        left: null,
        top: null,
      };
      return;
    }

    const autoPosition = resolveNodeInlineInspectorAutoPosition();
    nodeInlineInspectorPinned.value = true;
    nodeInlineInspectorManualPosition.value = autoPosition;
  };

  const nodeInlineInspectorStyle = computed(() => {
    const position =
      nodeInlineInspectorPinned.value &&
      nodeInlineInspectorManualPosition.value.left !== null &&
      nodeInlineInspectorManualPosition.value.top !== null
        ? clampNodeInlineInspectorPosition(
            nodeInlineInspectorManualPosition.value.left,
            nodeInlineInspectorManualPosition.value.top,
          )
        : resolveNodeInlineInspectorAutoPosition();

    return {
      left: `${position.left}px`,
      top: `${position.top}px`,
      width: `${NODE_INLINE_PANEL_WIDTH}px`,
    };
  });

  const jumpToMainInspector = (tab = "config") => {
    inspectorTab.value = tab;
    nodeInlineInspectorVisible.value = false;
  };

  const filteredNodePaletteGroups = computed(() => {
    const keyword = nodeSearchKeyword.value.trim().toLowerCase();
    if (!keyword) {
      return nodePaletteGroups.value;
    }

    return nodePaletteGroups.value
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const catalogMeta = buildNodeCatalogMeta(item?.type);
          const target =
            `${item.label || ""} ${item.type || ""} ${item.description || catalogMeta.description || ""} ${catalogMeta.schemaSummary || ""}`.toLowerCase();
          return target.includes(keyword);
        }),
      }))
      .filter((group) => group.items.length > 0);
  });

  const libraryDrawerGroups = computed(() =>
    filteredNodePaletteGroups.value.map((group) => ({
      ...group,
      displayLabel: getCategoryLabel(group.category),
      items: group.items.map((item) => {
        const catalogMeta = buildNodeCatalogMeta(item?.type);
        return {
          ...item,
          badge: getNodeBadge(item.type),
          description:
            catalogMeta.description || String(item?.description || "").trim(),
          schemaSummary: catalogMeta.schemaSummary,
          ioSummary: catalogMeta.ioSummary,
          widgetSummary: catalogMeta.widgetSummary,
        };
      }),
    })),
  );

  const contextMenuQuickNodeItems = computed(() => {
    const quickOrder = [
      TRANSLATE_SUBTITLE_NODE_TYPE,
      PACK_SUBTITLE_NODE_TYPE,
      UPLOAD_SUBTITLE_NODE_TYPE,
      CLOUD_DELETE_RECENT_NODE_TYPE,
      LOCAL_DELETE_SCANNED_NODE_TYPE,
      "files.scanArchives",
      "input.manual",
      "file.readText",
      "file.writeText",
      "tools.extractFileNames",
      "tools.cleanData",
      "util.delay",
      "output.inspect",
    ];
    const orderedTypeSet = new Set(quickOrder);
    const itemMap = new Map();

    nodePaletteGroups.value.forEach((group) => {
      const category = String(group?.category || "").trim();
      const groupItems = Array.isArray(group?.items) ? group.items : [];
      groupItems.forEach((item) => {
        const nodeType = String(item?.type || "").trim();
        if (!nodeType) {
          return;
        }
        itemMap.set(nodeType, {
          type: nodeType,
          label:
            String(item?.label || "").trim() || getNodeTypeDisplay(nodeType),
          category,
        });
      });
    });

    quickOrder.forEach((nodeType) => {
      if (itemMap.has(nodeType)) {
        return;
      }
      itemMap.set(nodeType, {
        type: nodeType,
        label: getNodeTypeDisplay(nodeType),
        category: resolveNodeCategoryKey(nodeType),
      });
    });

    const orderedItems = [];
    quickOrder.forEach((nodeType) => {
      const item = itemMap.get(nodeType);
      if (item) {
        orderedItems.push(item);
      }
    });

    const extraItems = [...itemMap.values()]
      .filter((item) => !orderedTypeSet.has(item.type))
      .sort((left, right) =>
        String(left.label || "").localeCompare(String(right.label || "")),
      );
    return [...orderedItems, ...extraItems].slice(
      0,
      comfyParityMode.value ? 6 : 16,
    );
  });

  const isNodeSelected = (nodeId) => selectedNodeIds.value.includes(nodeId);
  const hasMultiSelectModifier = (event) =>
    Boolean(event?.ctrlKey || event?.metaKey || event?.shiftKey);

  const syncStoreSelectionFromLegacy = () => {
    const nextItems = [];
    if (selectedNodeId.value) {
      nextItems.push({ type: "node", id: selectedNodeId.value });
    }
    if (selectedEdgeId.value) {
      nextItems.push({ type: "edge", id: selectedEdgeId.value });
    }
    selectionStore.setSelection(nextItems);
  };

  const handleNodeCardClick = (nodeId, event = null) => {
    if (event?.ctrlKey || event?.metaKey || event?.shiftKey) {
      selectionStore.toggleSelection("node", nodeId);
      const firstNodeId = selectedNodeIds.value[0] || nodeId;
      selectedNodeId.value = firstNodeId;
      selectedEdgeId.value = "";
    } else {
      selectNode(nodeId);
      selectionStore.selectSingle("node", nodeId);
    }
    inspectorTab.value = "config";
    nodeInlineInspectorVisible.value = prefersInlineInspector.value;
    nodeInlineInspectorTab.value = "config";
  };

  const isNodeTitleEditing = (nodeId) =>
    nodeTitleEditState.value.active &&
    nodeTitleEditState.value.nodeId === nodeId;

  const startNodeTitleEdit = (node, event = null) => {
    if (!node || canvasStore.locked) {
      return;
    }
    handleNodeCardClick(node.id, event);
    nodeTitleEditState.value = {
      active: true,
      nodeId: node.id,
      draft: String(resolveNodeLabel(node) || ""),
    };
  };

  const updateNodeTitleDraft = (value) => {
    if (!nodeTitleEditState.value.active) {
      return;
    }
    nodeTitleEditState.value = {
      ...nodeTitleEditState.value,
      draft: String(value || ""),
    };
  };

  const commitNodeTitleEdit = () => {
    if (!nodeTitleEditState.value.active || !nodeTitleEditState.value.nodeId) {
      return;
    }
    const node = workflow.value.graph.nodes.find(
      (item) => item.id === nodeTitleEditState.value.nodeId,
    );
    if (!node) {
      nodeTitleEditState.value = {
        active: false,
        nodeId: "",
        draft: "",
      };
      return;
    }
    const normalizedLabel = String(nodeTitleEditState.value.draft || "").trim();
    node.label = normalizedLabel || node.label || node.type || node.id;
    nodeTitleEditState.value = {
      active: false,
      nodeId: "",
      draft: "",
    };
  };

  const cancelNodeTitleEdit = () => {
    if (!nodeTitleEditState.value.active) {
      return;
    }
    nodeTitleEditState.value = {
      active: false,
      nodeId: "",
      draft: "",
    };
  };

  const toggleNodeVisualFlag = (nodeId, flagKey) => {
    if (!nodeId || !flagKey || canvasStore.locked) {
      return;
    }
    const node = workflow.value.graph.nodes.find((item) => item.id === nodeId);
    if (!node) {
      return;
    }
    const visual = ensureNodeVisualState(node);
    visual[flagKey] = !visual[flagKey];
  };

  const toggleNodeMute = (nodeId) => {
    toggleNodeVisualFlag(nodeId, "muted");
  };

  const toggleNodeBypass = (nodeId) => {
    toggleNodeVisualFlag(nodeId, "bypassed");
  };

  const toggleNodePin = (nodeId) => {
    toggleNodeVisualFlag(nodeId, "pinned");
  };

  const toggleNodeCollapse = (nodeId) => {
    toggleNodeVisualFlag(nodeId, "collapsed");
  };

  const focusNodeFromPicker = (nodeId) => {
    handleNodeCardClick(nodeId);
  };

  const handleEdgePathClick = (edgeId, event = null) => {
    if (event?.ctrlKey || event?.metaKey || event?.shiftKey) {
      selectionStore.toggleSelection("edge", edgeId);
      selectedEdgeId.value = selectedEdgeIds.value[0] || edgeId;
      return;
    }
    selectedEdgeId.value = edgeId;
    selectedNodeId.value = "";
    selectionStore.selectSingle("edge", edgeId);
  };

  const handleEdgePathDoubleClick = (edgeId, event) => {
    if (!edgeId || !event) {
      return;
    }
    const pointer = resolveCanvasPointerFromEvent(event);
    addRerouteToEdge(edgeId, pointer);
  };

  const handleGroupCardClick = (groupId, event = null) => {
    if (!groupId) {
      return;
    }
    if (event?.ctrlKey || event?.metaKey || event?.shiftKey) {
      selectionStore.toggleSelection("group", groupId);
    } else {
      selectionStore.selectSingle("group", groupId);
    }
    selectedNodeId.value = "";
    selectedEdgeId.value = "";
  };

  const handleRerouteHandleClick = (rerouteId, event = null) => {
    if (!rerouteId) {
      return;
    }
    if (event?.ctrlKey || event?.metaKey || event?.shiftKey) {
      selectionStore.toggleSelection("reroute", rerouteId);
    } else {
      selectionStore.selectSingle("reroute", rerouteId);
    }
    selectedNodeId.value = "";
    selectedEdgeId.value = "";
  };

  const startNodeBatchDrag = (node, event) => {
    if (!node || !event) {
      return;
    }
    const pointer = resolveCanvasPointerFromEvent(event);
    const selectedSet = new Set(selectedNodeIds.value);
    if (!selectedSet.has(node.id)) {
      selectedSet.clear();
      selectedSet.add(node.id);
      selectionStore.selectSingle("node", node.id);
      selectedNodeId.value = node.id;
      selectedEdgeId.value = "";
    }

    const dragNodes = workflow.value.graph.nodes
      .filter((item) => selectedSet.has(item.id))
      .map((item) => ({
        id: item.id,
        originX: Number(item.position?.x || 0),
        originY: Number(item.position?.y || 0),
      }));
    if (!dragNodes.length) {
      return;
    }

    nodeBatchDragState.value = {
      active: true,
      pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
      anchorX: pointer.x,
      anchorY: pointer.y,
      nodes: dragNodes,
    };
  };

  const applyNodeBatchDragFromPointer = (event) => {
    if (!nodeBatchDragState.value.active) {
      return false;
    }
    if (
      Number.isFinite(nodeBatchDragState.value.pointerId) &&
      Number.isFinite(event?.pointerId) &&
      event.pointerId !== nodeBatchDragState.value.pointerId
    ) {
      return true;
    }
    const pointer = resolveCanvasPointerFromEvent(event);
    const deltaX = pointer.x - nodeBatchDragState.value.anchorX;
    const deltaY = pointer.y - nodeBatchDragState.value.anchorY;
    const nodesById = new Map(
      workflow.value.graph.nodes.map((item) => [String(item.id), item]),
    );
    nodeBatchDragState.value.nodes.forEach((item) => {
      const node = nodesById.get(String(item.id));
      if (!node) {
        return;
      }
      node.position = {
        x: clampToGrid(item.originX + deltaX),
        y: clampToGrid(item.originY + deltaY),
      };
    });
    return true;
  };

  const stopNodeBatchDrag = () => {
    if (!nodeBatchDragState.value.active) {
      return;
    }
    nodeBatchDragState.value = {
      active: false,
      pointerId: null,
      anchorX: 0,
      anchorY: 0,
      nodes: [],
    };
  };

  const startGroupDrag = (groupVisual, event) => {
    if (!groupVisual?.id || !event || canvasStore.locked) {
      return;
    }
    if (hasMultiSelectModifier(event)) {
      return;
    }
    handleGroupCardClick(groupVisual.id, event);
    const pointer = resolveCanvasPointerFromEvent(event);
    groupDragState.value = {
      active: true,
      groupId: groupVisual.id,
      pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
      offsetX: pointer.x - Number(groupVisual.position?.x || 0),
      offsetY: pointer.y - Number(groupVisual.position?.y || 0),
    };
  };

  const applyGroupDragFromPointer = (event) => {
    if (!groupDragState.value.active) {
      return false;
    }
    if (
      Number.isFinite(groupDragState.value.pointerId) &&
      Number.isFinite(event?.pointerId) &&
      event.pointerId !== groupDragState.value.pointerId
    ) {
      return true;
    }
    ensureGraphCollections();
    const group = workflow.value.graph.groups.find(
      (item) => item.id === groupDragState.value.groupId,
    );
    if (!group) {
      return true;
    }
    const pointer = resolveCanvasPointerFromEvent(event);
    const nextX = clampToGrid(pointer.x - groupDragState.value.offsetX, 0);
    const nextY = clampToGrid(pointer.y - groupDragState.value.offsetY, 0);
    const prevX = Number(group?.position?.x || 0);
    const prevY = Number(group?.position?.y || 0);
    const deltaX = nextX - prevX;
    const deltaY = nextY - prevY;
    group.position = { x: nextX, y: nextY };
    if (Array.isArray(group.nodes) && group.nodes.length) {
      const groupNodeSet = new Set(group.nodes);
      workflow.value.graph.nodes.forEach((node) => {
        if (!groupNodeSet.has(node.id)) {
          return;
        }
        node.position = {
          x: clampToGrid(Number(node?.position?.x || 0) + deltaX),
          y: clampToGrid(Number(node?.position?.y || 0) + deltaY),
        };
      });
    }
    return true;
  };

  const stopGroupDrag = () => {
    if (!groupDragState.value.active) {
      return;
    }
    groupDragState.value = {
      active: false,
      groupId: "",
      pointerId: null,
      offsetX: 0,
      offsetY: 0,
    };
  };

  const startGroupResize = (groupVisual, handle = "SE", event) => {
    if (!groupVisual?.id || !event || canvasStore.locked) {
      return;
    }
    handleGroupCardClick(groupVisual.id, event);
    groupResizeState.value = {
      active: true,
      groupId: groupVisual.id,
      pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: Number(groupVisual.position?.x || 0),
      originY: Number(groupVisual.position?.y || 0),
      originWidth: clampGroupWidth(groupVisual.size?.width),
      originHeight: clampGroupHeight(groupVisual.size?.height),
      handle: String(handle || "SE").toUpperCase(),
    };
  };

  const applyGroupResizeFromPointer = (event) => {
    if (!groupResizeState.value.active) {
      return false;
    }
    if (
      Number.isFinite(groupResizeState.value.pointerId) &&
      Number.isFinite(event?.pointerId) &&
      event.pointerId !== groupResizeState.value.pointerId
    ) {
      return true;
    }
    ensureGraphCollections();
    const group = workflow.value.graph.groups.find(
      (item) => item.id === groupResizeState.value.groupId,
    );
    if (!group) {
      return true;
    }
    const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
    const deltaX = (event.clientX - groupResizeState.value.startClientX) / zoom;
    const deltaY = (event.clientY - groupResizeState.value.startClientY) / zoom;
    const handle = String(groupResizeState.value.handle || "SE").toUpperCase();
    let nextX = Number(groupResizeState.value.originX || 0);
    let nextY = Number(groupResizeState.value.originY || 0);
    let nextWidth = Number(
      groupResizeState.value.originWidth || DEFAULT_GROUP_WIDTH,
    );
    let nextHeight = Number(
      groupResizeState.value.originHeight || DEFAULT_GROUP_HEIGHT,
    );

    if (handle.includes("E")) {
      nextWidth = clampGroupWidth(nextWidth + deltaX);
    }
    if (handle.includes("S")) {
      nextHeight = clampGroupHeight(nextHeight + deltaY);
    }
    if (handle.includes("W")) {
      const widthAfterDrag = clampGroupWidth(nextWidth - deltaX);
      nextX += nextWidth - widthAfterDrag;
      nextWidth = widthAfterDrag;
    }
    if (handle.includes("N")) {
      const heightAfterDrag = clampGroupHeight(nextHeight - deltaY);
      nextY += nextHeight - heightAfterDrag;
      nextHeight = heightAfterDrag;
    }
    group.position = {
      x: clampToGrid(nextX, 0),
      y: clampToGrid(nextY, 0),
    };
    group.size = {
      width: clampGroupWidth(nextWidth),
      height: clampGroupHeight(nextHeight),
    };
    return true;
  };

  const stopGroupResize = () => {
    if (!groupResizeState.value.active) {
      return;
    }
    groupResizeState.value = {
      active: false,
      groupId: "",
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      originX: 0,
      originY: 0,
      originWidth: DEFAULT_GROUP_WIDTH,
      originHeight: DEFAULT_GROUP_HEIGHT,
      handle: "",
    };
  };

  const startRerouteDrag = (rerouteVisual, event) => {
    if (!rerouteVisual?.id || !event || canvasStore.locked) {
      return;
    }
    if (hasMultiSelectModifier(event)) {
      return;
    }
    handleRerouteHandleClick(rerouteVisual.id, event);
    rerouteDragState.value = {
      active: true,
      rerouteId: rerouteVisual.id,
      pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
    };
  };

  const applyRerouteDragFromPointer = (event) => {
    if (!rerouteDragState.value.active) {
      return false;
    }
    if (
      Number.isFinite(rerouteDragState.value.pointerId) &&
      Number.isFinite(event?.pointerId) &&
      event.pointerId !== rerouteDragState.value.pointerId
    ) {
      return true;
    }
    ensureGraphCollections();
    const reroute = workflow.value.graph.reroutes.find(
      (item) => item.id === rerouteDragState.value.rerouteId,
    );
    if (!reroute) {
      return true;
    }
    const pointer = resolveCanvasPointerFromEvent(event);
    reroute.x = clampToGrid(pointer.x, 0);
    reroute.y = clampToGrid(pointer.y, 0);
    return true;
  };

  const stopRerouteDrag = () => {
    if (!rerouteDragState.value.active) {
      return;
    }
    rerouteDragState.value = {
      active: false,
      rerouteId: "",
      pointerId: null,
    };
  };

  const handleNodeDragStart = (node, event) => {
    if (!node || nodeResizeState.value.active || canvasStore.locked) {
      return;
    }
    if (hasMultiSelectModifier(event)) {
      closeContextMenu();
      return;
    }
    handleNodeCardClick(node.id, event);
    closeContextMenu();
    startNodeBatchDrag(node, event);
  };

  const applyNodeResizeFromPointer = (event) => {
    if (!nodeResizeState.value.active || !event) {
      return;
    }

    if (
      Number.isFinite(nodeResizeState.value.pointerId) &&
      Number.isFinite(event.pointerId) &&
      event.pointerId !== nodeResizeState.value.pointerId
    ) {
      return;
    }

    const node = workflow.value.graph.nodes.find(
      (item) => item.id === nodeResizeState.value.nodeId,
    );
    if (!node) {
      return;
    }

    const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
    const deltaX = (event.clientX - nodeResizeState.value.startClientX) / zoom;
    const deltaY = (event.clientY - nodeResizeState.value.startClientY) / zoom;
    const handle = String(nodeResizeState.value.handle || "SE").toUpperCase();

    let nextX = nodeResizeState.value.originX;
    let nextY = nodeResizeState.value.originY;
    let nextWidth = nodeResizeState.value.originWidth;
    let nextHeight = nodeResizeState.value.originHeight;

    if (handle.includes("E")) {
      nextWidth = clampNodeWidth(nodeResizeState.value.originWidth + deltaX);
    }
    if (handle.includes("S")) {
      nextHeight = clampNodeHeight(nodeResizeState.value.originHeight + deltaY);
    }
    if (handle.includes("W")) {
      nextWidth = clampNodeWidth(nodeResizeState.value.originWidth - deltaX);
      nextX =
        nodeResizeState.value.originX +
        (nodeResizeState.value.originWidth - nextWidth);
    }
    if (handle.includes("N")) {
      nextHeight = clampNodeHeight(nodeResizeState.value.originHeight - deltaY);
      nextY =
        nodeResizeState.value.originY +
        (nodeResizeState.value.originHeight - nextHeight);
    }

    node.size = {
      width: nextWidth,
      height: nextHeight,
    };
    setNodeManualSize(node, true);
    node.position = {
      x: Math.max(8, Math.round(nextX)),
      y: Math.max(8, Math.round(nextY)),
    };

    if (selectedNode.value?.id === node.id) {
      syncSelectedNodeEditorDrafts();
    }
  };

  const startNodeResize = (node, handle, event) => {
    if (!node || !event || canvasStore.locked) {
      return;
    }

    handleNodeCardClick(node.id);
    closeContextMenu();
    const size = resolveNodeDimensions(node);
    nodeResizeState.value = {
      active: true,
      nodeId: node.id,
      handle: String(handle || "SE").toUpperCase(),
      pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: Number(node.position?.x || 0),
      originY: Number(node.position?.y || 0),
      originWidth: size.width,
      originHeight: size.height,
    };

    if (event.target?.setPointerCapture && Number.isFinite(event.pointerId)) {
      try {
        event.target.setPointerCapture(event.pointerId);
      } catch {
        // ignore pointer capture errors
      }
    }
  };

  const stopNodeResize = () => {
    if (!nodeResizeState.value.active) {
      return;
    }
    nodeResizeState.value = {
      active: false,
      nodeId: "",
      handle: "",
      pointerId: null,
      startClientX: 0,
      startClientY: 0,
      originX: 0,
      originY: 0,
      originWidth: DEFAULT_NODE_WIDTH,
      originHeight: DEFAULT_NODE_HEIGHT,
    };
  };

  const clampContextMenuPosition = ({ x, y, width, height }) => {
    const viewportLeft = Number(canvasStore.scrollLeft || 0);
    const viewportTop = Number(canvasStore.scrollTop || 0);
    const viewportWidth = Number(canvasStore.viewportWidth || 0);
    const viewportHeight = Number(canvasStore.viewportHeight || 0);
    const safeWidth = Math.max(
      1,
      Number(width || DEFAULT_CONTEXT_MENU_METRICS.width),
    );
    const safeHeight = Math.max(
      1,
      Number(height || DEFAULT_CONTEXT_MENU_METRICS.height),
    );

    if (viewportWidth <= 0 || viewportHeight <= 0) {
      return {
        x: Math.round(Number(x || 0)),
        y: Math.round(Number(y || 0)),
      };
    }

    const minX = viewportLeft + CONTEXT_MENU_MARGIN;
    const minY = viewportTop + CONTEXT_MENU_MARGIN;
    const maxX =
      viewportLeft +
      Math.max(
        CONTEXT_MENU_MARGIN,
        viewportWidth - safeWidth - CONTEXT_MENU_MARGIN,
      );
    const maxY =
      viewportTop +
      Math.max(
        CONTEXT_MENU_MARGIN,
        viewportHeight - safeHeight - CONTEXT_MENU_MARGIN,
      );

    return {
      x: Math.round(Math.min(Math.max(Number(x || 0), minX), maxX)),
      y: Math.round(Math.min(Math.max(Number(y || 0), minY), maxY)),
    };
  };

  const ensureContextMenuInViewport = (position = {}) =>
    clampContextMenuPosition({
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
    });

  const updateContextMenuMetrics = (metrics = {}) => {
    const width = Number(metrics.width || 0);
    const height = Number(metrics.height || 0);
    if (width <= 0 || height <= 0) {
      return;
    }
    contextMenuMetrics.value = {
      width,
      height,
    };
  };

  const contextMenuRenderPosition = computed(() => {
    const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
    const anchorX = Number(
      contextMenuState.value.anchorX || contextMenuState.value.x * zoom || 0,
    );
    const anchorY = Number(
      contextMenuState.value.anchorY || contextMenuState.value.y * zoom || 0,
    );
    return ensureContextMenuInViewport({
      x: anchorX,
      y: anchorY,
      width: contextMenuMetrics.value.width,
      height: contextMenuMetrics.value.height,
    });
  });

  const closeContextMenu = () => {
    contextMenuState.value = createDefaultContextMenuState();
  };

  const resolveCanvasMenuPosition = (event) => {
    const canvas = canvasRef.value;
    if (!canvas || !event) {
      return {
        x: 0,
        y: 0,
        anchorX: 0,
        anchorY: 0,
      };
    }

    const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
    const rect = canvas.getBoundingClientRect();
    const rawX = event.clientX - rect.left + canvas.scrollLeft;
    const rawY = event.clientY - rect.top + canvas.scrollTop;
    const maxAnchorX = Math.max(
      CONTEXT_MENU_MARGIN,
      canvas.scrollWidth - CONTEXT_MENU_MARGIN,
    );
    const maxAnchorY = Math.max(
      CONTEXT_MENU_MARGIN,
      canvas.scrollHeight - CONTEXT_MENU_MARGIN,
    );
    return {
      x: Math.max(
        CONTEXT_MENU_MARGIN,
        Math.min(
          BASE_CANVAS_WIDTH - CONTEXT_MENU_MARGIN,
          Math.round(rawX / zoom),
        ),
      ),
      y: Math.max(
        CONTEXT_MENU_MARGIN,
        Math.min(
          BASE_CANVAS_HEIGHT - CONTEXT_MENU_MARGIN,
          Math.round(rawY / zoom),
        ),
      ),
      anchorX: Math.max(
        CONTEXT_MENU_MARGIN,
        Math.min(maxAnchorX, Math.round(rawX)),
      ),
      anchorY: Math.max(
        CONTEXT_MENU_MARGIN,
        Math.min(maxAnchorY, Math.round(rawY)),
      ),
    };
  };

  const openCanvasContextMenu = (event) => {
    if (!event || event.target instanceof Element === false) {
      return;
    }
    closeQuickPalette();
    const menuPos = resolveCanvasMenuPosition(event);
    contextMenuState.value = {
      visible: true,
      x: menuPos.x,
      y: menuPos.y,
      anchorX: menuPos.anchorX,
      anchorY: menuPos.anchorY,
      scope: "canvas",
      nodeId: "",
      edgeId: "",
      groupId: "",
      rerouteId: "",
    };
  };
  const createNodeFromCanvasContext = (nodeType) => {
    if (!nodeType || canvasStore.locked) {
      closeContextMenu();
      return;
    }
    createNodeAtCanvasPoint(nodeType, {
      x: Number(contextMenuState.value.x || canvasViewport.value.x + 120),
      y: Number(contextMenuState.value.y || canvasViewport.value.y + 80),
    });
    closeContextMenu();
  };

  const openNodeContextMenu = (nodeId, event) => {
    if (!nodeId || !event) {
      return;
    }
    closeQuickPalette();
    handleNodeCardClick(nodeId);
    const menuPos = resolveCanvasMenuPosition(event);
    contextMenuState.value = {
      visible: true,
      x: menuPos.x,
      y: menuPos.y,
      anchorX: menuPos.anchorX,
      anchorY: menuPos.anchorY,
      scope: "node",
      nodeId,
      edgeId: "",
      groupId: "",
      rerouteId: "",
    };
  };

  const openEdgeContextMenu = (edgeId, event) => {
    if (!edgeId || !event) {
      return;
    }
    closeQuickPalette();
    handleEdgePathClick(edgeId, event);
    const menuPos = resolveCanvasMenuPosition(event);
    contextMenuState.value = {
      visible: true,
      x: menuPos.x,
      y: menuPos.y,
      anchorX: menuPos.anchorX,
      anchorY: menuPos.anchorY,
      scope: "edge",
      nodeId: "",
      edgeId,
      groupId: "",
      rerouteId: "",
    };
  };

  const openGroupContextMenu = (groupId, event) => {
    if (!groupId || !event) {
      return;
    }
    closeQuickPalette();
    handleGroupCardClick(groupId, event);
    const menuPos = resolveCanvasMenuPosition(event);
    contextMenuState.value = {
      visible: true,
      x: menuPos.x,
      y: menuPos.y,
      anchorX: menuPos.anchorX,
      anchorY: menuPos.anchorY,
      scope: "group",
      nodeId: "",
      edgeId: "",
      groupId,
      rerouteId: "",
    };
  };

  const openRerouteContextMenu = (rerouteId, event) => {
    if (!rerouteId || !event) {
      return;
    }
    closeQuickPalette();
    handleRerouteHandleClick(rerouteId, event);
    const menuPos = resolveCanvasMenuPosition(event);
    contextMenuState.value = {
      visible: true,
      x: menuPos.x,
      y: menuPos.y,
      anchorX: menuPos.anchorX,
      anchorY: menuPos.anchorY,
      scope: "reroute",
      nodeId: "",
      edgeId: "",
      groupId: "",
      rerouteId,
    };
  };

  const copySelectedNode = () => {
    const preferredNodeId =
      contextMenuState.value.nodeId || selectedNodeId.value || "";
    if (!copyNodesToClipboard(preferredNodeId)) {
      return;
    }
    closeContextMenu();
  };

  const contextMenuNode = computed(() => {
    const nodeId = contextMenuState.value.nodeId || selectedNodeId.value;
    if (!nodeId) {
      return null;
    }
    return (
      workflow.value.graph.nodes.find((item) => item.id === nodeId) || null
    );
  });
  const contextMenuNodeSubgraphId = computed(() =>
    resolveNodeSubgraphTargetId(contextMenuNode.value),
  );
  const canContextMenuEnterSubgraph = computed(() => {
    const subgraphId = normalizeSubgraphId(contextMenuNodeSubgraphId.value);
    if (!subgraphId) {
      return false;
    }
    if (activeSubgraphId.value === subgraphId) {
      return false;
    }
    return hasSubgraphDefinition(subgraphId);
  });

  const selectedNodeSubgraphId = computed(() =>
    resolveNodeSubgraphTargetId(selectedNode.value),
  );
  const canEnterSelectedNodeSubgraph = computed(() => {
    const subgraphId = normalizeSubgraphId(selectedNodeSubgraphId.value);
    if (!subgraphId) {
      return false;
    }
    if (activeSubgraphId.value === subgraphId) {
      return false;
    }
    return hasSubgraphDefinition(subgraphId);
  });
  const enterSelectedNodeSubgraph = () => {
    if (!canEnterSelectedNodeSubgraph.value) {
      return;
    }
    enterSubgraph(selectedNodeSubgraphId.value);
  };

  const contextMenuNodeVisualState = computed(() => {
    if (!contextMenuNode.value) {
      return {
        muted: false,
        bypassed: false,
        pinned: false,
        collapsed: false,
      };
    }
    return ensureNodeVisualState(contextMenuNode.value);
  });

  const buildContextMenuCommandContext = () => ({
    scope: contextMenuState.value.scope,
    nodeId: contextMenuState.value.nodeId,
    edgeId: contextMenuState.value.edgeId,
    groupId: contextMenuState.value.groupId,
    rerouteId: contextMenuState.value.rerouteId,
    x: contextMenuState.value.x,
    y: contextMenuState.value.y,
    anchorX: contextMenuState.value.anchorX,
    anchorY: contextMenuState.value.anchorY,
    node: contextMenuNode.value,
    edge:
      workflow.value?.graph?.edges?.find(
        (item) => item.id === contextMenuState.value.edgeId,
      ) || null,
    group:
      workflow.value?.graph?.groups?.find(
        (item) => item.id === contextMenuState.value.groupId,
      ) || null,
    reroute:
      workflow.value?.graph?.reroutes?.find(
        (item) => item.id === contextMenuState.value.rerouteId,
      ) || null,
    selectedItems: selectionStore.selectedItems,
    selectedNodeIds: selectedNodeIds.value,
    selectedEdgeIds: selectedEdgeIds.value,
    selectedGroupIds: selectedGroupIds.value,
    selectedRerouteIds: selectedRerouteIds.value,
    hasClipboard: hasNodeClipboardPayload.value,
    isRunInProgress: isRunInProgress.value,
    activeSubgraphId: activeSubgraphId.value,
  });

  const getContextMenuItemsByScopeSafe = (scope = "canvas") => {
    if (typeof commandStore.getContextMenuItemsByScope === "function") {
      return commandStore.getContextMenuItemsByScope(scope);
    }

    const normalizedScope =
      String(scope || "canvas")
        .trim()
        .toLowerCase() || "canvas";
    const items = Array.isArray(commandStore.contextMenuItems)
      ? commandStore.contextMenuItems
      : [];
    return items.filter(
      (item) => item?.scope === normalizedScope || item?.scope === "all",
    );
  };

  const contextMenuExtensionItems = computed(() => {
    if (comfyParityMode.value && contextMenuState.value.scope === "canvas") {
      return [];
    }

    const commandContext = buildContextMenuCommandContext();
    return getContextMenuItemsByScopeSafe(contextMenuState.value.scope)
      .filter((item) => {
        try {
          return item.visible(commandContext) !== false;
        } catch {
          return false;
        }
      })
      .map((item) => {
        let disabled = false;

        try {
          disabled = item.disabled(commandContext) === true;
        } catch {
          disabled = true;
        }

        if (!disabled && item.commandId) {
          disabled = !commandStore.isCommandActive(
            item.commandId,
            commandContext,
          );
        }

        return {
          ...item,
          disabled,
        };
      })
      .sort((left, right) => {
        if (left.order !== right.order) {
          return left.order - right.order;
        }
        return String(left.label || "").localeCompare(
          String(right.label || ""),
          "zh-Hans-CN",
        );
      });
  });

  const executeContextMenuExtensionAction = async (actionKey) => {
    const normalizedKey = String(actionKey || "").trim();
    if (!normalizedKey) {
      closeContextMenu();
      return;
    }

    const targetItem = contextMenuExtensionItems.value.find(
      (item) => (item.key || item.id) === normalizedKey,
    );
    if (!targetItem || targetItem.disabled) {
      closeContextMenu();
      return;
    }

    const payload = {
      scope: contextMenuState.value.scope,
      nodeId: contextMenuState.value.nodeId,
      edgeId: contextMenuState.value.edgeId,
      groupId: contextMenuState.value.groupId,
      rerouteId: contextMenuState.value.rerouteId,
      x: contextMenuState.value.x,
      y: contextMenuState.value.y,
      anchorX: contextMenuState.value.anchorX,
      anchorY: contextMenuState.value.anchorY,
    };
    const commandContext = buildContextMenuCommandContext();

    if (targetItem.commandId) {
      await commandStore.executeCommand(
        targetItem.commandId,
        payload,
        commandContext,
      );
      closeContextMenu();
      return;
    }

    if (typeof targetItem.handler === "function") {
      await targetItem.handler(payload, commandContext);
    }
    closeContextMenu();
  };

  const toggleContextNodeMute = () => {
    const nodeId = contextMenuNode.value?.id || "";
    if (!nodeId) {
      closeContextMenu();
      return;
    }
    toggleNodeMute(nodeId);
    closeContextMenu();
  };

  const toggleContextNodeBypass = () => {
    const nodeId = contextMenuNode.value?.id || "";
    if (!nodeId) {
      closeContextMenu();
      return;
    }
    toggleNodeBypass(nodeId);
    closeContextMenu();
  };

  const toggleContextNodePin = () => {
    const nodeId = contextMenuNode.value?.id || "";
    if (!nodeId) {
      closeContextMenu();
      return;
    }
    toggleNodePin(nodeId);
    closeContextMenu();
  };

  const toggleContextNodeCollapse = () => {
    const nodeId = contextMenuNode.value?.id || "";
    if (!nodeId) {
      closeContextMenu();
      return;
    }
    toggleNodeCollapse(nodeId);
    closeContextMenu();
  };
  const enterContextNodeSubgraph = () => {
    const subgraphId = normalizeSubgraphId(contextMenuNodeSubgraphId.value);
    if (!subgraphId || !hasSubgraphDefinition(subgraphId)) {
      closeContextMenu();
      return;
    }
    enterSubgraph(subgraphId);
    closeContextMenu();
  };
  const exitContextSubgraph = () => {
    if (!canExitActiveSubgraph.value) {
      closeContextMenu();
      return;
    }
    exitSubgraph();
    closeContextMenu();
  };

  const pasteCopiedNode = () => {
    pasteClipboardNodes({
      connectWithSelection: false,
    });
    closeContextMenu();
  };

  const pasteCopiedNodeWithConnect = () => {
    pasteClipboardNodes({
      connectWithSelection: true,
    });
    closeContextMenu();
  };

  const duplicateSelectedNode = () => {
    copySelectedNode();
    pasteCopiedNode();
  };

  const removeContextNode = () => {
    const nodeId = contextMenuState.value.nodeId || selectedNodeId.value;
    if (!nodeId) {
      closeContextMenu();
      return;
    }
    removeNode(nodeId);
    selectionStore.removeFromSelection("node", nodeId);
    closeContextMenu();
  };

  const removeContextEdge = () => {
    const edgeId = contextMenuState.value.edgeId || selectedEdgeId.value;
    if (!edgeId) {
      closeContextMenu();
      return;
    }
    selectedEdgeId.value = edgeId;
    removeSelectedEdge();
    selectionStore.removeFromSelection("edge", edgeId);
    closeContextMenu();
  };

  const removeContextGroup = () => {
    const groupId = contextMenuState.value.groupId || selectedGroupIds.value[0];
    if (!groupId) {
      closeContextMenu();
      return;
    }
    removeGroupById(groupId);
    closeContextMenu();
  };

  const fitContextGroup = () => {
    const groupId = contextMenuState.value.groupId || selectedGroupIds.value[0];
    if (!groupId) {
      closeContextMenu();
      return;
    }
    fitGroupToContents(groupId);
    closeContextMenu();
  };

  const removeContextReroute = () => {
    const rerouteId =
      contextMenuState.value.rerouteId || selectedRerouteIds.value[0];
    if (!rerouteId) {
      closeContextMenu();
      return;
    }
    removeRerouteById(rerouteId);
    closeContextMenu();
  };

  const addRerouteToEdge = (edgeId, point = null) => {
    if (!edgeId || canvasStore.locked) {
      return;
    }
    ensureGraphCollections();
    const edge = edgeVisualList.value.find((item) => item.id === edgeId);
    if (!edge) {
      return;
    }
    const fallbackX = Math.round(
      (Number(edge.x1 || 0) + Number(edge.x2 || 0)) / 2,
    );
    const fallbackY = Math.round(
      (Number(edge.y1 || 0) + Number(edge.y2 || 0)) / 2,
    );
    const edgeReroutes = workflow.value.graph.reroutes.filter(
      (item) => item.linkId === edgeId,
    );
    const rerouteId = createRerouteId();
    workflow.value.graph.reroutes.push({
      id: rerouteId,
      linkId: edgeId,
      order: edgeReroutes.length,
      x: clampToGrid(point?.x ?? fallbackX, 0),
      y: clampToGrid(point?.y ?? fallbackY, 0),
    });
    selectionStore.selectSingle("reroute", rerouteId);
  };

  const addRerouteFromContextEdge = () => {
    const edgeId = contextMenuState.value.edgeId || selectedEdgeId.value;
    if (!edgeId) {
      closeContextMenu();
      return;
    }
    addRerouteToEdge(edgeId, {
      x: contextMenuState.value.x,
      y: contextMenuState.value.y,
    });
    closeContextMenu();
  };

  const fitCanvasView = () => {
    const nodes = workflow.value?.graph?.nodes || [];
    if (!nodes.length) {
      return;
    }
    const left = Math.min(
      ...nodes.map((item) => Number(item.position?.x || 0)),
    );
    const top = Math.min(...nodes.map((item) => Number(item.position?.y || 0)));
    const right = Math.max(
      ...nodes.map(
        (item) =>
          Number(item.position?.x || 0) + resolveNodeDimensions(item).width,
      ),
    );
    const bottom = Math.max(
      ...nodes.map(
        (item) =>
          Number(item.position?.y || 0) + resolveNodeDimensions(item).height,
      ),
    );
    const contentWidth = Math.max(1, right - left);
    const contentHeight = Math.max(1, bottom - top);
    canvasStore.fitView({
      contentWidth,
      contentHeight,
      canvasWidth: canvasRef.value?.clientWidth || BASE_CANVAS_WIDTH,
      canvasHeight: canvasRef.value?.clientHeight || BASE_CANVAS_HEIGHT,
    });
    nextTick(() => {
      if (!canvasRef.value) {
        return;
      }
      const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
      canvasRef.value.scrollLeft = Math.max(0, left * zoom - 80);
      canvasRef.value.scrollTop = Math.max(0, top * zoom - 80);
      updateCanvasViewport();
    });
    closeContextMenu();
  };

  const resetCanvasView = () => {
    canvasStore.resetView();
    if (canvasRef.value) {
      canvasRef.value.scrollLeft = 0;
      canvasRef.value.scrollTop = 0;
      updateCanvasViewport();
    }
    closeContextMenu();
  };

  const toggleCanvasLinks = () => {
    canvasStore.setLinkVisible(!canvasStore.linkVisible);
    closeContextMenu();
  };

  const toggleCanvasLock = () => {
    const nextLocked = !canvasStore.locked;
    canvasStore.setLocked(nextLocked);
    if (nextLocked) {
      cancelEdgeConnect();
      stopNodeDrag();
      stopNodeBatchDrag();
      stopNodeResize();
      stopGroupDrag();
      stopGroupResize();
      stopRerouteDrag();
      handleCanvasPanEnd();
    }
    closeContextMenu();
  };

  const toggleCanvasMinimap = () => {
    canvasStore.setMinimapVisible(!canvasStore.minimapVisible);
    closeContextMenu();
  };

  const setCanvasNavigationMode = (mode = "move") => {
    canvasStore.setNavigationMode(mode);
    closeContextMenu();
  };

  const cloneWorkflowPayload = () => {
    try {
      return JSON.parse(JSON.stringify(workflow.value));
    } catch {
      return null;
    }
  };

  const inspectRunHistoryItem = (runRecord) => {
    inspectRunRecord(runRecord);
    runtimeDockTab.value = "selected";
    logDockScope.value = "workflow";
  };

  const rerunHistoryItem = async (runRecord, options = {}) => {
    runtimeDockTab.value = "queue";
    return rerunHistoryRun(runRecord, options);
  };

  const queueRunCurrentWorkflowFront = async () => {
    const payload = cloneWorkflowPayload();
    if (!payload) {
      message.error("工作流序列化失败，无法前插执行");
      closeContextMenu();
      return;
    }
    const result = await queueStore.runFront({ workflow: payload });
    if (!result?.success) {
      message.error(result?.error || "前插执行失败");
    } else {
      message.success("已加入队列前端");
      runtimeDockTab.value = "queue";
    }
    closeContextMenu();
  };

  const clearPendingQueue = async () => {
    const result = await queueStore.clearPending();
    if (!result?.success) {
      message.error(result?.error || "清空待执行失败");
    } else {
      message.success("待执行队列已清空");
    }
    closeContextMenu();
  };

  const assignSourceNode = (nodeId) => {
    sourceNodeId.value = nodeId;
    if (targetNodeId.value === nodeId) {
      targetNodeId.value = "";
    }
  };

  const assignTargetNode = (nodeId) => {
    targetNodeId.value = nodeId;
    if (sourceNodeId.value === nodeId) {
      sourceNodeId.value = "";
    }
  };

  const autoArrangeNodes = () => {
    const nodes = workflow.value?.graph?.nodes || [];
    const edges = workflow.value?.graph?.edges || [];
    if (!nodes.length) {
      return;
    }

    const nodeIds = new Set(nodes.map((node) => node.id));
    const inDegree = new Map(nodes.map((node) => [node.id, 0]));
    const outgoing = new Map(nodes.map((node) => [node.id, []]));
    const layerByNodeId = new Map(nodes.map((node) => [node.id, 0]));

    edges.forEach((edge) => {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        return;
      }
      outgoing.get(edge.source).push(edge.target);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    });

    const queue = nodes
      .filter((node) => (inDegree.get(node.id) || 0) === 0)
      .sort((left, right) => left.position.y - right.position.y)
      .map((node) => node.id);

    const visited = new Set();
    while (queue.length) {
      const nodeId = queue.shift();
      if (visited.has(nodeId)) {
        continue;
      }
      visited.add(nodeId);
      const nextLayer = layerByNodeId.get(nodeId) || 0;

      (outgoing.get(nodeId) || []).forEach((targetId) => {
        layerByNodeId.set(
          targetId,
          Math.max(layerByNodeId.get(targetId) || 0, nextLayer + 1),
        );
        inDegree.set(targetId, (inDegree.get(targetId) || 1) - 1);
        if ((inDegree.get(targetId) || 0) <= 0) {
          queue.push(targetId);
        }
      });
    }

    nodes
      .filter((node) => !visited.has(node.id))
      .sort((left, right) => left.position.x - right.position.x)
      .forEach((node, index) => {
        layerByNodeId.set(node.id, index);
      });

    const columns = new Map();
    nodes.forEach((node) => {
      const layer = layerByNodeId.get(node.id) || 0;
      if (!columns.has(layer)) {
        columns.set(layer, []);
      }
      columns.get(layer).push(node);
    });

    const orderedLayers = Array.from(columns.keys()).sort(
      (left, right) => left - right,
    );
    const baseX = 72;
    const baseY = 88;
    const gapX = 96;
    const gapY = 56;
    let cursorX = baseX;

    orderedLayers.forEach((layer) => {
      const columnNodes = columns
        .get(layer)
        .slice()
        .sort((left, right) => left.position.y - right.position.y);
      let cursorY = baseY;
      let columnWidth = 0;

      columnNodes.forEach((node) => {
        const size = resolveNodeDimensions(node);
        node.position.x = cursorX;
        node.position.y = cursorY;
        cursorY += size.height + gapY;
        columnWidth = Math.max(columnWidth, size.width);
      });

      cursorX += columnWidth + gapX;
    });

    nextTick(() => {
      updateCanvasViewport();
      updateMinimapMetrics();
    });
  };

  const handleLibraryNodeDragStart = (nodeType) => {
    libraryDragNodeType.value = typeof nodeType === "string" ? nodeType : "";
  };

  const resolveNodeTypeFromDropEvent = (event) => {
    const draggedType =
      event?.dataTransfer?.getData("application/x-workflow-node-type") ||
      libraryDragNodeType.value;
    return typeof draggedType === "string" ? draggedType : "";
  };

  const handleCanvasDragOver = (event) => {
    const draggedType = resolveNodeTypeFromDropEvent(event);
    if (!draggedType) {
      return;
    }

    if (event?.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleCanvasDrop = (event) => {
    const nodeType = resolveNodeTypeFromDropEvent(event);
    if (!nodeType) {
      return;
    }

    const pointer = resolveCanvasPointerFromEvent(event);
    const createdNode = addNodeByType(nodeType, {
      position: {
        x: pointer.x - DEFAULT_NODE_WIDTH / 2,
        y: pointer.y - DEFAULT_NODE_HEIGHT / 2,
      },
    });
    if (createdNode?.id) {
      handleNodeCardClick(createdNode.id);
    }
    libraryDragNodeType.value = "";
  };

  const resolveCanvasPointerFromEvent = (event) => {
    if (!canvasRef.value || !event) {
      return { x: 0, y: 0 };
    }

    const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
    const rect = canvasRef.value.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left + canvasRef.value.scrollLeft) / zoom,
      y: (event.clientY - rect.top + canvasRef.value.scrollTop) / zoom,
    };
  };

  const connectPreviewTarget = computed(() => {
    if (
      !connectDrag.value.active ||
      !connectHoverNodeId.value ||
      !connectHoverPortKey.value
    ) {
      return null;
    }

    if (connectHoverNodeId.value === connectDrag.value.sourceNodeId) {
      return null;
    }

    const node = workflow.value.graph.nodes.find(
      (item) => item.id === connectHoverNodeId.value,
    );
    if (!node) {
      return null;
    }

    return {
      node,
      portKey: connectHoverPortKey.value,
    };
  });

  const connectSourcePoint = computed(() => {
    if (
      !connectDrag.value.active ||
      !connectDrag.value.sourceNodeId ||
      !connectDrag.value.sourcePortKey
    ) {
      return null;
    }

    const sourceNode = workflow.value.graph.nodes.find(
      (node) => node.id === connectDrag.value.sourceNodeId,
    );
    if (!sourceNode) {
      return null;
    }

    return resolveNodePortAnchor(
      sourceNode,
      "out",
      connectDrag.value.sourcePortKey,
    );
  });

  const activeConnectPath = computed(() => {
    const start = connectSourcePoint.value;
    if (!start || !connectDrag.value.active) {
      return "";
    }

    const previewTarget = connectPreviewTarget.value;
    const end = previewTarget
      ? resolveNodePortAnchor(
          previewTarget.node,
          "in",
          String(previewTarget.portKey || "input"),
        )
      : {
          x: connectDrag.value.x,
          y: connectDrag.value.y,
        };
    const distance = Math.max(56, Math.abs(end.x - start.x) * 0.45);
    return `M ${start.x} ${start.y} C ${start.x + distance} ${start.y}, ${end.x - distance} ${end.y}, ${end.x} ${end.y}`;
  });

  const cancelEdgeConnect = () => {
    if (!connectDrag.value.active) {
      return;
    }

    connectDrag.value = {
      active: false,
      sourceNodeId: "",
      sourcePortKey: "output",
      x: 0,
      y: 0,
    };
    connectHoverNodeId.value = "";
    connectHoverPortKey.value = "";
  };

  const startEdgeConnect = (nodeId, sourcePortKey = "output", event) => {
    if (!nodeId || !sourcePortKey || canvasStore.locked) {
      return;
    }

    const pointer = resolveCanvasPointerFromEvent(event);
    connectDrag.value = {
      active: true,
      sourceNodeId: nodeId,
      sourcePortKey,
      x: pointer.x,
      y: pointer.y,
    };
    connectHoverNodeId.value = "";
    connectHoverPortKey.value = "";
    selectedNodeId.value = nodeId;
    selectionStore.selectSingle("node", nodeId);
  };

  const updateEdgeConnectPointer = (event) => {
    if (!connectDrag.value.active) {
      return;
    }

    const pointer = resolveCanvasPointerFromEvent(event);
    connectDrag.value = {
      ...connectDrag.value,
      x: pointer.x,
      y: pointer.y,
    };
  };

  const triggerConnectFeedback = (edgeId, sourceId, targetId) => {
    if (connectFeedbackTimer) {
      clearTimeout(connectFeedbackTimer);
      connectFeedbackTimer = null;
    }

    connectFeedback.value = {
      edgeId,
      sourceNodeId: sourceId,
      targetNodeId: targetId,
    };

    connectFeedbackTimer = setTimeout(() => {
      connectFeedback.value = {
        edgeId: "",
        sourceNodeId: "",
        targetNodeId: "",
      };
      connectFeedbackTimer = null;
    }, 900);
  };

  const updateConnectHoverNode = (nodeId, portKey = "", isInside = true) => {
    if (!connectDrag.value.active) {
      return;
    }

    if (!isInside || nodeId === connectDrag.value.sourceNodeId) {
      if (
        (connectHoverNodeId.value === nodeId &&
          connectHoverPortKey.value === portKey) ||
        !nodeId
      ) {
        connectHoverNodeId.value = "";
        connectHoverPortKey.value = "";
      }
      return;
    }

    connectHoverNodeId.value = nodeId;
    connectHoverPortKey.value = String(portKey || "");
  };

  const finishEdgeConnect = (nodeId, targetPortKey = "input") => {
    if (
      canvasStore.locked ||
      !connectDrag.value.active ||
      !nodeId ||
      !targetPortKey ||
      !connectDrag.value.sourcePortKey
    ) {
      return;
    }

    const sourceId = connectDrag.value.sourceNodeId;
    const sourcePortKey = connectDrag.value.sourcePortKey;
    const validation = resolveConnectValidation(
      sourceId,
      sourcePortKey,
      nodeId,
      targetPortKey,
    );
    if (!validation.valid) {
      message.warning(validation.reason || "端口类型不兼容");
      cancelEdgeConnect();
      return;
    }

    sourceNodeId.value = sourceId;
    targetNodeId.value = nodeId;
    const createdEdgeId = addEdge({
      source: sourceId,
      target: nodeId,
      sourcePort: sourcePortKey,
      targetPort: targetPortKey,
      replaceTargetPort: true,
    });
    if (createdEdgeId) {
      selectionStore.selectSingle("edge", createdEdgeId);
      triggerConnectFeedback(createdEdgeId, sourceId, nodeId);
    }
    cancelEdgeConnect();
  };

  const handleNodeCardMouseUp = () => {
    stopNodeDrag();
    stopNodeBatchDrag();
  };

  const handleCanvasPointerMove = (event) => {
    if (canvasPan.value.active) {
      return;
    }

    if (selectionStore.marquee.active) {
      const pointer = resolveCanvasPointerFromEvent(event);
      selectionStore.updateMarquee({
        x: pointer.x,
        y: pointer.y,
      });
      return;
    }

    if (nodeResizeState.value.active) {
      applyNodeResizeFromPointer(event);
      return;
    }

    if (groupResizeState.value.active) {
      applyGroupResizeFromPointer(event);
      return;
    }

    if (groupDragState.value.active) {
      applyGroupDragFromPointer(event);
      return;
    }

    if (rerouteDragState.value.active) {
      applyRerouteDragFromPointer(event);
      return;
    }

    if (nodeBatchDragState.value.active) {
      applyNodeBatchDragFromPointer(event);
      return;
    }

    handleCanvasMouseMove(event, canvasZoom.value);
    updateEdgeConnectPointer(event);
    if (connectDrag.value.active && isPanBlockedTarget(event.target)) {
      return;
    }
    if (connectDrag.value.active) {
      connectHoverNodeId.value = "";
      connectHoverPortKey.value = "";
    }
  };

  const handleCanvasPointerUp = (event) => {
    stopNodeDrag();
    stopNodeBatchDrag();
    stopNodeResize();
    stopGroupDrag();
    stopGroupResize();
    stopRerouteDrag();
    if (selectionStore.marquee.active) {
      const rect = selectionStore.marqueeRect;
      const nodesInRange = visibleNodeVisualList.value
        .filter((node) => {
          const size = resolveNodeDimensions(node);
          const nodeRight = node.position.x + size.width;
          const nodeBottom = node.position.y + size.height;
          return !(
            nodeRight < rect.left ||
            node.position.x > rect.right ||
            nodeBottom < rect.top ||
            node.position.y > rect.bottom
          );
        })
        .map((node) => ({ type: "node", id: node.id }));
      const groupsInRange = visibleGroupVisualList.value
        .filter((group) => {
          const groupRight = Number(group.position.x || 0) + group.size.width;
          const groupBottom = Number(group.position.y || 0) + group.size.height;
          return !(
            groupRight < rect.left ||
            Number(group.position.x || 0) > rect.right ||
            groupBottom < rect.top ||
            Number(group.position.y || 0) > rect.bottom
          );
        })
        .map((group) => ({ type: "group", id: group.id }));
      const reroutesInRange = visibleRerouteVisualList.value
        .filter(
          (reroute) =>
            reroute.x >= rect.left &&
            reroute.x <= rect.right &&
            reroute.y >= rect.top &&
            reroute.y <= rect.bottom,
        )
        .map((reroute) => ({ type: "reroute", id: reroute.id }));
      selectionStore.setSelection([
        ...groupsInRange,
        ...nodesInRange,
        ...reroutesInRange,
      ]);
      selectedNodeId.value = nodesInRange[0]?.id || "";
      selectedEdgeId.value = "";
      selectionStore.endMarquee();
      skipNextCanvasBackgroundClick.value = true;
    }
    handleCanvasPanEnd(event);
  };

  const handleCanvasPointerLeave = (event) => {
    stopNodeDrag();
    stopNodeBatchDrag();
    stopNodeResize();
    stopGroupDrag();
    stopGroupResize();
    stopRerouteDrag();
    if (selectionStore.marquee.active) {
      selectionStore.endMarquee();
      skipNextCanvasBackgroundClick.value = true;
    }
    handleCanvasPanEnd(event);
  };

  const handleCanvasBackgroundClick = (event) => {
    if (skipNextCanvasBackgroundClick.value) {
      skipNextCanvasBackgroundClick.value = false;
      return;
    }
    if (canvasPan.value.active || connectDrag.value.active) {
      return;
    }

    if (isPanBlockedTarget(event?.target)) {
      return;
    }

    leftDockCollapsed.value = true;
    bridgeBarCollapsed.value = true;
    selectedNodeId.value = "";
    selectedEdgeId.value = "";
    selectionStore.clearSelection();
    cancelNodeTitleEdit();
    closeContextMenu();
    closeQuickPalette();
  };

  const handleCanvasBackgroundDoubleClick = (event) => {
    if (
      canvasStore.locked ||
      canvasPan.value.active ||
      connectDrag.value.active
    ) {
      return;
    }
    if (isPanBlockedTarget(event?.target)) {
      return;
    }

    openNodeCreationPalette(event);
  };

  const updateCanvasViewport = () => {
    const canvas = canvasRef.value;
    if (!canvas) {
      return;
    }

    const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
    canvasViewport.value = {
      x: canvas.scrollLeft / zoom,
      y: canvas.scrollTop / zoom,
      width: canvas.clientWidth / zoom,
      height: canvas.clientHeight / zoom,
    };
    canvasStore.updateViewport({
      left: canvas.scrollLeft,
      top: canvas.scrollTop,
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    });
  };

  const handleCanvasScroll = () => {
    updateCanvasViewport();
    updateMinimapMetrics();
  };

  const updateMinimapMetrics = () => {
    const minimap = minimapRef.value;
    if (!minimap) {
      return;
    }

    minimapMetrics.value = {
      width: Math.max(1, minimap.clientWidth || MINIMAP_WIDTH),
      height: Math.max(1, minimap.clientHeight || MINIMAP_HEIGHT),
    };
  };

  const minimapScale = computed(() =>
    Math.min(
      minimapMetrics.value.width / BASE_CANVAS_WIDTH,
      minimapMetrics.value.height / BASE_CANVAS_HEIGHT,
    ),
  );

  const minimapNodes = computed(() => {
    const scale = minimapScale.value;
    return visibleNodeVisualList.value.map((node) => {
      const size = resolveNodeDimensions(node);
      return {
        id: node.id,
        status: normalizeStatusValue(runNodeStates.value?.[node.id]?.status),
        style: {
          left: `${Math.max(0, node.position.x * scale)}px`,
          top: `${Math.max(0, node.position.y * scale)}px`,
          width: `${Math.max(12, size.width * scale)}px`,
          height: `${Math.max(8, size.height * scale)}px`,
          "--mini-accent": getNodeCategoryAccent(node.type),
        },
      };
    });
  });

  const minimapViewportRect = computed(() => {
    const scale = minimapScale.value;
    const viewport = canvasViewport.value;
    return {
      left: Math.max(0, viewport.x * scale),
      top: Math.max(0, viewport.y * scale),
      width: Math.max(
        16,
        Math.min(minimapMetrics.value.width, viewport.width * scale),
      ),
      height: Math.max(
        10,
        Math.min(minimapMetrics.value.height, viewport.height * scale),
      ),
    };
  });

  const minimapViewportStyle = computed(() => ({
    left: `${minimapViewportRect.value.left}px`,
    top: `${minimapViewportRect.value.top}px`,
    width: `${minimapViewportRect.value.width}px`,
    height: `${minimapViewportRect.value.height}px`,
  }));

  const panCanvasToScenePoint = (sceneX, sceneY) => {
    const canvas = canvasRef.value;
    if (!canvas) {
      return;
    }

    const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
    canvas.scrollLeft = Math.max(0, sceneX * zoom - canvas.clientWidth / 2);
    canvas.scrollTop = Math.max(0, sceneY * zoom - canvas.clientHeight / 2);
    updateCanvasViewport();
  };

  const resolveMinimapPointer = (event) => {
    const minimap = minimapRef.value;
    if (!minimap || !event) {
      return null;
    }

    const rect = minimap.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    };
  };

  const moveMinimapDrag = (event) => {
    if (!minimapDrag.value.active) {
      return;
    }

    if (
      Number.isFinite(minimapDrag.value.pointerId) &&
      Number.isFinite(event?.pointerId) &&
      event.pointerId !== minimapDrag.value.pointerId
    ) {
      return;
    }

    const pointer = resolveMinimapPointer(event);
    if (!pointer) {
      return;
    }

    const viewport = minimapViewportRect.value;
    const scale = minimapScale.value;
    if (!Number.isFinite(scale) || scale <= 0) {
      return;
    }

    const nextLeft = pointer.x - minimapDrag.value.offsetX;
    const nextTop = pointer.y - minimapDrag.value.offsetY;
    const centerMapX = nextLeft + viewport.width / 2;
    const centerMapY = nextTop + viewport.height / 2;

    const sceneX = Math.max(0, Math.min(BASE_CANVAS_WIDTH, centerMapX / scale));
    const sceneY = Math.max(
      0,
      Math.min(BASE_CANVAS_HEIGHT, centerMapY / scale),
    );

    panCanvasToScenePoint(sceneX, sceneY);
  };

  const startMinimapDrag = (event) => {
    updateMinimapMetrics();

    const pointer = resolveMinimapPointer(event);
    if (!pointer) {
      return;
    }

    const viewport = minimapViewportRect.value;
    const isInsideViewport =
      pointer.x >= viewport.left &&
      pointer.x <= viewport.left + viewport.width &&
      pointer.y >= viewport.top &&
      pointer.y <= viewport.top + viewport.height;

    minimapDrag.value = {
      active: true,
      offsetX: isInsideViewport
        ? pointer.x - viewport.left
        : viewport.width / 2,
      offsetY: isInsideViewport
        ? pointer.y - viewport.top
        : viewport.height / 2,
      pointerId: Number.isFinite(event?.pointerId) ? event.pointerId : null,
    };

    if (
      Number.isFinite(event?.pointerId) &&
      minimapRef.value?.setPointerCapture
    ) {
      try {
        minimapRef.value.setPointerCapture(event.pointerId);
      } catch {
        // Ignore capture failures on unsupported environments.
      }
    }

    moveMinimapDrag(event);
  };

  const stopMinimapDrag = (event = null) => {
    if (!minimapDrag.value.active) {
      return;
    }

    if (
      event &&
      Number.isFinite(minimapDrag.value.pointerId) &&
      Number.isFinite(event.pointerId) &&
      event.pointerId !== minimapDrag.value.pointerId
    ) {
      return;
    }

    if (
      minimapRef.value &&
      Number.isFinite(minimapDrag.value.pointerId) &&
      minimapRef.value.releasePointerCapture
    ) {
      try {
        minimapRef.value.releasePointerCapture(minimapDrag.value.pointerId);
      } catch {
        // Ignore release errors when capture was already cleared.
      }
    }

    minimapDrag.value = {
      active: false,
      offsetX: 0,
      offsetY: 0,
      pointerId: null,
    };
  };

  const dockLogLines = computed(() => {
    if (logDockScope.value === "node") {
      return selectedNodeLogs.value;
    }
    if (logDockScope.value === "pipeline") {
      return pipelineLogs.value;
    }
    return workflowLogs.value;
  });

  const dockFilteredLogLines = computed(() => {
    const keyword = dockLogKeyword.value.trim().toLowerCase();
    if (!keyword) {
      return dockLogLines.value;
    }

    return dockLogLines.value.filter((line) =>
      String(line || "")
        .toLowerCase()
        .includes(keyword),
    );
  });

  const dockLogEmptyText = computed(() => {
    if (dockLogKeyword.value.trim()) {
      return "\u5f53\u524d\u7b5b\u9009\u65e0\u5339\u914d\u65e5\u5fd7";
    }
    if (logDockScope.value === "node") {
      return "\u8bf7\u9009\u62e9\u8282\u70b9\u67e5\u770b\u8282\u70b9\u65e5\u5fd7";
    }
    if (logDockScope.value === "pipeline") {
      return "\u6682\u65e0\u6d41\u6c34\u7ebf\u65e5\u5fd7";
    }
    return "\u6682\u65e0\u6d41\u7a0b\u65e5\u5fd7";
  });

  const runStatusClass = computed(() => {
    if (activeRunStatus.value === "running") {
      return "running";
    }
    if (activeRunStatus.value === "success") {
      return "success";
    }
    if (activeRunStatus.value === "failed") {
      return "failed";
    }
    if (
      activeRunStatus.value === "cancelled" ||
      activeRunStatus.value === "cancelling"
    ) {
      return "cancelled";
    }
    return "idle";
  });

  const statusLabelMap = {
    idle: "\u5f85\u547d",
    running: "\u8fd0\u884c\u4e2d",
    success: "\u5df2\u5b8c\u6210",
    failed: "\u5931\u8d25",
    cancelled: "\u5df2\u53d6\u6d88",
    cancelling: "\u53d6\u6d88\u4e2d",
  };

  const normalizeStatusValue = (status) => {
    const normalized = String(status || "idle").toLowerCase();
    if (normalized === "cancelling") {
      return "cancelled";
    }
    if (["running", "success", "failed", "cancelled"].includes(normalized)) {
      return normalized;
    }
    return "idle";
  };

  const getRunStatusLabel = (status) => {
    const normalized = String(status || "idle").toLowerCase();
    return statusLabelMap[normalized] || statusLabelMap.idle;
  };

  const getStatusClassByValue = (status) => normalizeStatusValue(status);

  const formatTimestampLabel = (value) => {
    if (!value) {
      return "-";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
  };

  const formatDurationLabel = (startedAt, endedAt = null) => {
    if (!startedAt) {
      return "-";
    }

    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
      return "-";
    }

    const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
    }
    return `${seconds}s`;
  };

  const formatRuntimePreview = (value) => {
    if (value === null || value === undefined || value === "") {
      return "暂无";
    }

    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const selectedNodeRunStatusClass = computed(() =>
    normalizeStatusValue(selectedNodeRunState.value?.status),
  );

  const selectedNodeRunDuration = computed(() =>
    formatDurationLabel(
      selectedNodeRunState.value?.startedAt,
      selectedNodeRunState.value?.endedAt,
    ),
  );

  const formatRunStartedAt = (value) => {
    if (!value) {
      return "暂无历史执行";
    }
    return String(value).slice(0, 19).replace("T", " ");
  };

  const progressValueLabel = computed(() => {
    if (runProgress.value.totalWorks > 0) {
      return `${runProgress.value.completedWorks}/${runProgress.value.totalWorks}`;
    }
    if (runProgress.value.totalFiles > 0) {
      return `${runProgress.value.processedFiles}/${runProgress.value.totalFiles}`;
    }
    return getRunStatusLabel(activeRunStatus.value);
  });

  const progressMetaLabel = computed(() => {
    if (runProgress.value.currentRj) {
      return `当前条目：${runProgress.value.currentRj}`;
    }
    const remainingWorks = Number(runProgress.value.remainingWorks || 0);
    if (remainingWorks > 0) {
      return `剩余任务：${remainingWorks}`;
    }
    return `最近执行：${formatRunStartedAt(runHistory.value?.[0]?.startedAt)}`;
  });

  const heroModeBadge = computed(() => {
    const errorCount = validationState.value?.errors?.length || 0;
    if (isRunInProgress.value) {
      return { label: "运行中", tone: "tone-hot" };
    }
    if (!workflow.value?.id) {
      return { label: "草稿", tone: "tone-warning" };
    }
    if (errorCount > 0) {
      return { label: "待修复", tone: "tone-danger" };
    }
    if (validationState.value?.ok) {
      return { label: "就绪", tone: "tone-cool" };
    }
    return { label: "已保存", tone: "tone-neutral" };
  });

  const overviewCards = computed(() => {
    const nodeCount = workflow.value?.graph?.nodes?.length || 0;
    const edgeCount = workflow.value?.graph?.edges?.length || 0;
    const categoryCount = new Set(
      (workflow.value?.graph?.nodes || []).map((node) =>
        resolveNodeCategoryKey(node.type),
      ),
    ).size;
    const errorCount = validationState.value?.errors?.length || 0;
    const warningCount = validationState.value?.warnings?.length || 0;
    const activeSelection = selectedNode.value
      ? `${resolveNodeLabel(selectedNode.value)} · ${getNodeTypeDisplay(selectedNode.value.type)}`
      : selectedEdgeId.value
        ? `已选中连线 · ${selectedEdgeId.value}`
        : "尚未选中节点或连线";

    return [
      {
        key: "graph",
        kicker: "图谱规模",
        value: `${nodeCount} 节点 / ${edgeCount} 连线`,
        meta: `${Math.max(categoryCount, 1)} 个能力分区已接入画布`,
        tone: "tone-cool",
      },
      {
        key: "validation",
        kicker: "校验健康",
        value:
          errorCount > 0
            ? `${errorCount} 个阻塞项`
            : validationState.value?.ok
              ? "检查通过"
              : "待触发校验",
        meta: warningCount > 0 ? `提示 ${warningCount} 条` : "当前没有额外预警",
        tone: errorCount > 0 ? "tone-danger" : "tone-neutral",
      },
      {
        key: "progress",
        kicker: "运行进度",
        value: progressValueLabel.value,
        meta: progressMetaLabel.value,
        tone: isRunInProgress.value ? "tone-hot" : "tone-warning",
      },
      {
        key: "selection",
        kicker: "焦点上下文",
        value: selectedNode.value
          ? resolveNodeLabel(selectedNode.value)
          : "等待选择",
        meta: activeSelection,
        tone: selectedNode.value ? "tone-cool" : "tone-neutral",
      },
    ];
  });

  const getNodeRuntimeStatusClass = (nodeId) => {
    if (!nodeId) {
      return "idle";
    }
    return normalizeStatusValue(runNodeStates.value?.[nodeId]?.status);
  };

  const getNodeRuntimeStatusLabel = (nodeId) =>
    getRunStatusLabel(runNodeStates.value?.[nodeId]?.status || "idle");

  const getNodeRuntimeProgressPercent = (nodeId) => {
    if (!nodeId) {
      return 0;
    }

    const nodeState = runNodeStates.value?.[nodeId];
    if (!nodeState || getNodeRuntimeStatusClass(nodeId) !== "running") {
      return 0;
    }

    const storedPercent = Number(nodeState?.progressPercent);
    if (Number.isFinite(storedPercent) && storedPercent >= 0) {
      return Math.max(0, Math.min(100, Math.round(storedPercent)));
    }

    const progress = nodeState?.progress;
    const totalWorks = Math.max(0, Number(progress?.totalWorks || 0));
    const completedWorks = Math.max(0, Number(progress?.completedWorks || 0));
    if (totalWorks > 0) {
      return Math.max(
        0,
        Math.min(100, Math.round((completedWorks / totalWorks) * 100)),
      );
    }

    const totalFiles = Math.max(0, Number(progress?.totalFiles || 0));
    const processedFiles = Math.max(0, Number(progress?.processedFiles || 0));
    if (totalFiles > 0) {
      return Math.max(
        0,
        Math.min(100, Math.round((processedFiles / totalFiles) * 100)),
      );
    }

    return 0;
  };

  const shouldShowNodeRuntimeProgress = (nodeId) =>
    comfyParityMode.value &&
    getNodeRuntimeStatusClass(nodeId) === "running" &&
    getNodeRuntimeProgressPercent(nodeId) > 0 &&
    getNodeRuntimeProgressPercent(nodeId) < 100;

  const getNodeRuntimeProgressLabel = (nodeId) =>
    `${getNodeRuntimeProgressPercent(nodeId)}%`;

  const getNodeRuntimeProgressStyle = (nodeId) => ({
    width: `${getNodeRuntimeProgressPercent(nodeId)}%`,
  });

  const bridgeNodePickerAllItems = computed(() =>
    workflow.value.graph.nodes.map((node) => {
      const categoryKey = resolveNodeCategoryKey(node.type);
      return {
        id: node.id,
        label: node.label || node.type || node.id,
        type: String(node.type || ""),
        status: normalizeStatusValue(runNodeStates.value?.[node.id]?.status),
        categoryKey,
        accent:
          nodeCategoryAccentMap[categoryKey] || nodeCategoryAccentMap.other,
      };
    }),
  );

  const bridgeNodePickerItems = computed(() => {
    const keyword = nodePickerKeyword.value.trim().toLowerCase();
    const statusFilter = nodePickerStatusFilter.value;

    return bridgeNodePickerAllItems.value.filter((item) => {
      const statusMatched =
        statusFilter === "all" || item.status === statusFilter;
      if (!statusMatched) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const target =
        `${item.label || ""} ${item.type || ""} ${item.id || ""}`.toLowerCase();
      return target.includes(keyword);
    });
  });

  const getCategoryLabel = (rawCategory) =>
    categoryLabelMap[rawCategory] || rawCategory;

  const getNodeBadge = (nodeType) => {
    const [prefix = "N"] = String(nodeType || "N").split(".");
    return prefix.slice(0, 2).toUpperCase();
  };

  const nodeTypeDisplayMap = {
    "whisper.translateSubtitles": "翻译字幕",
    "whisper.packSubtitles": "打包字幕",
    "tg.uploadSubtitles": "上传字幕",
    "asmr.cloudDeleteRecentUploads": "云端清理",
    "files.localDeleteScanned": "本地删除",
    "files.scanArchives": "扫描压缩包",
    "tools.extractFileNames": "提取文件名",
    "tools.cleanData": "数据清洗",
    "input.manual": "手动输入",
    "file.readText": "读取文本文件",
    "file.writeText": "写入文本文件",
    "util.delay": "延时节点",
    "output.inspect": "调试输出",
  };

  const configKeyLabelMap = {
    exePath: "引擎路径",
    targetPath: "媒体目录",
    subFormats: "字幕格式",
    outputDir: "输出目录",
    scanPath: "扫描目录",
    scanDir: "扫描目录",
    path: "路径",
    channelId: "频道ID",
    titleDelayMs: "标题延迟",
    betweenDelayMs: "文件间隔",
    perFileDelayMs: "文件间隔",
    failOnEmpty: "扫描为空失败",
    recentLimit: "最近上传数",
    batchSize: "批次大小",
    refreshCloudFirst: "刷新云端",
    failOnNoMatch: "无匹配报错",
    extensions: "扩展名",
    previewOnly: "仅预览",
    deleteFiles: "执行删除",
    sourceDir: "源目录",
    mainFile: "主文件",
    compareDir: "比对目录",
  };

  const getNodeTypeDisplay = (nodeType) =>
    nodeTypeDisplayMap[nodeType] || nodeType;

  const resolveNodeLabel = (node) => {
    if (!node || typeof node !== "object") {
      return "";
    }

    const nodeType = typeof node.type === "string" ? node.type : "";
    const rawLabel = typeof node.label === "string" ? node.label.trim() : "";
    if (rawLabel && rawLabel !== nodeType) {
      return rawLabel;
    }

    const matchedDef = nodePaletteGroups.value
      .flatMap((group) => group.items || [])
      .find((item) => item.type === nodeType);
    if (matchedDef?.label) {
      return matchedDef.label;
    }

    return rawLabel || getNodeTypeDisplay(nodeType);
  };

  const getNodeObjectInfoRecord = (nodeOrType) => {
    const nodeType =
      typeof nodeOrType === "string"
        ? String(nodeOrType).trim()
        : String(nodeOrType?.type || "").trim();
    if (!nodeType) {
      return null;
    }
    return nodeObjectInfoMap.value?.[nodeType] || null;
  };

  const formatNodeSchemaLabel = (entry = {}) => {
    const key = String(entry?.key || "").trim();
    return (
      String(entry?.label || configKeyLabelMap[key] || key || "value").trim() ||
      "value"
    );
  };

  const getNodeWidgetSchemaEntries = (nodeOrType) => {
    const objectInfo = getNodeObjectInfoRecord(nodeOrType);
    return Array.isArray(objectInfo?.widgets)
      ? objectInfo.widgets.filter((item) => isPlainRecord(item))
      : [];
  };

  const getNodeIoSchemaShape = (nodeOrType) => {
    const objectInfo = getNodeObjectInfoRecord(nodeOrType);
    return {
      requiredInputs: Array.isArray(objectInfo?.inputs?.required)
        ? objectInfo.inputs.required.filter((item) => isPlainRecord(item))
        : [],
      optionalInputs: Array.isArray(objectInfo?.inputs?.optional)
        ? objectInfo.inputs.optional.filter((item) => isPlainRecord(item))
        : [],
      outputs: Array.isArray(objectInfo?.outputs)
        ? objectInfo.outputs.filter((item) => isPlainRecord(item))
        : [],
    };
  };

  const buildNodeCatalogMeta = (nodeOrType) => {
    const objectInfo = getNodeObjectInfoRecord(nodeOrType);
    const { requiredInputs, optionalInputs, outputs } =
      getNodeIoSchemaShape(nodeOrType);
    const widgetLabels = getNodeWidgetSchemaEntries(nodeOrType)
      .map((entry) => formatNodeSchemaLabel(entry))
      .filter(Boolean);
    const inputSummary =
      optionalInputs.length > 0
        ? `${requiredInputs.length}+${optionalInputs.length} IN`
        : `${requiredInputs.length} IN`;
    const ioSummary = `${inputSummary} ? ${outputs.length} OUT`;
    const widgetSummary = widgetLabels.length
      ? `${widgetLabels.slice(0, 3).join(" ? ")}${widgetLabels.length > 3 ? " ? ..." : ""}`
      : "";

    return {
      description: String(objectInfo?.description || "").trim(),
      ioSummary,
      widgetSummary,
      schemaSummary: [ioSummary, widgetSummary].filter(Boolean).join(" ? "),
    };
  };

  const resolveQuickPaletteContext = () => ({
    isRunInProgress: isRunInProgress.value,
    hasSelection: selectionStore.selectedItems.length > 0,
    contextMenuScope: contextMenuState.value.scope,
  });

  const resolveQuickPaletteCanvasFallbackPoint = () => ({
    x: Math.max(48, canvasViewport.value.x + canvasViewport.value.width / 2),
    y: Math.max(48, canvasViewport.value.y + canvasViewport.value.height / 2),
  });

  const resolveQuickPaletteCanvasPoint = (eventOrPoint = null) => {
    if (isPlainRecord(eventOrPoint)) {
      return {
        x: Number(eventOrPoint.x || 0),
        y: Number(eventOrPoint.y || 0),
      };
    }

    if (
      eventOrPoint &&
      typeof eventOrPoint === "object" &&
      Number.isFinite(eventOrPoint.clientX) &&
      Number.isFinite(eventOrPoint.clientY)
    ) {
      return resolveCanvasPointerFromEvent(eventOrPoint);
    }

    return resolveQuickPaletteCanvasFallbackPoint();
  };

  const isCommandVisibleInQuickPalette = (command) => {
    if (!command || typeof command !== "object") {
      return false;
    }

    if (command.id === "Comfy.Node.OpenPicker") {
      return false;
    }

    return true;
  };

  const isCommandActiveInQuickPalette = (command) => {
    if (!command || typeof command.active !== "function") {
      return true;
    }

    try {
      return command.active(resolveQuickPaletteContext()) !== false;
    } catch {
      return false;
    }
  };

  const quickPaletteNodeItems = computed(() => {
    const keyword = quickPaletteKeyword.value.trim().toLowerCase();

    return nodePaletteGroups.value
      .flatMap((group) => {
        const category = String(group?.category || "other").trim() || "other";
        return (Array.isArray(group?.items) ? group.items : []).map((item) => {
          const nodeType = String(item?.type || "").trim();
          const objectInfo = nodeObjectInfoMap.value?.[nodeType] || {};
          const catalogMeta = buildNodeCatalogMeta(nodeType);
          const label =
            String(objectInfo.displayName || item?.label || "").trim() ||
            getNodeTypeDisplay(nodeType);
          const description =
            String(catalogMeta.description || item?.description || "").trim() ||
            "No node description";
          const schema = String(catalogMeta.schemaSummary || "").trim();
          return {
            id: nodeType,
            type: nodeType,
            label,
            description,
            subtitle: nodeType,
            meta: getCategoryLabel(category),
            schema,
            badge: getNodeBadge(nodeType),
            disabled: canvasStore.locked,
            searchText:
              `${label} ${nodeType} ${description} ${category} ${schema}`.toLowerCase(),
          };
        });
      })
      .filter((item) => {
        if (!keyword) {
          return true;
        }
        return item.searchText.includes(keyword);
      });
  });

  const quickPaletteCommandItems = computed(() => {
    const keyword = quickPaletteKeyword.value.trim().toLowerCase();

    return (Array.isArray(commandStore.commands) ? commandStore.commands : [])
      .filter((command) => isCommandVisibleInQuickPalette(command))
      .map((command) => ({
        id: command.id,
        commandId: command.id,
        label: command.label,
        description: command.description || "执行工作流命令",
        subtitle: command.id,
        meta: String(command.category || "general").toUpperCase(),
        badge: "⌘",
        disabled: isCommandActiveInQuickPalette(command) !== true,
        searchText:
          `${command.label || ""} ${command.id || ""} ${command.category || ""} ${command.description || ""}`.toLowerCase(),
      }))
      .filter((item) => {
        if (!keyword) {
          return true;
        }
        return item.searchText.includes(keyword);
      });
  });

  const quickPaletteItems = computed(() =>
    quickPaletteMode.value === "command"
      ? quickPaletteCommandItems.value
      : quickPaletteNodeItems.value,
  );

  const quickPaletteTitle = computed(() =>
    quickPaletteMode.value === "command" ? "命令搜索" : "添加节点",
  );

  const quickPalettePlaceholder = computed(() =>
    quickPaletteMode.value === "command"
      ? "输入命令名称或 ID，Ctrl+K 仅搜索命令"
      : "输入节点名称或类型，Tab / 双击空白 / 右键进入",
  );

  watch(
    () => [
      quickPaletteMode.value,
      quickPaletteKeyword.value,
      quickPaletteItems.value.length,
    ],
    () => {
      const itemCount = quickPaletteItems.value.length;
      if (itemCount <= 0) {
        quickPaletteSelectedIndex.value = 0;
        return;
      }
      quickPaletteSelectedIndex.value = Math.max(
        0,
        Math.min(quickPaletteSelectedIndex.value, itemCount - 1),
      );
    },
  );

  const closeQuickPalette = () => {
    quickPaletteVisible.value = false;
    quickPaletteKeyword.value = "";
    quickPaletteSelectedIndex.value = 0;
  };

  const waitForWorkflowParityStabilize = (
    delayMs = workflowParityCaptureDelay,
  ) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(160, Number(delayMs) || 360));
    });

  const resolveWorkflowParityScenePoint = () => {
    const canvas = canvasRef.value;
    const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
    if (canvas) {
      return {
        x: Math.max(220, Math.round((canvas.scrollLeft + 220) / zoom)),
        y: Math.max(160, Math.round((canvas.scrollTop + 180) / zoom)),
      };
    }

    return {
      x: 220,
      y: 180,
    };
  };

  const openCanvasContextMenuAtPoint = (
    point = resolveWorkflowParityScenePoint(),
  ) => {
    const zoom = canvasZoom.value > 0 ? canvasZoom.value : 1;
    const x = Math.max(12, Math.round(point.x || 0));
    const y = Math.max(12, Math.round(point.y || 0));
    closeQuickPalette();
    contextMenuState.value = {
      visible: true,
      x,
      y,
      anchorX: Math.round(x * zoom),
      anchorY: Math.round(y * zoom),
      scope: "canvas",
      nodeId: "",
      edgeId: "",
      groupId: "",
      rerouteId: "",
    };
  };

  const applyWorkflowParityScene = async (sceneName = workflowParityScene) => {
    const normalizedScene = String(sceneName || "")
      .trim()
      .toLowerCase();
    if (!normalizedScene) {
      return;
    }

    createNewWorkflow();
    workflow.value.graph.nodes = [];
    workflow.value.graph.edges = [];
    workflow.value.graph.links = [];
    workflow.value.graph.groups = [];
    workflow.value.graph.reroutes = [];
    workflow.value.graph.floatingLinks = [];
    selectedNodeId.value = "";
    selectedEdgeId.value = "";
    selectionStore.clearSelection();
    closeContextMenu();
    closeQuickPalette();
    runtimeDockTab.value = "queue";
    inspectorTab.value = "config";
    await nextTick();

    const anchorPoint = resolveWorkflowParityScenePoint();
    const pointWithOffset = (offsetX = 0, offsetY = 0) => ({
      x: anchorPoint.x + offsetX,
      y: anchorPoint.y + offsetY,
    });

    const createParityNode = (
      nodeType,
      configPatch = {},
      { selectNodeAfterCreate = false, point = anchorPoint } = {},
    ) => {
      const created = createNodeAtCanvasPoint(nodeType, point);
      const resolvedNodeId = String(
        created?.id || workflow.value?.graph?.nodes?.[0]?.id || "",
      ).trim();
      const targetNode = workflow.value?.graph?.nodes?.find(
        (item) => item.id === resolvedNodeId,
      );
      if (
        targetNode &&
        isPlainRecord(configPatch) &&
        Object.keys(configPatch).length > 0
      ) {
        targetNode.config = {
          ...(isPlainRecord(targetNode.config) ? targetNode.config : {}),
          ...configPatch,
        };
      }
      if (resolvedNodeId && selectNodeAfterCreate) {
        handleNodeCardClick(resolvedNodeId);
        selectionStore.selectSingle("node", resolvedNodeId);
        syncSelectedNodeDraft();
      }
      return targetNode || null;
    };

    const resetParityRuntimeState = () => {
      queueStore.setQueueData({
        pending: [],
        running: [],
        history: [],
        updatedAt: new Date().toISOString(),
      });
      runHistory.value = [];
      activeRunId.value = "";
      activeRunStatus.value = "idle";
      runProgress.value = 0;
      workflowLogs.value = [];
      pipelineLogs.value = [];
      selectedNodeLogs.value = [];
      runNodeStates.value = {};
    };

    const createExtractNode = (configPatch = {}, options = {}) =>
      createParityNode(
        "tools.extractFileNames",
        {
          sourceDir: "D:/ASMR/source",
          outputDir: "D:/ASMR/output",
          fileName: "filelist.txt",
          ...configPatch,
        },
        options,
      );

    const createInspectNode = (configPatch = {}, options = {}) =>
      createParityNode("output.inspect", configPatch, options);

    const createManualNode = (configPatch = {}, options = {}) =>
      createParityNode(
        "input.manual",
        {
          value: "manual value",
          ...configPatch,
        },
        options,
      );

    const connectParityNodes = (
      sourceNode,
      sourcePortKey,
      targetNode,
      targetPortKey,
    ) => {
      if (!sourceNode?.id || !targetNode?.id) {
        return "";
      }
      return addEdge({
        source: sourceNode.id,
        sourcePort: sourcePortKey,
        target: targetNode.id,
        targetPort: targetPortKey,
      });
    };

    const seedParitySelectedNodeState = (node, nodeState = {}, logs = []) => {
      if (!node?.id) {
        return;
      }
      handleNodeCardClick(node.id);
      selectionStore.selectSingle("node", node.id);
      runNodeStates.value = {
        ...runNodeStates.value,
        [node.id]: {
          ...(runNodeStates.value?.[node.id] || {}),
          ...nodeState,
        },
      };
      selectedNodeLogs.value = Array.isArray(logs) ? logs : [];
    };

    const buildParityRunRecord = (overrides = {}) => ({
      runId: "run-demo-001",
      workflowId: workflow.value.id,
      workflowName: workflow.value.name || "Workflow Designer Demo",
      status: "succeeded",
      requestedAt: "2026-03-14T16:10:00.000Z",
      startedAt: "2026-03-14T16:10:05.000Z",
      endedAt: "2026-03-14T16:10:28.000Z",
      ...overrides,
    });

    resetParityRuntimeState();

    if (normalizedScene === "s4-add-node-search") {
      openNodeCreationPalette(anchorPoint);
      return;
    }

    if (normalizedScene === "s4-node-created") {
      const created = createNodeAtCanvasPoint(
        TRANSLATE_SUBTITLE_NODE_TYPE,
        anchorPoint,
      );
      if (!created?.id && workflow.value?.graph?.nodes?.[0]?.id) {
        handleNodeCardClick(workflow.value.graph.nodes[0].id);
      }
      return;
    }

    if (normalizedScene === "s4-context-menu") {
      openCanvasContextMenuAtPoint(anchorPoint);
      return;
    }

    if (normalizedScene === "s5-node-card") {
      createParityNode(
        "tools.extractFileNames",
        {
          sourceDir: "D:/ASMR/source",
          outputDir: "D:/ASMR/output",
          fileName: "filelist.txt",
        },
        { selectNodeAfterCreate: false },
      );
      return;
    }

    if (normalizedScene === "s5-inspector") {
      createParityNode(
        "tools.extractFileNames",
        {
          sourceDir: "D:/ASMR/source",
          outputDir: "D:/ASMR/output",
          fileName: "filelist.txt",
        },
        { selectNodeAfterCreate: true },
      );
      inspectorTab.value = "config";
      nodeInlineInspectorVisible.value = false;
      nodeInlineInspectorPinned.value = false;
      return;
    }

    if (normalizedScene === "s5-node-search") {
      openNodeCreationPalette(anchorPoint);
      await nextTick();
      quickPaletteKeyword.value = "extract";
      quickPaletteSelectedIndex.value = 0;
      return;
    }

    if (normalizedScene === "s11-node-menu") {
      const sourceNode = createExtractNode(
        {
          sourceDir: "D:/ASMR/Subtitles",
          outputDir: "D:/ASMR/Subtitles/cache",
          fileName: "subtitle-list.txt",
        },
        { point: pointWithOffset(-320, 16) },
      );
      const translateNode = createParityNode(
        TRANSLATE_SUBTITLE_NODE_TYPE,
        {
          targetPath: "D:/ASMR/Subtitles",
          exePath: "C:/Tools/whisper.exe",
          subFormats: ["lrc", "srt", "vtt"],
        },
        { point: pointWithOffset(6, -4), selectNodeAfterCreate: true },
      );
      const inspectNode = createInspectNode(
        {},
        { point: pointWithOffset(410, 26) },
      );
      connectParityNodes(
        sourceNode,
        "outputPath",
        translateNode,
        "targetPath/path",
      );
      connectParityNodes(
        translateNode,
        "items[]",
        inspectNode,
        "inputValues/inputMap",
      );
      seedParitySelectedNodeState(translateNode, {
        status: "running",
        durationMs: 1320,
      });
      await nextTick();
      await waitForWorkflowParityStabilize(220);
      document
        .querySelector(
          '.comfy-node-toolbar-shell .comfy-node-toolbar-btn[title="More Actions"]',
        )
        ?.click();
      await nextTick();
      return;
    }

    if (normalizedScene === "s6-port-hover") {
      const sourceNode = createExtractNode(
        {
          sourceDir: "D:/ASMR/source-a",
          outputDir: "D:/ASMR/out-a",
          fileName: "source-a.txt",
        },
        { point: pointWithOffset(-280, 0) },
      );
      const targetNode = createExtractNode(
        {
          sourceDir: "D:/ASMR/source-b",
          outputDir: "D:/ASMR/out-b",
          fileName: "source-b.txt",
        },
        { point: pointWithOffset(220, 0), selectNodeAfterCreate: true },
      );
      if (sourceNode?.id && targetNode?.id) {
        updateConnectHoverNode(targetNode.id, "sourceDir");
      }
      return;
    }

    if (normalizedScene === "s6-drag-connect") {
      const sourceNode = createExtractNode(
        {
          sourceDir: "D:/ASMR/source-a",
          outputDir: "D:/ASMR/out-a",
          fileName: "source-a.txt",
        },
        { point: pointWithOffset(-280, 0), selectNodeAfterCreate: true },
      );
      createExtractNode(
        {
          sourceDir: "D:/ASMR/source-b",
          outputDir: "D:/ASMR/out-b",
          fileName: "source-b.txt",
        },
        { point: pointWithOffset(220, 0) },
      );
      if (sourceNode?.id) {
        connectDrag.value = {
          active: true,
          sourceNodeId: sourceNode.id,
          sourcePortKey: "outputPath",
          x: pointWithOffset(90, -80).x,
          y: pointWithOffset(90, -80).y,
        };
      }
      return;
    }

    if (normalizedScene === "s6-connect-target") {
      const sourceNode = createExtractNode(
        {
          sourceDir: "D:/ASMR/source-a",
          outputDir: "D:/ASMR/out-a",
          fileName: "source-a.txt",
        },
        { point: pointWithOffset(-280, 0), selectNodeAfterCreate: true },
      );
      const targetNode = createExtractNode(
        {
          sourceDir: "D:/ASMR/source-b",
          outputDir: "D:/ASMR/out-b",
          fileName: "source-b.txt",
        },
        { point: pointWithOffset(220, 0) },
      );
      if (sourceNode?.id && targetNode?.id) {
        connectDrag.value = {
          active: true,
          sourceNodeId: sourceNode.id,
          sourcePortKey: "outputPath",
          x: pointWithOffset(430, 4).x,
          y: pointWithOffset(430, 4).y,
        };
        updateConnectHoverNode(targetNode.id, "sourceDir");
      }
      return;
    }

    if (normalizedScene === "s6-connected-widget-taken") {
      const sourceNode = createExtractNode(
        {
          sourceDir: "D:/ASMR/source-a",
          outputDir: "D:/ASMR/out-a",
          fileName: "source-a.txt",
        },
        { point: pointWithOffset(-280, 0) },
      );
      const targetNode = createExtractNode(
        {
          sourceDir: "D:/ASMR/source-b",
          outputDir: "D:/ASMR/out-b",
          fileName: "source-b.txt",
        },
        { point: pointWithOffset(220, 0), selectNodeAfterCreate: true },
      );
      connectParityNodes(sourceNode, "outputPath", targetNode, "sourceDir");
      if (targetNode?.id) {
        handleNodeCardClick(targetNode.id);
        selectionStore.selectSingle("node", targetNode.id);
      }
      return;
    }

    if (normalizedScene === "s6-optional-widget-editable") {
      createManualNode(
        {
          value: "editable when unlinked",
        },
        { point: pointWithOffset(-20, 0), selectNodeAfterCreate: true },
      );
      return;
    }

    if (normalizedScene === "s7-queue-empty") {
      runtimeDockTab.value = "queue";
      return;
    }

    if (normalizedScene === "s7-queued") {
      createExtractNode({}, { point: pointWithOffset(-40, 0) });
      queueStore.setQueueData({
        pending: [
          buildParityRunRecord({
            runId: "run-queued-001",
            status: "queued",
            requestedAt: "2026-03-14T16:20:00.000Z",
            startedAt: "",
            endedAt: "",
          }),
        ],
        running: [],
        history: [],
        updatedAt: "2026-03-14T16:20:12.000Z",
      });
      runtimeDockTab.value = "queue";
      return;
    }

    if (normalizedScene === "s7-running") {
      const sourceNode = createExtractNode(
        {
          sourceDir: "D:/ASMR/source-a",
          outputDir: "D:/ASMR/out-a",
          fileName: "source-a.txt",
        },
        { point: pointWithOffset(-280, 0) },
      );
      const inspectNode = createInspectNode(
        {},
        { point: pointWithOffset(220, 0) },
      );
      connectParityNodes(
        sourceNode,
        "entries[]",
        inspectNode,
        "inputValues/inputMap",
      );
      activeRunId.value = "run-live-001";
      activeRunStatus.value = "running";
      runProgress.value = 62;
      queueStore.setQueueData({
        pending: [
          buildParityRunRecord({
            runId: "run-queued-002",
            status: "queued",
            requestedAt: "2026-03-14T16:23:00.000Z",
            startedAt: "",
            endedAt: "",
          }),
        ],
        running: [
          buildParityRunRecord({
            runId: "run-live-001",
            status: "running",
            requestedAt: "2026-03-14T16:22:00.000Z",
            startedAt: "2026-03-14T16:22:05.000Z",
            endedAt: "",
          }),
        ],
        history: [],
        updatedAt: "2026-03-14T16:23:18.000Z",
      });
      if (inspectNode?.id) {
        seedParitySelectedNodeState(inspectNode, {
          status: "running",
          startedAt: "2026-03-14T16:22:05.000Z",
          durationMs: 2800,
          inputPreview: {
            entries: ["RJ123456", "RJ654321"],
          },
          outputPreview: null,
          progressPercent: 62,
        });
      }
      runtimeDockTab.value = "queue";
      return;
    }

    if (normalizedScene === "s7-node-failed") {
      const sourceNode = createExtractNode(
        {
          sourceDir: "D:/ASMR/source-a",
          outputDir: "D:/ASMR/out-a",
          fileName: "source-a.txt",
        },
        { point: pointWithOffset(-280, 0) },
      );
      const targetNode = createExtractNode(
        {
          sourceDir: "D:/ASMR/missing-folder",
          outputDir: "D:/ASMR/out-b",
          fileName: "source-b.txt",
        },
        { point: pointWithOffset(220, 0) },
      );
      connectParityNodes(sourceNode, "outputPath", targetNode, "sourceDir");
      activeRunId.value = "run-failed-001";
      activeRunStatus.value = "failed";
      seedParitySelectedNodeState(
        targetNode,
        {
          status: "failed",
          startedAt: "2026-03-14T16:28:05.000Z",
          endedAt: "2026-03-14T16:28:07.000Z",
          durationMs: 1840,
          inputPreview: {
            sourceDir: "D:/ASMR/missing-folder",
          },
          outputPreview: null,
          error: {
            code: "PATH_NOT_FOUND",
            message: "目标源目录不存在",
          },
        },
        [
          "[error] PATH_NOT_FOUND 目标源目录不存在",
          "[hint] 请检查已连接路径或节点配置",
        ],
      );
      runtimeDockTab.value = "selected";
      return;
    }

    if (normalizedScene === "s7-history") {
      createExtractNode({}, { point: pointWithOffset(-40, 0) });
      runHistory.value = [
        buildParityRunRecord({
          runId: "run-history-003",
          status: "failed",
          startedAt: "2026-03-14T15:58:05.000Z",
          endedAt: "2026-03-14T15:58:11.000Z",
        }),
        buildParityRunRecord({
          runId: "run-history-002",
          status: "cancelled",
          startedAt: "2026-03-14T15:52:05.000Z",
          endedAt: "2026-03-14T15:52:10.000Z",
        }),
        buildParityRunRecord({
          runId: "run-history-001",
          status: "succeeded",
          startedAt: "2026-03-14T15:41:05.000Z",
          endedAt: "2026-03-14T15:41:29.000Z",
        }),
      ];
      runtimeDockTab.value = "history";
      return;
    }

    if (normalizedScene === "s7-selected-node") {
      const sourceNode = createManualNode(
        {
          value: "RJ123456",
        },
        { point: pointWithOffset(-280, 0) },
      );
      const inspectNode = createInspectNode(
        {},
        { point: pointWithOffset(220, 0) },
      );
      connectParityNodes(
        sourceNode,
        "value",
        inspectNode,
        "inputValues/inputMap",
      );
      activeRunId.value = "run-selected-001";
      activeRunStatus.value = "succeeded";
      seedParitySelectedNodeState(
        inspectNode,
        {
          status: "succeeded",
          startedAt: "2026-03-14T16:31:05.000Z",
          endedAt: "2026-03-14T16:31:09.000Z",
          durationMs: 4010,
          inputPreview: {
            value: "RJ123456",
          },
          outputPreview: {
            inspectPayload: {
              value: "RJ123456",
              status: "ok",
            },
          },
        },
        [
          "[info] Received upstream payload",
          "[info] Forwarded inspect payload to run history",
        ],
      );
      runtimeDockTab.value = "selected";
      return;
    }
  };

  const captureWorkflowParitySceneIfNeeded = async () => {
    if (!workflowParityCapturePath || typeof window === "undefined") {
      return;
    }

    await applyWorkflowParityScene(workflowParityScene);
    await nextTick();
    await waitForWorkflowParityStabilize();
  };

  const openQuickPalette = ({ mode = "node", point = null } = {}) => {
    quickPaletteMode.value = mode === "command" ? "command" : "node";
    quickPaletteCanvasPoint.value = resolveQuickPaletteCanvasPoint(point);
    quickPaletteKeyword.value = "";
    quickPaletteSelectedIndex.value = 0;
    quickPaletteVisible.value = true;
    closeContextMenu();
  };

  const openNodeCreationPalette = (eventOrPoint = null) => {
    if (canvasStore.locked) {
      return;
    }
    openQuickPalette({ mode: "node", point: eventOrPoint });
  };

  const openNodeCreationPaletteFromContextMenu = () => {
    openNodeCreationPalette({
      x: Number(contextMenuState.value.x || 0),
      y: Number(contextMenuState.value.y || 0),
    });
  };

  const openCommandPalette = () => {
    openQuickPalette({ mode: "command" });
  };

  const setQuickPaletteKeyword = (value) => {
    quickPaletteKeyword.value = String(value || "");
    quickPaletteSelectedIndex.value = 0;
  };

  const setQuickPaletteSelectionIndex = (index) => {
    const itemCount = quickPaletteItems.value.length;
    if (itemCount <= 0) {
      quickPaletteSelectedIndex.value = 0;
      return;
    }
    quickPaletteSelectedIndex.value = Math.max(
      0,
      Math.min(index, itemCount - 1),
    );
  };

  const moveQuickPaletteSelection = (delta = 0) => {
    const itemCount = quickPaletteItems.value.length;
    if (itemCount <= 0) {
      quickPaletteSelectedIndex.value = 0;
      return;
    }
    const nextIndex =
      (quickPaletteSelectedIndex.value + Number(delta || 0) + itemCount) %
      itemCount;
    quickPaletteSelectedIndex.value = nextIndex;
  };

  const createNodeAtCanvasPoint = (
    nodeType,
    point = quickPaletteCanvasPoint.value,
  ) => {
    const normalizedType = String(nodeType || "").trim();
    if (!normalizedType || canvasStore.locked) {
      return null;
    }

    const targetPoint = resolveQuickPaletteCanvasPoint(point);
    const created = addNodeByType(normalizedType, {
      position: {
        x: Math.max(12, Math.round(targetPoint.x - DEFAULT_NODE_WIDTH / 2)),
        y: Math.max(12, Math.round(targetPoint.y - DEFAULT_NODE_HEIGHT / 2)),
      },
    });
    if (created?.id) {
      handleNodeCardClick(created.id);
      runtimeDockTab.value = "selected";
    }
    return created;
  };

  const executeWorkflowCommand = async (commandId) => {
    const normalizedId = String(commandId || "").trim();
    if (!normalizedId) {
      return;
    }
    await commandStore.executeCommand(
      normalizedId,
      {},
      resolveQuickPaletteContext(),
    );
  };

  const commitQuickPaletteSelection = async (item = null) => {
    const selectedItem =
      item || quickPaletteItems.value[quickPaletteSelectedIndex.value] || null;
    if (!selectedItem || selectedItem.disabled) {
      return;
    }

    if (quickPaletteMode.value === "command") {
      closeQuickPalette();
      await executeWorkflowCommand(selectedItem.commandId || selectedItem.id);
      return;
    }

    createNodeAtCanvasPoint(selectedItem.type, quickPaletteCanvasPoint.value);
    closeQuickPalette();
  };

  const translateNodeConfigError = ref("");

  const sanitizePath = (value) => {
    if (!value) {
      return "";
    }
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      return value[0] || "";
    }
    if (typeof value.filePath === "string") {
      return value.filePath;
    }
    if (Array.isArray(value.filePaths) && value.filePaths.length > 0) {
      return value.filePaths[0];
    }
    return "";
  };

  const sanitizeIntegerInput = (rawValue, fallbackValue, minimum = 0) => {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) {
      return fallbackValue;
    }
    return Math.max(minimum, parsed);
  };

  const runtimeDispatchMode = computed({
    get: () => {
      const rawMode = String(workflow.value?.runtime?.dispatchMode || "single");
      return ["single", "batch", "fanout"].includes(rawMode)
        ? rawMode
        : "single";
    },
    set: (value) => {
      workflow.value.runtime.dispatchMode = value || "single";
    },
  });

  const runtimeBatchSize = computed({
    get: () => sanitizeIntegerInput(workflow.value?.runtime?.batchSize, 50, 1),
    set: (value) => {
      workflow.value.runtime.batchSize = sanitizeIntegerInput(
        value,
        runtimeBatchSize.value,
        1,
      );
    },
  });

  const runtimeEmitPerItem = computed({
    get: () => workflow.value?.runtime?.emitPerItem === true,
    set: (value) => {
      workflow.value.runtime.emitPerItem = value === true;
    },
  });

  const runtimeGuardianEnabled = computed({
    get: () => workflow.value?.runtime?.guardianEnabled !== false,
    set: (value) => {
      workflow.value.runtime.guardianEnabled = value !== false;
    },
  });

  const runtimeAutoCleanupDuplicates = computed({
    get: () => workflow.value?.runtime?.autoCleanupDuplicates !== false,
    set: (value) => {
      workflow.value.runtime.autoCleanupDuplicates = value !== false;
    },
  });

  const isTranslateSubtitleNodeSelected = computed(
    () => selectedNode.value?.type === TRANSLATE_SUBTITLE_NODE_TYPE,
  );

  const isPackSubtitleNodeSelected = computed(
    () => selectedNode.value?.type === PACK_SUBTITLE_NODE_TYPE,
  );

  const isUploadSubtitleNodeSelected = computed(
    () => selectedNode.value?.type === UPLOAD_SUBTITLE_NODE_TYPE,
  );

  const isCloudDeleteRecentNodeSelected = computed(
    () => selectedNode.value?.type === CLOUD_DELETE_RECENT_NODE_TYPE,
  );

  const isLocalDeleteScannedNodeSelected = computed(
    () => selectedNode.value?.type === LOCAL_DELETE_SCANNED_NODE_TYPE,
  );

  const selectedTranslateNodeConfig = computed(() => {
    const config = selectedNode.value?.config || {};
    const selectedFormats = Array.isArray(config.subFormats)
      ? config.subFormats.filter((item) => subtitleFormatOptions.includes(item))
      : [];

    return {
      exePath: typeof config.exePath === "string" ? config.exePath : "",
      targetPath:
        typeof config.targetPath === "string" ? config.targetPath : "",
      subFormats: selectedFormats.length > 0 ? selectedFormats : ["srt"],
    };
  });

  const selectedPackNodeConfig = computed(() => {
    const config = selectedNode.value?.config || {};
    return {
      targetPath:
        typeof config.targetPath === "string" ? config.targetPath : "",
      outputDir: typeof config.outputDir === "string" ? config.outputDir : "",
    };
  });

  const selectedUploadNodeConfig = computed(() => {
    const config = selectedNode.value?.config || {};
    const scanPathRaw =
      typeof config.scanPath === "string"
        ? config.scanPath
        : typeof config.scanDir === "string"
          ? config.scanDir
          : typeof config.path === "string"
            ? config.path
            : "";

    return {
      scanPath: scanPathRaw,
      channelId: typeof config.channelId === "string" ? config.channelId : "",
      titleDelayMs: sanitizeIntegerInput(config.titleDelayMs, 3500, 0),
      betweenDelayMs: sanitizeIntegerInput(
        config.betweenDelayMs,
        sanitizeIntegerInput(config.perFileDelayMs, 1000, 0),
        0,
      ),
      failOnEmpty: config.failOnEmpty !== false,
    };
  });

  const selectedCloudDeleteNodeConfig = computed(() => {
    const config = selectedNode.value?.config || {};
    return {
      recentLimit: sanitizeIntegerInput(config.recentLimit, 200, 1),
      batchSize: sanitizeIntegerInput(config.batchSize, 50, 1),
      refreshCloudFirst: config.refreshCloudFirst !== false,
      failOnNoMatch: config.failOnNoMatch === true,
    };
  });

  const selectedLocalDeleteNodeConfig = computed(() => {
    const config = selectedNode.value?.config || {};
    const scanPathRaw =
      typeof config.scanPath === "string"
        ? config.scanPath
        : typeof config.scanDir === "string"
          ? config.scanDir
          : typeof config.path === "string"
            ? config.path
            : "";

    const defaultExtensions = ".zip,.rar,.7z";
    const extensionsRaw = Array.isArray(config.extensions)
      ? config.extensions.join(",")
      : typeof config.extensions === "string"
        ? config.extensions
        : defaultExtensions;

    const deleteFiles =
      typeof config.deleteFiles === "boolean"
        ? config.deleteFiles
        : typeof config.previewOnly === "boolean"
          ? !config.previewOnly
          : false;

    return {
      scanPath: scanPathRaw,
      extensions: extensionsRaw,
      deleteFiles,
    };
  });

  const syncSelectedNodeDraft = () => {
    if (!selectedNode.value) {
      return;
    }
    selectedNodeConfigDraft.value = JSON.stringify(
      selectedNode.value.config || {},
      null,
      2,
    );
  };

  const applySpecialNodeConfigPatch = (nextConfig) => {
    if (!selectedNode.value) {
      return;
    }

    selectedNode.value.config = nextConfig;
    syncSelectedNodeDraft();
    translateNodeConfigError.value = "";
  };

  const getNodeSchemaWidgetEntry = (nodeOrType, widgetKey = "") => {
    const normalizedKey = String(widgetKey || "").trim();
    if (!normalizedKey) {
      return null;
    }
    return (
      getNodeWidgetSchemaEntries(nodeOrType).find(
        (entry) => String(entry?.key || "").trim() === normalizedKey,
      ) || null
    );
  };

  const resolveSchemaWidgetType = (entry = {}, fallbackValue = undefined) => {
    const explicitType = String(
      entry?.widget || entry?.kind || entry?.input || entry?.control || "",
    )
      .trim()
      .toLowerCase();
    if (
      ["toggle", "checkbox", "switch", "boolean", "bool"].includes(explicitType)
    ) {
      return "toggle";
    }
    if (
      ["number", "integer", "float", "slider", "range"].includes(explicitType)
    ) {
      return "number";
    }
    if (["list", "array", "tags"].includes(explicitType)) {
      return "list";
    }
    if (["path", "file", "folder", "directory"].includes(explicitType)) {
      return "path";
    }
    if (explicitType && !["text", "string", "input"].includes(explicitType)) {
      return explicitType;
    }
    if (typeof fallbackValue === "boolean") {
      return "toggle";
    }
    if (typeof fallbackValue === "number") {
      return "number";
    }
    if (Array.isArray(fallbackValue)) {
      return "list";
    }
    if (
      /(path|dir|file|folder|directory|exe)/i.test(String(entry?.key || ""))
    ) {
      return "path";
    }
    return "text";
  };

  const cloneSchemaWidgetValue = (value) => {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  };

  const getNodeSchemaWidgetValue = (node, widgetKey = "") => {
    const normalizedKey = String(widgetKey || "").trim();
    if (!node || !normalizedKey) {
      return "";
    }

    const nodeConfig = isPlainRecord(node?.config) ? node.config : {};
    if (Object.prototype.hasOwnProperty.call(nodeConfig, normalizedKey)) {
      return cloneSchemaWidgetValue(nodeConfig[normalizedKey]);
    }

    const widgetEntry = getNodeSchemaWidgetEntry(node, normalizedKey);
    if (
      widgetEntry &&
      Object.prototype.hasOwnProperty.call(widgetEntry, "defaultValue")
    ) {
      return cloneSchemaWidgetValue(widgetEntry.defaultValue);
    }

    const objectInfo = getNodeObjectInfoRecord(node);
    if (isPlainRecord(objectInfo?.defaultConfig)) {
      return cloneSchemaWidgetValue(objectInfo.defaultConfig[normalizedKey]);
    }

    return "";
  };

  const isNodeSchemaWidgetLinked = (node, widgetKey = "") => {
    if (!node) {
      return false;
    }
    const normalizedKey = String(widgetKey || "").trim();
    if (!normalizedKey) {
      return false;
    }
    return isNodePortSlotLinked(node.id, "in", normalizedKey);
  };

  const selectedNodeSchemaWidgets = computed(() =>
    getNodeWidgetSchemaEntries(selectedNode.value)
      .map((entry, index) => {
        const key = String(entry?.key || "").trim();
        if (!key) {
          return null;
        }
        const value = getNodeSchemaWidgetValue(selectedNode.value, key);
        return {
          ...entry,
          key,
          order:
            Number.isFinite(Number(entry?.order)) && Number(entry.order) >= 0
              ? Number(entry.order)
              : index,
          label: formatNodeSchemaLabel(entry),
          description: String(entry?.description || "").trim(),
          datatype:
            String(entry?.datatype || entry?.dataType || "ANY")
              .trim()
              .toUpperCase() || "ANY",
          widgetType: resolveSchemaWidgetType(entry, value),
          linked: isNodeSchemaWidgetLinked(selectedNode.value, key),
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.order - right.order),
  );

  const getSelectedNodeSchemaWidgetValue = (widgetKey = "") =>
    getNodeSchemaWidgetValue(selectedNode.value, widgetKey);

  const isSelectedNodeSchemaWidgetLinked = (widgetKey = "") =>
    isNodeSchemaWidgetLinked(selectedNode.value, widgetKey);

  const normalizeSchemaWidgetValue = (widgetEntry = {}, rawValue = "") => {
    const widgetType = String(widgetEntry?.widgetType || "text").trim();
    if (widgetType === "toggle") {
      return (
        rawValue === true ||
        rawValue === "true" ||
        rawValue === 1 ||
        rawValue === "1"
      );
    }
    if (widgetType === "number") {
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
      const defaultParsed = Number(widgetEntry?.defaultValue);
      return Number.isFinite(defaultParsed) ? defaultParsed : 0;
    }
    if (widgetType === "list") {
      if (Array.isArray(rawValue)) {
        return rawValue;
      }
      return String(rawValue || "")
        .split(/[\r\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return typeof rawValue === "string"
      ? rawValue
      : rawValue === undefined || rawValue === null
        ? ""
        : String(rawValue);
  };

  const patchSelectedNodeSchemaWidgetValue = (
    widgetKey = "",
    rawValue = "",
  ) => {
    if (!selectedNode.value) {
      return;
    }
    const normalizedKey = String(widgetKey || "").trim();
    if (!normalizedKey) {
      return;
    }
    const widgetEntry = selectedNodeSchemaWidgets.value.find(
      (item) => item.key === normalizedKey,
    );
    if (!widgetEntry || widgetEntry.linked) {
      return;
    }

    const nextConfig = isPlainRecord(selectedNode.value.config)
      ? { ...selectedNode.value.config }
      : {};
    nextConfig[normalizedKey] = normalizeSchemaWidgetValue(
      widgetEntry,
      rawValue,
    );
    applySpecialNodeConfigPatch(nextConfig);
  };

  const patchTranslateNodeConfig = (patch) => {
    if (!selectedNode.value || !isTranslateSubtitleNodeSelected.value) {
      return;
    }

    applySpecialNodeConfigPatch({
      ...selectedTranslateNodeConfig.value,
      ...patch,
    });
  };

  const patchPackNodeConfig = (patch) => {
    if (!selectedNode.value || !isPackSubtitleNodeSelected.value) {
      return;
    }

    applySpecialNodeConfigPatch({
      ...selectedPackNodeConfig.value,
      ...patch,
    });
  };

  const patchUploadNodeConfig = (patch) => {
    if (!selectedNode.value || !isUploadSubtitleNodeSelected.value) {
      return;
    }

    const next = {
      ...selectedUploadNodeConfig.value,
      ...patch,
    };

    applySpecialNodeConfigPatch({
      ...next,
      scanPath: next.scanPath,
      scanDir: next.scanPath,
      betweenDelayMs: next.betweenDelayMs,
      perFileDelayMs: next.betweenDelayMs,
    });
  };

  const patchCloudDeleteNodeConfig = (patch) => {
    if (!selectedNode.value || !isCloudDeleteRecentNodeSelected.value) {
      return;
    }

    applySpecialNodeConfigPatch({
      ...selectedCloudDeleteNodeConfig.value,
      ...patch,
    });
  };

  const patchLocalDeleteNodeConfig = (patch) => {
    if (!selectedNode.value || !isLocalDeleteScannedNodeSelected.value) {
      return;
    }

    const next = {
      ...selectedLocalDeleteNodeConfig.value,
      ...patch,
    };

    applySpecialNodeConfigPatch({
      ...next,
      scanPath: next.scanPath,
      scanDir: next.scanPath,
      path: next.scanPath,
      previewOnly: !next.deleteFiles,
      deleteFiles: next.deleteFiles === true,
    });
  };

  const pickDirectoryValue = async () => {
    const selected = await selectFile("dir");
    return sanitizePath(selected);
  };

  const pickTranslateExePath = async () => {
    const selected = await selectFile("exe");
    const nextPath = sanitizePath(selected);
    if (!nextPath) {
      return;
    }
    patchTranslateNodeConfig({ exePath: nextPath });
  };

  const pickTranslateTargetPath = async () => {
    const nextPath = await pickDirectoryValue();
    if (!nextPath) {
      return;
    }
    patchTranslateNodeConfig({ targetPath: nextPath });
  };

  const pickPackTargetPath = async () => {
    const nextPath = await pickDirectoryValue();
    if (!nextPath) {
      return;
    }
    patchPackNodeConfig({ targetPath: nextPath });
  };

  const pickPackOutputPath = async () => {
    const nextPath = await pickDirectoryValue();
    if (!nextPath) {
      return;
    }
    patchPackNodeConfig({ outputDir: nextPath });
  };

  const pickUploadScanDir = async () => {
    const nextPath = await pickDirectoryValue();
    if (!nextPath) {
      return;
    }
    patchUploadNodeConfig({ scanPath: nextPath });
  };

  const pickLocalDeleteScanDir = async () => {
    const nextPath = await pickDirectoryValue();
    if (!nextPath) {
      return;
    }
    patchLocalDeleteNodeConfig({ scanPath: nextPath });
  };

  const updateUploadChannelId = (value) => {
    patchUploadNodeConfig({
      channelId: typeof value === "string" ? value : "",
    });
  };

  const updateUploadTitleDelay = (value) => {
    patchUploadNodeConfig({
      titleDelayMs: sanitizeIntegerInput(
        value,
        selectedUploadNodeConfig.value.titleDelayMs,
        0,
      ),
    });
  };

  const updateUploadBetweenDelay = (value) => {
    patchUploadNodeConfig({
      betweenDelayMs: sanitizeIntegerInput(
        value,
        selectedUploadNodeConfig.value.betweenDelayMs,
        0,
      ),
    });
  };

  const updateLocalDeleteExtensions = (value) => {
    patchLocalDeleteNodeConfig({
      extensions: typeof value === "string" ? value : "",
    });
  };

  const updateCloudDeleteRecentLimit = (value) => {
    patchCloudDeleteNodeConfig({
      recentLimit: sanitizeIntegerInput(
        value,
        selectedCloudDeleteNodeConfig.value.recentLimit,
        1,
      ),
    });
  };

  const updateCloudDeleteBatchSize = (value) => {
    patchCloudDeleteNodeConfig({
      batchSize: sanitizeIntegerInput(
        value,
        selectedCloudDeleteNodeConfig.value.batchSize,
        1,
      ),
    });
  };

  const toggleTranslateSubFormat = (format, checked) => {
    const current = new Set(selectedTranslateNodeConfig.value.subFormats);
    if (checked) {
      current.add(format);
    } else {
      current.delete(format);
    }

    if (current.size === 0) {
      translateNodeConfigError.value = "至少选择一种字幕格式";
      return;
    }

    translateNodeConfigError.value = "";
    patchTranslateNodeConfig({
      subFormats: subtitleFormatOptions.filter((item) => current.has(item)),
    });
  };

  const summaryPathKeyPattern = /(path|dir|file|exe)/i;
  const summaryPreferredKeys = [
    "exePath",
    "targetPath",
    "outputDir",
    "scanPath",
    "scanDir",
    "path",
  ];

  const shortenPathForNode = (rawValue, maxLength = 30) => {
    const value = String(rawValue || "");
    if (value.length <= maxLength) {
      return value;
    }

    const normalized = value.replace(/\//g, "\\");
    const segments = normalized.split(/\\+/).filter(Boolean);
    if (segments.length >= 2) {
      const tail = `${segments[segments.length - 2]}\\${segments[segments.length - 1]}`;
      if (tail.length <= maxLength - 4) {
        return `...\\${tail}`;
      }
    }

    return `${value.slice(0, maxLength - 3)}...`;
  };

  const shortenTextForNode = (value, maxLength = 26) => {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength - 3)}...`;
  };

  const summarizeConfigValue = (key, rawValue, { compact = true } = {}) => {
    if (rawValue === null || rawValue === undefined) {
      return "";
    }

    if (Array.isArray(rawValue)) {
      if (rawValue.length === 0) {
        return "";
      }
      const rendered = rawValue.join(", ");
      return compact ? shortenTextForNode(rendered, 30) : rendered;
    }

    if (typeof rawValue === "boolean") {
      return rawValue ? "是" : "否";
    }

    if (typeof rawValue === "number") {
      return String(rawValue);
    }

    if (typeof rawValue === "string") {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        return "";
      }

      if (summaryPathKeyPattern.test(String(key || ""))) {
        return compact ? shortenPathForNode(trimmed) : trimmed;
      }

      return compact ? shortenTextForNode(trimmed) : trimmed;
    }

    return "";
  };

  const buildNodeSummaryEntries = (node, { full = false } = {}) => {
    const config =
      node?.config && typeof node.config === "object" ? node.config : {};
    const widgetEntries = getNodeWidgetSchemaEntries(node);
    const schemaEntryMap = new Map();

    widgetEntries.forEach((entry, index) => {
      const key = String(entry?.key || "").trim();
      if (!key || schemaEntryMap.has(key)) {
        return;
      }
      schemaEntryMap.set(key, {
        index,
        entry,
      });
    });

    return Object.entries(config)
      .map(([key, value]) => {
        const schemaMeta = schemaEntryMap.get(key) || null;
        if (schemaMeta && isNodePortSlotLinked(node?.id, "in", key)) {
          return null;
        }
        const preferredOrder = summaryPreferredKeys.indexOf(key);
        const priority =
          schemaMeta !== null
            ? schemaMeta.index
            : preferredOrder >= 0
              ? 200 + preferredOrder
              : summaryPathKeyPattern.test(key)
                ? 290
                : 300;
        return {
          key,
          label: formatNodeSchemaLabel(schemaMeta?.entry || { key }),
          value: summarizeConfigValue(key, value, { compact: !full }),
          fullValue: summarizeConfigValue(key, value, { compact: false }),
          rawValue: value,
          isPath: summaryPathKeyPattern.test(key),
          priority,
          widget: String(schemaMeta?.entry?.widget || "").trim(),
          datatype: String(schemaMeta?.entry?.datatype || "").trim(),
        };
      })
      .filter((item) => item?.value)
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return a.key.localeCompare(b.key, "zh-Hans-CN");
      });
  };

  const numericHintPattern =
    /(?:^|_)(?:limit|batch|delay|timeout|ttl|ms|count|size|width|height|parallel|retry)(?:$|_)/i;
  const nodeWidgetRendererRegistry = [];
  const registerNodeWidgetRenderer = (renderer) => {
    if (
      !renderer ||
      typeof renderer !== "object" ||
      typeof renderer.id !== "string" ||
      !renderer.id.trim() ||
      typeof renderer.match !== "function" ||
      typeof renderer.render !== "function"
    ) {
      return;
    }
    const normalizedId = renderer.id.trim();
    const existingIndex = nodeWidgetRendererRegistry.findIndex(
      (item) => item.id === normalizedId,
    );
    const normalizedRenderer = {
      id: normalizedId,
      priority:
        Number.isFinite(Number(renderer.priority)) &&
        Number(renderer.priority) >= 0
          ? Number(renderer.priority)
          : 100,
      match: renderer.match,
      render: renderer.render,
    };
    if (existingIndex >= 0) {
      nodeWidgetRendererRegistry.splice(existingIndex, 1, normalizedRenderer);
    } else {
      nodeWidgetRendererRegistry.push(normalizedRenderer);
    }
    nodeWidgetRendererRegistry.sort(
      (left, right) => left.priority - right.priority,
    );
  };
  const ensureDefaultNodeWidgetRenderers = () => {
    if (nodeWidgetRendererRegistry.length > 0) {
      return;
    }
    registerNodeWidgetRenderer({
      id: "boolean",
      priority: 10,
      match: ({ rawValue }) => typeof rawValue === "boolean",
      render: ({ rawValue }) => ({
        widgetType: "toggle",
        widgetActive: rawValue === true,
        value: rawValue ? "ON" : "OFF",
      }),
    });
    registerNodeWidgetRenderer({
      id: "number",
      priority: 20,
      match: ({ rawValue }) => typeof rawValue === "number",
      render: ({ rawValue }) => ({
        widgetType: "number",
        value: String(rawValue),
      }),
    });
    registerNodeWidgetRenderer({
      id: "list",
      priority: 30,
      match: ({ rawValue }) => Array.isArray(rawValue),
      render: ({ rawValue }) => {
        const listPreview = rawValue
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .join(", ");
        return {
          widgetType: "list",
          value:
            rawValue.length > 0
              ? shortenTextForNode(listPreview, 28)
              : "0 items",
        };
      },
    });
    registerNodeWidgetRenderer({
      id: "path",
      priority: 40,
      match: ({ entry }) => entry?.isPath === true,
      render: ({ entry }) => ({
        widgetType: "path",
        value: shortenPathForNode(
          String(entry?.fullValue || entry?.value || ""),
        ),
      }),
    });
    registerNodeWidgetRenderer({
      id: "numeric-hint",
      priority: 50,
      match: ({ entryKey }) => numericHintPattern.test(entryKey),
      render: ({ rawValue, defaultValue }) => {
        const parsed = Number(rawValue);
        if (!Number.isFinite(parsed)) {
          return {
            widgetType: "number",
            widgetError: true,
            value: defaultValue,
          };
        }
        return {
          widgetType: "number",
          value: String(parsed),
        };
      },
    });
  };
  const toNodeWidgetEntry = (entry) => {
    const rawValue = entry?.rawValue;
    const entryKey = String(entry?.key || "").trim();
    const defaultValue = shortenTextForNode(String(entry?.value || ""), 28);
    const baseEntry = {
      ...entry,
      widgetType: "text",
      widgetActive: false,
      widgetError: false,
      value: defaultValue,
    };

    ensureDefaultNodeWidgetRenderers();
    const renderContext = {
      entry,
      rawValue,
      entryKey,
      defaultValue,
      shortenPathForNode,
      shortenTextForNode,
      numericHintPattern,
    };
    const matchedRenderer = nodeWidgetRendererRegistry.find((renderer) => {
      try {
        return renderer.match(renderContext) === true;
      } catch {
        return false;
      }
    });
    if (!matchedRenderer) {
      return baseEntry;
    }

    try {
      return {
        ...baseEntry,
        ...matchedRenderer.render(renderContext),
      };
    } catch {
      return baseEntry;
    }
  };

  const getNodeCardSummaryEntries = (node) => {
    const summaryEntries = buildNodeSummaryEntries(node);
    if (!summaryEntries.length) {
      return [];
    }

    if (comfyParityMode.value) {
      return summaryEntries.slice(0, 2).map(toNodeWidgetEntry);
    }

    return summaryEntries.slice(0, 3);
  };

  const nodePortDegreeMap = computed(() => {
    const nodes = Array.isArray(workflow.value?.graph?.nodes)
      ? workflow.value.graph.nodes
      : [];
    const edges = Array.isArray(workflow.value?.graph?.edges)
      ? workflow.value.graph.edges
      : [];
    const degreeMap = new Map();

    nodes.forEach((node) => {
      const nodeId = String(node?.id || "").trim();
      if (nodeId) {
        degreeMap.set(nodeId, { in: 0, out: 0 });
      }
    });

    edges.forEach((edge) => {
      const sourceId = String(edge?.source || "").trim();
      const targetId = String(edge?.target || "").trim();

      if (sourceId && degreeMap.has(sourceId)) {
        degreeMap.get(sourceId).out += 1;
      }
      if (targetId && degreeMap.has(targetId)) {
        degreeMap.get(targetId).in += 1;
      }
    });

    return degreeMap;
  });

  const buildNodePortLinkKey = (nodeId, direction, portKey = "") => {
    const normalizedNodeId = String(nodeId || "").trim();
    const normalizedDirection = direction === "out" ? "out" : "in";
    const fallbackPort = normalizedDirection === "out" ? "output" : "input";
    const normalizedPortKey =
      String(portKey || fallbackPort).trim() || fallbackPort;
    if (!normalizedNodeId) {
      return "";
    }
    return `${normalizedNodeId}:${normalizedDirection}:${normalizedPortKey}`;
  };

  const nodePortSlotLinkCountMap = computed(() => {
    const edges = Array.isArray(workflow.value?.graph?.edges)
      ? workflow.value.graph.edges
      : [];
    const linkCountMap = new Map();

    edges.forEach((edge) => {
      const sourceNodeId = String(edge?.source || "").trim();
      const targetNodeId = String(edge?.target || "").trim();
      const sourcePortKey =
        String(edge?.sourcePort || "output").trim() || "output";
      const targetPortKey =
        String(edge?.targetPort || "input").trim() || "input";

      const sourceKey = buildNodePortLinkKey(
        sourceNodeId,
        "out",
        sourcePortKey,
      );
      if (sourceKey) {
        linkCountMap.set(sourceKey, (linkCountMap.get(sourceKey) || 0) + 1);
      }

      const targetKey = buildNodePortLinkKey(targetNodeId, "in", targetPortKey);
      if (targetKey) {
        linkCountMap.set(targetKey, (linkCountMap.get(targetKey) || 0) + 1);
      }
    });

    return linkCountMap;
  });

  const getNodePortDegree = (nodeId) =>
    nodePortDegreeMap.value.get(String(nodeId || "").trim()) || {
      in: 0,
      out: 0,
    };

  const hasNodePortLinked = (nodeId, direction = "in") => {
    const degree = getNodePortDegree(nodeId);
    return direction === "in" ? degree.in > 0 : degree.out > 0;
  };

  const getNodePortSlotLinkCount = (nodeId, direction = "in", portKey = "") => {
    const key = buildNodePortLinkKey(nodeId, direction, portKey);
    if (!key) {
      return 0;
    }
    return nodePortSlotLinkCountMap.value.get(key) || 0;
  };

  const isNodePortSlotLinked = (nodeId, direction = "in", portKey = "") =>
    getNodePortSlotLinkCount(nodeId, direction, portKey) > 0;

  const isInputBoundaryNode = (nodeId) => getNodePortDegree(nodeId).in === 0;

  const isOutputBoundaryNode = (nodeId) => getNodePortDegree(nodeId).out === 0;

  const resolveWorkflowNode = (nodeOrId) => {
    if (isPlainRecord(nodeOrId)) {
      return nodeOrId;
    }

    const normalizedNodeId = String(nodeOrId || "").trim();
    if (!normalizedNodeId) {
      return null;
    }

    return (
      workflow.value?.graph?.nodes?.find(
        (item) => item.id === normalizedNodeId,
      ) || null
    );
  };

  const canPartialExecuteNode = (nodeOrId) => {
    const node = resolveWorkflowNode(nodeOrId);
    if (!node?.id) {
      return false;
    }

    const runtimeFlags = getNodeObjectInfoRecord(node)?.runtimeFlags || {};
    if (runtimeFlags.supportsPartialExecution === false) {
      return false;
    }

    return isOutputBoundaryNode(node.id);
  };

  const runNodePartialExecution = async (nodeOrId) => {
    const node = resolveWorkflowNode(nodeOrId);
    if (!node?.id) {
      return;
    }

    if (!canPartialExecuteNode(node)) {
      message.warning("当前节点不是可局部执行的输出节点");
      return;
    }

    const workflowPayload = cloneJsonValue(workflow.value, null);
    if (!workflowPayload) {
      message.error("工作流序列化失败，无法局部执行");
      return;
    }

    const result = await workflowPartialEnqueue({
      workflow: workflowPayload,
      workflowId: workflowPayload.id,
      nodeId: node.id,
      targetNodeId: node.id,
    });

    if (!result?.success) {
      message.error(result?.error || "局部执行入队失败");
      return;
    }

    logDockExpanded.value = true;
    runtimeDockTab.value = "queue";
    message.success(`已将 ${resolveNodeLabel(node)} 加入局部执行队列`);
  };

  const openNodeDocsForNode = async (nodeOrId) => {
    const node = resolveWorkflowNode(nodeOrId);
    const nodeType = String(node?.type || "").trim();
    if (!nodeType) {
      return;
    }

    await workflowHub.openNodeDocs(nodeType);
  };

  const toNormalizedDatatype = (value) => {
    const normalized = String(value || "")
      .trim()
      .toUpperCase();
    if (normalized) {
      return normalized;
    }
    return "ANY";
  };

  const resolveDatatypeFromKeyPattern = (rawKey) => {
    const key = String(rawKey || "").trim();
    if (!key) {
      return "";
    }

    if (/\[\]$/.test(key)) {
      return "LIST";
    }

    const pathTokens = key
      .split(/[/.:]/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const normalizedTokens = pathTokens.flatMap((item) =>
      item.split(/[_-]/).filter(Boolean),
    );
    const tokenSet = new Set([...pathTokens, ...normalizedTokens]);

    if (tokenSet.has("model")) {
      return "MODEL";
    }
    if (tokenSet.has("clip")) {
      return "CLIP";
    }
    if (tokenSet.has("vae")) {
      return "VAE";
    }
    if (
      tokenSet.has("conditioning") ||
      tokenSet.has("positive") ||
      tokenSet.has("negative")
    ) {
      return "CONDITIONING";
    }
    if (tokenSet.has("latent") || tokenSet.has("samples")) {
      return "LATENT";
    }
    if (tokenSet.has("image") || tokenSet.has("images")) {
      return "IMAGE";
    }
    if (tokenSet.has("mask")) {
      return "MASK";
    }
    if (tokenSet.has("bool") || tokenSet.has("boolean")) {
      return "BOOLEAN";
    }
    if (
      tokenSet.has("int") ||
      tokenSet.has("float") ||
      tokenSet.has("double") ||
      /(?:^|[_-])(ms|count|size|width|height|limit|batch|ttl|timeout|retry|parallel)(?:$|[_-])/i.test(
        key,
      )
    ) {
      return "NUMBER";
    }
    if (
      tokenSet.has("path") ||
      tokenSet.has("dir") ||
      tokenSet.has("directory") ||
      tokenSet.has("file") ||
      tokenSet.has("filepath") ||
      tokenSet.has("sourcepath") ||
      tokenSet.has("targetpath")
    ) {
      return "PATH";
    }
    if (
      tokenSet.has("files") ||
      tokenSet.has("archives") ||
      tokenSet.has("items") ||
      tokenSet.has("entries") ||
      tokenSet.has("results")
    ) {
      return "LIST";
    }
    return "";
  };

  const resolveDatatypeFromComfyTuple = (value) => {
    if (!Array.isArray(value) || value.length === 0) {
      return "";
    }
    const candidate = value[0];
    if (typeof candidate === "string") {
      return toNormalizedDatatype(candidate);
    }
    if (Array.isArray(candidate) && typeof candidate[0] === "string") {
      return toNormalizedDatatype(candidate[0]);
    }
    return "";
  };

  const resolveEntryExplicitDatatype = (entry = {}) => {
    const explicitCandidates = [
      entry?.datatype,
      entry?.dataType,
      entry?.valueType,
      entry?.slotType,
      entry?.portType,
      entry?.type,
    ];
    const blocked = new Set([
      "INPUT",
      "OUTPUT",
      "IN",
      "OUT",
      "REQUIRED",
      "OPTIONAL",
      "OBJECT",
    ]);
    for (const candidate of explicitCandidates) {
      const normalized = toNormalizedDatatype(candidate);
      if (normalized !== "ANY" && !blocked.has(normalized)) {
        return normalized;
      }
    }
    return "";
  };

  const inferPortDatatype = (entry = {}) => {
    const explicitDatatype = resolveEntryExplicitDatatype(entry);
    if (explicitDatatype) {
      return explicitDatatype;
    }

    const datatypeFromKey = resolveDatatypeFromKeyPattern(entry?.key);
    if (datatypeFromKey) {
      return datatypeFromKey;
    }

    if (Array.isArray(entry?.typeHints)) {
      const hinted = entry.typeHints
        .map((item) => resolveEntryExplicitDatatype({ type: item }))
        .find(Boolean);
      if (hinted) {
        return hinted;
      }
    }

    const tupleDatatype = resolveDatatypeFromComfyTuple(entry?.definitionValue);
    if (tupleDatatype) {
      return tupleDatatype;
    }

    // Keep very-late fallback for legacy entries that only expose free-form labels.
    const signature = `${String(entry?.key || "")} ${String(entry?.label || "")}`;
    if (/(model)/i.test(signature)) {
      return "MODEL";
    }
    if (/(clip)/i.test(signature)) {
      return "CLIP";
    }
    if (/(vae)/i.test(signature)) {
      return "VAE";
    }
    if (/(positive|negative|conditioning)/i.test(signature)) {
      return "CONDITIONING";
    }
    if (/(latent|sample)/i.test(signature)) {
      return "LATENT";
    }
    if (/(mask|boolean|bool)/i.test(signature)) {
      return "BOOLEAN";
    }
    if (/(path|image|string|text|name|title)/i.test(signature)) {
      return "STRING";
    }
    if (/(number|count|size|delay|ms|width|height|rate)/i.test(signature)) {
      return "NUMBER";
    }
    if (/(files?|archives?|list|items?\[\])/i.test(signature)) {
      return "LIST";
    }
    return "ANY";
  };

  const toNodeDefinitionEntries = (rawField = {}, direction = "in") => {
    const entries = [];
    if (!isPlainRecord(rawField)) {
      return entries;
    }
    Object.entries(rawField).forEach(([fieldKey, fieldValue]) => {
      if (fieldKey === "required" || fieldKey === "optional") {
        if (isPlainRecord(fieldValue)) {
          entries.push(...toNodeDefinitionEntries(fieldValue, direction));
        }
        return;
      }
      entries.push({
        key: fieldKey,
        label: fieldKey,
        definitionValue: fieldValue,
        datatype:
          resolveDatatypeFromComfyTuple(fieldValue) ||
          resolveDatatypeFromKeyPattern(fieldKey) ||
          (direction === "out" ? "ANY" : ""),
      });
    });
    return entries;
  };

  const normalizeNodeIoEntries = (value) => {
    if (isPlainRecord(value)) {
      return toNodeDefinitionEntries(value)
        .map((entry) => ({
          key: String(entry?.key || "").trim(),
          label: String(entry?.label || entry?.key || "").trim(),
          datatype: inferPortDatatype(entry),
        }))
        .filter((entry) => entry.key && entry.label);
    }

    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item) => {
        if (typeof item === "string") {
          const trimmed = item.trim();
          if (!trimmed) {
            return null;
          }
          return {
            key: trimmed,
            label: trimmed,
            datatype: inferPortDatatype({
              key: trimmed,
              label: trimmed,
            }),
          };
        }

        if (!item || typeof item !== "object") {
          return null;
        }

        const key =
          typeof item.key === "string" && item.key.trim()
            ? item.key.trim()
            : "";
        const label =
          typeof item.label === "string" && item.label.trim()
            ? item.label.trim()
            : key;

        if (!key && !label) {
          return null;
        }

        return {
          key: key || label,
          label: label || key,
          definitionValue: item?.value,
          datatype: inferPortDatatype({
            ...item,
            key: key || label,
            label: label || key,
          }),
        };
      })
      .filter(Boolean);
  };

  const applyDefinitionRecordToMap = (
    map,
    rawDefinition = {},
    typeHint = "",
  ) => {
    if (!isPlainRecord(rawDefinition)) {
      return;
    }
    const definitionType = String(rawDefinition?.type || typeHint || "").trim();
    if (!definitionType) {
      return;
    }
    map.set(definitionType, {
      ...rawDefinition,
      type: definitionType,
    });
  };

  const applyDefinitionCollectionToMap = (map, collection) => {
    if (!collection) {
      return;
    }
    if (Array.isArray(collection)) {
      collection.forEach((item) => applyDefinitionRecordToMap(map, item));
      return;
    }
    if (!isPlainRecord(collection)) {
      return;
    }
    Object.entries(collection).forEach(([key, value]) => {
      applyDefinitionRecordToMap(map, value, key);
    });
  };

  const nodeDefinitionMap = computed(() => {
    const map = new Map();
    applyDefinitionCollectionToMap(map, LOCAL_NODE_DEFINITION_FALLBACK);
    applyDefinitionCollectionToMap(map, workflow.value?.definitions);
    applyDefinitionCollectionToMap(map, workflow.value?.graph?.definitions);
    applyDefinitionCollectionToMap(map, nodeDefinitions.value);
    return map;
  });

  const getNodePortSchemaEntries = (node, direction = "in") => {
    const schemaShape = getNodeIoSchemaShape(node);
    const objectInfoField =
      direction === "in"
        ? [...schemaShape.requiredInputs, ...schemaShape.optionalInputs]
        : schemaShape.outputs;
    if (objectInfoField.length > 0) {
      return normalizeNodeIoEntries(objectInfoField);
    }

    const nodeType = String(node?.type || "").trim();
    if (!nodeType) {
      return [];
    }
    const matchedDefinition = nodeDefinitionMap.value.get(nodeType);
    if (!matchedDefinition) {
      return [];
    }
    const ioConfig = isPlainRecord(matchedDefinition?.io)
      ? matchedDefinition.io
      : {};

    const field =
      direction === "in"
        ? ioConfig.input ||
          ioConfig.inputs ||
          matchedDefinition.input ||
          matchedDefinition.inputs
        : ioConfig.output ||
          ioConfig.outputs ||
          matchedDefinition.output ||
          matchedDefinition.outputs;
    return normalizeNodeIoEntries(field);
  };

  const formatPortKeyLabel = (rawValue) =>
    String(rawValue || "")
      .replace(/\[[^\]]*]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const truncatePortLabel = (value, maxLength = 20) => {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, maxLength - 1)}…`;
  };

  const resolveNodePortEntryRawLabel = (entry) => {
    const key = String(entry?.key || "").trim();
    const label = String(entry?.label || "").trim();
    const compactKey = formatPortKeyLabel(key);
    const compactLabel = formatPortKeyLabel(label);

    if (compactKey && compactLabel) {
      // Prioritize short slot keys for readability when labels are verbose.
      if (
        compactLabel.length > 20 ||
        compactLabel.length - compactKey.length > 6
      ) {
        return compactKey;
      }
      return compactLabel;
    }

    return compactLabel || compactKey || label || key;
  };

  const formatNodePortEntryLabel = (entry) => {
    const rawLabel = resolveNodePortEntryRawLabel(entry);
    return truncatePortLabel(rawLabel, comfyParityMode.value ? 14 : 26);
  };

  const getObservedNodePortEntries = (nodeId, direction = "in") => {
    const normalizedNodeId = String(nodeId || "").trim();
    if (!normalizedNodeId) {
      return [];
    }
    const edges = Array.isArray(workflow.value?.graph?.edges)
      ? workflow.value.graph.edges
      : [];
    const seen = new Set();
    const entries = [];
    const appendEntry = (rawKey, rawLabel = "") => {
      const normalizedKey = String(rawKey || "").trim();
      if (!normalizedKey || seen.has(normalizedKey)) {
        return;
      }
      seen.add(normalizedKey);
      entries.push({
        key: normalizedKey,
        label: String(rawLabel || normalizedKey).trim() || normalizedKey,
        datatype: inferPortDatatype({
          key: normalizedKey,
          label: String(rawLabel || normalizedKey).trim() || normalizedKey,
        }),
      });
    };

    edges.forEach((edge) => {
      const isMatchedNode =
        direction === "in"
          ? String(edge?.target || "").trim() === normalizedNodeId
          : String(edge?.source || "").trim() === normalizedNodeId;
      if (!isMatchedNode) {
        return;
      }

      const rawKey =
        direction === "in"
          ? String(edge?.targetPort || "").trim()
          : String(edge?.sourcePort || "").trim();
      appendEntry(rawKey, rawKey);
    });

    if (direction === "out") {
      const nodeRunState = runNodeStates.value?.[normalizedNodeId];
      const outputPreview = nodeRunState?.outputPreview;
      if (isPlainRecord(outputPreview)) {
        Object.keys(outputPreview).forEach((key) => {
          appendEntry(key, key);
        });
      } else if (Array.isArray(outputPreview)) {
        if (outputPreview.length > 0 && isPlainRecord(outputPreview[0])) {
          Object.keys(outputPreview[0]).forEach((key) => {
            appendEntry(`${key}[]`, key);
          });
        } else if (outputPreview.length > 0) {
          appendEntry("items[]", "items");
        }
      } else if (
        outputPreview !== undefined &&
        outputPreview !== null &&
        String(outputPreview).trim()
      ) {
        appendEntry("value", "value");
      }
    }

    return entries;
  };

  const getNodeConfigFallbackEntries = (node, direction = "in") => {
    if (direction !== "in") {
      return [];
    }
    const config = isPlainRecord(node?.config) ? node.config : {};
    const ignoredKeys = new Set([
      "widgetsValues",
      "properties",
      "flags",
      "mode",
    ]);
    const keys = Object.keys(config)
      .map((item) => String(item || "").trim())
      .filter(
        (item) => item && !item.startsWith("_") && !ignoredKeys.has(item),
      );
    if (!keys.length) {
      return [];
    }

    return keys.slice(0, 4).map((key) => {
      const rawValue = config[key];
      return {
        key,
        label: configKeyLabelMap[key] || key,
        datatype: inferPortDatatype({
          key,
          label: configKeyLabelMap[key] || key,
          type:
            typeof rawValue === "number"
              ? "NUMBER"
              : typeof rawValue === "boolean"
                ? "BOOLEAN"
                : Array.isArray(rawValue)
                  ? "LIST"
                  : typeof rawValue === "string" &&
                      summaryPathKeyPattern.test(key)
                    ? "PATH"
                    : "ANY",
        }),
      };
    });
  };

  const getNodePortSlots = (node, direction = "in") => {
    const schemaEntries = getNodePortSchemaEntries(node, direction);
    const observedEntries = getObservedNodePortEntries(node?.id, direction);
    const configFallbackEntries =
      schemaEntries.length > 0
        ? []
        : getNodeConfigFallbackEntries(node, direction);
    const entries = [];
    const seenKeySet = new Set();
    const fallbackKey = direction === "in" ? "input" : "output";

    const appendEntry = (entry, indexHint = 0) => {
      const rawKey = String(entry?.key || `${fallbackKey}_${indexHint}`).trim();
      const normalizedKey = rawKey || `${fallbackKey}_${indexHint}`;
      if (!normalizedKey || seenKeySet.has(normalizedKey)) {
        return;
      }
      const rawLabel =
        resolveNodePortEntryRawLabel(entry) || String(normalizedKey);
      seenKeySet.add(normalizedKey);
      entries.push({
        key: normalizedKey,
        rawLabel,
        label: formatNodePortEntryLabel(entry) || rawLabel,
        datatype: inferPortDatatype(entry),
      });
    };

    schemaEntries.forEach((entry, index) => {
      appendEntry(entry, index);
    });
    observedEntries.forEach((entry, index) => {
      appendEntry(entry, schemaEntries.length + index);
    });
    configFallbackEntries.forEach((entry, index) => {
      appendEntry(entry, schemaEntries.length + observedEntries.length + index);
    });

    if (!entries.length) {
      entries.push({
        key: fallbackKey,
        rawLabel: direction === "in" ? "input" : "output",
        label: direction === "in" ? "input" : "output",
        datatype: "ANY",
      });
    }

    return entries.map((entry, index) => ({
      ...entry,
      index,
    }));
  };

  const getNodePortSlotTypeLabel = (slot) =>
    toNormalizedDatatype(slot?.datatype);

  const shouldShowNodePortSlotType = (slot) => {
    const typeLabel = getNodePortSlotTypeLabel(slot);
    if (!typeLabel || typeLabel === "ANY") {
      return false;
    }
    if (comfyParityMode.value) {
      return false;
    }
    return true;
  };

  const _getNodePortLabelList = (node, direction = "in", fallbackText = "") => {
    const labels = getNodePortSlots(node, direction)
      .map((slot) => String(slot?.label || "").trim())
      .filter(Boolean);
    if (labels.length > 0) {
      return labels;
    }
    return fallbackText ? [fallbackText] : [];
  };

  const getNodePortSlotIndex = (node, direction = "in", portKey = "") => {
    const slots = getNodePortSlots(node, direction);
    if (!slots.length) {
      return 0;
    }
    const targetKey = String(portKey || "").trim();
    if (!targetKey) {
      return 0;
    }
    const slotIndex = slots.findIndex((slot) => slot.key === targetKey);
    return slotIndex >= 0 ? slotIndex : 0;
  };

  const findNodePortSlot = (node, direction = "in", portKey = "") => {
    const slots = getNodePortSlots(node, direction);
    if (!slots.length) {
      return null;
    }
    const targetKey = String(portKey || "").trim();
    if (!targetKey) {
      return slots[0];
    }
    return slots.find((slot) => slot.key === targetKey) || slots[0];
  };

  const resolveComfySlotColor = (slot, direction = "in") => {
    const normalizedType = toNormalizedDatatype(slot?.datatype);
    const fallbackColor =
      direction === "out"
        ? COMFY_DEFAULT_OUTPUT_SLOT_COLOR
        : COMFY_DEFAULT_INPUT_SLOT_COLOR;
    return `var(--color-datatype-${normalizedType}, ${fallbackColor})`;
  };

  const getNodePortSlotColor = (node, direction = "in", portKey = "") => {
    const slot = findNodePortSlot(node, direction, portKey);
    return resolveComfySlotColor(slot, direction);
  };

  const getNodePortSlotStyle = (node, direction = "in", port = null) => ({
    "--node-port-slot-color": getNodePortSlotColor(
      node,
      direction,
      String(port?.key || ""),
    ),
  });

  const getNodePortDetailLabel = (node, direction = "in") => {
    const fallback =
      direction === "in"
        ? [{ label: "未声明入参", datatype: "ANY" }]
        : [{ label: "未声明出参", datatype: "ANY" }];
    const slots = getNodePortSlots(node, direction);
    const selectedSlots = slots.length ? slots : fallback;
    return selectedSlots
      .map((slot) => `${slot.label}[${getNodePortSlotTypeLabel(slot)}]`)
      .join(" · ");
  };

  const resolveNodePortAnchor = (node, direction = "in", portKey = "") => {
    const nodeSize = resolveNodeDimensions(node);
    const slotIndex = getNodePortSlotIndex(node, direction, portKey);
    return {
      x:
        direction === "in"
          ? node.position.x
          : node.position.x + Math.max(0, nodeSize.width),
      y: node.position.y + NODE_PORT_STACK_TOP + slotIndex * NODE_PORT_ROW_STEP,
    };
  };

  const getNodePortStatusLabel = (nodeId, direction = "in") => {
    const linked = hasNodePortLinked(nodeId, direction);

    if (direction === "in") {
      return linked ? "输入已连" : "待接输入";
    }

    return linked ? "输出已连" : "待接输出";
  };

  const getNodePortSlotStatusLabel = (
    nodeId,
    direction = "in",
    portKey = "",
  ) => {
    if (direction === "in" && connectDrag.value.active) {
      const connectState = getNodePortConnectIntentState(nodeId, portKey);
      if (connectState === "compatible") {
        return "可连接";
      }
      if (connectState === "blocked") {
        return "类型不匹配";
      }
    }
    const linked = isNodePortSlotLinked(nodeId, direction, portKey);
    return linked ? "已连接" : "就绪";
  };

  const toComparablePortDatatype = (value) => {
    const normalized = toNormalizedDatatype(value);
    return normalized || "ANY";
  };

  const arePortDatatypesCompatible = (sourceSlot, targetSlot) => {
    const sourceType = toComparablePortDatatype(sourceSlot?.datatype);
    const targetType = toComparablePortDatatype(targetSlot?.datatype);
    if (
      !sourceType ||
      !targetType ||
      sourceType === "ANY" ||
      targetType === "ANY"
    ) {
      return true;
    }
    if (sourceType === targetType) {
      return true;
    }
    const compatiblePairs = new Set([
      "FILE:PATH",
      "PATH:FILE",
      "FILES:LIST",
      "LIST:FILES",
    ]);
    return compatiblePairs.has(`${sourceType}:${targetType}`);
  };

  const resolveConnectValidation = (
    sourceId,
    sourcePortKey = "output",
    targetId,
    targetPortKey = "input",
  ) => {
    const sourceNode = workflow.value?.graph?.nodes?.find(
      (item) => item.id === sourceId,
    );
    const targetNode = workflow.value?.graph?.nodes?.find(
      (item) => item.id === targetId,
    );
    if (!sourceNode || !targetNode) {
      return {
        valid: false,
        reason: "缺少连接目标",
      };
    }
    if (sourceId === targetId) {
      return {
        valid: false,
        reason: "不能连接节点自身",
      };
    }

    const sourceSlot = findNodePortSlot(sourceNode, "out", sourcePortKey);
    const targetSlot = findNodePortSlot(targetNode, "in", targetPortKey);
    if (!sourceSlot || !targetSlot) {
      return {
        valid: false,
        reason: "未找到端口",
      };
    }

    const compatible = arePortDatatypesCompatible(sourceSlot, targetSlot);
    if (!compatible) {
      return {
        valid: false,
        sourceSlot,
        targetSlot,
        reason: `类型不匹配：${getNodePortSlotTypeLabel(sourceSlot)} -> ${getNodePortSlotTypeLabel(targetSlot)}`,
      };
    }

    return {
      valid: true,
      sourceSlot,
      targetSlot,
      reason: "",
    };
  };

  const getNodePortConnectIntentState = (nodeId, portKey = "input") => {
    if (
      !connectDrag.value.active ||
      !connectDrag.value.sourceNodeId ||
      !connectDrag.value.sourcePortKey ||
      !nodeId
    ) {
      return "idle";
    }
    const validation = resolveConnectValidation(
      connectDrag.value.sourceNodeId,
      connectDrag.value.sourcePortKey,
      nodeId,
      portKey,
    );
    if (!validation.valid) {
      return "blocked";
    }
    return "compatible";
  };

  const isNodePortConnectable = (nodeId, portKey = "input") =>
    getNodePortConnectIntentState(nodeId, portKey) === "compatible";

  const isNodePortConnectBlocked = (nodeId, portKey = "input") =>
    getNodePortConnectIntentState(nodeId, portKey) === "blocked";

  const visibleNodeVisualList = computed(() => {
    ensureGraphCollections();
    const nodes = Array.isArray(workflow.value?.graph?.nodes)
      ? workflow.value.graph.nodes
      : [];
    return nodes.filter((node) => isNodeVisibleInActiveSubgraph(node));
  });
  const visibleNodeIdSet = computed(
    () =>
      new Set(
        visibleNodeVisualList.value.map((node) => String(node?.id || "")),
      ),
  );

  const edgeVisualList = computed(() => {
    ensureGraphCollections();
    const nodes = Array.isArray(workflow.value?.graph?.nodes)
      ? workflow.value.graph.nodes
      : [];
    const edges = Array.isArray(workflow.value?.graph?.edges)
      ? workflow.value.graph.edges
      : [];
    const reroutes = Array.isArray(workflow.value?.graph?.reroutes)
      ? workflow.value.graph.reroutes
      : [];

    return edges
      .map((edge) => {
        const sourceNode = nodes.find((node) => node.id === edge?.source);
        const targetNode = nodes.find((node) => node.id === edge?.target);
        if (!sourceNode || !targetNode) {
          return null;
        }

        const sourcePortKey = String(edge?.sourcePort || "output").trim();
        const targetPortKey = String(edge?.targetPort || "input").trim();
        const start = resolveNodePortAnchor(sourceNode, "out", sourcePortKey);
        const end = resolveNodePortAnchor(targetNode, "in", targetPortKey);
        const edgeReroutes = reroutes
          .filter((item) => item?.linkId === edge.id)
          .map((item, index) => ({
            ...item,
            x: Number.isFinite(Number(item?.x)) ? Number(item.x) : start.x,
            y: Number.isFinite(Number(item?.y)) ? Number(item.y) : start.y,
            order: Number.isFinite(Number(item?.order))
              ? Number(item.order)
              : index,
          }))
          .sort((left, right) => left.order - right.order);

        return {
          ...edge,
          x1: start.x,
          y1: start.y,
          x2: end.x,
          y2: end.y,
          reroutes: edgeReroutes,
        };
      })
      .filter(Boolean);
  });

  const groupVisualList = computed(() => {
    ensureGraphCollections();
    const groups = workflow.value.graph.groups || [];
    return groups.map((group, index) => {
      const width = Math.max(
        MIN_GROUP_WIDTH,
        Number.parseInt(group?.size?.width, 10) || DEFAULT_GROUP_WIDTH,
      );
      const height = Math.max(
        MIN_GROUP_HEIGHT,
        Number.parseInt(group?.size?.height, 10) || DEFAULT_GROUP_HEIGHT,
      );
      return {
        id:
          typeof group?.id === "string" && group.id.trim()
            ? group.id.trim()
            : `group-${index + 1}`,
        label:
          typeof group?.label === "string" && group.label.trim()
            ? group.label.trim()
            : `分组 ${index + 1}`,
        color:
          typeof group?.color === "string" && group.color.trim()
            ? group.color.trim()
            : "rgba(110, 170, 230, 0.24)",
        position: {
          x: clampToGrid(group?.position?.x || 0, 0),
          y: clampToGrid(group?.position?.y || 0, 0),
        },
        size: {
          width,
          height,
        },
        nodes: Array.isArray(group?.nodes) ? [...group.nodes] : [],
      };
    });
  });

  const rerouteVisualList = computed(() =>
    edgeVisualList.value.flatMap((edge) =>
      (edge.reroutes || []).map((reroute) => ({
        id: reroute.id,
        edgeId: edge.id,
        x: reroute.x,
        y: reroute.y,
      })),
    ),
  );

  const visibleEdgeVisualList = computed(() => {
    if (!canvasStore.linkVisible) {
      return [];
    }
    const nodeIdSet = visibleNodeIdSet.value;
    return edgeVisualList.value.filter(
      (edge) =>
        nodeIdSet.has(String(edge?.source || "")) &&
        nodeIdSet.has(String(edge?.target || "")),
    );
  });
  const visibleGroupVisualList = computed(() => {
    const activeId = normalizeSubgraphId(activeSubgraphId.value);
    const nodeIdSet = visibleNodeIdSet.value;
    return groupVisualList.value.filter((group) => {
      const groupSubgraphId = normalizeSubgraphId(
        resolveGroupContainerSubgraphId(group),
      );
      if (activeId) {
        if (groupSubgraphId && groupSubgraphId !== activeId) {
          return false;
        }
      } else if (groupSubgraphId) {
        return false;
      }
      const nodeIds = Array.isArray(group?.nodes) ? group.nodes : [];
      if (!nodeIds.length) {
        return true;
      }
      return nodeIds.some((nodeId) => nodeIdSet.has(String(nodeId || "")));
    });
  });
  const visibleRerouteVisualList = computed(() => {
    if (!canvasStore.linkVisible) {
      return [];
    }
    const edgeIdSet = new Set(
      visibleEdgeVisualList.value.map((edge) => String(edge?.id || "")),
    );
    return rerouteVisualList.value.filter((reroute) =>
      edgeIdSet.has(String(reroute?.edgeId || "")),
    );
  });

  const summarizeNodeConfig = (node, { full = false } = {}) => {
    const entries = buildNodeSummaryEntries(node, { full });

    if (!entries.length) {
      return "未配置";
    }

    const limit = full ? 4 : 2;
    const separator = full ? "\n" : " | ";
    return entries
      .slice(0, limit)
      .map((item) => `${item.label}: ${item.value}`)
      .join(separator);
  };

  const syncSingleNodeDimensions = (nodeId, measuredHeight = null) => {
    if (comfyParityMode.value) {
      return;
    }
    const node = workflow.value?.graph?.nodes?.find(
      (item) => item.id === nodeId,
    );
    const element = nodeCardElementMap.get(nodeId);
    if (!node || !element) {
      return;
    }

    const currentSize = resolveNodeDimensions(node);
    const safeMeasuredHeight = Number.isFinite(measuredHeight)
      ? Math.ceil(measuredHeight + 6)
      : Math.ceil(element.scrollHeight + 6);
    const nextHeight = clampNodeHeight(
      Math.max(currentSize.height, DEFAULT_NODE_HEIGHT, safeMeasuredHeight),
    );
    const nextWidth = clampNodeWidth(
      Math.max(currentSize.width, estimateNodeCardWidth(node)),
    );

    if (nextHeight === currentSize.height && nextWidth === currentSize.width) {
      return;
    }

    node.size = {
      width: nextWidth,
      height: nextHeight,
    };
  };

  const syncAutoNodeHeights = () => {
    nodeHeightSyncScheduled = false;
    if (comfyParityMode.value) {
      return;
    }

    const nodes = workflow.value?.graph?.nodes || [];
    nodes.forEach((node) => {
      syncSingleNodeDimensions(node.id);
    });
  };

  const scheduleAutoNodeHeightSync = () => {
    if (comfyParityMode.value) {
      return;
    }
    if (nodeHeightSyncScheduled) {
      return;
    }

    nodeHeightSyncScheduled = true;
    nextTick(() => {
      syncAutoNodeHeights();
    });
  };

  const estimateComfyNodeAutoHeight = (node) => {
    if (!node || isNodeCollapsed(node)) {
      return clampNodeHeight(COMFY_NODE_TITLE_HEIGHT + 6);
    }

    const inputSlotCount = getNodePortSlots(node, "in").length;
    const outputSlotCount = getNodePortSlots(node, "out").length;
    const slotRows = Math.max(1, inputSlotCount, outputSlotCount);
    const widgetRows = getNodeCardSummaryEntries(node).filter(Boolean).length;
    const slotSectionHeight = slotRows * COMFY_NODE_SLOT_HEIGHT;
    const widgetSectionHeight =
      widgetRows > 0
        ? COMFY_NODE_WIDGET_STACK_OFFSET +
          widgetRows * COMFY_NODE_WIDGET_HEIGHT +
          Math.max(0, widgetRows - 1) * COMFY_NODE_WIDGET_ROW_GAP +
          COMFY_NODE_WIDGET_SECTION_PADDING
        : 0;

    return clampNodeHeight(
      COMFY_NODE_TITLE_HEIGHT + slotSectionHeight + widgetSectionHeight + 8,
    );
  };

  const estimateComfyNodeBaselineDimensions = (node) => ({
    width: clampNodeWidth(
      Math.max(
        COMFY_NODE_MIN_WIDTH,
        Math.min(COMFY_NODE_MAX_WIDTH, estimateNodeCardWidth(node)),
      ),
    ),
    height: estimateComfyNodeAutoHeight(node),
  });

  const shouldAutoNormalizeComfyNode = (node) => {
    if (!node) {
      return false;
    }
    return !isNodeManuallySized(node);
  };

  const normalizeComfyNodeDimensions = () => {
    comfyNodeNormalizeScheduled = false;
    if (!comfyParityMode.value) {
      return;
    }

    const nodes = workflow.value?.graph?.nodes || [];
    nodes.forEach((node) => {
      const visualState = ensureNodeVisualState(node);
      const currentSize = resolveNodeDimensions(node);
      const baselineSize = estimateComfyNodeBaselineDimensions(node);
      const shouldAutoNormalize = shouldAutoNormalizeComfyNode(node);
      const nextWidth = shouldAutoNormalize
        ? baselineSize.width
        : Math.max(currentSize.width, baselineSize.width);
      const nextHeight = shouldAutoNormalize
        ? baselineSize.height
        : Math.max(currentSize.height, baselineSize.height);

      if (
        nextWidth === currentSize.width &&
        nextHeight === currentSize.height
      ) {
        visualState.comfyNormalized = true;
        return;
      }

      node.size = {
        width: nextWidth,
        height: nextHeight,
      };
      visualState.comfyNormalized = true;
    });
  };

  const scheduleComfyNodeNormalize = () => {
    if (!comfyParityMode.value) {
      return;
    }
    if (comfyNodeNormalizeScheduled) {
      return;
    }

    comfyNodeNormalizeScheduled = true;
    nextTick(() => {
      normalizeComfyNodeDimensions();
    });
  };

  const graphHistoryWatchSignature = computed(() => {
    ensureGraphCollections();
    return JSON.stringify({
      nodes: workflow.value.graph.nodes,
      edges: workflow.value.graph.edges,
      links: workflow.value.graph.links,
      groups: workflow.value.graph.groups,
      reroutes: workflow.value.graph.reroutes,
      floatingLinks: workflow.value.graph.floatingLinks,
      state: workflow.value.graph.state,
      extra: workflow.value.graph.extra,
    });
  });

  watch(
    () => graphHistoryWatchSignature.value,
    () => {
      scheduleGraphHistorySnapshot();
    },
    {
      flush: "post",
      immediate: true,
    },
  );

  watch(
    () =>
      workflow.value.graph.nodes
        .map((node) => {
          const summarySignature = getNodeCardSummaryEntries(node)
            .map((entry) => `${entry.key}:${entry.value}`)
            .join("|");
          const inputSlotSignature = getNodePortSlots(node, "in")
            .map((slot) => `${slot.key}:${slot.datatype}`)
            .join("|");
          const outputSlotSignature = getNodePortSlots(node, "out")
            .map((slot) => `${slot.key}:${slot.datatype}`)
            .join("|");
          return [
            node.id,
            resolveNodeLabel(node),
            node.type,
            summarySignature,
            inputSlotSignature,
            outputSlotSignature,
            resolveNodeDimensions(node).width,
            resolveNodeFontSize(node),
          ].join("::");
        })
        .join("||"),
    () => {
      if (comfyParityMode.value) {
        scheduleComfyNodeNormalize();
        return;
      }
      scheduleAutoNodeHeightSync();
    },
    { flush: "post" },
  );

  watch(
    () =>
      [
        workflow.value.graph.nodes.map((node) => node.id).join("|"),
        workflow.value.graph.edges.map((edge) => edge.id).join("|"),
      ].join("::"),
    () => {
      ensureGraphCollections();
      const nodeIdSet = new Set(
        workflow.value.graph.nodes.map((node) => node.id),
      );
      const edgeIdSet = new Set(
        workflow.value.graph.edges.map((edge) => edge.id),
      );
      workflow.value.graph.groups.forEach((group) => {
        if (!Array.isArray(group.nodes)) {
          group.nodes = [];
          return;
        }
        group.nodes = group.nodes.filter((nodeId) => nodeIdSet.has(nodeId));
      });
      workflow.value.graph.reroutes = workflow.value.graph.reroutes.filter(
        (item) => edgeIdSet.has(item.linkId),
      );
    },
    { flush: "post" },
  );

  watch(
    () => activeSubgraphId.value,
    () => {
      const visibleNodeIdSetSnapshot = visibleNodeIdSet.value;
      if (
        selectedNodeId.value &&
        !visibleNodeIdSetSnapshot.has(String(selectedNodeId.value))
      ) {
        selectedNodeId.value = "";
      }

      const nextSelection = selectionStore.selectedItems.filter((item) => {
        if (item.type !== "node") {
          return true;
        }
        return visibleNodeIdSetSnapshot.has(String(item.id || ""));
      });
      if (nextSelection.length !== selectionStore.selectedItems.length) {
        selectionStore.setSelection(nextSelection);
      }

      if (
        contextMenuState.value.scope === "node" &&
        contextMenuState.value.nodeId &&
        !visibleNodeIdSetSnapshot.has(
          String(contextMenuState.value.nodeId || ""),
        )
      ) {
        closeContextMenu();
      }
    },
    { flush: "post" },
  );

  watch(
    () => [activeRunId.value, activeRunStatus.value],
    () => {
      queueStore.refreshQueue();
    },
  );

  watch(
    () => lastRunEvent.value,
    (eventPayload) => {
      if (!queueStore.ingestRunEvent(eventPayload || {})) {
        return;
      }
    },
    { deep: false },
  );

  onMounted(() => {
    syncComfyParityModeFromConfig();
    registerWorkflowCommands();
    registerWorkflowKeybindings();
    syncStoreSelectionFromLegacy();
    workflowHub.bootstrap().catch(() => {});
    updateResponsiveWorkflowChrome();
    nextTick(() => {
      if (canvasRef.value) {
        canvasRef.value.scrollLeft = canvasStore.scrollLeft;
        canvasRef.value.scrollTop = canvasStore.scrollTop;
      }
      updateCanvasViewport();
      updateMinimapMetrics();
      if (comfyParityMode.value) {
        scheduleComfyNodeNormalize();
      } else {
        scheduleAutoNodeHeightSync();
      }
    });
    queueStore.refreshQueue();
    if (typeof window !== "undefined") {
      window.__workflowParity = {
        applyScene: (sceneName) => applyWorkflowParityScene(sceneName),
      };
    }
    window.addEventListener("resize", updateResponsiveWorkflowChrome);
    window.addEventListener("resize", updateCanvasViewport);
    window.addEventListener("resize", updateMinimapMetrics);
    if (!comfyParityMode.value) {
      window.addEventListener("resize", scheduleAutoNodeHeightSync);
    } else {
      window.addEventListener("resize", scheduleComfyNodeNormalize);
    }
    window.addEventListener("mouseup", cancelEdgeConnect);
    window.addEventListener("mouseup", stopNodeDrag);
    window.addEventListener("pointermove", applyNodeBatchDragFromPointer);
    window.addEventListener("pointerup", stopNodeBatchDrag);
    window.addEventListener("pointercancel", stopNodeBatchDrag);
    window.addEventListener("pointermove", applyNodeResizeFromPointer);
    window.addEventListener("pointerup", stopNodeResize);
    window.addEventListener("pointercancel", stopNodeResize);
    window.addEventListener("pointermove", applyGroupDragFromPointer);
    window.addEventListener("pointerup", stopGroupDrag);
    window.addEventListener("pointercancel", stopGroupDrag);
    window.addEventListener("pointermove", applyGroupResizeFromPointer);
    window.addEventListener("pointerup", stopGroupResize);
    window.addEventListener("pointercancel", stopGroupResize);
    window.addEventListener("pointermove", applyRerouteDragFromPointer);
    window.addEventListener("pointerup", stopRerouteDrag);
    window.addEventListener("pointercancel", stopRerouteDrag);
    window.addEventListener("mousedown", closeContextMenu);
    window.addEventListener("touchstart", closeContextMenu, { passive: true });
    window.addEventListener("mousemove", moveNodeInlineInspectorDrag);
    window.addEventListener("mouseup", stopNodeInlineInspectorDrag);
    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("keyup", handleGlobalKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("pointermove", moveMinimapDrag);
    window.addEventListener("pointerup", stopMinimapDrag);
    window.addEventListener("pointercancel", stopMinimapDrag);
    window.addEventListener("pointerup", handleCanvasPanEnd);
    window.addEventListener("pointercancel", handleCanvasPanEnd);
  });

  onUnmounted(() => {
    if (typeof window !== "undefined" && window.__workflowParity?.applyScene) {
      delete window.__workflowParity;
    }
    if (connectFeedbackTimer) {
      clearTimeout(connectFeedbackTimer);
    }
    if (graphHistoryCommitTimer) {
      clearTimeout(graphHistoryCommitTimer);
      graphHistoryCommitTimer = null;
    }
    nodeCardResizeObserver?.disconnect();
    nodeCardResizeObserver = null;
    window.removeEventListener("resize", updateResponsiveWorkflowChrome);
    window.removeEventListener("resize", updateCanvasViewport);
    window.removeEventListener("resize", updateMinimapMetrics);
    window.removeEventListener("resize", scheduleAutoNodeHeightSync);
    window.removeEventListener("resize", scheduleComfyNodeNormalize);
    window.removeEventListener("mouseup", cancelEdgeConnect);
    window.removeEventListener("mouseup", stopNodeDrag);
    window.removeEventListener("pointermove", applyNodeBatchDragFromPointer);
    window.removeEventListener("pointerup", stopNodeBatchDrag);
    window.removeEventListener("pointercancel", stopNodeBatchDrag);
    window.removeEventListener("pointermove", applyNodeResizeFromPointer);
    window.removeEventListener("pointerup", stopNodeResize);
    window.removeEventListener("pointercancel", stopNodeResize);
    window.removeEventListener("pointermove", applyGroupDragFromPointer);
    window.removeEventListener("pointerup", stopGroupDrag);
    window.removeEventListener("pointercancel", stopGroupDrag);
    window.removeEventListener("pointermove", applyGroupResizeFromPointer);
    window.removeEventListener("pointerup", stopGroupResize);
    window.removeEventListener("pointercancel", stopGroupResize);
    window.removeEventListener("pointermove", applyRerouteDragFromPointer);
    window.removeEventListener("pointerup", stopRerouteDrag);
    window.removeEventListener("pointercancel", stopRerouteDrag);
    window.removeEventListener("mousedown", closeContextMenu);
    window.removeEventListener("touchstart", closeContextMenu);
    window.removeEventListener("mousemove", moveNodeInlineInspectorDrag);
    window.removeEventListener("mouseup", stopNodeInlineInspectorDrag);
    window.removeEventListener("keydown", handleGlobalKeyDown);
    window.removeEventListener("keyup", handleGlobalKeyUp);
    window.removeEventListener("blur", handleWindowBlur);
    window.removeEventListener("pointermove", moveMinimapDrag);
    window.removeEventListener("pointerup", stopMinimapDrag);
    window.removeEventListener("pointercancel", stopMinimapDrag);
    window.removeEventListener("pointerup", handleCanvasPanEnd);
    window.removeEventListener("pointercancel", handleCanvasPanEnd);
  });

  const toBezierSegment = (fromPoint, toPoint) => {
    const x1 = Number(fromPoint?.x || 0);
    const y1 = Number(fromPoint?.y || 0);
    const x2 = Number(toPoint?.x || 0);
    const y2 = Number(toPoint?.y || 0);
    const distance = Math.max(56, Math.abs(x2 - x1) * 0.45);
    return `C ${x1 + distance} ${y1}, ${x2 - distance} ${y2}, ${x2} ${y2}`;
  };

  const toEdgePath = (edge) => {
    const start = {
      x: Number(edge?.x1 || 0),
      y: Number(edge?.y1 || 0),
    };
    const end = {
      x: Number(edge?.x2 || 0),
      y: Number(edge?.y2 || 0),
    };
    const reroutes = Array.isArray(edge?.reroutes) ? edge.reroutes : [];
    const waypoints = [start, ...reroutes, end];
    if (waypoints.length <= 1) {
      return "";
    }
    const segments = [];
    for (let index = 1; index < waypoints.length; index += 1) {
      segments.push(toBezierSegment(waypoints[index - 1], waypoints[index]));
    }
    return `M ${start.x} ${start.y} ${segments.join(" ")}`;
  };

  const getEdgePathStyle = (edge) => {
    const sourceNode = workflow.value?.graph?.nodes?.find(
      (node) => node.id === edge?.source,
    );
    const edgeColor = sourceNode
      ? getNodePortSlotColor(sourceNode, "out", String(edge?.sourcePort || ""))
      : COMFY_DEFAULT_OUTPUT_SLOT_COLOR;
    return {
      stroke: edgeColor,
    };
  };

  provide(workflowDesignerContextKey, {
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
    selectedNodeRunState,
    runNodeStates,
    lastRunEvent,
    totalWorksDisplay,
    completedWorksDisplay,
    inProgressWorksDisplay,
    remainingWorksDisplay,
    isRunInProgress,
    isSaving,
    isValidating,
    selectedNodeId,
    selectedEdgeId,
    selectedNode,
    selectedNodeObjectInfo,
    selectedNodeConfigDraft,
    selectedNodeConfigError,
    sourceNodeId,
    targetNodeId,
    currentNodeOptions,
    validationState,
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
    cancelRun,
    startNodeDrag,
    handleCanvasMouseMove,
    stopNodeDrag,
    queueStore,
    workflowHub,
    canvasStore,
    selectionStore,
    commandStore,
    keybindingStore,
    registerWorkflowCommand: commandStore.registerCommand,
    registerNodeMenuItem: commandStore.registerNodeMenuItem,
    registerCanvasMenuItem: commandStore.registerCanvasMenuItem,
    registerEdgeMenuItem: commandStore.registerEdgeMenuItem,
    registerGroupMenuItem: commandStore.registerGroupMenuItem,
    registerRerouteMenuItem: commandStore.registerRerouteMenuItem,
    nodeSearchKeyword,
    nodePickerKeyword,
    nodePickerStatusFilter,
    inspectorTab,
    MIN_CANVAS_ZOOM,
    MAX_CANVAS_ZOOM,
    MIN_NODE_WIDTH,
    MAX_NODE_WIDTH,
    MIN_NODE_HEIGHT,
    MAX_NODE_HEIGHT,
    MIN_NODE_FONT_SIZE,
    MAX_NODE_FONT_SIZE,
    canvasZoom,
    bridgeBarCollapsed,
    leftDockCollapsed,
    nodeInlineInspectorVisible,
    nodeInlineInspectorTab,
    nodeInlineInspectorPinned,
    nodeInlineInspectorStyle,
    nodeInlineInspectorDrag,
    marqueeStyle,
    selectedNodeIds,
    selectedEdgeIds,
    selectedGroupIds,
    selectedRerouteIds,
    canCreateGroupFromSelection,
    dispatchModeLabelMap,
    heroModeBadge,
    runStatusClass,
    inspectorTabs,
    runtimeDispatchMode,
    runtimeBatchSize,
    runtimeEmitPerItem,
    runtimeGuardianEnabled,
    runtimeAutoCleanupDuplicates,
    libraryDrawerGroups,
    handleLibraryNodeDragStart,
    overviewCards,
    getRunStatusLabel,
    resolveNodeLabel,
    getNodeTypeDisplay,
    getStatusClassByValue,
    formatTimestampLabel,
    formatRuntimePreview,
    selectedNodeRunStatusClass,
    selectedNodeRunDuration,
    selectedNodeWidthDraft,
    selectedNodeHeightDraft,
    selectedNodeFontSizeDraft,
    translateNodeConfigError,
    subtitleFormatOptions,
    selectedTranslateNodeConfig,
    selectedPackNodeConfig,
    selectedUploadNodeConfig,
    selectedCloudDeleteNodeConfig,
    selectedLocalDeleteNodeConfig,
    isTranslateSubtitleNodeSelected,
    isPackSubtitleNodeSelected,
    isUploadSubtitleNodeSelected,
    isCloudDeleteRecentNodeSelected,
    isLocalDeleteScannedNodeSelected,
    pickTranslateExePath,
    pickTranslateTargetPath,
    toggleTranslateSubFormat,
    pickPackTargetPath,
    pickPackOutputPath,
    patchPackNodeConfig,
    pickUploadScanDir,
    updateUploadChannelId,
    updateUploadTitleDelay,
    updateUploadBetweenDelay,
    patchUploadNodeConfig,
    updateCloudDeleteRecentLimit,
    updateCloudDeleteBatchSize,
    patchCloudDeleteNodeConfig,
    pickLocalDeleteScanDir,
    updateLocalDeleteExtensions,
    patchLocalDeleteNodeConfig,
    selectedNodeSchemaWidgets,
    getSelectedNodeSchemaWidgetValue,
    isSelectedNodeSchemaWidgetLinked,
    patchSelectedNodeSchemaWidgetValue,
    commitSelectedNodeSize,
    commitSelectedNodeFontSize,
    applyNodeSizePreset,
    applyNodeFontSizePreset,
    bridgeNodePickerItems,
    canvasZoomPercent,
    focusNodeFromPicker,
    assignSourceNode,
    assignTargetNode,
    autoArrangeNodes,
    zoomIn,
    zoomOut,
    canvasPan,
    spacePanPressed,
    handleCanvasPanStart,
    handleCanvasPanMove,
    handleCanvasPanEnd,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleCanvasPointerLeave,
    handleCanvasScroll,
    handleCanvasWheel,
    handleCanvasBackgroundClick,
    handleCanvasBackgroundDoubleClick,
    openCanvasContextMenu,
    createNodeFromCanvasContext,
    openNodeCreationPalette,
    openNodeCreationPaletteFromContextMenu,
    openCommandPalette,
    openEdgeContextMenu,
    openGroupContextMenu,
    openRerouteContextMenu,
    handleCanvasDragOver,
    handleCanvasDrop,
    canvasSceneStyle,
    canvasContentStyle,
    activeConnectPath,
    visibleNodeVisualList,
    visibleGroupVisualList,
    visibleEdgeVisualList,
    visibleRerouteVisualList,
    connectFeedback,
    toEdgePath,
    getEdgePathStyle,
    handleEdgePathClick,
    handleEdgePathDoubleClick,
    setNodeCardRef,
    isNodeSelected,
    isGroupSelected,
    isRerouteSelected,
    getGroupCardStyle,
    getRerouteHandleStyle,
    connectDrag,
    connectHoverNodeId,
    connectHoverPortKey,
    isInputBoundaryNode,
    isOutputBoundaryNode,
    nodeResizeState,
    getNodeRuntimeStatusClass,
    getNodeRuntimeProgressPercent,
    shouldShowNodeRuntimeProgress,
    getNodeRuntimeProgressLabel,
    getNodeRuntimeProgressStyle,
    getNodeCategoryClass,
    getNodeCardStateClass,
    isNodeBatchDragging,
    getNodeCardStyle,
    handleNodeCardClick,
    handleNodeDragStart,
    handleNodeCardMouseUp,
    isNodeTitleEditing,
    nodeTitleEditState,
    startNodeTitleEdit,
    updateNodeTitleDraft,
    commitNodeTitleEdit,
    cancelNodeTitleEdit,
    isNodeMuted,
    isNodeBypassed,
    isNodePinned,
    isNodeCollapsed,
    toggleNodeMute,
    toggleNodeBypass,
    toggleNodePin,
    toggleNodeCollapse,
    handleGroupCardClick,
    startGroupDrag,
    startGroupResize,
    groupDragState,
    groupResizeState,
    handleRerouteHandleClick,
    startRerouteDrag,
    rerouteDragState,
    openNodeContextMenu,
    hasNodePortLinked,
    getNodePortDetailLabel,
    getNodePortSlots,
    getNodePortSlotStyle,
    isNodePortSlotLinked,
    isNodePortConnectable,
    isNodePortConnectBlocked,
    updateConnectHoverNode,
    finishEdgeConnect,
    getNodePortSlotStatusLabel,
    getNodePortSlotTypeLabel,
    shouldShowNodePortSlotType,
    startEdgeConnect,
    getNodeBadge,
    shouldShowNodeFamily,
    getNodeCategoryLabel,
    shouldShowNodeType,
    getNodeRuntimeStatusLabel,
    formatNodeIdCompact,
    getNodePortStatusLabel,
    getNodeCardSummaryEntries,
    registerNodeWidgetRenderer,
    startNodeResize,
    copyPrimarySelectedNode,
    pasteCopiedNode,
    pasteCopiedNodeWithConnect,
    deleteCurrentSelection,
    summarizeNodeConfig,
    jumpToMainInspector,
    toggleNodeInlineInspectorPin,
    startNodeInlineInspectorDrag,
    contextMenuState,
    contextMenuRenderPosition,
    contextMenuMetrics,
    updateContextMenuMetrics,
    contextMenuQuickNodeItems,
    contextMenuExtensionItems,
    contextMenuNodeVisualState,
    contextMenuNodeSubgraphId,
    canContextMenuEnterSubgraph,
    selectedNodeSubgraphId,
    canEnterSelectedNodeSubgraph,
    enterSelectedNodeSubgraph,
    canExitActiveSubgraph,
    canUndoGraphHistory,
    canRedoGraphHistory,
    hasNodeClipboardPayload,
    copySelectedNode,
    duplicateSelectedNode,
    removeContextNode,
    toggleContextNodeMute,
    toggleContextNodeBypass,
    toggleContextNodePin,
    toggleContextNodeCollapse,
    removeContextEdge,
    removeContextGroup,
    fitContextGroup,
    removeContextReroute,
    addRerouteFromContextEdge,
    enterContextNodeSubgraph,
    exitContextSubgraph,
    executeUndoGraphHistory,
    executeRedoGraphHistory,
    createGroupFromSelection,
    fitCanvasView,
    resetCanvasView,
    toggleCanvasLinks,
    toggleCanvasLock,
    toggleCanvasMinimap,
    setCanvasNavigationMode,
    queueRunCurrentWorkflowFront,
    clearPendingQueue,
    inspectRunHistoryItem,
    rerunHistoryItem,
    executeContextMenuExtensionAction,
    canPartialExecuteNode,
    runNodePartialExecution,
    openNodeDocsForNode,
    comfyParityMode,
    minimapRef,
    minimapDrag,
    startMinimapDrag,
    moveMinimapDrag,
    stopMinimapDrag,
    minimapNodes,
    minimapViewportStyle,
    logDockExpanded,
    runtimeDockTab,
    logDockScope,
    dockLogKeyword,
    dockFilteredLogLines,
    dockLogEmptyText,
    quickPaletteVisible,
    quickPaletteMode,
    quickPaletteTitle,
    quickPalettePlaceholder,
    quickPaletteKeyword,
    quickPaletteItems,
    quickPaletteSelectedIndex,
    setQuickPaletteKeyword,
    setQuickPaletteSelectionIndex,
    moveQuickPaletteSelection,
    commitQuickPaletteSelection,
    closeQuickPalette,
    subgraphNavigationStack,
    activeSubgraphId,
    enterSubgraph,
    exitSubgraph,
  });
};

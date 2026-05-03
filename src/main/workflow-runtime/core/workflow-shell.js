import {
  getDefaultWorkflowRuntimeConfig,
  normalizeWorkflowDefinition,
} from "../contracts/workflow-schema";
import { getWorkflowObjectInfo } from "../registry/node-registry";

const cloneJsonValue = (value, fallbackValue = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallbackValue;
  }
};

const createEdge = (id, source, sourcePort, target, targetPort) => ({
  id,
  source,
  sourcePort,
  target,
  targetPort,
  type: "default",
});

const createWorkflowDocument = ({
  name,
  description,
  tags = [],
  nodes = [],
  edges = [],
  extra = {},
  runtime = {},
}) =>
  normalizeWorkflowDefinition({
    id: "",
    name,
    version: "1.0.0",
    description,
    tags,
    graph: {
      nodes,
      edges,
      links: cloneJsonValue(edges, []),
      groups: [],
      reroutes: [],
      floatingLinks: [],
      state: {},
      extra,
      definitions: {},
    },
    runtime: {
      ...getDefaultWorkflowRuntimeConfig(),
      ...runtime,
    },
  });

const WORKFLOW_TEMPLATES = [
  {
    id: "blank-workflow",
    displayName: "空白工作流",
    category: "基础",
    description: "从空白画布开始，自定义节点、连线与运行路径。",
    summary: "从零开始搭建自定义工作流。",
    tags: ["空白", "设计器"],
    inputRequirements: [],
    dependencies: [],
    buildDocument: () =>
      createWorkflowDocument({
        name: "空白工作流",
        description: "从空白画布开始，自定义节点与运行路径。",
        tags: ["空白"],
        nodes: [],
        edges: [],
        extra: {
          workflowTemplate: {
            id: "blank-workflow",
            category: "基础",
          },
        },
      }),
  },
  {
    id: "subtitle-translate-review",
    displayName: "字幕翻译审查",
    category: "字幕",
    description: "将字幕目录交给 Whisper 翻译，并在 Inspect 节点中检查结果。",
    summary: "目录输入 → 字幕翻译 → 结果检查。",
    tags: ["字幕", "审查"],
    inputRequirements: [
      {
        key: "targetPath",
        label: "媒体目录",
        required: true,
        datatype: "PATH",
      },
    ],
    dependencies: [
      {
        key: "whisper-exe",
        label: "Whisper 可执行文件",
        required: true,
        detail: "需要已配置可用的 Whisper 可执行文件。",
      },
    ],
    buildDocument: () => {
      const nodes = [
        {
          id: "node-input-path",
          type: "input.manual",
          label: "媒体目录",
          position: { x: 120, y: 150 },
          config: { value: "" },
        },
        {
          id: "node-translate",
          type: "whisper.translateSubtitles",
          label: "翻译字幕",
          position: { x: 420, y: 120 },
          config: {
            exePath: "",
            targetPath: "",
            subFormats: ["lrc", "srt", "vtt"],
          },
        },
        {
          id: "node-inspect",
          type: "output.inspect",
          label: "结果检查",
          position: { x: 760, y: 140 },
          config: {},
        },
      ];
      const edges = [
        createEdge(
          "edge-input-path",
          "node-input-path",
          "value",
          "node-translate",
          "targetPath/path",
        ),
        createEdge(
          "edge-translate-inspect",
          "node-translate",
          "items[]",
          "node-inspect",
          "inputValues/inputMap",
        ),
      ];
      return createWorkflowDocument({
        name: "字幕翻译审查",
        description:
          "将字幕目录交给 Whisper 翻译，并通过 Inspect 节点复核输出。",
        tags: ["字幕", "审查"],
        nodes,
        edges,
        extra: {
          workflowTemplate: {
            id: "subtitle-translate-review",
            category: "字幕",
          },
        },
      });
    },
  },
  {
    id: "subtitle-pack-upload",
    displayName: "字幕打包上传",
    category: "发布",
    description: "将字幕目录打包后上传到 Telegram，并保留结果检查节点。",
    summary: "字幕目录 → 打包字幕 → 上传 Telegram → 结果检查。",
    tags: ["打包", "上传"],
    inputRequirements: [
      {
        key: "targetPath",
        label: "字幕目录",
        required: true,
        datatype: "PATH",
      },
      {
        key: "channelId",
        label: "Telegram 频道",
        required: true,
        datatype: "TEXT",
      },
    ],
    dependencies: [
      {
        key: "telegram-login",
        label: "Telegram 登录状态",
        required: true,
        detail: "需要已登录 Telegram，且具备目标频道的上传权限。",
      },
    ],
    buildDocument: () => {
      const nodes = [
        {
          id: "node-pack-input",
          type: "input.manual",
          label: "字幕目录",
          position: { x: 120, y: 160 },
          config: { value: "" },
        },
        {
          id: "node-pack",
          type: "whisper.packSubtitles",
          label: "打包字幕",
          position: { x: 420, y: 120 },
          config: {
            targetPath: "",
            outputDir: "",
          },
        },
        {
          id: "node-upload",
          type: "tg.uploadSubtitles",
          label: "上传 Telegram",
          position: { x: 760, y: 120 },
          config: {
            scanPath: "",
            channelId: "",
            titleDelayMs: 3500,
            betweenDelayMs: 1000,
            failOnEmpty: true,
            failFast: false,
          },
        },
        {
          id: "node-upload-inspect",
          type: "output.inspect",
          label: "结果检查",
          position: { x: 1120, y: 150 },
          config: {},
        },
      ];
      const edges = [
        createEdge(
          "edge-pack-input",
          "node-pack-input",
          "value",
          "node-pack",
          "targetPath/path",
        ),
        createEdge(
          "edge-pack-upload",
          "node-pack",
          "outputPaths[]",
          "node-upload",
          "archives/files",
        ),
        createEdge(
          "edge-upload-inspect",
          "node-upload",
          "uploadedFiles[]",
          "node-upload-inspect",
          "inputValues/inputMap",
        ),
      ];
      return createWorkflowDocument({
        name: "字幕打包上传",
        description: "将字幕目录打包后上传到 Telegram，并检查上传结果。",
        tags: ["打包", "上传"],
        nodes,
        edges,
        extra: {
          workflowTemplate: {
            id: "subtitle-pack-upload",
            category: "发布",
          },
        },
      });
    },
  },
  {
    id: "recent-cleanup-review",
    displayName: "最近上传清理检查",
    category: "清理",
    description:
      "输入 RJ 列表，在最近上传记录中执行云端删除，并通过 Inspect 查看命中结果。",
    summary: "RJ 列表 → 云端删除最近上传 → 结果检查。",
    tags: ["清理", "最近"],
    inputRequirements: [
      {
        key: "rjCodes",
        label: "RJ/VJ/BJ 列表",
        required: true,
        datatype: "LIST",
      },
    ],
    dependencies: [
      {
        key: "asmr-session",
        label: "ASMR Cloud 会话",
        required: true,
        detail: "需要已登录 ASMR 且可访问云端播放列表。",
      },
    ],
    buildDocument: () => {
      const nodes = [
        {
          id: "node-rj-input",
          type: "input.manual",
          label: "RJ 列表",
          position: { x: 120, y: 140 },
          config: { value: [] },
        },
        {
          id: "node-cloud-delete",
          type: "asmr.cloudDeleteRecentUploads",
          label: "清理最近上传",
          position: { x: 430, y: 120 },
          config: {
            recentLimit: 30,
            batchSize: 50,
            requestDelayMs: 1000,
            refreshCloudFirst: true,
            failOnNoMatch: false,
          },
        },
        {
          id: "node-cleanup-inspect",
          type: "output.inspect",
          label: "结果检查",
          position: { x: 790, y: 150 },
          config: {},
        },
      ];
      const edges = [
        createEdge(
          "edge-rj-delete",
          "node-rj-input",
          "value",
          "node-cloud-delete",
          "rjCodes",
        ),
        createEdge(
          "edge-delete-inspect",
          "node-cloud-delete",
          "matchedWorkIds[]",
          "node-cleanup-inspect",
          "inputValues/inputMap",
        ),
      ];
      return createWorkflowDocument({
        name: "最近上传清理检查",
        description: "根据 RJ 列表清理最近上传的云端作品，并输出命中结果。",
        tags: ["cleanup", "cloud"],
        nodes,
        edges,
        extra: {
          workflowTemplate: {
            id: "recent-cleanup-review",
            category: "清理",
          },
        },
      });
    },
  },
];

const normalizeEntryList = (list = []) =>
  (Array.isArray(list) ? list : []).map((entry) => ({
    ...cloneJsonValue(entry, {}),
    datatype: String(
      entry?.datatype || entry?.dataType || entry?.valueType || "ANY",
    )
      .trim()
      .toUpperCase(),
  }));

const deriveSearchAliases = (record = {}, type = "") => {
  const values = [
    type,
    record.displayName,
    record.label,
    record.category,
    ...(String(record.uiHints?.searchableTerms || "")
      .split(/\s+/)
      .filter(Boolean) || []),
  ];

  const unique = new Set();
  values.forEach((item) => {
    const normalized = String(item || "").trim();
    if (normalized) {
      unique.add(normalized);
    }
  });

  return [...unique];
};

export const listWorkflowCatalogEntries = () => {
  const objectInfo = getWorkflowObjectInfo();
  return Object.entries(objectInfo)
    .map(([type, record]) => {
      const requiredInputs = normalizeEntryList(record?.inputs?.required || []);
      const optionalInputs = normalizeEntryList(record?.inputs?.optional || []);
      const outputs = normalizeEntryList(record?.outputs || []);
      const widgets = cloneJsonValue(record?.widgets || [], []);
      const runtimeFlags = cloneJsonValue(record?.runtimeFlags || {}, {});
      const uiHints = cloneJsonValue(record?.uiHints || {}, {});
      const entry = {
        type,
        displayName:
          String(record?.displayName || record?.label || type).trim() || type,
        category: String(record?.category || "other").trim() || "other",
        description: String(record?.description || "").trim(),
        searchAliases: deriveSearchAliases(record, type),
        deprecated: Boolean(record?.deprecated),
        isExperimental: Boolean(
          runtimeFlags.experimental || uiHints.experimental,
        ),
        inputs: {
          required: requiredInputs,
          optional: optionalInputs,
        },
        outputs,
        outputTooltips: outputs.reduce((acc, item) => {
          acc[item.key] = item.description || item.label || item.key;
          return acc;
        }, {}),
        widgets,
        runtimeFlags,
        uiHints,
      };
      return {
        ...entry,
        docs: buildWorkflowNodeDocs(entry),
      };
    })
    .sort((left, right) => {
      const categoryCompare = left.category.localeCompare(
        right.category,
        "zh-Hans-CN",
      );
      if (categoryCompare !== 0) {
        return categoryCompare;
      }
      return left.displayName.localeCompare(right.displayName, "zh-Hans-CN");
    });
};

export const buildWorkflowNodeDocs = (entry = {}) => {
  const requiredInputs = Array.isArray(entry?.inputs?.required)
    ? entry.inputs.required
    : [];
  const optionalInputs = Array.isArray(entry?.inputs?.optional)
    ? entry.inputs.optional
    : [];
  const outputs = Array.isArray(entry?.outputs) ? entry.outputs : [];
  const widgets = Array.isArray(entry?.widgets) ? entry.widgets : [];
  const lines = [
    `# ${entry.displayName || entry.type || "未命名节点"}`,
    "",
    entry.description || "暂无节点说明。",
    "",
    `- 类型：\`${entry.type || "unknown"}\``,
    `- 分类：${entry.category || "other"}`,
    `- 实验特性：${entry.isExperimental ? "是" : "否"}`,
    "",
    "## 必填输入",
  ];

  if (!requiredInputs.length) {
    lines.push("- 无");
  } else {
    requiredInputs.forEach((item) => {
      lines.push(
        `- \`${item.key}\` · ${item.label || item.key} · ${item.datatype}${item.description ? ` · ${item.description}` : ""}`,
      );
    });
  }

  lines.push("", "## 可选输入");
  if (!optionalInputs.length) {
    lines.push("- 无");
  } else {
    optionalInputs.forEach((item) => {
      lines.push(
        `- \`${item.key}\` · ${item.label || item.key} · ${item.datatype}${item.description ? ` · ${item.description}` : ""}`,
      );
    });
  }

  lines.push("", "## 输出");
  if (!outputs.length) {
    lines.push("- 无");
  } else {
    outputs.forEach((item) => {
      lines.push(
        `- \`${item.key}\` · ${item.label || item.key} · ${item.datatype}${item.description ? ` · ${item.description}` : ""}`,
      );
    });
  }

  lines.push("", "## 配置项");
  if (!widgets.length) {
    lines.push("- 无");
  } else {
    widgets.forEach((item) => {
      lines.push(
        `- \`${item.key || item.label || "widget"}\` · ${item.label || item.key || "未命名控件"} · ${String(item.widget || item.type || "text").trim() || "text"}`,
      );
    });
  }

  return {
    markdown: lines.join("\n"),
    generated: true,
  };
};

export const getWorkflowNodeDocs = (nodeType) => {
  const normalizedType = String(nodeType || "").trim();
  if (!normalizedType) {
    return null;
  }
  return (
    listWorkflowCatalogEntries().find(
      (entry) => entry.type === normalizedType,
    ) || null
  );
};

export const listWorkflowCatalogCategories = (entries = []) => {
  const counts = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const category = String(entry?.category || "other").trim() || "other";
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((left, right) => left.label.localeCompare(right.label, "zh-Hans-CN"));
};

export const listWorkflowTemplates = () =>
  WORKFLOW_TEMPLATES.map((template) => ({
    id: template.id,
    displayName: template.displayName,
    category: template.category,
    description: template.description,
    summary: template.summary,
    tags: cloneJsonValue(template.tags || [], []),
    inputRequirements: cloneJsonValue(template.inputRequirements || [], []),
    dependencies: cloneJsonValue(template.dependencies || [], []),
  }));

export const loadWorkflowTemplateDocument = (templateId) => {
  const normalizedTemplateId = String(templateId || "").trim();
  const template = WORKFLOW_TEMPLATES.find(
    (item) => item.id === normalizedTemplateId,
  );
  if (!template) {
    return null;
  }

  const document =
    typeof template.buildDocument === "function"
      ? template.buildDocument()
      : cloneJsonValue(template.document, null);

  if (!document) {
    return null;
  }

  return normalizeWorkflowDefinition({
    ...document,
    id: "",
    name: template.displayName,
    description: template.description,
    tags: cloneJsonValue(template.tags || [], []),
    graph: {
      ...cloneJsonValue(document.graph || {}, {}),
      extra: {
        ...cloneJsonValue(document?.graph?.extra || {}, {}),
        workflowTemplate: {
          id: template.id,
          displayName: template.displayName,
          category: template.category,
        },
      },
    },
  });
};

const collectUpstreamNodeIds = (workflow, targetNodeId) => {
  const edges = Array.isArray(workflow?.graph?.edges)
    ? workflow.graph.edges
    : Array.isArray(workflow?.graph?.links)
      ? workflow.graph.links
      : [];
  const parentsByTarget = new Map();
  edges.forEach((edge) => {
    const target = String(edge?.target || "").trim();
    const source = String(edge?.source || "").trim();
    if (!target || !source) {
      return;
    }
    if (!parentsByTarget.has(target)) {
      parentsByTarget.set(target, new Set());
    }
    parentsByTarget.get(target).add(source);
  });

  const visited = new Set();
  const stack = [targetNodeId];
  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    const parents = parentsByTarget.get(current);
    if (!parents) {
      continue;
    }
    parents.forEach((nodeId) => {
      if (!visited.has(nodeId)) {
        stack.push(nodeId);
      }
    });
  }

  return visited;
};

export const buildPartialWorkflowDocument = ({ workflow, nodeId }) => {
  const normalizedWorkflow = normalizeWorkflowDefinition(workflow || {});
  const normalizedNodeId = String(nodeId || "").trim();
  if (!normalizedNodeId) {
    throw new Error("缺少目标节点 ID");
  }

  const nodeIds = collectUpstreamNodeIds(normalizedWorkflow, normalizedNodeId);
  const hasTargetNode = normalizedWorkflow.graph.nodes.some(
    (node) => node.id === normalizedNodeId,
  );
  if (!hasTargetNode) {
    throw new Error("目标节点不存在");
  }

  const nodes = normalizedWorkflow.graph.nodes.filter((node) =>
    nodeIds.has(node.id),
  );
  const edges = normalizedWorkflow.graph.edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );

  return normalizeWorkflowDefinition({
    ...cloneJsonValue(normalizedWorkflow, {}),
    name: `${normalizedWorkflow.name || "未命名工作流"} · 局部执行`,
    graph: {
      ...cloneJsonValue(normalizedWorkflow.graph || {}, {}),
      nodes,
      edges,
      links: cloneJsonValue(edges, []),
      groups: [],
      floatingLinks: [],
      reroutes: [],
      extra: {
        ...cloneJsonValue(normalizedWorkflow?.graph?.extra || {}, {}),
        partialExecution: {
          enabled: true,
          targetNodeId: normalizedNodeId,
          includedNodeIds: [...nodeIds],
        },
      },
    },
  });
};

const toDurationMs = (startedAt, endedAt) => {
  const startTs = Date.parse(String(startedAt || ""));
  const endTs = Date.parse(String(endedAt || ""));
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
    return null;
  }
  return Math.max(0, endTs - startTs);
};

const normalizeNodeExecutionState = (nodeId, rawState = {}) => ({
  nodeId,
  status: String(rawState?.status || "idle").trim() || "idle",
  startedAt: rawState?.startedAt || null,
  endedAt: rawState?.endedAt || null,
  durationMs: Number.isFinite(Number(rawState?.durationMs))
    ? Number(rawState.durationMs)
    : toDurationMs(rawState?.startedAt, rawState?.endedAt),
  inputPreview: cloneJsonValue(rawState?.inputPreview, null),
  outputPreview: cloneJsonValue(rawState?.outputPreview, null),
  error: cloneJsonValue(rawState?.error, null),
  progressPercent: Number.isFinite(Number(rawState?.progressPercent))
    ? Number(rawState.progressPercent)
    : 0,
});

export const normalizeRunSession = (runRecord = {}) => {
  if (!runRecord || typeof runRecord !== "object") {
    return null;
  }

  const nodeStates = Object.fromEntries(
    Object.entries(runRecord.nodeStates || {}).map(([nodeId, state]) => [
      nodeId,
      normalizeNodeExecutionState(nodeId, state),
    ]),
  );

  return {
    runSessionId: String(
      runRecord.runSessionId || runRecord.runId || "",
    ).trim(),
    workflowId: String(runRecord.workflowId || "").trim(),
    workflowName: String(runRecord.workflowName || "").trim(),
    status: String(runRecord.status || "unknown").trim() || "unknown",
    requestedAt: runRecord.requestedAt || runRecord.startedAt || null,
    startedAt: runRecord.startedAt || null,
    endedAt: runRecord.endedAt || null,
    durationMs: Number.isFinite(Number(runRecord.durationMs))
      ? Number(runRecord.durationMs)
      : toDurationMs(runRecord.startedAt, runRecord.endedAt),
    mode: String(runRecord.mode || "").trim() || "enqueue",
    queuePosition: Number.isFinite(Number(runRecord.queuePosition))
      ? Number(runRecord.queuePosition)
      : null,
    summary: cloneJsonValue(runRecord.summary || null, null),
    validation: cloneJsonValue(runRecord.validation || null, null),
    nodeStates,
    workflowLogs: cloneJsonValue(runRecord.workflowLogs || [], []),
    pipelineLogs: cloneJsonValue(runRecord.pipelineLogs || [], []),
    nodeLogs: cloneJsonValue(runRecord.nodeLogs || {}, {}),
    workflowSnapshot: cloneJsonValue(runRecord.workflowSnapshot || null, null),
    error: cloneJsonValue(runRecord.error || null, null),
  };
};

const classifyRecoveryItem = (rawMessage = "") => {
  const message = String(rawMessage || "").toLowerCase();
  if (
    message.includes("missing") ||
    message.includes("缺失") ||
    message.includes("unknown node") ||
    message.includes("未知节点")
  ) {
    return "missing-node";
  }
  if (
    message.includes("model") ||
    message.includes("resource") ||
    message.includes("资源") ||
    message.includes("模型") ||
    message.includes("文件")
  ) {
    return "missing-resource";
  }
  return "execution-failure";
};

export const buildRecoveryReport = (runRecord = {}) => {
  const runSession = normalizeRunSession(runRecord) || {
    runSessionId: "",
    status: "unknown",
    nodeStates: {},
    validation: null,
    error: null,
  };

  const items = [];

  const validationErrors = Array.isArray(runSession.validation?.errors)
    ? runSession.validation.errors
    : [];
  validationErrors.forEach((message, index) => {
    items.push({
      id: `validation-${index + 1}`,
      type: classifyRecoveryItem(message),
      severity: "error",
      title: "校验错误",
      message: String(message || "未知校验错误"),
      actions: ["show-report", "replace-node", "remove-node"],
    });
  });

  Object.values(runSession.nodeStates || {}).forEach((state) => {
    if (state.status !== "failed" || !state.error) {
      return;
    }
    items.push({
      id: `node-${state.nodeId}`,
      type: classifyRecoveryItem(
        state.error?.message || state.error?.code || "",
      ),
      severity: "error",
      nodeId: state.nodeId,
      title: "节点执行失败",
      message: state.error?.message || "未知节点错误",
      actions: ["show-report", "replace-node", "remove-node"],
    });
  });

  if (runSession.error) {
    items.push({
      id: "run-error",
      type: classifyRecoveryItem(
        runSession.error?.message || runSession.error?.code || "",
      ),
      severity: "error",
      title: "运行失败",
      message: runSession.error?.message || "未知运行错误",
      actions: ["show-report", "rerun"],
    });
  }

  const summary = {
    missingNodes: items.filter((item) => item.type === "missing-node").length,
    missingResources: items.filter((item) => item.type === "missing-resource")
      .length,
    executionFailures: items.filter((item) => item.type === "execution-failure")
      .length,
    total: items.length,
  };

  return {
    runSessionId: runSession.runSessionId,
    status: items.length ? "needs-follow-up" : "clear",
    generatedAt: new Date().toISOString(),
    summary,
    items,
  };
};

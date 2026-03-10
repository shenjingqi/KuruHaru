const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  maxParallel: 1,
  failFast: true,
  timeoutMs: 0,
  dispatchMode: "single",
  batchSize: 50,
  emitPerItem: false,
});

const toSafeInteger = (
  rawValue,
  fallbackValue,
  { min = 0, max = 999999 } = {},
) => {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    return fallbackValue;
  }
  return Math.max(min, Math.min(max, parsed));
};

const toSafeBoolean = (rawValue, fallbackValue) => {
  if (typeof rawValue === "boolean") {
    return rawValue;
  }
  return fallbackValue;
};

const toSafeDispatchMode = (rawValue, fallbackValue) => {
  const normalized = String(rawValue || "")
    .trim()
    .toLowerCase();
  if (["single", "batch", "fanout"].includes(normalized)) {
    return normalized;
  }
  return fallbackValue;
};

const normalizePosition = (rawPosition, index) => {
  const fallbackX = 120 + index * 36;
  const fallbackY = 120 + index * 24;

  if (!rawPosition || typeof rawPosition !== "object") {
    return { x: fallbackX, y: fallbackY };
  }

  const x = Number(rawPosition.x);
  const y = Number(rawPosition.y);

  return {
    x: Number.isFinite(x) ? Math.round(x) : fallbackX,
    y: Number.isFinite(y) ? Math.round(y) : fallbackY,
  };
};

const normalizeNode = (rawNode, index) => {
  const node = rawNode && typeof rawNode === "object" ? rawNode : {};
  const fallbackId = `node-${index + 1}`;
  const type =
    typeof node.type === "string" && node.type.trim()
      ? node.type.trim()
      : "input.manual";

  return {
    id:
      typeof node.id === "string" && node.id.trim()
        ? node.id.trim()
        : fallbackId,
    type,
    label:
      typeof node.label === "string" && node.label.trim()
        ? node.label.trim()
        : type,
    position: normalizePosition(node.position, index),
    config:
      node.config &&
      typeof node.config === "object" &&
      !Array.isArray(node.config)
        ? JSON.parse(JSON.stringify(node.config))
        : {},
  };
};

const normalizeEdge = (rawEdge, index) => {
  const edge = rawEdge && typeof rawEdge === "object" ? rawEdge : {};
  const source =
    typeof edge.source === "string" && edge.source.trim()
      ? edge.source.trim()
      : "";
  const target =
    typeof edge.target === "string" && edge.target.trim()
      ? edge.target.trim()
      : "";

  const fallbackId =
    source && target ? `${source}->${target}` : `edge-${index + 1}`;

  return {
    id:
      typeof edge.id === "string" && edge.id.trim()
        ? edge.id.trim()
        : fallbackId,
    source,
    target,
    sourcePort:
      typeof edge.sourcePort === "string" && edge.sourcePort.trim()
        ? edge.sourcePort.trim()
        : "output",
    targetPort:
      typeof edge.targetPort === "string" && edge.targetPort.trim()
        ? edge.targetPort.trim()
        : "input",
  };
};

const normalizeTags = (rawTags) => {
  if (!Array.isArray(rawTags)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  rawTags.forEach((item) => {
    if (typeof item !== "string") {
      return;
    }

    const next = item.trim();
    if (!next) {
      return;
    }

    if (!seen.has(next)) {
      seen.add(next);
      normalized.push(next);
    }
  });

  return normalized;
};

export const normalizeWorkflowRuntimeConfig = (rawRuntime = {}) => {
  const runtime =
    rawRuntime && typeof rawRuntime === "object" && !Array.isArray(rawRuntime)
      ? rawRuntime
      : {};

  return {
    maxParallel: toSafeInteger(
      runtime.maxParallel,
      DEFAULT_RUNTIME_CONFIG.maxParallel,
      {
        min: 1,
        max: 16,
      },
    ),
    failFast: toSafeBoolean(runtime.failFast, DEFAULT_RUNTIME_CONFIG.failFast),
    timeoutMs: toSafeInteger(
      runtime.timeoutMs,
      DEFAULT_RUNTIME_CONFIG.timeoutMs,
      {
        min: 0,
        max: 24 * 60 * 60 * 1000,
      },
    ),
    dispatchMode: toSafeDispatchMode(
      runtime.dispatchMode,
      DEFAULT_RUNTIME_CONFIG.dispatchMode,
    ),
    batchSize: toSafeInteger(
      runtime.batchSize,
      DEFAULT_RUNTIME_CONFIG.batchSize,
      {
        min: 1,
        max: 500,
      },
    ),
    emitPerItem: toSafeBoolean(
      runtime.emitPerItem,
      DEFAULT_RUNTIME_CONFIG.emitPerItem,
    ),
  };
};

export const normalizeWorkflowDefinition = (rawWorkflow = {}) => {
  const workflow =
    rawWorkflow &&
    typeof rawWorkflow === "object" &&
    !Array.isArray(rawWorkflow)
      ? rawWorkflow
      : {};
  const graph =
    workflow.graph &&
    typeof workflow.graph === "object" &&
    !Array.isArray(workflow.graph)
      ? workflow.graph
      : {};

  const nodes = Array.isArray(graph.nodes)
    ? graph.nodes.map(normalizeNode)
    : [];
  const edges = Array.isArray(graph.edges)
    ? graph.edges.map(normalizeEdge)
    : [];

  const nowIso = new Date().toISOString();

  return {
    id:
      typeof workflow.id === "string" && workflow.id.trim()
        ? workflow.id.trim()
        : "",
    name:
      typeof workflow.name === "string" && workflow.name.trim()
        ? workflow.name.trim()
        : "未命名工作流",
    version:
      typeof workflow.version === "string" && workflow.version.trim()
        ? workflow.version.trim()
        : "1.0.0",
    description:
      typeof workflow.description === "string"
        ? workflow.description.trim()
        : "",
    tags: normalizeTags(workflow.tags),
    graph: {
      nodes,
      edges,
    },
    runtime: normalizeWorkflowRuntimeConfig(workflow.runtime),
    createdAt:
      typeof workflow.createdAt === "string" && workflow.createdAt.trim()
        ? workflow.createdAt
        : nowIso,
    updatedAt:
      typeof workflow.updatedAt === "string" && workflow.updatedAt.trim()
        ? workflow.updatedAt
        : nowIso,
  };
};

export const summarizeWorkflowDefinition = (workflow) => {
  const normalized = normalizeWorkflowDefinition(workflow);
  return {
    id: normalized.id,
    name: normalized.name,
    version: normalized.version,
    description: normalized.description,
    tags: normalized.tags,
    updatedAt: normalized.updatedAt,
    createdAt: normalized.createdAt,
    nodeCount: normalized.graph.nodes.length,
    edgeCount: normalized.graph.edges.length,
  };
};

export const getDefaultWorkflowRuntimeConfig = () => ({
  ...DEFAULT_RUNTIME_CONFIG,
});

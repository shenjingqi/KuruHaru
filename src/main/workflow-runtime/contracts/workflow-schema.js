const DEFAULT_RUNTIME_CONFIG = Object.freeze({
  maxParallel: 1,
  failFast: true,
  timeoutMs: 0,
  dispatchMode: "single",
  batchSize: 50,
  emitPerItem: false,
});

const isRecord = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cloneJsonValue = (value, fallbackValue = {}) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallbackValue;
  }
};

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

  if (!isRecord(rawPosition)) {
    return { x: fallbackX, y: fallbackY };
  }

  const x = Number(rawPosition.x);
  const y = Number(rawPosition.y);

  return {
    x: Number.isFinite(x) ? Math.round(x) : fallbackX,
    y: Number.isFinite(y) ? Math.round(y) : fallbackY,
  };
};

const normalizeSize = (rawSize) => {
  if (!isRecord(rawSize)) {
    return undefined;
  }

  const width = Number(rawSize.width);
  const height = Number(rawSize.height);
  const normalized = {};

  if (Number.isFinite(width)) {
    normalized.width = Math.max(1, Math.round(width));
  }
  if (Number.isFinite(height)) {
    normalized.height = Math.max(1, Math.round(height));
  }

  return Object.keys(normalized).length ? normalized : undefined;
};

const normalizeNode = (rawNode, index) => {
  const node = isRecord(rawNode) ? rawNode : {};
  const fallbackId = `node-${index + 1}`;
  const type =
    typeof node.type === "string" && node.type.trim()
      ? node.type.trim()
      : "input.manual";

  const normalized = {
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
    config: isRecord(node.config) ? cloneJsonValue(node.config, {}) : {},
  };

  const nodeSize = normalizeSize(node.size);
  if (nodeSize) {
    normalized.size = nodeSize;
  }

  if (isRecord(node.appearance)) {
    normalized.appearance = cloneJsonValue(node.appearance, {});
  }

  if (isRecord(node.widgets_values)) {
    normalized.widgets_values = cloneJsonValue(node.widgets_values, {});
  }

  return normalized;
};

const normalizeLink = (rawLink, index) => {
  const link = isRecord(rawLink) ? rawLink : {};
  const source =
    typeof link.source === "string" && link.source.trim()
      ? link.source.trim()
      : "";
  const target =
    typeof link.target === "string" && link.target.trim()
      ? link.target.trim()
      : "";

  const fallbackId =
    source && target ? `${source}->${target}` : `edge-${index + 1}`;

  return {
    id:
      typeof link.id === "string" && link.id.trim()
        ? link.id.trim()
        : fallbackId,
    source,
    target,
    sourcePort:
      typeof link.sourcePort === "string" && link.sourcePort.trim()
        ? link.sourcePort.trim()
        : typeof link.output === "string" && link.output.trim()
          ? link.output.trim()
          : "output",
    targetPort:
      typeof link.targetPort === "string" && link.targetPort.trim()
        ? link.targetPort.trim()
        : typeof link.input === "string" && link.input.trim()
          ? link.input.trim()
          : "input",
    type:
      typeof link.type === "string" && link.type.trim()
        ? link.type.trim()
        : "default",
  };
};

const normalizeArrayRecordList = (value) =>
  Array.isArray(value)
    ? value
        .filter((item) => isRecord(item))
        .map((item) => cloneJsonValue(item, {}))
    : [];

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
  const runtime = isRecord(rawRuntime) ? rawRuntime : {};

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

export const normalizeWorkflowGraphV2 = (rawWorkflow = {}) => {
  const workflow = isRecord(rawWorkflow) ? rawWorkflow : {};
  const graph = isRecord(workflow.graph) ? workflow.graph : {};

  const nodesSource = Array.isArray(workflow.nodes)
    ? workflow.nodes
    : Array.isArray(graph.nodes)
      ? graph.nodes
      : [];

  const linksSource = Array.isArray(workflow.links)
    ? workflow.links
    : Array.isArray(graph.links)
      ? graph.links
      : Array.isArray(graph.edges)
        ? graph.edges
        : [];

  return {
    nodes: nodesSource.map(normalizeNode),
    links: linksSource.map(normalizeLink),
    groups: normalizeArrayRecordList(
      Array.isArray(workflow.groups)
        ? workflow.groups
        : Array.isArray(graph.groups)
          ? graph.groups
          : [],
    ),
    reroutes: normalizeArrayRecordList(
      Array.isArray(workflow.reroutes)
        ? workflow.reroutes
        : Array.isArray(graph.reroutes)
          ? graph.reroutes
          : [],
    ),
    floatingLinks: normalizeArrayRecordList(
      Array.isArray(workflow.floatingLinks)
        ? workflow.floatingLinks
        : Array.isArray(graph.floatingLinks)
          ? graph.floatingLinks
          : [],
    ),
    state: isRecord(workflow.state)
      ? cloneJsonValue(workflow.state, {})
      : isRecord(graph.state)
        ? cloneJsonValue(graph.state, {})
        : {},
    extra: isRecord(workflow.extra)
      ? cloneJsonValue(workflow.extra, {})
      : isRecord(graph.extra)
        ? cloneJsonValue(graph.extra, {})
        : {},
    definitions: isRecord(workflow.definitions)
      ? cloneJsonValue(workflow.definitions, {})
      : isRecord(graph.definitions)
        ? cloneJsonValue(graph.definitions, {})
        : {},
  };
};

const resolveSchemaVersion = (workflow) => {
  const explicitSchemaVersion = Number(workflow?.schemaVersion);
  if (explicitSchemaVersion === 1) {
    return 1;
  }

  if (explicitSchemaVersion >= 2) {
    return 2;
  }

  if (
    typeof workflow?.formatVersion === "string" &&
    workflow.formatVersion.trim()
  ) {
    const formatVersion = workflow.formatVersion.trim();
    if (/^1(\.\d+)?$/.test(formatVersion)) {
      return 1;
    }
    if (/^2(\.\d+)?$/.test(formatVersion)) {
      return 2;
    }
  }

  const graph = isRecord(workflow?.graph) ? workflow.graph : {};
  const hasTopLevelV2Fields =
    Array.isArray(workflow?.nodes) ||
    Array.isArray(workflow?.links) ||
    Array.isArray(workflow?.groups) ||
    Array.isArray(workflow?.reroutes) ||
    Array.isArray(workflow?.floatingLinks) ||
    isRecord(workflow?.state) ||
    isRecord(workflow?.extra) ||
    isRecord(workflow?.definitions);

  const hasGraphV2Fields =
    Array.isArray(graph.links) ||
    Array.isArray(graph.groups) ||
    Array.isArray(graph.reroutes) ||
    Array.isArray(graph.floatingLinks) ||
    isRecord(graph.state) ||
    isRecord(graph.extra) ||
    isRecord(graph.definitions);

  if (hasTopLevelV2Fields || hasGraphV2Fields) {
    return 2;
  }

  return 1;
};

export const normalizeWorkflowDefinition = (rawWorkflow = {}) => {
  const workflow = isRecord(rawWorkflow) ? rawWorkflow : {};
  const graphV2 = normalizeWorkflowGraphV2(workflow);

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
    schemaVersion: resolveSchemaVersion(workflow),
    description:
      typeof workflow.description === "string"
        ? workflow.description.trim()
        : "",
    tags: normalizeTags(workflow.tags),
    nodes: cloneJsonValue(graphV2.nodes, []),
    links: cloneJsonValue(graphV2.links, []),
    groups: cloneJsonValue(graphV2.groups, []),
    reroutes: cloneJsonValue(graphV2.reroutes, []),
    floatingLinks: cloneJsonValue(graphV2.floatingLinks, []),
    state: cloneJsonValue(graphV2.state, {}),
    extra: cloneJsonValue(graphV2.extra, {}),
    definitions: cloneJsonValue(graphV2.definitions, {}),
    graph: {
      nodes: cloneJsonValue(graphV2.nodes, []),
      edges: cloneJsonValue(graphV2.links, []),
      links: cloneJsonValue(graphV2.links, []),
      groups: cloneJsonValue(graphV2.groups, []),
      reroutes: cloneJsonValue(graphV2.reroutes, []),
      floatingLinks: cloneJsonValue(graphV2.floatingLinks, []),
      state: cloneJsonValue(graphV2.state, {}),
      extra: cloneJsonValue(graphV2.extra, {}),
      definitions: cloneJsonValue(graphV2.definitions, {}),
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

export const migrateWorkflowV1ToV2 = (rawWorkflow = {}) => {
  const normalized = normalizeWorkflowDefinition(rawWorkflow);
  return {
    ...normalized,
    schemaVersion: 2,
    nodes: cloneJsonValue(normalized.nodes, []),
    links: cloneJsonValue(normalized.links, []),
    groups: cloneJsonValue(normalized.groups, []),
    reroutes: cloneJsonValue(normalized.reroutes, []),
    floatingLinks: cloneJsonValue(normalized.floatingLinks, []),
    state: cloneJsonValue(normalized.state, {}),
    extra: cloneJsonValue(normalized.extra, {}),
    definitions: cloneJsonValue(normalized.definitions, {}),
    graph: {
      nodes: cloneJsonValue(normalized.nodes, []),
      edges: cloneJsonValue(normalized.links, []),
      links: cloneJsonValue(normalized.links, []),
      groups: cloneJsonValue(normalized.groups, []),
      reroutes: cloneJsonValue(normalized.reroutes, []),
      floatingLinks: cloneJsonValue(normalized.floatingLinks, []),
      state: cloneJsonValue(normalized.state, {}),
      extra: cloneJsonValue(normalized.extra, {}),
      definitions: cloneJsonValue(normalized.definitions, {}),
    },
  };
};

export const exportWorkflowV2ToV1 = (rawWorkflow = {}) => {
  const normalized = normalizeWorkflowDefinition(rawWorkflow);

  return {
    id: normalized.id,
    name: normalized.name,
    version: normalized.version,
    description: normalized.description,
    tags: cloneJsonValue(normalized.tags, []),
    graph: {
      nodes: cloneJsonValue(normalized.graph.nodes, []),
      edges: cloneJsonValue(normalized.graph.edges, []),
    },
    runtime: cloneJsonValue(normalized.runtime, {}),
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    schemaVersion: 1,
  };
};

const toNormalizedNodeId = (rawValue, fallbackValue) => {
  if (typeof rawValue === "string" && rawValue.trim()) {
    return rawValue.trim();
  }

  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return String(Math.trunc(rawValue));
  }

  return fallbackValue;
};

const normalizeComfyPosition = (rawPosition, index) => {
  if (Array.isArray(rawPosition)) {
    const x = Number(rawPosition[0]);
    const y = Number(rawPosition[1]);
    return {
      x: Number.isFinite(x) ? Math.round(x) : 120 + index * 36,
      y: Number.isFinite(y) ? Math.round(y) : 120 + index * 24,
    };
  }

  if (isRecord(rawPosition)) {
    return normalizePosition(rawPosition, index);
  }

  return normalizePosition({}, index);
};

const normalizeComfySize = (rawSize) => {
  if (Array.isArray(rawSize)) {
    const width = Number(rawSize[0]);
    const height = Number(rawSize[1]);
    const normalized = {};
    if (Number.isFinite(width)) {
      normalized.width = Math.max(1, Math.round(width));
    }
    if (Number.isFinite(height)) {
      normalized.height = Math.max(1, Math.round(height));
    }
    return Object.keys(normalized).length ? normalized : undefined;
  }

  return normalizeSize(rawSize);
};

const resolveComfySlotName = (rawSlots, slotIndex, fallbackPrefix) => {
  const numericIndex = Number.parseInt(slotIndex, 10);
  if (!Number.isFinite(numericIndex) || numericIndex < 0) {
    return fallbackPrefix;
  }

  if (!Array.isArray(rawSlots) || numericIndex >= rawSlots.length) {
    return `${fallbackPrefix}_${numericIndex}`;
  }

  const slotDef = rawSlots[numericIndex];
  if (
    Array.isArray(slotDef) &&
    typeof slotDef[0] === "string" &&
    slotDef[0].trim()
  ) {
    return slotDef[0].trim();
  }

  if (
    isRecord(slotDef) &&
    typeof slotDef.name === "string" &&
    slotDef.name.trim()
  ) {
    return slotDef.name.trim();
  }

  return `${fallbackPrefix}_${numericIndex}`;
};

const toPortIndex = (rawPort) => {
  const direct = Number.parseInt(rawPort, 10);
  if (Number.isFinite(direct)) {
    return Math.max(0, direct);
  }

  const normalized = String(rawPort || "").trim();
  if (!normalized) {
    return 0;
  }

  const matched = normalized.match(/(\d+)$/);
  if (!matched) {
    return 0;
  }

  return Number.parseInt(matched[1], 10) || 0;
};

const resolveComfyNodeIdForExport = (rawValue, fallbackValue) => {
  const parsed = Number.parseInt(String(rawValue || ""), 10);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallbackValue;
};

export const convertComfyWorkflowToInternal = (rawComfyWorkflow = {}) => {
  const comfyWorkflow = isRecord(rawComfyWorkflow) ? rawComfyWorkflow : {};
  const rawNodes = Array.isArray(comfyWorkflow.nodes)
    ? comfyWorkflow.nodes
    : [];

  const slotMap = new Map();
  rawNodes.forEach((rawNode, index) => {
    const node = isRecord(rawNode) ? rawNode : {};
    const nodeId = toNormalizedNodeId(node.id, `node-${index + 1}`);
    slotMap.set(nodeId, {
      inputs: Array.isArray(node.inputs) ? node.inputs : [],
      outputs: Array.isArray(node.outputs) ? node.outputs : [],
    });
  });

  const nodes = rawNodes.map((rawNode, index) => {
    const node = isRecord(rawNode) ? rawNode : {};
    const nodeId = toNormalizedNodeId(node.id, `node-${index + 1}`);
    const nodeType =
      typeof node.type === "string" && node.type.trim()
        ? node.type.trim()
        : typeof node.class_type === "string" && node.class_type.trim()
          ? node.class_type.trim()
          : "input.manual";
    const config = {};
    if (Array.isArray(node.widgets_values)) {
      config.widgetsValues = cloneJsonValue(node.widgets_values, []);
    }
    if (isRecord(node.properties)) {
      config.properties = cloneJsonValue(node.properties, {});
    }
    if (isRecord(node.flags)) {
      config.flags = cloneJsonValue(node.flags, {});
    }
    if (node.mode !== undefined && node.mode !== null) {
      config.mode = node.mode;
    }

    const normalizedNode = {
      id: nodeId,
      type: nodeType,
      label:
        typeof node.title === "string" && node.title.trim()
          ? node.title.trim()
          : typeof node.label === "string" && node.label.trim()
            ? node.label.trim()
            : nodeType,
      position: normalizeComfyPosition(node.pos || node.position, index),
      config,
    };

    const nodeSize = normalizeComfySize(node.size);
    if (nodeSize) {
      normalizedNode.size = nodeSize;
    }

    return normalizedNode;
  });

  const linksSource = Array.isArray(comfyWorkflow.links)
    ? comfyWorkflow.links
    : [];
  const links = linksSource
    .map((rawLink, index) => {
      const linkId = `edge-${index + 1}`;

      if (Array.isArray(rawLink)) {
        const sourceId = toNormalizedNodeId(rawLink[1], "");
        const targetId = toNormalizedNodeId(rawLink[3], "");
        const sourceSlots = slotMap.get(sourceId)?.outputs || [];
        const targetSlots = slotMap.get(targetId)?.inputs || [];
        return normalizeLink(
          {
            id:
              typeof rawLink[0] === "string" && rawLink[0].trim()
                ? rawLink[0].trim()
                : String(rawLink[0] || linkId),
            source: sourceId,
            target: targetId,
            sourcePort: resolveComfySlotName(sourceSlots, rawLink[2], "output"),
            targetPort: resolveComfySlotName(targetSlots, rawLink[4], "input"),
            type:
              typeof rawLink[5] === "string" && rawLink[5].trim()
                ? rawLink[5].trim()
                : "default",
          },
          index,
        );
      }

      const link = isRecord(rawLink) ? rawLink : {};
      const sourceId = toNormalizedNodeId(link.source ?? link.origin_id, "");
      const targetId = toNormalizedNodeId(link.target ?? link.target_id, "");
      const sourceSlots = slotMap.get(sourceId)?.outputs || [];
      const targetSlots = slotMap.get(targetId)?.inputs || [];

      const rawSourcePort =
        link.sourcePort ?? link.origin_slot ?? link.output ?? "";
      const rawTargetPort =
        link.targetPort ?? link.target_slot ?? link.input ?? "";

      return normalizeLink(
        {
          id:
            typeof link.id === "string" && link.id.trim()
              ? link.id.trim()
              : String(link.id || linkId),
          source: sourceId,
          target: targetId,
          sourcePort:
            typeof rawSourcePort === "string" && rawSourcePort.trim()
              ? rawSourcePort.trim()
              : resolveComfySlotName(sourceSlots, rawSourcePort, "output"),
          targetPort:
            typeof rawTargetPort === "string" && rawTargetPort.trim()
              ? rawTargetPort.trim()
              : resolveComfySlotName(targetSlots, rawTargetPort, "input"),
          type:
            typeof link.type === "string" && link.type.trim()
              ? link.type.trim()
              : "default",
        },
        index,
      );
    })
    .filter((link) => link.source && link.target);

  const nextExtra = isRecord(comfyWorkflow.extra)
    ? cloneJsonValue(comfyWorkflow.extra, {})
    : {};
  nextExtra.comfy = {
    ...(isRecord(nextExtra.comfy) ? nextExtra.comfy : {}),
    origin: "workflow",
    lastNodeId: comfyWorkflow.last_node_id ?? comfyWorkflow.lastNodeId ?? null,
    lastLinkId: comfyWorkflow.last_link_id ?? comfyWorkflow.lastLinkId ?? null,
  };

  return normalizeWorkflowDefinition({
    id:
      typeof comfyWorkflow.id === "string" && comfyWorkflow.id.trim()
        ? comfyWorkflow.id.trim()
        : "",
    name:
      typeof comfyWorkflow.name === "string" && comfyWorkflow.name.trim()
        ? comfyWorkflow.name.trim()
        : "Comfy Workflow",
    version:
      typeof comfyWorkflow.version === "string" && comfyWorkflow.version.trim()
        ? comfyWorkflow.version.trim()
        : "1.0.0",
    schemaVersion: 2,
    nodes,
    links,
    groups: normalizeArrayRecordList(comfyWorkflow.groups),
    reroutes: normalizeArrayRecordList(comfyWorkflow.reroutes),
    floatingLinks: normalizeArrayRecordList(
      comfyWorkflow.floatingLinks || comfyWorkflow.floating_links,
    ),
    state: isRecord(comfyWorkflow.state)
      ? cloneJsonValue(comfyWorkflow.state, {})
      : {},
    extra: nextExtra,
    definitions: isRecord(comfyWorkflow.definitions)
      ? cloneJsonValue(comfyWorkflow.definitions, {})
      : {},
  });
};

export const convertComfyWorkflowApiToInternal = (rawWorkflowApi = {}) => {
  const workflowApi = isRecord(rawWorkflowApi) ? rawWorkflowApi : {};
  const nodeEntries = Object.entries(workflowApi).filter(([, value]) =>
    isRecord(value),
  );

  const nodes = nodeEntries.map(([nodeKey, rawNode], index) => {
    const node = isRecord(rawNode) ? rawNode : {};
    const type =
      typeof node.class_type === "string" && node.class_type.trim()
        ? node.class_type.trim()
        : "input.manual";

    const staticInputs = {};
    if (isRecord(node.inputs)) {
      Object.entries(node.inputs).forEach(([inputKey, inputValue]) => {
        if (Array.isArray(inputValue) && inputValue.length >= 2) {
          return;
        }
        staticInputs[inputKey] = cloneJsonValue(inputValue, inputValue);
      });
    }

    const config = {};
    if (Object.keys(staticInputs).length > 0) {
      config.params = staticInputs;
    }

    return {
      id: toNormalizedNodeId(nodeKey, `node-${index + 1}`),
      type,
      label:
        typeof node?._meta?.title === "string" && node._meta.title.trim()
          ? node._meta.title.trim()
          : type,
      position: normalizePosition({}, index),
      config,
    };
  });

  const links = [];
  nodeEntries.forEach(([targetNodeKey, rawNode]) => {
    const node = isRecord(rawNode) ? rawNode : {};
    if (!isRecord(node.inputs)) {
      return;
    }

    Object.entries(node.inputs).forEach(([inputName, inputValue]) => {
      if (!Array.isArray(inputValue) || inputValue.length < 2) {
        return;
      }

      const sourceNodeId = toNormalizedNodeId(inputValue[0], "");
      if (!sourceNodeId) {
        return;
      }

      const sourcePortIndex = toPortIndex(inputValue[1]);
      links.push(
        normalizeLink(
          {
            id: `edge-${links.length + 1}`,
            source: sourceNodeId,
            target: toNormalizedNodeId(targetNodeKey, ""),
            sourcePort: `output_${sourcePortIndex}`,
            targetPort:
              typeof inputName === "string" && inputName.trim()
                ? inputName.trim()
                : "input",
            type: "default",
          },
          links.length,
        ),
      );
    });
  });

  return normalizeWorkflowDefinition({
    name: "Comfy Workflow API",
    schemaVersion: 2,
    nodes,
    links,
    extra: {
      comfy: {
        origin: "workflow_api",
      },
    },
  });
};

export const convertInternalToComfyWorkflow = (rawWorkflow = {}) => {
  const normalized = normalizeWorkflowDefinition(rawWorkflow);
  const nodeIdMap = new Map();

  const comfyNodes = normalized.nodes.map((node, index) => {
    const comfyNodeId = resolveComfyNodeIdForExport(node.id, index + 1);
    nodeIdMap.set(node.id, comfyNodeId);

    const config = isRecord(node.config) ? node.config : {};
    const comfyNode = {
      id: comfyNodeId,
      type: node.type,
      pos: [Number(node?.position?.x || 0), Number(node?.position?.y || 0)],
      size: [
        Number(node?.size?.width || 220),
        Number(node?.size?.height || 120),
      ],
      title:
        typeof node.label === "string" && node.label.trim()
          ? node.label.trim()
          : node.type,
    };

    if (Array.isArray(config.widgetsValues)) {
      comfyNode.widgets_values = cloneJsonValue(config.widgetsValues, []);
    }

    if (isRecord(config.properties)) {
      comfyNode.properties = cloneJsonValue(config.properties, {});
    }

    if (isRecord(config.flags)) {
      comfyNode.flags = cloneJsonValue(config.flags, {});
    }

    if (config.mode !== undefined && config.mode !== null) {
      comfyNode.mode = config.mode;
    }

    return comfyNode;
  });

  const comfyLinks = normalized.links.map((link, index) => [
    index + 1,
    nodeIdMap.get(link.source) ||
      resolveComfyNodeIdForExport(link.source, index + 1),
    toPortIndex(link.sourcePort),
    nodeIdMap.get(link.target) ||
      resolveComfyNodeIdForExport(link.target, index + 1),
    toPortIndex(link.targetPort),
    typeof link.type === "string" && link.type.trim()
      ? link.type.trim()
      : "default",
  ]);

  const numericNodeIds = [...nodeIdMap.values()].filter((value) =>
    Number.isFinite(Number(value)),
  );
  const lastNodeId = numericNodeIds.length
    ? Math.max(...numericNodeIds.map((value) => Number(value)))
    : comfyNodes.length;

  return {
    last_node_id: lastNodeId,
    last_link_id: comfyLinks.length,
    nodes: comfyNodes,
    links: comfyLinks,
    groups: cloneJsonValue(normalized.groups, []),
    reroutes: cloneJsonValue(normalized.reroutes, []),
    floating_links: cloneJsonValue(normalized.floatingLinks, []),
    state: cloneJsonValue(normalized.state, {}),
    extra: cloneJsonValue(normalized.extra, {}),
    version: normalized.version || "1.0.0",
  };
};

export const convertInternalToComfyWorkflowApi = (rawWorkflow = {}) => {
  const normalized = normalizeWorkflowDefinition(rawWorkflow);
  const workflowApi = {};

  normalized.nodes.forEach((node) => {
    const config = isRecord(node.config) ? node.config : {};
    const inputs = {};

    if (isRecord(config.params)) {
      Object.entries(config.params).forEach(([key, value]) => {
        inputs[key] = cloneJsonValue(value, value);
      });
    }

    workflowApi[node.id] = {
      class_type: node.type,
      inputs,
      _meta: {
        title:
          typeof node.label === "string" && node.label.trim()
            ? node.label.trim()
            : node.type,
      },
    };
  });

  normalized.links.forEach((link) => {
    const targetNode = workflowApi[link.target];
    if (!targetNode) {
      return;
    }

    const targetPort =
      typeof link.targetPort === "string" && link.targetPort.trim()
        ? link.targetPort.trim()
        : "input";

    targetNode.inputs[targetPort] = [link.source, toPortIndex(link.sourcePort)];
  });

  return workflowApi;
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
    schemaVersion: normalized.schemaVersion,
  };
};

export const getDefaultWorkflowRuntimeConfig = () => ({
  ...DEFAULT_RUNTIME_CONFIG,
});

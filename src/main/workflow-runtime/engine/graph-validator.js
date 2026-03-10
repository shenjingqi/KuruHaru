const createNodeIndex = (nodes) => {
  const nodeMap = new Map();
  const duplicateIds = [];

  nodes.forEach((node) => {
    const nodeId = node?.id;
    if (!nodeId) {
      return;
    }

    if (nodeMap.has(nodeId)) {
      duplicateIds.push(nodeId);
      return;
    }

    nodeMap.set(nodeId, node);
  });

  return { nodeMap, duplicateIds };
};

const createAdjacencyState = (nodeMap, edges) => {
  const indegreeMap = new Map();
  const adjacencyMap = new Map();

  nodeMap.forEach((_node, nodeId) => {
    indegreeMap.set(nodeId, 0);
    adjacencyMap.set(nodeId, []);
  });

  edges.forEach((edge) => {
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) {
      return;
    }

    indegreeMap.set(edge.target, (indegreeMap.get(edge.target) || 0) + 1);
    adjacencyMap.get(edge.source).push(edge.target);
  });

  return { indegreeMap, adjacencyMap };
};

const buildTopologicalOrder = (nodeMap, edges) => {
  const { indegreeMap, adjacencyMap } = createAdjacencyState(nodeMap, edges);
  const queue = [];

  indegreeMap.forEach((indegree, nodeId) => {
    if (indegree === 0) {
      queue.push(nodeId);
    }
  });

  const order = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    order.push(nodeId);

    const outgoing = adjacencyMap.get(nodeId) || [];
    outgoing.forEach((targetId) => {
      const nextDegree = (indegreeMap.get(targetId) || 0) - 1;
      indegreeMap.set(targetId, nextDegree);
      if (nextDegree === 0) {
        queue.push(targetId);
      }
    });
  }

  return order;
};

const buildIncomingEdgeMap = (edges) => {
  const incomingEdgeMap = new Map();

  edges.forEach((edge) => {
    if (!incomingEdgeMap.has(edge.target)) {
      incomingEdgeMap.set(edge.target, []);
    }
    incomingEdgeMap.get(edge.target).push(edge);
  });

  return incomingEdgeMap;
};

export const validateWorkflowGraph = ({ workflow, nodeRegistry }) => {
  const graph = workflow?.graph || {};
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const errors = [];
  const warnings = [];

  if (nodes.length === 0) {
    errors.push("工作流图中至少需要一个节点");
  }

  const { nodeMap, duplicateIds } = createNodeIndex(nodes);
  if (duplicateIds.length > 0) {
    errors.push(`存在重复节点 ID: ${[...new Set(duplicateIds)].join(", ")}`);
  }

  nodes.forEach((node) => {
    if (!node?.id) {
      errors.push("存在缺少 id 的节点");
      return;
    }

    if (!node?.type) {
      errors.push(`节点 ${node.id} 缺少 type`);
      return;
    }

    if (!nodeRegistry.has(node.type)) {
      errors.push(`节点 ${node.id} 使用了未注册类型: ${node.type}`);
      return;
    }

    const nodeDefinition = nodeRegistry.get(node.type);
    if (typeof nodeDefinition?.validateConfig === "function") {
      const configErrors = nodeDefinition.validateConfig(
        node.config || {},
        node,
      );
      if (Array.isArray(configErrors) && configErrors.length > 0) {
        configErrors.forEach((item) => {
          if (!item) {
            return;
          }
          errors.push(`节点 ${node.id}(${node.type}) 配置错误: ${item}`);
        });
      }
    }
  });

  const edgeIdSet = new Set();
  edges.forEach((edge) => {
    if (!edge?.source || !edge?.target) {
      errors.push(
        `存在 source/target 不完整的边: ${edge?.id || "unknown-edge"}`,
      );
      return;
    }

    if (!nodeMap.has(edge.source)) {
      errors.push(`边 ${edge.id} 的 source 节点不存在: ${edge.source}`);
    }
    if (!nodeMap.has(edge.target)) {
      errors.push(`边 ${edge.id} 的 target 节点不存在: ${edge.target}`);
    }

    if (edge.source === edge.target) {
      errors.push(`边 ${edge.id} 不能自环 (${edge.source} -> ${edge.target})`);
    }

    const edgeKey = `${edge.source}:${edge.target}:${edge.sourcePort || ""}:${edge.targetPort || ""}`;
    if (edgeIdSet.has(edgeKey)) {
      warnings.push(`检测到重复边定义: ${edge.source} -> ${edge.target}`);
    }
    edgeIdSet.add(edgeKey);
  });

  const filteredEdges = edges.filter(
    (edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target),
  );
  const order = buildTopologicalOrder(nodeMap, filteredEdges);
  if (order.length !== nodeMap.size) {
    errors.push("工作流图存在环路，当前版本仅支持 DAG");
  }

  const incomingEdgeMap = buildIncomingEdgeMap(filteredEdges);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    order,
    nodeMap,
    incomingEdgeMap,
  };
};

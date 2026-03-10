import { CORE_NODE_DEFINITIONS } from "./adapters/core.adapter";
import { TOOL_NODE_DEFINITIONS } from "./adapters/tools.adapter";

const NODE_DEFINITIONS = [...TOOL_NODE_DEFINITIONS, ...CORE_NODE_DEFINITIONS];

const NODE_REGISTRY = new Map();
NODE_DEFINITIONS.forEach((nodeDef) => {
  NODE_REGISTRY.set(nodeDef.type, nodeDef);
});

const cloneValue = (value) => JSON.parse(JSON.stringify(value));

export const getWorkflowNodeRegistry = () => NODE_REGISTRY;

export const listWorkflowNodeDefinitions = () =>
  NODE_DEFINITIONS.map((nodeDef) => ({
    type: nodeDef.type,
    label: nodeDef.label,
    category: nodeDef.category,
    description: nodeDef.description || "",
    defaultConfig: cloneValue(nodeDef.defaultConfig || {}),
  }));

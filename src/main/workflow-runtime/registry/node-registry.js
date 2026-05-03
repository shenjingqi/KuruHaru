import { CORE_NODE_DEFINITIONS } from './adapters/core.adapter';
import { TOOL_NODE_DEFINITIONS } from './adapters/tools.adapter';

const NODE_DEFINITIONS = [...TOOL_NODE_DEFINITIONS, ...CORE_NODE_DEFINITIONS];

const NODE_REGISTRY = new Map();
NODE_DEFINITIONS.forEach((nodeDef) => {
  NODE_REGISTRY.set(nodeDef.type, nodeDef);
});

const cloneValue = (value, fallbackValue = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallbackValue;
  }
};

const inferWidgetKind = (key, value) => {
  const normalizedKey = String(key || '').trim().toLowerCase();
  if (typeof value === 'boolean') {
    return 'toggle';
  }
  if (typeof value === 'number') {
    return 'number';
  }
  if (Array.isArray(value)) {
    return 'list';
  }
  if (
    normalizedKey.includes('path') ||
    normalizedKey.includes('file') ||
    normalizedKey.includes('dir') ||
    normalizedKey.includes('directory')
  ) {
    return 'path';
  }
  return 'text';
};

const inferDatatypeFromKey = (key, fallbackValue) => {
  const normalizedKey = String(key || '').trim().toLowerCase();
  if (!normalizedKey) {
    return fallbackValue;
  }
  if (normalizedKey.endsWith('[]') || normalizedKey.includes('/files')) {
    return 'LIST';
  }
  if (
    normalizedKey.includes('/path') ||
    normalizedKey.endsWith('path') ||
    normalizedKey.includes('dir') ||
    normalizedKey.includes('directory')
  ) {
    return 'PATH';
  }
  if (normalizedKey.includes('count') || normalizedKey.includes('size')) {
    return 'NUMBER';
  }
  return fallbackValue;
};

const normalizeDatatype = (value, key = '') => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized) {
    return normalized;
  }
  return inferDatatypeFromKey(key, 'ANY');
};

const normalizeIoEntry = (entry = {}) => {
  const key = String(entry?.key || '').trim();
  const label = String(entry?.label || '').trim();
  const datatype = normalizeDatatype(
    entry?.datatype || entry?.dataType || entry?.valueType,
    key,
  );
  const description = String(entry?.description || '').trim();
  const optionalByLabel = /可选|optional/i.test(label);
  const optionalByKey = /optional|inputvalues\[0\]/i.test(key);
  const required = entry?.required === true ? true : !(optionalByLabel || optionalByKey);

  return {
    key,
    label: label || key || 'value',
    description,
    datatype,
    required,
  };
};

const normalizeIoGroup = (entries = []) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeIoEntry(entry))
    .filter((entry) => entry.key || entry.label);

const createWidgetsFromDefaultConfig = (defaultConfig = {}) => {
  if (!defaultConfig || typeof defaultConfig !== 'object' || Array.isArray(defaultConfig)) {
    return [];
  }

  return Object.entries(defaultConfig).map(([key, value]) => ({
    key,
    label: key,
    widget: inferWidgetKind(key, value),
    datatype: normalizeDatatype('', key),
    defaultValue: cloneValue(value, value),
  }));
};

const deriveRuntimeFlags = (nodeDef = {}) => {
  if (nodeDef.runtimeFlags && typeof nodeDef.runtimeFlags === 'object') {
    return cloneValue(nodeDef.runtimeFlags, {});
  }

  const category = String(nodeDef.category || '').trim().toLowerCase();
  const type = String(nodeDef.type || '').trim().toLowerCase();
  const mutatingCategories = new Set(['tg', 'clean']);
  const sideEffect =
    mutatingCategories.has(category) ||
    type.includes('write') ||
    type.includes('delete') ||
    type.includes('upload');
  const longRunning = category === 'whisper' || type.includes('delay') || type.includes('scan');

  return {
    sideEffect,
    cancellable: true,
    longRunning,
    idempotent: sideEffect !== true,
  };
};

const deriveUiHints = (nodeDef = {}) => {
  if (nodeDef.uiHints && typeof nodeDef.uiHints === 'object') {
    return cloneValue(nodeDef.uiHints, {});
  }

  return {
    compactTitle: true,
    preferredWidth: 280,
    accent: String(nodeDef.category || 'other').trim() || 'other',
    searchableTerms: [nodeDef.type, nodeDef.label, nodeDef.description]
      .filter((item) => typeof item === 'string' && item.trim())
      .join(' '),
  };
};

const buildObjectInfoRecord = (nodeDef = {}) => {
  const inputEntries = normalizeIoGroup(nodeDef?.io?.input || nodeDef?.inputs || []);
  const outputEntries = normalizeIoGroup(nodeDef?.io?.output || nodeDef?.outputs || []);

  return {
    type: nodeDef.type,
    displayName: nodeDef.label,
    label: nodeDef.label,
    category: nodeDef.category,
    description: nodeDef.description || '',
    defaultConfig: cloneValue(nodeDef.defaultConfig || {}, {}),
    inputs: {
      required: inputEntries.filter((entry) => entry.required !== false),
      optional: inputEntries.filter((entry) => entry.required === false),
    },
    outputs: outputEntries,
    widgets: cloneValue(
      Array.isArray(nodeDef.widgets) && nodeDef.widgets.length
        ? nodeDef.widgets
        : createWidgetsFromDefaultConfig(nodeDef.defaultConfig || {}),
      [],
    ),
    runtimeFlags: deriveRuntimeFlags(nodeDef),
    uiHints: deriveUiHints(nodeDef),
  };
};

export const getWorkflowNodeRegistry = () => NODE_REGISTRY;

export const getWorkflowObjectInfo = () =>
  Object.fromEntries(
    NODE_DEFINITIONS.map((nodeDef) => [
      nodeDef.type,
      buildObjectInfoRecord(nodeDef),
    ]),
  );

export const listWorkflowNodeDefinitions = () =>
  Object.values(getWorkflowObjectInfo()).map((record) => ({
    type: record.type,
    label: record.displayName,
    displayName: record.displayName,
    category: record.category,
    description: record.description,
    defaultConfig: cloneValue(record.defaultConfig || {}, {}),
    widgets: cloneValue(record.widgets || [], []),
    runtimeFlags: cloneValue(record.runtimeFlags || {}, {}),
    uiHints: cloneValue(record.uiHints || {}, {}),
    io: {
      input: cloneValue(
        [...(record.inputs?.required || []), ...(record.inputs?.optional || [])],
        [],
      ),
      output: cloneValue(record.outputs || [], []),
    },
  }));

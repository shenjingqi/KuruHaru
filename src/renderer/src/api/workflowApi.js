import { callBridge, getApiNamespace, getWindowApi, noop } from './bridge';
import { workflowMockApi } from './workflowApi.mock';

const getWorkflowBridge = () => getApiNamespace('workflow');

const callWorkflow = (method, fallbacks = [], args = [], mockMethodName = '') =>
  callBridge({
    namespace: 'workflow',
    method,
    fallbacks,
    args,
    fallbackValue: () => {
      const fallbackMethod = workflowMockApi[mockMethodName || `workflow${method.charAt(0).toUpperCase()}${method.slice(1)}`];
      if (typeof fallbackMethod === 'function') {
        return fallbackMethod(...args);
      }
      return { success: false, error: `workflow mock unavailable: ${method}` };
    },
  });

export const workflowBootstrap = () =>
  callWorkflow('bootstrap', ['workflowBootstrap'], [], 'workflowBootstrap');

export const workflowTemplateList = () =>
  callWorkflow('templateList', ['workflowTemplateList'], [], 'workflowTemplateList');

export const workflowTemplateLoad = (templateId) =>
  callWorkflow('templateLoad', ['workflowTemplateLoad'], [templateId], 'workflowTemplateLoad');

export const workflowDocumentGet = (documentId) =>
  callWorkflow('documentGet', ['workflowDocumentGet'], [documentId], 'workflowDocumentGet');

export const workflowDocumentSave = (payload) =>
  callWorkflow('documentSave', ['workflowDocumentSave'], [payload], 'workflowDocumentSave');

export const workflowCatalogGet = () =>
  callWorkflow('catalogGet', ['workflowCatalogGet'], [], 'workflowCatalogGet');

export const workflowNodeDocsGet = (nodeType) =>
  callWorkflow('nodeDocsGet', ['workflowNodeDocsGet'], [nodeType], 'workflowNodeDocsGet');

export const workflowList = () => callWorkflow('list', ['workflowList'], [], 'workflowList');
export const workflowGet = (workflowId) => callWorkflow('get', ['workflowGet'], [workflowId], 'workflowGet');
export const workflowSave = (payload) => callWorkflow('save', ['workflowSave'], [payload], 'workflowSave');
export const workflowDelete = (workflowId) =>
  callWorkflow('delete', ['workflowDelete'], [workflowId], 'workflowDelete');
export const workflowValidate = (payload) =>
  callWorkflow('validate', ['workflowValidate'], [payload], 'workflowValidate');
export const workflowRun = (payload) => callWorkflow('run', ['workflowRun'], [payload], 'workflowRun');
export const workflowEnqueue = (payload) =>
  callWorkflow('enqueue', ['workflowEnqueue', 'workflowRun'], [payload], 'workflowEnqueue');
export const workflowPartialEnqueue = (payload) =>
  callWorkflow('partialEnqueue', ['workflowPartialEnqueue'], [payload], 'workflowPartialEnqueue');
export const workflowCancel = (payload) =>
  callWorkflow('cancel', ['workflowCancel'], [payload], 'workflowCancel');
export const workflowGetRun = (runId) =>
  callWorkflow('getRun', ['workflowGetRun'], [runId], 'workflowGetRun');
export const workflowRunGet = (runId) =>
  callWorkflow('runGet', ['workflowRunGet', 'workflowGetRun'], [runId], 'workflowRunGet');
export const workflowListRuns = (payload = {}) =>
  callWorkflow('listRuns', ['workflowListRuns'], [payload], 'workflowListRuns');
export const workflowRunList = (payload = {}) =>
  callWorkflow('runList', ['workflowRunList', 'workflowListRuns'], [payload], 'workflowRunList');
export const workflowGetObjectInfo = () =>
  callWorkflow('getObjectInfo', ['workflowGetObjectInfo'], [], 'workflowGetObjectInfo');
export const workflowListNodeDefinitions = () =>
  callWorkflow('listNodeDefinitions', ['workflowListNodeDefinitions'], [], 'workflowListNodeDefinitions');
export const workflowRecoveryReportGet = (runSessionId) =>
  callWorkflow('recoveryReportGet', ['workflowRecoveryReportGet'], [runSessionId], 'workflowRecoveryReportGet');

export const workflowQueueGet = () => {
  const bridge = getWorkflowBridge();
  const api = getWindowApi();
  if (typeof bridge.queueGet === 'function') {
    return bridge.queueGet();
  }
  if (typeof api.workflowQueueGet === 'function') {
    return api.workflowQueueGet();
  }
  return workflowMockApi.workflowQueueGet();
};

export const workflowQueueRunFront = (payload = {}) => {
  const bridge = getWorkflowBridge();
  const api = getWindowApi();
  if (typeof bridge.queueRunFront === 'function') {
    return bridge.queueRunFront(payload);
  }
  if (typeof api.workflowQueueRunFront === 'function') {
    return api.workflowQueueRunFront(payload);
  }
  return workflowMockApi.workflowQueueRunFront(payload);
};

export const workflowQueueClearPending = () => {
  const bridge = getWorkflowBridge();
  const api = getWindowApi();
  if (typeof bridge.queueClearPending === 'function') {
    return bridge.queueClearPending();
  }
  if (typeof api.workflowQueueClearPending === 'function') {
    return api.workflowQueueClearPending();
  }
  return workflowMockApi.workflowQueueClearPending();
};

export const onWorkflowRunEvent = (callback) => {
  const bridge = getWorkflowBridge();
  const api = getWindowApi();
  if (typeof bridge.onRunEvent === 'function') {
    return bridge.onRunEvent(callback);
  }
  if (typeof api.onWorkflowRunEvent === 'function') {
    return api.onWorkflowRunEvent(callback);
  }
  if (typeof api.on === 'function') {
    api.on('workflow-run-event', callback);
    return () => api.removeAllListeners?.('workflow-run-event');
  }
  return noop;
};

export const onRunEvent = onWorkflowRunEvent;

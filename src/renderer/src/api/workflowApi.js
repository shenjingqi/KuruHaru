const workflowBridge = window.api.workflow || {};

const callWorkflow = (method, fallback, ...args) =>
  typeof workflowBridge[method] === "function"
    ? workflowBridge[method](...args)
    : window.api[fallback](...args);

export const workflowList = () => callWorkflow("list", "workflowList");

export const workflowGet = (workflowId) =>
  callWorkflow("get", "workflowGet", workflowId);

export const workflowSave = (payload) =>
  callWorkflow("save", "workflowSave", payload);

export const workflowDelete = (workflowId) =>
  callWorkflow("delete", "workflowDelete", workflowId);

export const workflowValidate = (payload) =>
  callWorkflow("validate", "workflowValidate", payload);

export const workflowRun = (payload) =>
  callWorkflow("run", "workflowRun", payload);

export const workflowCancel = (payload) =>
  callWorkflow("cancel", "workflowCancel", payload);

export const workflowGetRun = (runId) =>
  callWorkflow("getRun", "workflowGetRun", runId);

export const workflowListRuns = (payload = {}) =>
  callWorkflow("listRuns", "workflowListRuns", payload);

export const workflowListNodeDefinitions = () =>
  callWorkflow("listNodeDefinitions", "workflowListNodeDefinitions");

export const onWorkflowRunEvent = (callback) => {
  if (typeof workflowBridge.onRunEvent === "function") {
    return workflowBridge.onRunEvent(callback);
  }

  if (typeof window.api.onWorkflowRunEvent === "function") {
    return window.api.onWorkflowRunEvent(callback);
  }

  window.api.on("workflow-run-event", callback);
  return () => window.api.removeAllListeners("workflow-run-event");
};

// Backward-compatible alias for older callers.
export const onRunEvent = onWorkflowRunEvent;

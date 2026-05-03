export const workflowDesignerContextKey = Symbol("workflow-designer-context");

export const ensureWorkflowDesignerContext = (context) => {
  if (!context) {
    throw new Error("Workflow designer context is not provided.");
  }
  return context;
};

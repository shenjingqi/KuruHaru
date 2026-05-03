import "./assets/main.css";
import "./assets/page-skin.css";
import "./assets/component-themes.css";
import "./assets/workflow-comfy-tokens.css";

import { createApp } from "vue";
import { createPinia } from "pinia";
import naive from "naive-ui";
import App from "./App.vue";
import { workflowMockApi } from "./api/workflowApi.mock";

const createBrowserPreviewApi = () => {
  const noop = () => {};
  const callWorkflowMock = (methodName) => (...args) => {
    const method = workflowMockApi?.[methodName];
    return typeof method === "function"
      ? method.apply(workflowMockApi, args)
      : { success: false, error: `workflow mock unavailable: ${methodName}` };
  };

  const workflowFlatMethods = {
    workflowBootstrap: callWorkflowMock("workflowBootstrap"),
    workflowTemplateList: callWorkflowMock("workflowTemplateList"),
    workflowTemplateLoad: callWorkflowMock("workflowTemplateLoad"),
    workflowDocumentGet: callWorkflowMock("workflowDocumentGet"),
    workflowDocumentSave: callWorkflowMock("workflowDocumentSave"),
    workflowCatalogGet: callWorkflowMock("workflowCatalogGet"),
    workflowNodeDocsGet: callWorkflowMock("workflowNodeDocsGet"),
    workflowEnqueue: callWorkflowMock("workflowEnqueue"),
    workflowPartialEnqueue: callWorkflowMock("workflowPartialEnqueue"),
    workflowRunGet: callWorkflowMock("workflowRunGet"),
    workflowRunList: callWorkflowMock("workflowRunList"),
    workflowRecoveryReportGet: callWorkflowMock("workflowRecoveryReportGet"),
    workflowList: callWorkflowMock("workflowList"),
    workflowGet: callWorkflowMock("workflowGet"),
    workflowSave: callWorkflowMock("workflowSave"),
    workflowDelete: callWorkflowMock("workflowDelete"),
    workflowValidate: callWorkflowMock("workflowValidate"),
    workflowRun: callWorkflowMock("workflowRun"),
    workflowQueueRunFront: callWorkflowMock("workflowQueueRunFront"),
    workflowQueueGet: callWorkflowMock("workflowQueueGet"),
    workflowQueueClearPending: callWorkflowMock("workflowQueueClearPending"),
    workflowCancel: callWorkflowMock("workflowCancel"),
    workflowGetRun: callWorkflowMock("workflowGetRun"),
    workflowListRuns: callWorkflowMock("workflowListRuns"),
    workflowGetObjectInfo: callWorkflowMock("workflowGetObjectInfo"),
    workflowListNodeDefinitions: callWorkflowMock("workflowListNodeDefinitions"),
  };

  const workflow = {
    bootstrap: workflowFlatMethods.workflowBootstrap,
    templateList: workflowFlatMethods.workflowTemplateList,
    templateLoad: workflowFlatMethods.workflowTemplateLoad,
    documentGet: workflowFlatMethods.workflowDocumentGet,
    documentSave: workflowFlatMethods.workflowDocumentSave,
    catalogGet: workflowFlatMethods.workflowCatalogGet,
    nodeDocsGet: workflowFlatMethods.workflowNodeDocsGet,
    enqueue: workflowFlatMethods.workflowEnqueue,
    partialEnqueue: workflowFlatMethods.workflowPartialEnqueue,
    runGet: workflowFlatMethods.workflowRunGet,
    runList: workflowFlatMethods.workflowRunList,
    recoveryReportGet: workflowFlatMethods.workflowRecoveryReportGet,
    list: workflowFlatMethods.workflowList,
    get: workflowFlatMethods.workflowGet,
    save: workflowFlatMethods.workflowSave,
    delete: workflowFlatMethods.workflowDelete,
    validate: workflowFlatMethods.workflowValidate,
    run: workflowFlatMethods.workflowRun,
    queueRunFront: workflowFlatMethods.workflowQueueRunFront,
    queueGet: workflowFlatMethods.workflowQueueGet,
    queueClearPending: workflowFlatMethods.workflowQueueClearPending,
    cancel: workflowFlatMethods.workflowCancel,
    getRun: workflowFlatMethods.workflowGetRun,
    listRuns: workflowFlatMethods.workflowListRuns,
    getObjectInfo: workflowFlatMethods.workflowGetObjectInfo,
    listNodeDefinitions: workflowFlatMethods.workflowListNodeDefinitions,
    onRunEvent: noop,
  };

  return {
    ...workflowFlatMethods,
    loadConfig: async () => ({
      profile: {
        username: "KuruHaru",
        avatar: "",
      },
    }),
    saveConfig: async (config) => ({ success: true, data: config || {} }),
    saveCustomPaths: async (paths) => ({ success: true, data: paths || {} }),
    readImageAsBase64: async () => "",
    getDefaultAvatar: async () => "",
    onWorkflowRunEvent: noop,
    on: noop,
    removeAllListeners: noop,
    config: {
      load: async () => ({
        profile: {
          username: "KuruHaru",
          avatar: "",
        },
      }),
      save: async (config) => ({ success: true, data: config || {} }),
      saveCustomPaths: async (paths) => ({ success: true, data: paths || {} }),
    },
    system: {
      readImageAsBase64: async () => "",
      getDefaultAvatar: async () => "",
      windowControls: {
        supported: false,
      },
    },
    workflow,
  };
};

if (typeof window !== "undefined" && (!window.api || typeof window.api !== "object")) {
  window.api = createBrowserPreviewApi();
}

const app = createApp(App);
app.use(createPinia());
app.use(naive);
app.mount("#app");

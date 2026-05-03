import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import * as workflowApi from '../api/workflowApi';

const TEMPLATE_KEY = 'workflow.pendingTemplateId';
const DOCS_NODE_KEY = 'workflow.docs.nodeType';

const cloneJsonValue = (value, fallbackValue = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallbackValue;
  }
};

const getAppShell = () =>
  typeof window !== 'undefined' && window.__appShell ? window.__appShell : null;

const persistSessionValue = (key, value) => {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  if (value === null || value === undefined || value === '') {
    sessionStorage.removeItem(key);
    return;
  }
  sessionStorage.setItem(key, String(value));
};

const readSessionValue = (key) => {
  if (typeof sessionStorage === 'undefined') {
    return '';
  }
  return String(sessionStorage.getItem(key) || '').trim();
};

export const useWorkflowHubStore = defineStore('workflowHub', () => {
  const isBootstrapping = ref(false);
  const isLoadingCatalog = ref(false);
  const isLoadingRuntime = ref(false);
  const isLoadingRunDetail = ref(false);
  const templates = ref([]);
  const recentDocuments = ref([]);
  const catalogEntries = ref([]);
  const catalogCategories = ref([]);
  const catalogSummary = ref({ total: 0, categories: [] });
  const runtimeQueue = ref({ pending: [], running: [], history: [], updatedAt: null });
  const runList = ref([]);
  const selectedRun = ref(null);
  const selectedRecoveryReport = ref(null);
  const featureFlags = ref({});

  const runtimeItems = computed(() => ({
    pending: Array.isArray(runtimeQueue.value.pending) ? runtimeQueue.value.pending : [],
    running: Array.isArray(runtimeQueue.value.running) ? runtimeQueue.value.running : [],
    history: Array.isArray(runtimeQueue.value.history) ? runtimeQueue.value.history : [],
  }));

  const allRuns = computed(() => {
    const merged = [
      ...runtimeItems.value.running,
      ...runtimeItems.value.pending,
      ...runtimeItems.value.history,
      ...(Array.isArray(runList.value) ? runList.value : []),
    ];
    const map = new Map();
    merged.forEach((item) => {
      const key = String(item?.runSessionId || item?.runId || '').trim();
      if (!key || map.has(key)) {
        return;
      }
      map.set(key, item);
    });
    return [...map.values()];
  });

  const bootstrap = async (force = false) => {
    if (isBootstrapping.value && !force) {
      return;
    }
    isBootstrapping.value = true;
    try {
      const result = await workflowApi.workflowBootstrap();
      if (result?.success && result.data) {
        templates.value = cloneJsonValue(result.data.templates || [], []);
        recentDocuments.value = cloneJsonValue(result.data.recentDocuments || [], []);
        runtimeQueue.value = cloneJsonValue(
          result.data.runtimeSummary?.queue || { pending: [], running: [], history: [], updatedAt: null },
          { pending: [], running: [], history: [], updatedAt: null },
        );
        featureFlags.value = cloneJsonValue(result.data.featureFlags || {}, {});
        catalogSummary.value = cloneJsonValue(
          result.data.catalogSummary || { total: 0, categories: [] },
          { total: 0, categories: [] },
        );
      }
    } finally {
      isBootstrapping.value = false;
    }
  };

  const refreshTemplates = async () => {
    const result = await workflowApi.workflowTemplateList();
    if (result?.success && result.data) {
      templates.value = cloneJsonValue(result.data, []);
    }
    return templates.value;
  };

  const refreshCatalog = async () => {
    isLoadingCatalog.value = true;
    try {
      const result = await workflowApi.workflowCatalogGet();
      if (result?.success && result.data) {
        catalogEntries.value = cloneJsonValue(result.data.entries || [], []);
        catalogCategories.value = cloneJsonValue(result.data.categories || [], []);
      }
      return catalogEntries.value;
    } finally {
      isLoadingCatalog.value = false;
    }
  };

  const refreshRuntime = async () => {
    isLoadingRuntime.value = true;
    try {
      const [queueResult, runListResult] = await Promise.all([
        workflowApi.workflowQueueGet(),
        workflowApi.workflowRunList({ limit: 80 }),
      ]);

      if (queueResult?.success && queueResult.data) {
        runtimeQueue.value = cloneJsonValue(queueResult.data, {
          pending: [],
          running: [],
          history: [],
          updatedAt: null,
        });
      }
      if (runListResult?.success && runListResult.data) {
        runList.value = cloneJsonValue(runListResult.data, []);
      }
      return runtimeQueue.value;
    } finally {
      isLoadingRuntime.value = false;
    }
  };

  const inspectRun = async (runSessionId) => {
    const normalizedRunId = String(runSessionId || '').trim();
    if (!normalizedRunId) {
      return null;
    }

    isLoadingRunDetail.value = true;
    try {
      const [runResult, recoveryResult] = await Promise.all([
        workflowApi.workflowRunGet(normalizedRunId),
        workflowApi.workflowRecoveryReportGet(normalizedRunId),
      ]);
      if (runResult?.success && runResult.data) {
        selectedRun.value = cloneJsonValue(runResult.data, null);
      }
      if (recoveryResult?.success && recoveryResult.data) {
        selectedRecoveryReport.value = cloneJsonValue(recoveryResult.data, null);
      } else {
        selectedRecoveryReport.value = null;
      }
      return selectedRun.value;
    } finally {
      isLoadingRunDetail.value = false;
    }
  };

  const rerunSession = async (runSession) => {
    const workflowId = String(runSession?.workflowId || '').trim();
    if (!workflowId) {
      return { success: false, error: '?? workflowId' };
    }
    return workflowApi.workflowEnqueue({ workflowId });
  };

  const cancelRun = async (runSessionId) => {
    const normalizedRunId = String(runSessionId || '').trim();
    if (!normalizedRunId) {
      return { success: false, error: '?? runSessionId' };
    }
    return workflowApi.workflowCancel({ runId: normalizedRunId });
  };

  const openTemplateInDesigner = async (templateId) => {
    const normalizedTemplateId = String(templateId || '').trim();
    if (!normalizedTemplateId) {
      return;
    }
    persistSessionValue(TEMPLATE_KEY, normalizedTemplateId);
    getAppShell()?.setView?.('workflow.designer');
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        window.__workflowDesigner?.loadTemplateById?.(normalizedTemplateId);
      }, 0);
    }
  };

  const openNodeDocs = async (nodeType) => {
    const normalizedNodeType = String(nodeType || '').trim();
    if (!normalizedNodeType) {
      return;
    }
    persistSessionValue(DOCS_NODE_KEY, normalizedNodeType);
    getAppShell()?.setView?.('workflow.docs');
  };

  const consumePendingTemplateId = () => {
    const value = readSessionValue(TEMPLATE_KEY);
    persistSessionValue(TEMPLATE_KEY, null);
    return value;
  };

  const readPendingDocsNodeType = () => readSessionValue(DOCS_NODE_KEY);

  return {
    isBootstrapping,
    isLoadingCatalog,
    isLoadingRuntime,
    isLoadingRunDetail,
    templates,
    recentDocuments,
    catalogEntries,
    catalogCategories,
    catalogSummary,
    runtimeQueue,
    runtimeItems,
    runList,
    allRuns,
    selectedRun,
    selectedRecoveryReport,
    featureFlags,
    bootstrap,
    refreshTemplates,
    refreshCatalog,
    refreshRuntime,
    inspectRun,
    rerunSession,
    cancelRun,
    openTemplateInDesigner,
    openNodeDocs,
    consumePendingTemplateId,
    readPendingDocsNodeType,
  };
});

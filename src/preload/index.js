import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

const ARG_NONE = "none";
const ARG_DIRECT = "direct";
const ARG_PAYLOAD = "payload";

const LISTENER_RAW = "raw";
const LISTENER_VALUE = "value";
const LISTENER_EVENT_AND_VALUE = "event-and-value";

const createChannelCallMethod = (transport, descriptor) => {
  const normalizedDescriptor =
    typeof descriptor === "string"
      ? { channel: descriptor, args: ARG_NONE }
      : { args: ARG_NONE, ...descriptor };

  if (normalizedDescriptor.args === ARG_DIRECT) {
    return (value) =>
      ipcRenderer[transport](normalizedDescriptor.channel, value);
  }

  if (normalizedDescriptor.args === ARG_PAYLOAD) {
    return (...values) =>
      ipcRenderer[transport](
        normalizedDescriptor.channel,
        normalizedDescriptor.payload(...values),
      );
  }

  return () => ipcRenderer[transport](normalizedDescriptor.channel);
};

const createChannelCallMethods = (transport, descriptorMap) =>
  Object.fromEntries(
    Object.entries(descriptorMap).map(([methodName, descriptor]) => [
      methodName,
      createChannelCallMethod(transport, descriptor),
    ]),
  );

const createListenerMethod = (descriptor) => {
  const normalizedDescriptor = {
    mode: LISTENER_VALUE,
    mapValue: (value) => value,
    clearBeforeListen: false,
    returnUnsubscribe: false,
    returnSubscription: false,
    ...descriptor,
  };

  return (callback) => {
    if (normalizedDescriptor.clearBeforeListen) {
      ipcRenderer.removeAllListeners(normalizedDescriptor.channel);
    }

    if (normalizedDescriptor.mode === LISTENER_RAW) {
      return ipcRenderer.on(normalizedDescriptor.channel, callback);
    }

    const handler =
      normalizedDescriptor.mode === LISTENER_EVENT_AND_VALUE
        ? (event, value) =>
            callback(event, normalizedDescriptor.mapValue(value))
        : (event, value) => callback(normalizedDescriptor.mapValue(value));

    const subscription = ipcRenderer.on(normalizedDescriptor.channel, handler);

    if (normalizedDescriptor.returnUnsubscribe) {
      return () =>
        ipcRenderer.removeListener(normalizedDescriptor.channel, handler);
    }

    if (normalizedDescriptor.returnSubscription) {
      return subscription;
    }

    return undefined;
  };
};

const createListenerMethods = (descriptorMap) =>
  Object.fromEntries(
    Object.entries(descriptorMap).map(([methodName, descriptor]) => [
      methodName,
      createListenerMethod(descriptor),
    ]),
  );

const WINDOW_CONTROL_INVOKE_MAP = {
  minimize: "window-minimize",
  toggleMaximize: "window-toggle-maximize",
  close: "window-close",
  isMaximized: "window-is-maximized",
  getState: "window-get-state",
  getBounds: "window-get-bounds",
  setBounds: { channel: "window-set-bounds", args: ARG_DIRECT },
};

const INVOKE_MAP = {
  // 配置与文件
  loadConfig: "get-config",
  saveConfig: { channel: "save-config", args: ARG_DIRECT },
  selectFile: { channel: "dialog:openFile", args: ARG_DIRECT },
  dialogOpenFile: { channel: "dialog:openFile", args: ARG_DIRECT },
  dialogOpenDirectory: "dialog:openDirectory",
  dialogSaveFile: { channel: "dialog:saveFile", args: ARG_DIRECT },
  writeFile: {
    channel: "write-file",
    args: ARG_PAYLOAD,
    payload: ({ path, content }) => ({ path, content }),
  },
  readFile: { channel: "fs-read-file", args: ARG_DIRECT },
  readImageAsBase64: { channel: "read-image-as-base64", args: ARG_DIRECT },
  getDefaultAvatar: "get-default-avatar",

  // 保存自定义路径配置
  saveCustomPaths: { channel: "save-custom-paths", args: ARG_DIRECT },

  // 个人中心
  getUserProfile: "get-user-profile",
  updateUserProfile: { channel: "update-user-profile", args: ARG_DIRECT },
  getSystemInfo: "get-system-info",
  getStatistics: "get-statistics",
  openLogsDir: "open-logs-dir",
  clearCache: {
    channel: "clear-cache",
    args: ARG_PAYLOAD,
    payload: (cacheFile = "recent_activity.json") => ({ cacheFile }),
  },
  exportData: "export-data",
  importData: "import-data",
  clearAllData: "clear-all-data",
  updateSystemSettings: { channel: "update-system-settings", args: ARG_DIRECT },
  resetSystemSettings: "reset-system-settings",

  // 模块接口
  asmrLogin: { channel: "asmr-login", args: ARG_DIRECT },
  asmrFetchPlaylist: { channel: "asmr-fetch-playlist", args: ARG_DIRECT },
  asmrDeleteByRJ: { channel: "asmr-delete-by-rj", args: ARG_DIRECT },
  asmrDeleteWorks: { channel: "asmr-delete-works", args: ARG_DIRECT },
  asmrFetchChineseWorks: {
    channel: "asmr-fetch-chinese-works",
    args: ARG_DIRECT,
  },
  asmrSetChineseListPath: {
    channel: "asmr-set-chinese-list-path",
    args: ARG_DIRECT,
  },
  asmrGetChineseListPath: "asmr-get-chinese-list-path",
  asmrReadChineseList: "asmr-read-chinese-list",
  asmrWriteChineseList: {
    channel: "asmr-write-chinese-list",
    args: ARG_DIRECT,
  },
  filterRjFromUrl: { channel: "filter-rj-from-url", args: ARG_DIRECT },
  filterRjFromUrlLegacy: {
    channel: "filter_rj_from_url",
    args: ARG_DIRECT,
  },
  scanLocalIds: {
    channel: "scan-local-ids",
    args: ARG_PAYLOAD,
    payload: (path) => ({ path }),
  },
  scanLocalArchives: { channel: "scan-local-archives", args: ARG_DIRECT },
  getUploadHistory: "get-upload-history",
  loadTagDb: "load-tag-db",
  asmrGetCachedCloudWorks: "asmr-get-cached-cloud-works",
  asmrFetchCloudWorks: "asmr-fetch-cloud-works",
  triggerCloudDataFetch: "asmr-trigger-cloud-data-fetch",

  // Whisper
  countMediaFiles: { channel: "count-media-files", args: ARG_DIRECT },
  zipSubtitles: { channel: "zip-subtitles", args: ARG_DIRECT },

  // Tools
  extractFileNames: { channel: "extract-file-names", args: ARG_DIRECT },
  cleanData: { channel: "clean-data", args: ARG_DIRECT },

  // Telegram
  tgCheckLogin: "tg-check-login",
  tgLogin: { channel: "tg-login", args: ARG_DIRECT },
  tgCancelUpload: "tg-cancel-upload",
  tgGetStatistics: "tg-get-statistics",

  // Telegram 搜索 Bot
  tgBotStart: "tg-bot-start",
  tgBotStop: "tg-bot-stop",
  tgBotStatus: "tg-bot-status",
  tgBotSearch: { channel: "tg-bot-search", args: ARG_DIRECT },
  tgBotInfo: { channel: "tg-bot-info", args: ARG_DIRECT },
  tgBotSyncHistory: { channel: "tg-bot-sync-history", args: ARG_DIRECT },
  tgInfoCacheBuild: { channel: "tg-info-cache-build", args: ARG_DIRECT },
  tgInfoCacheStatus: { channel: "tg-info-cache-status", args: ARG_DIRECT },

  // 最近活动（新增）
  tgScanRecentActivity: "tg-scan-recent-activity",
  tgReadRecentActivity: "tg-read-recent-activity",
  tgGetRecentActivity: "get-recent-activity",
  tgReadRjList: { channel: "read-rj-list", args: ARG_DIRECT },
  tgDownloadFile: { channel: "download-tg-file", args: ARG_DIRECT },
  tgFilterActivityByTime: {
    channel: "tg-filter-activity-by-time",
    args: ARG_DIRECT,
  },
  tgFindRaishunyaDate: "tg-find-raishunya-date",
  tgGetRJFilesByRange: {
    channel: "tg-get-rj-files-by-range",
    args: ARG_DIRECT,
  },
  tgScanRjDuplicates: { channel: "tg-scan-rj-duplicates", args: ARG_DIRECT },
  tgDeleteDuplicateMessages: {
    channel: "tg-delete-duplicate-messages",
    args: ARG_DIRECT,
  },
  tgInfoErrorRecover: { channel: "tg-info-error-recover", args: ARG_DIRECT },

  // Workflow Runtime
  workflowList: "workflow-list",
  workflowGet: { channel: "workflow-get", args: ARG_DIRECT },
  workflowSave: { channel: "workflow-save", args: ARG_DIRECT },
  workflowDelete: { channel: "workflow-delete", args: ARG_DIRECT },
  workflowValidate: { channel: "workflow-validate", args: ARG_DIRECT },
  workflowRun: { channel: "workflow-run", args: ARG_DIRECT },
  workflowCancel: { channel: "workflow-cancel", args: ARG_DIRECT },
  workflowGetRun: { channel: "workflow-get-run", args: ARG_DIRECT },
  workflowListRuns: { channel: "workflow-list-runs", args: ARG_DIRECT },
  workflowListNodeDefinitions: "workflow-list-node-definitions",
};

const SEND_MAP = {
  asmrRemoveWorks: { channel: "asmr-remove-works", args: ARG_DIRECT },
  asmrRemoveWorksByRJ: { channel: "asmr-remove-works-by-rj", args: ARG_DIRECT },
  startTask: { channel: "start-task", args: ARG_DIRECT },
  stopTask: "stop-task",
  tgUploadFiles: { channel: "tg-upload-files", args: ARG_DIRECT },
  tgAuthReply: { channel: "tg-auth-reply", args: ARG_DIRECT },
};

const LISTENER_MAP = {
  onTgAuthNeeded: {
    channel: "tg-auth-needed",
    returnUnsubscribe: true,
  },
  onTgUploadFinished: {
    channel: "tg-upload-finished",
    mapValue: (value) => value || {},
    returnUnsubscribe: true,
  },

  // 🟢 日志监听保护 - 移除旧监听器后再注册
  onLogUpdate: {
    channel: "log-update",
    clearBeforeListen: true,
    mapValue: (value) => value || { type: "system", msg: "" },
  },
  onTaskFinished: {
    channel: "task-finished",
    mode: LISTENER_EVENT_AND_VALUE,
    clearBeforeListen: true,
    mapValue: (value) => value || {},
  },

  // 云端数据更新监听
  onCloudWorksUpdated: {
    channel: "cloud-works-updated",
    mapValue: (value) => value || {},
    returnSubscription: true,
  },

  // 登录成功事件监听
  onAsmrLoggedIn: {
    channel: "asmr-logged-in",
    mode: LISTENER_RAW,
  },

  onWindowStateChanged: {
    channel: "window-state-changed",
    mapValue: (value) => value || {},
    returnUnsubscribe: true,
  },

  onWorkflowRunEvent: {
    channel: "workflow-run-event",
    mapValue: (value) => value || {},
    returnUnsubscribe: true,
  },
};

const api = {
  send: (channel, data) => ipcRenderer.send(channel, data),
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),

  // 🟢 通用监听器空值保护
  on: (channel, func) => {
    ipcRenderer.on(channel, (event, ...args) => {
      const safeData = args[0] || {};
      func(safeData);
    });
  },

  // 🟢 特殊监听器，传递事件对象和数据
  onWithEvent: (channel, func) => {
    ipcRenderer.on(channel, (event, ...args) => {
      const safeData = args[0] || {};
      func(event, safeData);
    });
  },

  removeListener: (channel, func) => ipcRenderer.removeListener(channel, func),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  windowControls: {
    supported: process.platform === "win32",
    ...createChannelCallMethods("invoke", WINDOW_CONTROL_INVOKE_MAP),
  },

  ...createChannelCallMethods("invoke", INVOKE_MAP),
  ...createChannelCallMethods("send", SEND_MAP),
  ...createListenerMethods(LISTENER_MAP),
};

// 命名空间 API（保留原有平铺方法，逐步迁移）
api.config = {
  load: api.loadConfig,
  save: api.saveConfig,
  saveCustomPaths: api.saveCustomPaths,
};

api.dialog = {
  openFile: api.dialogOpenFile,
  openDirectory: api.dialogOpenDirectory,
  saveFile: api.dialogSaveFile,
  selectFile: api.selectFile,
};

api.system = {
  clearCache: api.clearCache,
  readImageAsBase64: api.readImageAsBase64,
  getDefaultAvatar: api.getDefaultAvatar,
  getWindowState: api.windowControls.getState,
  onWindowStateChanged: api.onWindowStateChanged,
  windowControls: api.windowControls,
};

api.whisper = {
  startTask: api.startTask,
  stopTask: api.stopTask,
  countMediaFiles: api.countMediaFiles,
  zipSubtitles: api.zipSubtitles,
  onTaskFinished: api.onTaskFinished,
  onLogUpdate: api.onLogUpdate,
};

api.local = {
  scanLocalArchives: api.scanLocalArchives,
  readFile: api.readFile,
  writeFile: api.writeFile,
};

api.tools = {
  extractFileNames: api.extractFileNames,
  cleanData: api.cleanData,
  zipSubtitles: api.zipSubtitles,
};

api.asmr = {
  login: api.asmrLogin,
  fetchCloudWorks: api.asmrFetchCloudWorks,
  getCachedCloudWorks: api.asmrGetCachedCloudWorks,
  triggerCloudDataFetch: api.triggerCloudDataFetch,
  fetchChineseWorks: api.asmrFetchChineseWorks,
  setChineseListPath: api.asmrSetChineseListPath,
  getChineseListPath: api.asmrGetChineseListPath,
  readChineseList: api.asmrReadChineseList,
  writeChineseList: api.asmrWriteChineseList,
  filterRjFromUrl: api.filterRjFromUrl,
  deleteWorks: api.asmrDeleteWorks,
  deleteByRJ: api.asmrDeleteByRJ,
};

api.tg = {
  checkLogin: api.tgCheckLogin,
  login: api.tgLogin,
  uploadFiles: api.tgUploadFiles,
  cancelUpload: api.tgCancelUpload,
  authReply: api.tgAuthReply,
  onAuthNeeded: api.onTgAuthNeeded,
  onUploadFinished: api.onTgUploadFinished,
  getRecentActivity: api.tgGetRecentActivity,
  readRecentActivity: api.tgReadRecentActivity,
  scanRecentActivity: api.tgScanRecentActivity,
  readRjList: api.tgReadRjList,
  downloadFile: api.tgDownloadFile,
  botStart: api.tgBotStart,
  botStop: api.tgBotStop,
  botStatus: api.tgBotStatus,
  botSearch: api.tgBotSearch,
  botInfo: api.tgBotInfo,
  botSyncHistory: api.tgBotSyncHistory,
  infoCacheBuild: api.tgInfoCacheBuild,
  infoCacheStatus: api.tgInfoCacheStatus,
  scanRjDuplicates: api.tgScanRjDuplicates,
  deleteDuplicateMessages: api.tgDeleteDuplicateMessages,
  infoErrorRecover: api.tgInfoErrorRecover,
};

api.workflow = {
  list: api.workflowList,
  get: api.workflowGet,
  save: api.workflowSave,
  delete: api.workflowDelete,
  validate: api.workflowValidate,
  run: api.workflowRun,
  cancel: api.workflowCancel,
  getRun: api.workflowGetRun,
  listRuns: api.workflowListRuns,
  listNodeDefinitions: api.workflowListNodeDefinitions,
  onRunEvent: api.onWorkflowRunEvent,
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = electronAPI;
  window.api = api;
}

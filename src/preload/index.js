import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";

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

  // 配置与文件
  loadConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (config) => ipcRenderer.invoke("save-config", config),
  selectFile: (type) => ipcRenderer.invoke("dialog:openFile", type),
  dialogOpenFile: (options) => ipcRenderer.invoke("dialog:openFile", options),
  dialogOpenDirectory: () => ipcRenderer.invoke("dialog:openFile", "dir"),
  dialogSaveFile: (options) => ipcRenderer.invoke("dialog:saveFile", options),
  writeFile: ({ path, content }) =>
    ipcRenderer.invoke("write-file", { path, content }),
  readImageAsBase64: (filePath) =>
    ipcRenderer.invoke("read-image-as-base64", filePath),
  getDefaultAvatar: () => ipcRenderer.invoke("get-default-avatar"),

  // 保存自定义路径配置
  saveCustomPaths: (paths) => ipcRenderer.invoke("save-custom-paths", paths),

  // 个人中心
  getUserProfile: () => ipcRenderer.invoke("get-user-profile"),
  updateUserProfile: (profile) =>
    ipcRenderer.invoke("update-user-profile", profile),
  getSystemInfo: () => ipcRenderer.invoke("get-system-info"),
  getStatistics: () => ipcRenderer.invoke("get-statistics"),
  openLogsDir: () => ipcRenderer.invoke("open-logs-dir"),
  clearCache: () => ipcRenderer.invoke("clear-cache"),
  exportData: () => ipcRenderer.invoke("export-data"),
  importData: () => ipcRenderer.invoke("import-data"),
  clearAllData: () => ipcRenderer.invoke("clear-all-data"),
  updateSystemSettings: (settings) =>
    ipcRenderer.invoke("update-system-settings", settings),
  resetSystemSettings: () => ipcRenderer.invoke("reset-system-settings"),

  // 模块接口
  asmrLogin: (cred) => ipcRenderer.invoke("asmr-login", cred),
  asmrFetchPlaylist: (data) => ipcRenderer.invoke("asmr-fetch-playlist", data),
  asmrRemoveWorks: (data) => ipcRenderer.send("asmr-remove-works", data),
  asmrRemoveWorksByRJ: (data) =>
    ipcRenderer.send("asmr-remove-works-by-rj", data),
  asmrDeleteByRJ: (rjCodes) => ipcRenderer.invoke("asmr-delete-by-rj", rjCodes),
  asmrFetchChineseWorks: (options) =>
    ipcRenderer.invoke("asmr-fetch-chinese-works", options),
  asmrSetChineseListPath: (path) =>
    ipcRenderer.invoke("asmr-set-chinese-list-path", path),
  asmrGetChineseListPath: () =>
    ipcRenderer.invoke("asmr-get-chinese-list-path"),
  asmrReadChineseList: () => ipcRenderer.invoke("asmr-read-chinese-list"),
  scanLocalIds: (path) => ipcRenderer.invoke("scan-local-ids", path),
  scanLocalArchives: (dir) => ipcRenderer.invoke("scan-local-archives", dir),
  getUploadHistory: () => ipcRenderer.invoke("get-upload-history"),
  loadTagDb: () => ipcRenderer.invoke("load-tag-db"),
  asmrGetCachedCloudWorks: () =>
    ipcRenderer.invoke("asmr-get-cached-cloud-works"),
  triggerCloudDataFetch: () =>
    ipcRenderer.invoke("asmr-trigger-cloud-data-fetch"),

  // Whisper
  startTask: (config) => ipcRenderer.send("start-task", config),
  stopTask: () => ipcRenderer.send("stop-task"),
  zipSubtitles: (data) => ipcRenderer.invoke("zip-subtitles", data),

  // Telegram
  tgCheckLogin: () => ipcRenderer.invoke("tg-check-login"),
  tgLogin: (config) => ipcRenderer.invoke("tg-login", config),
  tgUploadFiles: (data) => ipcRenderer.send("tg-upload-files", data),
  onTgAuthNeeded: (callback) => {
    const handler = (e, val) => callback(val);
    ipcRenderer.on("tg-auth-needed", handler);
    // 返回取消监听函数
    return () => ipcRenderer.removeListener("tg-auth-needed", handler);
  },
  tgGetStatistics: () => ipcRenderer.invoke("tg-get-statistics"),

  // 最近活动（新增）
  tgScanRecentActivity: () => ipcRenderer.invoke("tg-scan-recent-activity"),
  tgReadRecentActivity: () => ipcRenderer.invoke("tg-read-recent-activity"),
  tgFilterActivityByTime: (options) =>
    ipcRenderer.invoke("tg-filter-activity-by-time", options),
  tgFindRaishunyaDate: () => ipcRenderer.invoke("tg-find-raishunya-date"),
  tgGetRJFilesByRange: (options) =>
    ipcRenderer.invoke("tg-get-rj-files-by-range", options),

  // 🟢 日志监听保护 - 移除旧监听器后再注册
  onLogUpdate: (callback) => {
    ipcRenderer.removeAllListeners("log-update");
    ipcRenderer.on("log-update", (e, val) => {
      if (!val) val = { type: "system", msg: "" };
      callback(val);
    });
  },

  onTaskFinished: (callback) => {
    ipcRenderer.removeAllListeners("task-finished");
    ipcRenderer.on("task-finished", (e, val) => callback(e, val || {}));
  },

  // 云端数据更新监听
  onCloudWorksUpdated: (callback) =>
    ipcRenderer.on("cloud-works-updated", (e, val) => callback(val || {})),

  // 登录成功事件监听
  onAsmrLoggedIn: (callback) => ipcRenderer.on("asmr-logged-in", callback),
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

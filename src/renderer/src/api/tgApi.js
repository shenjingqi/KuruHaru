const tgBridge = window.api.tg || {};

// Telegram API 在新版本挂在 window.api.tg，下方 fallback 兼容历史平铺方法名。
const callTg = (method, fallback, ...args) =>
  typeof tgBridge[method] === "function"
    ? tgBridge[method](...args)
    : window.api[fallback](...args);

export const tgCheckLogin = () => callTg("checkLogin", "tgCheckLogin");

export const tgLogin = (config) => callTg("login", "tgLogin", config);

export const tgUploadFiles = (payload) =>
  callTg("uploadFiles", "tgUploadFiles", payload);

export const tgCancelUpload = () => callTg("cancelUpload", "tgCancelUpload");

export const tgAuthReply = (payload) =>
  callTg("authReply", "tgAuthReply", payload);

export const onTgAuthNeeded = (callback) => {
  // 登录挑战事件并非所有 preload 都实现；缺失时返回空取消函数，调用方可无条件执行清理。
  if (typeof tgBridge.onAuthNeeded === "function") {
    return tgBridge.onAuthNeeded(callback);
  }
  if (typeof window.api.onTgAuthNeeded === "function") {
    return window.api.onTgAuthNeeded(callback);
  }
  return () => {};
};

export const onTgUploadFinished = (callback) => {
  // 兜底到裸 channel 时，主动返回清理函数，避免页面切换后残留重复监听。
  if (typeof tgBridge.onUploadFinished === "function") {
    return tgBridge.onUploadFinished(callback);
  }
  if (typeof window.api.onTgUploadFinished === "function") {
    return window.api.onTgUploadFinished(callback);
  }
  window.api.on("tg-upload-finished", callback);
  return () => window.api.removeAllListeners("tg-upload-finished");
};

export const onLogUpdate = (callback) => {
  if (typeof tgBridge.onLogUpdate === "function") {
    return tgBridge.onLogUpdate(callback);
  }
  return window.api.onLogUpdate(callback);
};

export const removeAllListeners = (channel) => {
  // 统一暴露 removeAllListeners，方便业务层不关心当前运行的是哪一代桥接。
  if (typeof tgBridge.removeAllListeners === "function") {
    return tgBridge.removeAllListeners(channel);
  }
  return window.api.removeAllListeners(channel);
};

export const tgGetRecentActivity = () =>
  callTg("getRecentActivity", "tgGetRecentActivity");

export const tgScanRecentActivity = () =>
  callTg("scanRecentActivity", "tgScanRecentActivity");

export const tgReadRecentActivity = () =>
  callTg("readRecentActivity", "tgReadRecentActivity");

export const tgReadRjList = (payload) =>
  callTg("readRjList", "tgReadRjList", payload);

export const tgDownloadFile = (payload) =>
  callTg("downloadFile", "tgDownloadFile", payload);

export const tgBotStatus = () => callTg("botStatus", "tgBotStatus");

export const tgBotStart = () => callTg("botStart", "tgBotStart");

export const tgBotStop = () => callTg("botStop", "tgBotStop");

export const tgBotSearch = (rjCode) =>
  callTg("botSearch", "tgBotSearch", rjCode);

export const tgBotInfo = (workCode) => callTg("botInfo", "tgBotInfo", workCode);

export const tgBotSyncHistory = (options) =>
  callTg("botSyncHistory", "tgBotSyncHistory", options);

export const tgInfoCacheBuild = (payload) =>
  callTg("infoCacheBuild", "tgInfoCacheBuild", payload);

export const tgInfoCacheStatus = (payload) =>
  callTg("infoCacheStatus", "tgInfoCacheStatus", payload);

export const tgScanRjDuplicates = (options) =>
  callTg("scanRjDuplicates", "tgScanRjDuplicates", options);

export const tgDeleteDuplicateMessages = (messageIds) =>
  callTg("deleteDuplicateMessages", "tgDeleteDuplicateMessages", messageIds);

export const tgInfoErrorRecover = (options) =>
  callTg("infoErrorRecover", "tgInfoErrorRecover", options);

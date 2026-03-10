const asmrBridge = window.api.asmr || {};

// 统一调用入口：优先使用新版本 namespaced bridge，缺失时回退到旧版平铺 API。
const resolveAsmrMethod = (method, ...fallbacks) => {
  if (typeof asmrBridge[method] === "function") {
    return asmrBridge[method];
  }

  for (const fallback of fallbacks) {
    if (typeof window.api[fallback] === "function") {
      return window.api[fallback];
    }
  }

  throw new Error(
    `[asmrApi] Missing API bridge method: ${method} (${fallbacks.join(",")})`,
  );
};

const callAsmr = (method, fallback, ...args) =>
  resolveAsmrMethod(method, fallback)(...args);

export const asmrLogin = (payload) => callAsmr("login", "asmrLogin", payload);

export const asmrFetchCloudWorks = () =>
  callAsmr("fetchCloudWorks", "asmrFetchCloudWorks");

export const asmrDeleteWorks = (workIds) =>
  callAsmr("deleteWorks", "asmrDeleteWorks", workIds);

export const asmrGetCachedCloudWorks = () =>
  callAsmr("getCachedCloudWorks", "asmrGetCachedCloudWorks");

export const onCloudWorksUpdated = (callback) => {
  // 兼容三种事件暴露方式：模块化 API -> 旧式 helper -> 通用 channel 监听。
  if (typeof asmrBridge.onCloudWorksUpdated === "function") {
    return asmrBridge.onCloudWorksUpdated(callback);
  }
  if (typeof window.api.onCloudWorksUpdated === "function") {
    return window.api.onCloudWorksUpdated(callback);
  }
  return window.api.on("cloud-works-updated", callback);
};

export const removeCloudWorksUpdatedListeners = () => {
  // 与 onCloudWorksUpdated 的回退顺序保持一致，确保不同 preload 版本都能清理监听器。
  if (typeof asmrBridge.removeCloudWorksUpdatedListeners === "function") {
    return asmrBridge.removeCloudWorksUpdatedListeners();
  }
  if (typeof window.api.removeCloudWorksUpdatedListeners === "function") {
    return window.api.removeCloudWorksUpdatedListeners();
  }
  return window.api.removeAllListeners("cloud-works-updated");
};

export const asmrDeleteByRJ = (rjCodes) =>
  callAsmr("deleteByRJ", "asmrDeleteByRJ", rjCodes);

export const asmrFetchChineseWorks = (options) =>
  callAsmr("fetchChineseWorks", "asmrFetchChineseWorks", options);

export const asmrSetChineseListPath = (path) =>
  callAsmr("setChineseListPath", "asmrSetChineseListPath", path);

export const asmrGetChineseListPath = () =>
  callAsmr("getChineseListPath", "asmrGetChineseListPath");

export const asmrReadChineseList = () =>
  callAsmr("readChineseList", "asmrReadChineseList");

export const asmrWriteChineseList = (rjCodes) => {
  return resolveAsmrMethod("writeChineseList", "asmrWriteChineseList")(rjCodes);
};

export const onChineseListProgress = (handler) => {
  if (typeof asmrBridge.onChineseListProgress === "function") {
    return asmrBridge.onChineseListProgress(handler);
  }
  if (typeof window.api.onChineseListProgress === "function") {
    return window.api.onChineseListProgress(handler);
  }
  return window.api.on("chinese-list-progress", handler);
};

export const removeChineseListProgressListener = (handler) => {
  // 新 API 支持按 handler 精确移除；最老回退仅有 channel 级 removeListener 能力。
  if (typeof asmrBridge.removeChineseListProgressListener === "function") {
    return asmrBridge.removeChineseListProgressListener(handler);
  }
  if (typeof window.api.removeChineseListProgressListener === "function") {
    return window.api.removeChineseListProgressListener(handler);
  }
  return window.api.removeListener("chinese-list-progress", handler);
};

export const filterRjFromUrl = (payload) => {
  // 旧桥接中该能力曾重命名为 filterRjFromUrlLegacy，这里做多名称探测。
  return resolveAsmrMethod(
    "filterRjFromUrl",
    "filterRjFromUrl",
    "filterRjFromUrlLegacy",
  )(payload);
};

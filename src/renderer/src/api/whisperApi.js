const whisperBridge = window.api.whisper || {};

// 统一方法解析：优先新版本 namespaced bridge，兼容旧 preload 的平铺方法。
const resolveWhisperMethod = (method, fallback) => {
  if (typeof whisperBridge[method] === "function") {
    return whisperBridge[method];
  }
  if (typeof window.api[fallback] === "function") {
    return window.api[fallback];
  }
  throw new Error(
    `[whisperApi] Missing API bridge method: ${method} (${fallback})`,
  );
};

const callWhisper = (method, fallback, ...args) =>
  resolveWhisperMethod(method, fallback)(...args);

// 监听器移除在不同版本 API 中签名不一致，这里统一收敛到 (handler) 调用模型。
const removeWhisperListener = (method, fallback, channel, handler) => {
  if (typeof whisperBridge[method] === "function") {
    return whisperBridge[method](handler);
  }
  if (typeof window.api[fallback] === "function") {
    return window.api[fallback](handler);
  }
  return window.api.removeListener(channel, handler);
};

export const startTask = (payload) =>
  callWhisper("startTask", "startTask", payload);

export const stopTask = () => callWhisper("stopTask", "stopTask");

export const countMediaFiles = (targetPath) => {
  // 文件计数在业务上用于任务前置校验；缺失桥接时直接抛错，避免误判为 0 继续流程。
  if (typeof whisperBridge.countMediaFiles === "function") {
    return whisperBridge.countMediaFiles(targetPath);
  }
  if (typeof window.api.countMediaFiles === "function") {
    return window.api.countMediaFiles(targetPath);
  }
  throw new Error("[whisperApi] Missing API bridge method: countMediaFiles");
};

export const onTaskFinished = (handler) =>
  callWhisper("onTaskFinished", "onTaskFinished", handler);

export const onLogUpdate = (handler) =>
  callWhisper("onLogUpdate", "onLogUpdate", handler);

export const removeTaskFinishedListener = (handler) =>
  removeWhisperListener(
    "removeTaskFinishedListener",
    "removeTaskFinishedListener",
    // 兼容最老事件通道名。
    "task-finished",
    handler,
  );

export const removeLogUpdateListener = (handler) =>
  removeWhisperListener(
    "removeLogUpdateListener",
    "removeLogUpdateListener",
    "log-update",
    handler,
  );

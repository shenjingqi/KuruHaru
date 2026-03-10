const systemBridge = window.api.system || {};
// window 控制能力在不同 preload 版本里可能挂在 system.windowControls 或 window.api.windowControls。
const windowControlsBridge =
  systemBridge.windowControls || window.api.windowControls;

// 读取类系统 API 的统一入口：新 bridge 缺失时回退历史平铺方法名。
const callSystem = (method, fallback, ...args) =>
  typeof systemBridge[method] === "function"
    ? systemBridge[method](...args)
    : window.api[fallback](...args);

// 窗口控制在非桌面运行环境可能不可用，统一返回 null 让上层按“能力缺失”处理。
const callWindowControl = (method) =>
  typeof windowControlsBridge?.[method] === "function"
    ? windowControlsBridge[method]()
    : null;

export const readImageAsBase64 = (filePath) =>
  callSystem("readImageAsBase64", "readImageAsBase64", filePath);

export const getDefaultAvatar = () =>
  callSystem("getDefaultAvatar", "getDefaultAvatar");

export const clearCache = (cacheFile = "recent_activity.json") =>
  callSystem("clearCache", "clearCache", cacheFile);

export const minimizeWindow = () => callWindowControl("minimize");

export const toggleMaximizeWindow = () => callWindowControl("toggleMaximize");

export const closeWindow = () => callWindowControl("close");

export const isWindowMaximized = () => callWindowControl("isMaximized");

export const getWindowState = () => callWindowControl("getState");

export const getWindowBounds = () => callWindowControl("getBounds");

export const setWindowBounds = (bounds) =>
  typeof windowControlsBridge?.setBounds === "function"
    ? windowControlsBridge.setBounds(bounds)
    : null;

export const onWindowStateChanged = (callback) => {
  // 订阅函数可能不存在，始终返回可调用的取消函数以简化调用方清理逻辑。
  const subscribe =
    typeof systemBridge.onWindowStateChanged === "function"
      ? systemBridge.onWindowStateChanged
      : window.api?.onWindowStateChanged;

  if (typeof subscribe !== "function") {
    return () => {};
  }

  // 状态对象兜底为空对象，避免上游在字段缺失时解构报错。
  const unsubscribe = subscribe((state) => {
    callback(state || {});
  });

  return typeof unsubscribe === "function" ? unsubscribe : () => {};
};

export const isWindowControlSupported = () =>
  // 新版显式提供 supported 标志；旧版退化为基于核心方法存在性的能力探测。
  typeof windowControlsBridge?.supported === "boolean"
    ? windowControlsBridge.supported
    : typeof windowControlsBridge?.minimize === "function";
